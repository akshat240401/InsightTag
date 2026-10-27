"""HTTP routes for entry creation, retrieval, and deletion."""

import logging
import sqlite3
from math import ceil
from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    Path as PathParameter,
    Query,
    Request,
    Response,
    status,
)

from app import database
from app.errors import DatabaseError, EntryNotFoundError
from app.openrouter import OpenRouterClient
from app.schemas import EntryCreate, EntryResponse, PaginatedEntries

router = APIRouter(prefix="/entries", tags=["entries"])
logger = logging.getLogger(__name__)


def get_database_path(request: Request) -> Path:
    return request.app.state.database_path


def get_llm_client(request: Request) -> OpenRouterClient:
    return request.app.state.llm_client


DatabasePath = Annotated[Path, Depends(get_database_path)]
LLMClient = Annotated[OpenRouterClient, Depends(get_llm_client)]


@router.post("", response_model=EntryResponse, status_code=status.HTTP_201_CREATED)
async def create_entry(
    payload: EntryCreate,
    database_path: DatabasePath,
    llm_client: LLMClient,
) -> EntryResponse:
    generated = await llm_client.summarize(payload.text)

    entry = database.create_entry(
        database_path,
        payload.text,
        generated.summary,
        generated.tags,
    )
    return EntryResponse.model_validate(entry)


@router.get("", response_model=PaginatedEntries)
def list_entries(
    database_path: DatabasePath,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 10,
) -> PaginatedEntries:
    entries, total = database.list_entries(database_path, page, page_size)
    return PaginatedEntries(
        items=[EntryResponse.model_validate(entry) for entry in entries],
        total=total,
        page=page,
        page_size=page_size,
        total_pages=ceil(total / page_size),
    )


@router.get("/{entry_id}", response_model=EntryResponse)
def get_entry(
    entry_id: Annotated[int, PathParameter(gt=0)],
    database_path: DatabasePath,
) -> EntryResponse:
    entry = database.get_entry(database_path, entry_id)
    if entry is None:
        raise EntryNotFoundError()
    return EntryResponse.model_validate(entry)


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: Annotated[int, PathParameter(gt=0)],
    database_path: DatabasePath,
) -> Response:
    try:
        deleted = database.delete_entry(database_path, entry_id)
    except sqlite3.Error as exc:
        logger.error(
            "Database request failed category=delete entry_id=%s",
            entry_id,
        )
        raise DatabaseError() from exc

    if not deleted:
        raise EntryNotFoundError()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
