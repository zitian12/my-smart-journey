"""Public itinerary generation API routes."""

from fastapi import APIRouter, HTTPException, status

from schemas.itinerary import ItineraryGenerateRequest, ItineraryGenerateResponse
from services.itinerary_generation_service import ItineraryGenerationService

router = APIRouter(tags=["itineraries"])


@router.post(
    "/api/itineraries/generate",
    response_model=ItineraryGenerateResponse,
)
async def generate_itinerary(body: ItineraryGenerateRequest) -> dict:
    """Generate a personalised itinerary from traveller inputs."""
    service = ItineraryGenerationService()
    try:
        return service.generate(body.model_dump())
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc

