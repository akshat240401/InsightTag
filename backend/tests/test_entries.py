"""API and persistence tests for entries."""

import json
import logging
import sqlite3
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app import database, routes
from app.config import DEFAULT_MODEL
from app.main import create_app
from app.openrouter import (
    API_KEY_PLACEHOLDERS,
    FREE_ROUTER_MODEL,
    RESPONSE_FORMAT,
    SYSTEM_PROMPT,
    OpenRouterClient,
)
from app.schemas import MAX_TEXT_LENGTH


def openrouter_response(content: Any) -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": {"content": content}}]},
    )


def mock_llm_client(
    handler: httpx.MockTransport,
    model: str = DEFAULT_MODEL,
) -> OpenRouterClient:
    return OpenRouterClient(
        api_key=SecretStr("test-api-key"),
        model=model,
        transport=handler,
    )


def seed_entries(database_path: Path, count: int) -> list[dict[str, Any]]:
    database.initialize_database(database_path)
    return [
        database.create_entry(
            database_path,
            f"Original text {number}",
            f"Summary {number}",
            [f"tag-{number}", "testing", "insighttag"],
        )
        for number in range(1, count + 1)
    ]


def test_entry_lifecycle_persists_across_connections(tmp_path: Path) -> None:
    database_path = tmp_path / "entries.sqlite3"

    def success_handler(request: httpx.Request) -> httpx.Response:
        request_payload = json.loads(request.content)
        assert request_payload["model"] == DEFAULT_MODEL
        assert request_payload["messages"] == [
            {"role": "system", "content": SYSTEM_PROMPT},
            {
                "role": "user",
                "content": "A short note about improving customer service.",
            },
        ]
        assert request_payload["response_format"] == RESPONSE_FORMAT
        assert request_payload["reasoning"] == {"effort": "none"}
        assert request_payload["temperature"] == 0.2
        assert request_payload["max_tokens"] == 300
        assert "provider" not in request_payload
        assert request.headers["Authorization"] == "Bearer test-api-key"
        return openrouter_response(
            json.dumps(
                {
                    "summary": "Customer service improvements are being considered.",
                    "tags": ["customer-service", "improvement", "operations"],
                }
            )
        )

    llm_client = mock_llm_client(httpx.MockTransport(success_handler))

    with TestClient(create_app(database_path, llm_client)) as client:
        create_response = client.post(
            "/entries",
            json={"text": "  A short note about improving customer service.  "},
        )

        assert create_response.status_code == 201
        created = create_response.json()
        assert created["id"] == 1
        assert created["original_text"] == "A short note about improving customer service."
        assert created["summary"] == "Customer service improvements are being considered."
        assert created["tags"] == [
            "customer-service",
            "improvement",
            "operations",
        ]
        assert created["created_at"]

    # A new app and client use fresh SQLite connections to the same file.
    with TestClient(create_app(database_path, llm_client)) as client:
        list_response = client.get("/entries")
        detail_response = client.get("/entries/1")

        assert list_response.status_code == 200
        assert list_response.json() == {
            "items": [created],
            "total": 1,
            "page": 1,
            "page_size": 10,
            "total_pages": 1,
        }
        assert detail_response.status_code == 200
        assert detail_response.json() == created


@pytest.mark.parametrize(
    ("model", "expected_provider"),
    [
        (DEFAULT_MODEL, None),
        (FREE_ROUTER_MODEL, {"require_parameters": True}),
    ],
)
def test_model_configurations_preserve_structured_request_and_create_entry(
    tmp_path: Path,
    model: str,
    expected_provider: dict[str, bool] | None,
) -> None:
    def success_handler(request: httpx.Request) -> httpx.Response:
        payload = json.loads(request.content)
        assert payload["model"] == model
        assert payload["response_format"] == RESPONSE_FORMAT
        assert payload["reasoning"] == {"effort": "none"}
        assert payload["temperature"] == 0.2
        assert payload["max_tokens"] == 300
        assert payload.get("provider") == expected_provider
        return openrouter_response(
            json.dumps(
                {
                    "summary": "A valid model-configuration response.",
                    "tags": ["configuration", "structured-output", "testing"],
                }
            )
        )

    client = mock_llm_client(httpx.MockTransport(success_handler), model)
    with TestClient(create_app(tmp_path / "entries.sqlite3", client)) as api:
        response = api.post("/entries", json={"text": "Synthetic source text"})

    assert response.status_code == 201
    assert response.json()["tags"] == [
        "configuration",
        "structured-output",
        "testing",
    ]


