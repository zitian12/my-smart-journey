"""Public itinerary generation + authenticated save/list APIs."""

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from deps import get_current_user
from integration.external_api import GoogleMapsClient
from integration.external_api.geo import haversine_km
from integration.repositories import DestinationCategoryRepository
from schemas.itinerary import (
    FavouriteUpdateRequest,
    ItineraryGenerateRequest,
    ItineraryGenerateResponse,
    ItineraryRecomputeRequest,
    ItinerarySaveRequest,
    PlaceInput,
    RenameItineraryRequest,
    SavedItineraryDetail,
    SavedItinerarySummary,
)
from schemas.trip_share import FriendSharesResponse, TripShareCreateRequest, TripShareItem
from services.itinerary_generation_service import ItineraryGenerationService
from services.itinerary_persistence_service import (
    ItineraryNameConflictError,
    ItineraryPersistenceService,
)
from services.itinerary_poi_selection_service import ItineraryPoiSelectionService
from services.trip_share_service import TripShareError, TripShareService

router = APIRouter(tags=["itineraries"])
_persistence = ItineraryPersistenceService()
_shares = TripShareService()
_maps = GoogleMapsClient()
_MIN_START_END_KM = 0.2
_ADDRESS_NOT_FOUND = (
    "Could not find that address in Malaysia. Try a fuller street or area name."
)


def _mapped_user_destinations(places: list[PlaceInput]) -> list[dict[str, Any]]:
    """Keep catalog/folder stops that already have coordinates. Never geocode."""
    destinations: list[dict[str, Any]] = []
    for place in places:
        dump = place.model_dump()
        lat = dump.get("latitude")
        lng = dump.get("longitude")
        if lat is None or lng is None:
            continue
        destinations.append(
            {
                **dump,
                "latitude": float(lat),
                "longitude": float(lng),
            }
        )
    return destinations


async def _resolve_user_place(place: dict[str, Any]) -> dict[str, Any]:
    """Geocode name-only start/end once; skip if coords are already present."""
    name = str(place.get("name") or "").strip()
    lat = place.get("latitude")
    lng = place.get("longitude")
    if lat is not None and lng is not None:
        return {
            **place,
            "name": name or str(place.get("name") or ""),
            "latitude": float(lat),
            "longitude": float(lng),
        }
    if not name:
        raise ValueError("Address is required.")
    resolved_lat, resolved_lng, formatted = await _maps.geocode(name)
    if resolved_lat is None or resolved_lng is None:
        raise ValueError(_ADDRESS_NOT_FOUND)
    return {
        **place,
        "name": formatted or name,
        "latitude": resolved_lat,
        "longitude": resolved_lng,
    }


