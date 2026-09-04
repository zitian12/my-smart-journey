"""Sustainability leaderboard APIs."""

from fastapi import APIRouter, Depends, HTTPException, Query, status

from deps import get_current_user
from schemas.eco_score import LeaderboardPeriod, LeaderboardResponse
from services.leaderboard_service import LeaderboardService

router = APIRouter(prefix="/api/eco-score", tags=["eco-score"])
_service = LeaderboardService()


@router.get("/leaderboard", response_model=LeaderboardResponse)
async def get_leaderboard(
    period: LeaderboardPeriod = Query(default="week"),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Rank all travellers who saved trips in the current day, week, month, or year."""
    try:
        return await _service.list_leaderboard(current_user, period)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