@pytest.mark.parametrize("model", [DEFAULT_MODEL, FREE_ROUTER_MODEL])
def test_model_configurations_reject_malformed_output_without_persistence(
    tmp_path: Path,
    model: str,
) -> None:
    handler = httpx.MockTransport(lambda _: openrouter_response("not JSON"))
    with TestClient(
        create_app(
            tmp_path / "entries.sqlite3",
            mock_llm_client(handler, model),
        )
    ) as api:
        response = api.post("/entries", json={"text": "Synthetic source text"})
        listing = api.get("/entries")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == "INVALID_MODEL_OUTPUT"
    assert listing.json()["items"] == []


@pytest.mark.parametrize("model", [DEFAULT_MODEL, FREE_ROUTER_MODEL])
@pytest.mark.parametrize(
    ("provider_status", "expected_status", "expected_code"),
    [
        (429, 503, "PROVIDER_RATE_LIMITED"),
        (500, 502, "PROVIDER_UNAVAILABLE"),
    ],
)
def test_model_configurations_map_provider_failures_without_persistence(
    tmp_path: Path,
    model: str,
    provider_status: int,
    expected_status: int,
    expected_code: str,
) -> None:
    handler = httpx.MockTransport(
        lambda _: httpx.Response(provider_status, headers={"Retry-After": "30"})
    )
    with TestClient(
        create_app(
            tmp_path / "entries.sqlite3",
            mock_llm_client(handler, model),
        )
    ) as api:
        response = api.post("/entries", json={"text": "Synthetic source text"})
        listing = api.get("/entries")

    assert response.status_code == expected_status
    assert response.json()["error"]["code"] == expected_code
    assert listing.json()["items"] == []


@pytest.mark.parametrize(
    "text",
    ["", "   \t\n", "x" * (MAX_TEXT_LENGTH + 1)],
)
def test_create_entry_rejects_invalid_text(tmp_path: Path, text: str) -> None:
    def unexpected_request(_: httpx.Request) -> httpx.Response:
        raise AssertionError("Invalid input must not call OpenRouter")

    llm_client = mock_llm_client(httpx.MockTransport(unexpected_request))
    with TestClient(create_app(tmp_path / "entries.sqlite3", llm_client)) as client:
        response = client.post("/entries", json={"text": text})

    assert response.status_code == 422


def test_get_missing_entry_returns_404(tmp_path: Path) -> None:
    handler = httpx.MockTransport(lambda _: openrouter_response("{}"))
    llm_client = mock_llm_client(handler)
    with TestClient(create_app(tmp_path / "entries.sqlite3", llm_client)) as client:
        response = client.get("/entries/999")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "ENTRY_NOT_FOUND", "message": "Entry not found."}
    }


@pytest.mark.parametrize(
    "content",
    [
        [],
        "not JSON",
        json.dumps({"summary": "", "tags": ["one", "two", "three"]}),
        json.dumps({"summary": "Valid", "tags": ["one", "two"]}),
        json.dumps({"summary": "Valid", "tags": ["one", "ONE", "three"]}),
        json.dumps({"summary": "Valid", "tags": ["one", " ", "three"]}),
    ],
)
def test_invalid_llm_output_is_not_persisted(tmp_path: Path, content: Any) -> None:
    handler = httpx.MockTransport(lambda _: openrouter_response(content))

    with TestClient(
        create_app(tmp_path / "entries.sqlite3", mock_llm_client(handler))
    ) as client:
        response = client.post("/entries", json={"text": "Valid source text"})
        entries = client.get("/entries")

    assert response.status_code == 502
    assert response.json() == {
        "error": {
            "code": "INVALID_MODEL_OUTPUT",
            "message": "The AI provider returned invalid output.",
        }
    }
    assert entries.json()["items"] == []


