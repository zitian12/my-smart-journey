"""User destination favourite and folder document models."""

from datetime import datetime, timezone

from pydantic import BaseModel, Field


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class FavouriteDestination(BaseModel):
    """A destination liked by a user."""

    user_id: str
    destination_id: str
    created_at: datetime = Field(default_factory=_utc_now)


class FavouriteFolder(BaseModel):
    """A user-owned folder for organizing favourited destinations."""

    user_id: str
    name: str
    created_at: datetime = Field(default_factory=_utc_now)
    updated_at: datetime = Field(default_factory=_utc_now)


class FavouriteFolderItem(BaseModel):
    """A destination placed inside a favourite folder."""

    user_id: str
    folder_id: str
    destination_id: str
    created_at: datetime = Field(default_factory=_utc_now)
