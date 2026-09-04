"""Eco Score leaderboard request and response schemas."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

LeaderboardPeriod = Literal["day", "week", "month", "year"]


class LeaderboardEntry(BaseModel):
    rank: int = Field(ge=1)
    user_id: str
    display_name: str
    profile_picture: str = ""
    trip_count: int = Field(ge=1)
    carbon_saved_kg: float
    average_score: float
    is_current_user: bool = False


class LeaderboardResponse(BaseModel):
    period: LeaderboardPeriod
    period_start: datetime
    period_end: datetime
    entries: list[LeaderboardEntry]
