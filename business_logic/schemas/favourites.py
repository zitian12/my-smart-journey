"""Pydantic schemas for destination favourite APIs."""

from datetime import datetime

from pydantic import BaseModel, Field

from schemas.destinations import DestinationOut


class FavouriteIdsOut(BaseModel):
    destination_ids: list[str] = Field(default_factory=list)


class FavouriteFolderCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class FavouriteFolderRenameRequest(BaseModel):
    name: str = Field(min_length=1, max_length=80)


class FavouriteFolderOut(BaseModel):
    id: str
    name: str
    item_count: int = 0
    created_at: datetime | None = None
    updated_at: datetime | None = None


class FavouriteStatusOut(BaseModel):
    destination_id: str
    is_favourite: bool = True
