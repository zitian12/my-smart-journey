"""24-hour photo daily document model."""

from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=24)


class DailyTripSnapshot(BaseModel):
    """Frozen trip card shown on a daily after the itinerary may change."""

    id: str
    name: str = ""
    location: str = ""
    date: str = ""
    days: int = 1
    image: str = ""


class Daily(BaseModel):
    """A post on the author's avatar ring for 24 hours."""

    user_id: str
    kind: Literal["photo", "text", "trip"] = "photo"
    image_url: str = ""
    caption: str = ""
    trip: DailyTripSnapshot | None = None
    created_at: datetime = Field(default_factory=_utc_now)
    expires_at: datetime = Field(default_factory=_expires_at)