def test_llm_timeout_is_not_persisted(tmp_path: Path) -> None:
    def timeout_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("Provider timed out", request=request)

    handler = httpx.MockTransport(timeout_handler)
    with TestClient(
        create_app(tmp_path / "entries.sqlite3", mock_llm_client(handler))
    ) as client:
        response = client.post("/entries", json={"text": "Valid source text"})
        entries = client.get("/entries")

    assert response.status_code == 504
    assert response.json() == {
        "error": {
            "code": "PROVIDER_TIMEOUT",
            "message": "The AI provider did not respond in time.",
        }
    }
    assert entries.json()["items"] == []


@pytest.mark.parametrize(
    ("provider_status", "expected_status", "expected_code"),
    [
        (408, 504, "PROVIDER_TIMEOUT"),
        (401, 502, "PROVIDER_AUTH_FAILED"),
        (403, 502, "PROVIDER_AUTH_FAILED"),
        (429, 503, "PROVIDER_RATE_LIMITED"),
        (500, 502, "PROVIDER_UNAVAILABLE"),
    ],
)
def test_provider_errors_are_not_persisted(
    tmp_path: Path,
    provider_status: int,
    expected_status: int,
    expected_code: str,
) -> None:
    def error_handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            provider_status,
            headers={"Retry-After": "30"},
            json={"error": {"message": "Provider failure"}},
        )

    handler = httpx.MockTransport(error_handler)
    with TestClient(
        create_app(tmp_path / "entries.sqlite3", mock_llm_client(handler))
    ) as client:
        response = client.post("/entries", json={"text": "Valid source text"})
        entries = client.get("/entries")

    assert response.status_code == expected_status
    assert response.json()["error"]["code"] == expected_code
    assert response.json()["error"]["message"]
    assert entries.json()["items"] == []
    if provider_status == 429:
        assert response.headers["Retry-After"] == "30"


def test_openrouter_network_failure_is_not_persisted(tmp_path: Path) -> None:
    def network_handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("Provider connection failed", request=request)

    handler = httpx.MockTransport(network_handler)
    with TestClient(
        create_app(tmp_path / "entries.sqlite3", mock_llm_client(handler))
    ) as client:
        response = client.post("/entries", json={"text": "Valid source text"})
        entries = client.get("/entries")

    assert response.status_code == 502
    assert response.json()["error"] == {
        "code": "PROVIDER_UNAVAILABLE",
        "message": "The AI provider is temporarily unavailable.",
    }
    assert entries.json()["items"] == []


@pytest.mark.parametrize(
    ("provider_payload", "expected_code"),
    [
        ([], "INVALID_MODEL_OUTPUT"),
        ({}, "INVALID_MODEL_OUTPUT"),
        ({"choices": []}, "INVALID_MODEL_OUTPUT"),
        ({"choices": [{"message": {}}]}, "INVALID_MODEL_OUTPUT"),
        (
            {"choices": [{"message": {"content": {"summary": "invalid"}}}]},
            "INVALID_MODEL_OUTPUT",
        ),
        ({"error": {"code": 500, "message": "upstream detail"}}, "PROVIDER_UNAVAILABLE"),
    ],
)
def test_unexpected_openrouter_responses_are_not_persisted(
    tmp_path: Path,
    provider_payload: Any,
    expected_code: str,
) -> None:
    handler = httpx.MockTransport(
        lambda _: httpx.Response(200, json=provider_payload)
    )
    with TestClient(
        create_app(tmp_path / "entries.sqlite3", mock_llm_client(handler))
    ) as client:
        response = client.post("/entries", json={"text": "Valid source text"})
        entries = client.get("/entries")

    assert response.status_code == 502
    assert response.json()["error"]["code"] == expected_code
    assert entries.json()["items"] == []


def test_unexpected_internal_error_is_sanitized(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    sensitive_message = "secret upstream body and submitted content"

    class BrokenOpenRouterClient:
        async def summarize(self, _: str) -> Any:
            raise RuntimeError(sensitive_message)

    with caplog.at_level(logging.ERROR, logger="app.main"):
        with TestClient(
            create_app(tmp_path / "entries.sqlite3", BrokenOpenRouterClient()),
            raise_server_exceptions=False,
        ) as client:
            response = client.post("/entries", json={"text": "Sensitive input"})
            entries = client.get("/entries")

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "INTERNAL_ERROR",
            "message": "An unexpected server error occurred.",
        }
    }
    assert entries.json()["items"] == []
    assert "exception_type=RuntimeError" in caplog.text
    assert sensitive_message not in caplog.text
    assert "Sensitive input" not in caplog.text


