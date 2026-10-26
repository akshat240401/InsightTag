"""API and persistence tests for entries."""

import json
import logging
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.config import DEFAULT_MODEL
from app.main import create_app
from app.openrouter import API_KEY_PLACEHOLDERS, OpenRouterClient
from app.schemas import MAX_TEXT_LENGTH


def openrouter_response(content: Any) -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": {"content": content}}]},
    )


def mock_llm_client(handler: httpx.MockTransport) -> OpenRouterClient:
    return OpenRouterClient(
        api_key=SecretStr("test-api-key"),
        model=DEFAULT_MODEL,
        transport=handler,
    )


def test_entry_lifecycle_persists_across_connections(tmp_path: Path) -> None:
    database_path = tmp_path / "entries.sqlite3"

    def success_handler(request: httpx.Request) -> httpx.Response:
        request_payload = json.loads(request.content)
        assert request_payload["model"] == DEFAULT_MODEL
        assert request_payload["response_format"]["type"] == "json_schema"
        assert request_payload["reasoning"] == {"effort": "none"}
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
        assert list_response.json() == [created]
        assert detail_response.status_code == 200
        assert detail_response.json() == created


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
    assert response.json() == {"detail": "Entry not found"}


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
    assert response.json() == {"detail": "AI service returned invalid output"}
    assert entries.json() == []


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
    assert response.json() == {"detail": "AI service timed out"}
    assert entries.json() == []


@pytest.mark.parametrize(
    ("provider_status", "expected_status", "expected_detail"),
    [
        (408, 504, "AI service timed out"),
        (401, 503, "AI service is not configured"),
        (429, 503, "AI service rate limit reached; try again later"),
        (500, 502, "AI service request failed"),
    ],
)
def test_provider_errors_are_not_persisted(
    tmp_path: Path,
    provider_status: int,
    expected_status: int,
    expected_detail: str,
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
    assert response.json() == {"detail": expected_detail}
    assert entries.json() == []
    if provider_status == 429:
        assert response.headers["Retry-After"] == "30"


def test_missing_api_key_is_not_persisted(tmp_path: Path) -> None:
    llm_client = OpenRouterClient(api_key=None, model=DEFAULT_MODEL)
    with TestClient(create_app(tmp_path / "entries.sqlite3", llm_client)) as client:
        response = client.post("/entries", json={"text": "Valid source text"})
        entries = client.get("/entries")

    assert response.status_code == 503
    assert response.json() == {"detail": "AI service is not configured"}
    assert entries.json() == []


def test_placeholder_api_key_is_not_persisted(tmp_path: Path) -> None:
    placeholder = next(iter(API_KEY_PLACEHOLDERS))
    llm_client = OpenRouterClient(
        api_key=SecretStr(placeholder),
        model=DEFAULT_MODEL,
    )
    with TestClient(create_app(tmp_path / "entries.sqlite3", llm_client)) as client:
        response = client.post("/entries", json={"text": "Valid source text"})
        entries = client.get("/entries")

    assert response.status_code == 503
    assert response.json() == {"detail": "AI service is not configured"}
    assert entries.json() == []


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
    assert entries.json() == []
    assert "category=provider" in caplog.text
    assert "status=500" in caplog.text
    assert "provider_code=500" in caplog.text
    assert submitted_text not in caplog.text
    assert provider_message not in caplog.text
    assert "test-api-key" not in caplog.text
