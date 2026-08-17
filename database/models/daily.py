"""24-hour photo daily document model."""

from datetime import datetime, timedelta, timezone

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _expires_at() -> datetime:
    return datetime.now(timezone.utc) + timedelta(hours=24)


class Daily(BaseModel):
    """A photo posted to the author's avatar ring for 24 hours."""

    user_id: str
    image_url: str
    caption: str = ""
    created_at: datetime = Field(default_factory=_utc_now)
    expires_at: datetime = Field(default_factory=_expires_at)