def test_missing_api_key_is_not_persisted(tmp_path: Path) -> None:
    llm_client = OpenRouterClient(api_key=None, model=DEFAULT_MODEL)
    with TestClient(create_app(tmp_path / "entries.sqlite3", llm_client)) as client:
        response = client.post("/entries", json={"text": "Valid source text"})
        entries = client.get("/entries")

    assert response.status_code == 503
    assert response.json()["error"] == {
        "code": "PROVIDER_NOT_CONFIGURED",
        "message": "The AI provider is not configured.",
    }
    assert entries.json()["items"] == []


@pytest.mark.parametrize("placeholder", sorted(API_KEY_PLACEHOLDERS))
def test_placeholder_api_key_is_not_persisted(
    tmp_path: Path,
    placeholder: str,
) -> None:
    llm_client = OpenRouterClient(
        api_key=SecretStr(placeholder),
        model=DEFAULT_MODEL,
    )
    with TestClient(create_app(tmp_path / "entries.sqlite3", llm_client)) as client:
        response = client.post("/entries", json={"text": "Valid source text"})
        entries = client.get("/entries")

    assert response.status_code == 503
    assert response.json()["error"] == {
        "code": "PROVIDER_NOT_CONFIGURED",
        "message": "The AI provider is not configured.",
    }
    assert entries.json()["items"] == []


def test_upstream_logging_is_sanitized(tmp_path: Path, caplog: pytest.LogCaptureFixture) -> None:
    submitted_text = "sensitive customer account details"
    provider_message = f"Rejected input: {submitted_text}"

    def error_handler(_: httpx.Request) -> httpx.Response:
        return httpx.Response(
            500,
            json={"error": {"code": 500, "message": provider_message}},
        )

    handler = httpx.MockTransport(error_handler)
    with caplog.at_level(logging.WARNING, logger="app.openrouter"):
        with TestClient(
            create_app(tmp_path / "entries.sqlite3", mock_llm_client(handler))
        ) as client:
            response = client.post("/entries", json={"text": submitted_text})
            entries = client.get("/entries")

    assert response.status_code == 502
    assert entries.json()["items"] == []
    assert "category=provider" in caplog.text
    assert "status=500" in caplog.text
    assert "provider_code=500" in caplog.text
    assert submitted_text not in caplog.text
    assert provider_message not in caplog.text
    assert "test-api-key" not in caplog.text


