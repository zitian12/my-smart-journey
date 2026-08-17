"""Destination category document model."""

from datetime import datetime, timezone

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class DestinationCategory(BaseModel):
    name: str
    slug: str
    description: str = ""
    is_active: bool = True
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)
