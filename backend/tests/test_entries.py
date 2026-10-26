"""API and persistence tests for entries."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.schemas import MAX_TEXT_LENGTH


def test_entry_lifecycle_persists_across_connections(tmp_path: Path) -> None:
    database_path = tmp_path / "entries.sqlite3"

    with TestClient(create_app(database_path)) as client:
        create_response = client.post(
            "/entries",
            json={"text": "  A short note about improving customer service.  "},
        )

        assert create_response.status_code == 201
        created = create_response.json()
        assert created["id"] == 1
        assert created["original_text"] == "A short note about improving customer service."
        assert created["summary"] == created["original_text"]
        assert len(created["tags"]) == 3
        assert created["created_at"]

    # A new app and client use fresh SQLite connections to the same file.
    with TestClient(create_app(database_path)) as client:
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
    with TestClient(create_app(tmp_path / "entries.sqlite3")) as client:
        response = client.post("/entries", json={"text": text})

    assert response.status_code == 422


def test_get_missing_entry_returns_404(tmp_path: Path) -> None:
    with TestClient(create_app(tmp_path / "entries.sqlite3")) as client:
        response = client.get("/entries/999")

    assert response.status_code == 404
    assert response.json() == {"detail": "Entry not found"}
