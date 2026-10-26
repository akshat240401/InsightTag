"""Small SQLite persistence layer for InsightTag entries."""

import sqlite3
from collections.abc import Iterator, Sequence
from contextlib import contextmanager
from pathlib import Path
from typing import Any

DEFAULT_DATABASE_PATH = Path(__file__).resolve().parents[1] / "data" / "insighttag.db"

CREATE_ENTRIES_TABLE = """
CREATE TABLE IF NOT EXISTS entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    original_text TEXT NOT NULL,
    summary TEXT NOT NULL,
    tag_1 TEXT NOT NULL,
    tag_2 TEXT NOT NULL,
    tag_3 TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
)
"""


@contextmanager
def database_connection(database_path: Path) -> Iterator[sqlite3.Connection]:
    """Yield a configured connection and always close it afterward."""
    database_path.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(database_path)
    connection.row_factory = sqlite3.Row

    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def initialize_database(database_path: Path) -> None:
    """Create the database schema when it does not already exist."""
    with database_connection(database_path) as connection:
        connection.execute(CREATE_ENTRIES_TABLE)


def create_entry(
    database_path: Path,
    original_text: str,
    summary: str,
    tags: Sequence[str],
) -> dict[str, Any]:
    """Insert an entry and return its persisted representation."""
    if len(tags) != 3:
        raise ValueError("Exactly three tags are required")

    with database_connection(database_path) as connection:
        cursor = connection.execute(
            """
            INSERT INTO entries (original_text, summary, tag_1, tag_2, tag_3)
            VALUES (?, ?, ?, ?, ?)
            """,
            (original_text, summary, tags[0], tags[1], tags[2]),
        )
        row = connection.execute(
            "SELECT * FROM entries WHERE id = ?", (cursor.lastrowid,)
        ).fetchone()

    if row is None:  # Defensive guard; the inserted row should always exist.
        raise RuntimeError("The saved entry could not be read")
    return _entry_from_row(row)


def list_entries(database_path: Path) -> list[dict[str, Any]]:
    """Return all entries, newest first."""
    with database_connection(database_path) as connection:
        rows = connection.execute(
            "SELECT * FROM entries ORDER BY created_at DESC, id DESC"
        ).fetchall()
    return [_entry_from_row(row) for row in rows]


def get_entry(database_path: Path, entry_id: int) -> dict[str, Any] | None:
    """Return one entry by ID, or None when it does not exist."""
    with database_connection(database_path) as connection:
        row = connection.execute(
            "SELECT * FROM entries WHERE id = ?", (entry_id,)
        ).fetchone()
    return _entry_from_row(row) if row is not None else None


def _entry_from_row(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "id": row["id"],
        "original_text": row["original_text"],
        "summary": row["summary"],
        "tags": [row["tag_1"], row["tag_2"], row["tag_3"]],
        "created_at": row["created_at"],
    }
