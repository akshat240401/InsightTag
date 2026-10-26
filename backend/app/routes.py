"""HTTP routes for entry creation and retrieval."""

from pathlib import Path
from typing import Annotated

from fastapi import (
    APIRouter,
    Depends,
    HTTPException,
    Path as PathParameter,
    Request,
    status,
)

from app import database
from app.openrouter import (
    LLMConfigurationError,
    LLMOutputError,
    LLMProviderError,
    LLMRateLimitError,
    LLMTimeoutError,
    OpenRouterClient,
)
from app.schemas import EntryCreate, EntryResponse

router = APIRouter(prefix="/entries", tags=["entries"])


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
    try:
        generated = await llm_client.summarize(payload.text)
    except LLMConfigurationError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service is not configured",
        ) from exc
    except LLMTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="AI service timed out",
        ) from exc
    except LLMRateLimitError as exc:
        headers = {"Retry-After": exc.retry_after} if exc.retry_after else None
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI service rate limit reached; try again later",
            headers=headers,
        ) from exc
    except LLMProviderError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service request failed",
        ) from exc
    except LLMOutputError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="AI service returned invalid output",
        ) from exc

    entry = database.create_entry(
        database_path,
        payload.text,
        generated.summary,
        generated.tags,
    )
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
