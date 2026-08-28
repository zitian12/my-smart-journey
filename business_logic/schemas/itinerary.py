"""Pydantic schemas for itinerary generation APIs."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from schemas.profile import PublicUserProfile


class PlaceInput(BaseModel):
    """Typed address (start/end) or catalog destination (stops)."""

    name: str = Field(min_length=1)
    id: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    recommended_stay_minutes: int | None = Field(default=None, ge=30, le=480)
    category_slug: str | None = None
    hub_label: str | None = None

    @field_validator("name")
    @classmethod
    def strip_place_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("name cannot be empty")
        return cleaned


class ItineraryGenerateRequest(BaseModel):
    """Trip constraints. Empty destinations = server catalog pick (System Planner)."""

    start: PlaceInput
    end: PlaceInput
    days: int = Field(ge=1, le=30)
    nights: int = Field(ge=0, le=30)
    hours_per_day: int = Field(ge=1, le=16)
    interests: list[str] = Field(default_factory=list)
    preferred_mode: Literal["driving", "walking", "transit"] = "driving"
    destinations: list[PlaceInput] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_nights_vs_days(self) -> ItineraryGenerateRequest:
        if self.nights not in {self.days - 1, self.days}:
            raise ValueError(
                f"nights must be {self.days - 1} or {self.days} for a {self.days}-day trip"
            )
        return self


class RecomputeStopInput(PlaceInput):
    """Explicit stop for recompute; order/day/stay are preserved when set."""

    order: int | None = Field(default=None, ge=1)
    day: int | None = Field(default=None, ge=1, le=30)
    stay_min: int | None = Field(default=None, ge=30, le=480)


class ItineraryRecomputeRequest(BaseModel):
    """Rebuild legs/schedule from an explicit stop list (no catalog re-pick)."""

    start: PlaceInput
    end: PlaceInput
    destinations: list[RecomputeStopInput] = Field(default_factory=list)
    days: int = Field(ge=1, le=30)
    nights: int = Field(ge=0, le=30)
    hours_per_day: int = Field(ge=1, le=16)
    interests: list[str] = Field(default_factory=list)
    preferred_mode: Literal["driving", "walking", "transit"] = "driving"
    # When true (e.g. after Add stop): re-order by corridor and re-pack days.
    optimize_order: bool = False

    @model_validator(mode="after")
    def validate_trip_bounds(self) -> ItineraryRecomputeRequest:
        if self.nights not in {self.days - 1, self.days}:
            raise ValueError(
                f"nights must be {self.days - 1} or {self.days} for a {self.days}-day trip"
            )
        if self.start.latitude is None or self.start.longitude is None:
            raise ValueError("start must include latitude and longitude")
        if self.end.latitude is None or self.end.longitude is None:
            raise ValueError("end must include latitude and longitude")
        for stop in self.destinations:
            if stop.latitude is None or stop.longitude is None:
                raise ValueError(
                    f"destination '{stop.name}' must include latitude and longitude"
                )
            if stop.day is not None and stop.day > self.days:
                raise ValueError(
                    f"destination '{stop.name}' day {stop.day} exceeds trip days {self.days}"
                )
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
    hub_label: str | None = None


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


class SustainabilityModeBreakdown(BaseModel):
    mode: str
    carbon_kg: float
    distance_km: float = 0.0
    share_percent: float


class SustainabilityLegBreakdown(BaseModel):
    index: int
    from_name: str
    to: str
    day: int
    distance_km: float
    carbon_kg: float
    mode: str


class SustainabilitySummary(BaseModel):
    score: float
    rating: str
    total_footprint_kg: float
    baseline_footprint_kg: float
    emissions_reduced_kg: float
    reduction_percent: float
    distance_km: float
    modes_used: list[str] = Field(default_factory=list)
    breakdown_by_mode: list[SustainabilityModeBreakdown] = Field(default_factory=list)
    breakdown_by_leg: list[SustainabilityLegBreakdown] = Field(default_factory=list)
    impact_text: str = ""
    has_transport_data: bool = True


class ItineraryGenerateResponse(BaseModel):
    start_location: str
    end_location: str
    start_latitude: float | None = None
    start_longitude: float | None = None
    end_latitude: float | None = None
    end_longitude: float | None = None
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
    sustainability: SustainabilitySummary | None = None


class PlaceCoordsInput(BaseModel):
    """Place coordinates snapshot used when reopening a saved trip."""

    id: str
    name: str
    latitude: float
    longitude: float
    image: str | None = None
    category_slug: str | None = None
    state: str | None = None


class ItinerarySaveRequest(BaseModel):
    """Persist the current itinerary result snapshot for the signed-in user."""

    name: str | None = Field(default=None, max_length=120)
    itinerary: ItineraryGenerateResponse
    places: list[PlaceCoordsInput] = Field(default_factory=list)
    travelers: int = Field(default=1, ge=1, le=20)


class SavedItinerarySummary(BaseModel):
    """Card fields for My Trips list."""

    id: str
    name: str
    start_point: str
    end_point: str
    location: str
    date: str
    days: int
    nights: int
    travelers: int
    hours_per_day: int
    eco_score: int
    carbon_kg: float = 0.0
    baseline_footprint_kg: float = 0.0
    emissions_reduced_kg: float = 0.0
    reduction_percent: float = 0.0
    status: Literal["upcoming", "completed"]
    image: str
    is_favourite: bool
    created_at: str | None = None
    is_read_only: bool = False
    shared_by: PublicUserProfile | None = None


class SavedItineraryDetail(SavedItinerarySummary):
    """Full snapshot for reopening on the result page."""

    itinerary: ItineraryGenerateResponse
    places: list[PlaceCoordsInput] = Field(default_factory=list)


class FavouriteUpdateRequest(BaseModel):
    is_favourite: bool


class RenameItineraryRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("name cannot be empty")
        return cleaned
