"""Saved itinerary document model."""

from datetime import datetime, timezone
from typing import Any, Literal

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class SavedItinerary(BaseModel):
    """Persisted trip snapshot for a user."""

    user_id: str
    name: str
    start_point: str
    end_point: str
    location: str = ""
    days: int
    nights: int
    hours_per_day: int
    travelers: int = 1
    eco_score: int = 80
    status: Literal["upcoming", "completed"] = "upcoming"
    image: str = ""
    is_favourite: bool = False
    itinerary: dict[str, Any]
    places: list[dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)