def test_list_entries_uses_default_pagination_and_newest_first(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "entries.sqlite3"
    seeded = seed_entries(database_path, 23)

    with TestClient(create_app(database_path)) as client:
        response = client.get("/entries")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 23
    assert payload["page"] == 1
    assert payload["page_size"] == 10
    assert payload["total_pages"] == 3
    assert [entry["id"] for entry in payload["items"]] == [
        entry["id"] for entry in reversed(seeded[-10:])
    ]


def test_list_entries_returns_requested_page_without_loading_all_rows(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "entries.sqlite3"
    seed_entries(database_path, 12)

    with TestClient(create_app(database_path)) as client:
        response = client.get("/entries?page=2&page_size=5")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 12
    assert payload["page"] == 2
    assert payload["page_size"] == 5
    assert payload["total_pages"] == 3
    assert [entry["id"] for entry in payload["items"]] == [7, 6, 5, 4, 3]


def test_list_entries_returns_empty_items_for_out_of_range_page(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "entries.sqlite3"
    seed_entries(database_path, 3)

    with TestClient(create_app(database_path)) as client:
        response = client.get("/entries?page=9&page_size=2")

    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "total": 3,
        "page": 9,
        "page_size": 2,
        "total_pages": 2,
    }


def test_list_entries_handles_empty_database(tmp_path: Path) -> None:
    with TestClient(create_app(tmp_path / "entries.sqlite3")) as client:
        response = client.get("/entries")

    assert response.status_code == 200
    assert response.json() == {
        "items": [],
        "total": 0,
        "page": 1,
        "page_size": 10,
        "total_pages": 0,
    }


@pytest.mark.parametrize(
    "query",
    [
        "page=0",
        "page=-1",
        "page=not-a-number",
        "page_size=0",
        "page_size=101",
        "page_size=not-a-number",
    ],
)
def test_list_entries_rejects_invalid_pagination(
    tmp_path: Path,
    query: str,
) -> None:
    with TestClient(create_app(tmp_path / "entries.sqlite3")) as client:
        response = client.get(f"/entries?{query}")

    assert response.status_code == 422


def test_list_entries_accepts_maximum_page_size(tmp_path: Path) -> None:
    database_path = tmp_path / "entries.sqlite3"
    seed_entries(database_path, 101)

    with TestClient(create_app(database_path)) as client:
        response = client.get("/entries?page_size=100")

    assert response.status_code == 200
    payload = response.json()
    assert len(payload["items"]) == 100
    assert payload["page_size"] == 100
    assert payload["total_pages"] == 2


def test_delete_entry_returns_204_and_preserves_other_entries(
    tmp_path: Path,
) -> None:
    database_path = tmp_path / "entries.sqlite3"
    seed_entries(database_path, 3)

    with TestClient(create_app(database_path)) as client:
        response = client.delete("/entries/2")
        deleted_detail = client.get("/entries/2")
        listing = client.get("/entries")

    assert response.status_code == 204
    assert response.content == b""
    assert deleted_detail.status_code == 404
    assert listing.status_code == 200
    assert listing.json()["total"] == 2
    assert [entry["id"] for entry in listing.json()["items"]] == [3, 1]


def test_delete_unknown_entry_returns_404(tmp_path: Path) -> None:
    with TestClient(create_app(tmp_path / "entries.sqlite3")) as client:
        response = client.delete("/entries/999")

    assert response.status_code == 404
    assert response.json() == {
        "error": {"code": "ENTRY_NOT_FOUND", "message": "Entry not found."}
    }


@pytest.mark.parametrize("entry_id", ["0", "-1", "not-a-number"])
def test_delete_rejects_invalid_entry_id(tmp_path: Path, entry_id: str) -> None:
    with TestClient(create_app(tmp_path / "entries.sqlite3")) as client:
        response = client.delete(f"/entries/{entry_id}")

    assert response.status_code == 422


def test_deletion_persists_across_application_instances(tmp_path: Path) -> None:
    database_path = tmp_path / "entries.sqlite3"
    seed_entries(database_path, 2)

    with TestClient(create_app(database_path)) as client:
        assert client.delete("/entries/2").status_code == 204

    with TestClient(create_app(database_path)) as client:
        assert client.get("/entries/2").status_code == 404
        listing = client.get("/entries").json()

    assert listing["total"] == 1
    assert [entry["id"] for entry in listing["items"]] == [1]


def test_deletion_updates_pagination_metadata(tmp_path: Path) -> None:
    database_path = tmp_path / "entries.sqlite3"
    seed_entries(database_path, 11)

    with TestClient(create_app(database_path)) as client:
        assert client.delete("/entries/11").status_code == 204
        first_page = client.get("/entries").json()
        second_page = client.get("/entries?page=2").json()

    assert first_page["total"] == 10
    assert first_page["total_pages"] == 1
    assert len(first_page["items"]) == 10
    assert second_page["items"] == []
    assert second_page["page"] == 2


def test_delete_database_error_is_sanitized(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    def fail_delete(_: Path, __: int) -> bool:
        raise sqlite3.OperationalError("sensitive database path and SQL")

    monkeypatch.setattr(routes.database, "delete_entry", fail_delete)
    with caplog.at_level(logging.ERROR, logger="app.routes"):
        with TestClient(create_app(tmp_path / "entries.sqlite3")) as client:
            response = client.delete("/entries/1")

    assert response.status_code == 500
    assert response.json() == {
        "error": {
            "code": "DATABASE_ERROR",
            "message": "The database operation could not be completed.",
        }
    }
    assert "sensitive database path and SQL" not in caplog.text
    assert "category=delete" in caplog.text
