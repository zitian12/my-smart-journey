"""Public destination and category API routes."""

from fastapi import APIRouter, Header, HTTPException, Query, status

from config import DESTINATION_SYNC_SECRET
from schemas.destinations import (
    DestinationCategoryOut,
    DestinationOut,
    DestinationSyncRequest,
    DestinationSyncResult,
)
from services.destination_ai_service import DestinationAiService
from services.destination_service import DestinationService

router = APIRouter(tags=["destinations"])


@router.get(
    "/api/destination-categories",
    response_model=list[DestinationCategoryOut],
)
async def list_destination_categories() -> list[dict]:
    """List active destination categories."""
    service = DestinationService()
    return await service.list_categories()


@router.get("/api/destinations", response_model=list[DestinationOut])
async def list_destinations(
    name: str | None = Query(default=None, description="Filter by destination name"),
    state: str | None = Query(default=None, description="Filter by Malaysian state"),
    category: str | None = Query(
        default=None,
        description="Filter by category slug or id",
    ),
) -> list[dict]:
    """List destinations with optional name, state, and category filters."""
    service = DestinationService()
    return await service.list_destinations(name=name, state=state, category=category)


@router.post("/api/destinations/sync", response_model=DestinationSyncResult)
async def sync_destinations(
    body: DestinationSyncRequest | None = None,
    x_destination_sync_secret: str | None = Header(default=None),
) -> dict:
    """Run the Gemini destination sync workflow (secret-protected)."""
    if not DESTINATION_SYNC_SECRET:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Destination sync is not configured",
        )

    payload = body or DestinationSyncRequest()
    provided = x_destination_sync_secret or payload.secret or ""
    if provided != DESTINATION_SYNC_SECRET:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid destination sync secret",
        )

    try:
        ai_service = DestinationAiService()
        result = await ai_service.sync_destinations(
            count_per_state=payload.count_per_state,
            deactivate_missing=payload.deactivate_missing,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Destination sync failed: {exc}",
        ) from exc

    return result


@router.get("/api/destinations/{destination_id}", response_model=DestinationOut)
async def get_destination(destination_id: str) -> dict:
    """Return detailed destination information."""
    service = DestinationService()
    destination = await service.get_destination(destination_id)
    if destination is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Destination not found",
        )
    return destination
