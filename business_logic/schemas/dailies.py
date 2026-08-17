"""Pydantic schemas for 24-hour photo dailies."""

from datetime import datetime

from pydantic import BaseModel, Field

from schemas.profile import PublicUserProfile


class DailyItem(BaseModel):
    id: str
    image_url: str
    caption: str = ""
    created_at: str | datetime | None = None
    expires_at: str | datetime | None = None


class DailyGroup(BaseModel):
    user: PublicUserProfile
    items: list[DailyItem] = Field(default_factory=list)


class DailyFeedResponse(BaseModel):
    me: DailyGroup
    friends: list[DailyGroup] = Field(default_factory=list)


class DailyHistoryResponse(BaseModel):
    items: list[DailyItem] = Field(default_factory=list)
