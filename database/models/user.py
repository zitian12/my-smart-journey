"""User document model."""

from datetime import datetime, timezone

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class User(BaseModel):
    google_id: str
    email: str
    full_name: str
    profile_picture: str
    nickname: str = ""
    bio: str = ""
    phone: str = ""
    created_at: datetime = Field(default_factory=_utc_now)
    last_login: datetime = Field(default_factory=_utc_now)