@router.post(
    "/api/itineraries/generate",
    response_model=ItineraryGenerateResponse,
)
async def generate_itinerary(body: ItineraryGenerateRequest) -> dict:
    """Generate a personalised itinerary from trip constraints + catalog pick."""
    interests = [str(i).strip().lower() for i in body.interests if str(i).strip()]
    if interests:
        category_repo = DestinationCategoryRepository()
        categories = await category_repo.list_active()
        valid_slugs = {
            str(c.get("slug") or "").lower() for c in categories if c.get("slug")
        }
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

    try:
        start = await _resolve_user_place(start)
        end = await _resolve_user_place(end)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

    if haversine_km(
        (start["latitude"], start["longitude"]),
        (end["latitude"], end["longitude"]),
    ) < _MIN_START_END_KM:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Start and end are too close. Choose two different places.",
        )

    if body.destinations:
        destinations = _mapped_user_destinations(body.destinations)
        if not destinations:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Select at least one mapped destination to plan.",
            )
    else:
        selector = ItineraryPoiSelectionService()
        try:
            destinations = await selector.select_places(
                start=start,
                end=end,
                days=body.days,
                nights=body.nights,
                interests=interests,
                hours_per_day=hours_per_day,
                preferred_mode=body.preferred_mode,
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
                "keep_all_stops": bool(body.destinations),
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
    try:
        return await _persistence.save(
            user_id=str(current_user["id"]),
            name=body.name,
            itinerary=body.itinerary.model_dump(),
            places=[p.model_dump() for p in body.places],
            travelers=body.travelers,
        )
    except ItineraryNameConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc


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
    "/api/itineraries/shared",
    response_model=list[SavedItinerarySummary],
)
async def list_shared_itineraries(
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """List trips shared with the authenticated user (accepted)."""
    return await _shares.list_shared_with_me(current_user)


@router.get(
    "/api/itineraries/shared/pending",
    response_model=list[TripShareItem],
)
async def list_pending_trip_shares(
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """List pending trip invites for the authenticated user."""
    return await _shares.list_pending_invites(current_user)


@router.get(
    "/api/itineraries/shared/with/{user_id}",
    response_model=FriendSharesResponse,
)
async def list_shares_with_friend(
    user_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List trips shared between the current user and an accepted friend."""
    try:
        return await _shares.list_with_friend(current_user, user_id)
    except TripShareError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post(
    "/api/trip-shares/{share_id}/accept",
    response_model=TripShareItem,
)
async def accept_trip_share(
    share_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Accept a trip invite."""
    try:
        return await _shares.accept(current_user, share_id)
    except TripShareError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post(
    "/api/trip-shares/{share_id}/decline",
    response_model=TripShareItem,
)
async def decline_trip_share(
    share_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Decline a trip invite."""
    try:
        return await _shares.decline(current_user, share_id)
    except TripShareError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get(
    "/api/itineraries/{itinerary_id}",
    response_model=SavedItineraryDetail,
)
async def get_itinerary(
    itinerary_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Load a saved itinerary owned by the user or shared with them."""
    detail = await _shares.get_for_viewer(current_user, itinerary_id)
    if detail is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Itinerary not found",
        )
    return detail


@router.post(
    "/api/itineraries/{itinerary_id}/duplicate",
    response_model=SavedItinerarySummary,
    status_code=status.HTTP_201_CREATED,
)
async def duplicate_itinerary(
    itinerary_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Clone an owned itinerary into a new saved trip."""
    duplicated = await _persistence.duplicate_for_user(
        itinerary_id,
        str(current_user["id"]),
    )
    if duplicated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Itinerary not found",
        )
    return duplicated


@router.post(
    "/api/itineraries/{itinerary_id}/shares",
    response_model=TripShareItem,
    status_code=status.HTTP_201_CREATED,
)
async def share_itinerary(
    itinerary_id: str,
    body: TripShareCreateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Invite an accepted friend to view this trip."""
    try:
        return await _shares.invite(current_user, itinerary_id, body.user_id)
    except TripShareError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get(
    "/api/itineraries/{itinerary_id}/shares",
    response_model=list[TripShareItem],
)
async def list_itinerary_shares(
    itinerary_id: str,
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """List who this trip is shared with (owner only)."""
    try:
        return await _shares.list_for_itinerary(current_user, itinerary_id)
    except TripShareError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.delete(
    "/api/itineraries/{itinerary_id}/shares/{user_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def revoke_itinerary_share(
    itinerary_id: str,
    user_id: str,
    current_user: dict = Depends(get_current_user),
) -> None:
    """Revoke a friend's access to this trip (owner only)."""
    try:
        await _shares.revoke(current_user, itinerary_id, user_id)
    except TripShareError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


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
    try:
        updated = await _persistence.rename(
            itinerary_id,
            str(current_user["id"]),
            body.name,
        )
    except ItineraryNameConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        ) from exc
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Itinerary not found",
        )
    return updated


@router.put(
    "/api/itineraries/{itinerary_id}",
    response_model=SavedItineraryDetail,
)
async def replace_itinerary(
    itinerary_id: str,
    body: ItinerarySaveRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Overwrite an owned itinerary snapshot. Name and favourite are kept."""
    updated = await _persistence.replace_for_user(
        itinerary_id,
        str(current_user["id"]),
        itinerary=body.itinerary.model_dump(),
        places=[p.model_dump() for p in body.places],
        travelers=body.travelers,
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
