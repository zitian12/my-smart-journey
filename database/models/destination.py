"""Destination document model."""

from datetime import datetime, timezone

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class Destination(BaseModel):
    destination_name: str
    name_normalized: str
    description: str = ""
    category_id: str
    state: str = ""
    location: str = ""
    latitude: float | None = None
    longitude: float | None = None
    operating_hours: str = ""
    images: list[str] = Field(default_factory=list)
    source: str = "gemini"
    is_active: bool = True
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)
