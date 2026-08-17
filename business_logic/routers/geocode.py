"""OSM Photon address suggestions (no Google quota)."""

from fastapi import APIRouter, Query

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
