"""Pydantic schemas for read-only trip sharing."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from schemas.itinerary import SavedItinerarySummary
from schemas.profile import PublicUserProfile


class TripShareCreateRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)


class TripShareItem(BaseModel):
    id: str
    itinerary_id: str
    status: Literal["pending", "accepted", "declined"]
    user: PublicUserProfile
    itinerary: SavedItinerarySummary | None = None
    created_at: str | datetime | None = None


class FriendSharesResponse(BaseModel):
    from_friend: list[TripShareItem]
    to_friend: list[TripShareItem]
