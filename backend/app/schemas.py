"""Pydantic request and response models."""

from datetime import datetime
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

MAX_TEXT_LENGTH = 10_000

SubmittedText = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True,
        min_length=1,
        max_length=MAX_TEXT_LENGTH,
    ),
]


class EntryCreate(BaseModel):
    """Text accepted when creating an entry."""

    model_config = ConfigDict(extra="forbid")

    text: SubmittedText


class EntryResponse(BaseModel):
    """Public representation of a persisted entry."""

    id: int = Field(gt=0)
    original_text: str
    summary: str = Field(min_length=1)
    tags: list[str] = Field(min_length=3, max_length=3)
    created_at: datetime
