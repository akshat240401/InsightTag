"""Pydantic request and response models."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

MAX_TEXT_LENGTH = 10_000

SubmittedText = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_TEXT_LENGTH,
    ),
]
GeneratedSummary = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=1_000,
        strict=True,
    ),
]
GeneratedTag = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=50,
        strict=True,
    ),
]


class EntryCreate(BaseModel):
    """Text accepted when creating an entry."""

    model_config = ConfigDict(extra="forbid")

    text: SubmittedText


class GeneratedContent(BaseModel):
    """Independently validated content returned by the LLM."""

    model_config = ConfigDict(extra="forbid")

    summary: GeneratedSummary
    tags: list[GeneratedTag] = Field(min_length=3, max_length=3)

    @field_validator("tags")
    @classmethod
    def tags_must_be_distinct(cls, tags: list[str]) -> list[str]:
        if len({tag.casefold() for tag in tags}) != 3:
            raise ValueError("Tags must be distinct")
        return tags


class EntryResponse(BaseModel):
    """Public representation of a persisted entry."""

    id: int = Field(gt=0)
    original_text: str
    summary: str = Field(min_length=1)
    tags: list[str] = Field(min_length=3, max_length=3)
    created_at: datetime


class PaginatedEntries(BaseModel):
    """One server-side page of persisted entries."""

    items: list[EntryResponse]
    total: int = Field(ge=0)
    page: int = Field(ge=1)
    page_size: int = Field(ge=1, le=100)
    total_pages: int = Field(ge=0)
