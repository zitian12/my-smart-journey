"""Read-only itinerary share document model."""

from datetime import datetime, timezone
from typing import Literal

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class TripShare(BaseModel):
    """Invite a connected friend to view a saved itinerary."""

    itinerary_id: str
    owner_id: str
    recipient_id: str
    status: Literal["pending", "accepted", "declined"] = "pending"
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)
