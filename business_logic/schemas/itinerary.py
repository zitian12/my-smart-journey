"""Pydantic schemas for itinerary generation APIs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, model_validator


class PlaceInput(BaseModel):
    """A place selected from the destinations catalog (or typed name)."""

    name: str = Field(min_length=1)
    id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    recommended_stay_minutes: int | None = Field(default=None, ge=30, le=480)
    category_slug: str | None = None


class ItineraryGenerateRequest(BaseModel):
    """User trip constraints; destinations are selected server-side from catalog."""

    start: PlaceInput
    end: PlaceInput
    days: int = Field(ge=1, le=30)
    nights: int = Field(ge=0, le=30)
    hours_per_day: int = Field(ge=1, le=16)
    interests: list[str] = Field(default_factory=list)
    preferred_mode: Literal["driving"] = "driving"

    @model_validator(mode="after")
    def validate_nights_vs_days(self) -> ItineraryGenerateRequest:
        if self.nights not in {self.days - 1, self.days}:
            raise ValueError(
                f"nights must be {self.days - 1} or {self.days} for a {self.days}-day trip"
            )
        if self.start.latitude is None or self.start.longitude is None:
            raise ValueError("start must include latitude and longitude")
        if self.end.latitude is None or self.end.longitude is None:
            raise ValueError("end must include latitude and longitude")
        return self


class PlaceRef(BaseModel):
    id: str
    name: str


class OrderedDestination(BaseModel):
    id: str
    name: str
    order: int
    day: int
    stay_min: int
    latitude: float | None = None
    longitude: float | None = None
    category_slug: str | None = None


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
    # Driving path as [[lat, lng], ...] for map polyline.
    path: list[list[float]] = Field(default_factory=list)


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
    preferred_mode: str = "driving"
    destinations: list[OrderedDestination]
    legs: list[ItineraryLeg]
    totals: ItineraryTotals
    day_totals: list[DayTotal] = Field(default_factory=list)
    excluded_destinations: list[str] = Field(default_factory=list)
    notes: list[str] = Field(default_factory=list)
