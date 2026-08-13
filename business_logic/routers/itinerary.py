"""Public itinerary generation + authenticated save/list APIs."""

from fastapi import APIRouter, Depends, HTTPException, status

from deps import get_current_user
from integration.repositories import DestinationCategoryRepository
from schemas.itinerary import (
    FavouriteUpdateRequest,
    ItineraryGenerateRequest,
    ItineraryGenerateResponse,
    ItineraryRecomputeRequest,
    ItinerarySaveRequest,
    RenameItineraryRequest,
    SavedItineraryDetail,
    SavedItinerarySummary,
)
from services.itinerary_generation_service import ItineraryGenerationService
from services.itinerary_persistence_service import ItineraryPersistenceService
from services.itinerary_poi_selection_service import ItineraryPoiSelectionService

router = APIRouter(tags=["itineraries"])
_persistence = ItineraryPersistenceService()


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


@router.post(
    "/api/itineraries",
    response_model=SavedItineraryDetail,
    status_code=status.HTTP_201_CREATED,
)
async def save_itinerary(
    body: ItinerarySaveRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Save the current itinerary snapshot for the authenticated user."""
    return await _persistence.save(
        user_id=str(current_user["id"]),
        name=body.name,
        itinerary=body.itinerary.model_dump(),
        places=[p.model_dump() for p in body.places],
        travelers=body.travelers,
    )


@router.get(
    "/api/itineraries",
    response_model=list[SavedItinerarySummary],
)
async def list_itineraries(
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """List saved itineraries for the authenticated user."""
    return await _persistence.list_for_user(str(current_user["id"]))


@router.get(
    "/api/itineraries/{itinerary_id}",
    response_model=SavedItineraryDetail,
)
async def get_itinerary(
    itinerary_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Load a saved itinerary snapshot owned by the authenticated user."""
    detail = await _persistence.get_for_user(itinerary_id, str(current_user["id"]))
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Itinerary not found",
        )
    return detail


@router.patch(
    "/api/itineraries/{itinerary_id}/favourite",
    response_model=SavedItinerarySummary,
)
async def update_itinerary_favourite(
    itinerary_id: str,
    body: FavouriteUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Set favourite flag on an owned itinerary."""
    updated = await _persistence.set_favourite(
        itinerary_id,
        str(current_user["id"]),
        body.is_favourite,
    )
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Itinerary not found",
        )
    return updated


@router.patch(
    "/api/itineraries/{itinerary_id}",
    response_model=SavedItinerarySummary,
)
async def rename_itinerary(
    itinerary_id: str,
    body: RenameItineraryRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Rename an owned itinerary."""
    updated = await _persistence.rename(
        itinerary_id,
        str(current_user["id"]),
        body.name,
    )
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Itinerary not found",
        )
    return updated


@router.delete(
    "/api/itineraries/{itinerary_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_itinerary(
    itinerary_id: str,
    current_user: dict = Depends(get_current_user),
) -> None:
    """Delete an owned itinerary."""
    deleted = await _persistence.delete_for_user(
        itinerary_id,
        str(current_user["id"]),
    )
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Itinerary not found",
        )
