"""OSM Photon address suggestions / reverse (no Google quota)."""

from fastapi import APIRouter, HTTPException, Query

from integration.external_api.photon_client import PhotonClient
from schemas.geocode import AddressSuggestion

router = APIRouter(tags=["geocode"])
_photon = PhotonClient()


@router.get("/api/geocode/suggest", response_model=list[AddressSuggestion])
async def suggest_addresses(
    q: str = Query(default="", min_length=0, max_length=120),
) -> list[dict]:
    """Return Malaysia-scoped address suggestions from OSM Photon."""
    query = q.strip()
    if len(query) < 3:
        return []
    return await _photon.suggest(query)


@router.get("/api/geocode/reverse", response_model=AddressSuggestion)
async def reverse_address(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
) -> dict:
    """Return a label for GPS coordinates via OSM Photon reverse (no Google)."""
    result = await _photon.reverse(lat, lng)
    if result is None:
        raise HTTPException(status_code=404, detail="Address not found")
    return result

