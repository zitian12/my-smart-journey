"""Public itinerary generation API routes."""

from fastapi import APIRouter, HTTPException, status

from integration.repositories import DestinationCategoryRepository
from schemas.itinerary import (
    ItineraryGenerateRequest,
    ItineraryGenerateResponse,
    ItineraryRecomputeRequest,
)
from services.itinerary_generation_service import ItineraryGenerationService
from services.itinerary_poi_selection_service import ItineraryPoiSelectionService

router = APIRouter(tags=["itineraries"])


@router.post(
    "/api/itineraries/generate",
    response_model=ItineraryGenerateResponse,
)
async def generate_itinerary(body: ItineraryGenerateRequest) -> dict:
    """Generate a personalised itinerary from trip constraints + catalog AI pick."""
    category_repo = DestinationCategoryRepository()
    categories = await category_repo.list_active()
    valid_slugs = {str(c.get("slug") or "").lower() for c in categories if c.get("slug")}

    interests = [str(i).strip().lower() for i in body.interests if str(i).strip()]
    invalid = sorted({slug for slug in interests if slug not in valid_slugs})
    if invalid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Invalid interest slug(s): "
                + ", ".join(invalid)
                + ". Use active destination category slugs."
            ),
        )

    start = body.start.model_dump()
    end = body.end.model_dump()
    hours_per_day = body.hours_per_day

    selector = ItineraryPoiSelectionService()
    try:
        destinations = await selector.select_places(
            start=start,
            end=end,
            days=body.days,
            nights=body.nights,
            interests=interests,
            hours_per_day=hours_per_day,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    service = ItineraryGenerationService()
    try:
        return service.generate(
            {
                "start": start,
                "end": end,
                "destinations": destinations,
                "days": body.days,
                "nights": body.nights,
                "hours_per_day": hours_per_day,
                "interests": interests,
                "preferred_mode": body.preferred_mode,
            }
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post(
    "/api/itineraries/recompute",
    response_model=ItineraryGenerateResponse,
)
async def recompute_itinerary(body: ItineraryRecomputeRequest) -> dict:
    """Rebuild schedule and legs from an explicit stop list (user CUD on result)."""
    service = ItineraryGenerationService()
    try:
        return service.recompute(
            {
                "start": body.start.model_dump(),
                "end": body.end.model_dump(),
                "destinations": [d.model_dump() for d in body.destinations],
                "days": body.days,
                "nights": body.nights,
                "hours_per_day": body.hours_per_day,
                "interests": [
                    str(i).strip().lower() for i in body.interests if str(i).strip()
                ],
                "preferred_mode": body.preferred_mode,
                "optimize_order": body.optimize_order,
            }
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
