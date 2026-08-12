"""Pydantic schemas for itinerary generation APIs."""

from __future__ import annotations

from pydantic import BaseModel, Field


class PlaceInput(BaseModel):
    """A place selected from the destinations catalog (or typed name)."""

    name: str = Field(min_length=1)
    id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    recommended_stay_minutes: int | None = Field(default=None, ge=30, le=480)
    category_slug: str | None = None


class ItineraryGenerateRequest(BaseModel):
    start: PlaceInput
    end: PlaceInput
    destinations: list[PlaceInput] = Field(min_length=1)
    days: int | None = Field(default=None, ge=1, le=30)
    hours_per_day: int | None = Field(default=None, ge=1, le=16)
    interests: list[str] = Field(default_factory=list)
    nights: int | None = Field(default=None, ge=0, le=30)


class PlaceRef(BaseModel):
    id: str
    name: str


class OrderedDestination(BaseModel):
    id: str
    name: str
    order: int
    day: int
    stay_min: int


class TransportOption(BaseModel):
    mode: str
    duration_min: int
    distance_km: float
    carbon_kg: float
    is_default: bool = False
    is_estimated: bool = False


class ItineraryLeg(BaseModel):
    from_place: PlaceRef
    to_place: PlaceRef
    distance_km: float
    duration_min: int
    transport_options: list[TransportOption]
    selected_mode: str
    day: int | None = None
    steps: list[dict] = Field(default_factory=list)


class ItineraryTotals(BaseModel):
    duration_min: int
    travel_duration_min: int
    stay_duration_min: int
    distance_km: float
    carbon_kg: float


class DayTotal(BaseModel):
    day: int
    travel_duration_min: int
    stay_duration_min: int
    duration_min: int


class ItineraryGenerateResponse(BaseModel):
    start_location: str
    end_location: str
    days: int
    nights: int
    hours_per_day: int
    interests: list[str]
    destinations: list[OrderedDestination]
    legs: list[ItineraryLeg]
    totals: ItineraryTotals
    day_totals: list[DayTotal] = Field(default_factory=list)
    excluded_destinations: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
