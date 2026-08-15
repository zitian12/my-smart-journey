"""Pydantic schemas for destination APIs."""

from datetime import datetime

from pydantic import BaseModel, Field


class DestinationCategoryOut(BaseModel):
    id: str
    name: str
    slug: str
    description: str = ""
    is_active: bool = True


class DestinationOut(BaseModel):
    id: str
    destination_name: str
    description: str = ""
    category_id: str
    category_name: str | None = None
    category_slug: str | None = None
    state: str = ""
    location: str = ""
    latitude: float | None = None
    longitude: float | None = None
    operating_hours: str = ""
    images: list[str] = Field(default_factory=list)
    source: str = "gemini"
    place_id: str | None = None
    is_featured: bool = False
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None


class DestinationSyncRequest(BaseModel):
    secret: str | None = None
    count_per_state: int = Field(default=6, ge=5, le=8)
    deactivate_missing: bool = True


class DestinationSyncResult(BaseModel):
    categories_ensured: int
    destinations_upserted: int
    destinations_deactivated: int
