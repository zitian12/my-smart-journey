"""Itinerary document model."""

from datetime import datetime, timezone

from pydantic import BaseModel, Field


class Itinerary(BaseModel):
    user_id: str
    title: str
    days: int
    destinations: list[str]
    total_carbon_score: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
