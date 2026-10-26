"""HTTP routes for entry creation and retrieval."""

from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path as PathParameter, Request, status

from app import database
from app.schemas import EntryCreate, EntryResponse
from app.summarizer import summarize_text

router = APIRouter(prefix="/entries", tags=["entries"])


def get_database_path(request: Request) -> Path:
    return request.app.state.database_path


DatabasePath = Annotated[Path, Depends(get_database_path)]


@router.post("", response_model=EntryResponse, status_code=status.HTTP_201_CREATED)
def create_entry(payload: EntryCreate, database_path: DatabasePath) -> EntryResponse:
    summary, tags = summarize_text(payload.text)
    entry = database.create_entry(database_path, payload.text, summary, tags)
    return EntryResponse.model_validate(entry)


@router.get("", response_model=list[EntryResponse])
def list_entries(database_path: DatabasePath) -> list[EntryResponse]:
    return [
        EntryResponse.model_validate(entry)
        for entry in database.list_entries(database_path)
    ]


@router.get("/{entry_id}", response_model=EntryResponse)
def get_entry(
    entry_id: Annotated[int, PathParameter(gt=0)],
    database_path: DatabasePath,
) -> EntryResponse:
    entry = database.get_entry(database_path, entry_id)
    if entry is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Entry not found",
        )
    return EntryResponse.model_validate(entry)
