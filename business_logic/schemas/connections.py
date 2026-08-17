"""Pydantic schemas for friend connections."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator

from schemas.profile import PublicUserProfile


class ConnectionCreateRequest(BaseModel):
    user_id: str = Field(min_length=1, max_length=64)

    @field_validator("user_id")
    @classmethod
    def normalize_user_id(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("User id is required")
        return cleaned


class ConnectionItem(BaseModel):
    id: str
    status: Literal["pending", "accepted", "declined"]
    direction: Literal["incoming", "outgoing"]
    user: PublicUserProfile
    created_at: str | datetime | None = None


class PendingConnectionsResponse(BaseModel):
    incoming: list[ConnectionItem]
    outgoing: list[ConnectionItem]


class UserSearchResult(BaseModel):
    user: PublicUserProfile
    relationship: Literal["none", "pending_out", "pending_in", "friends"]
    connection_id: str | None = None


class UserSearchResponse(BaseModel):
    items: list[UserSearchResult] = Field(default_factory=list)
