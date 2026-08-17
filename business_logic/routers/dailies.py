"""24-hour photo daily endpoints."""

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)

from deps import get_current_user
from schemas.dailies import DailyFeedResponse, DailyHistoryResponse, DailyItem
from services.daily_service import DailyError, DailyService

router = APIRouter(prefix="/api/dailies", tags=["dailies"])
_service = DailyService()


def _raise_daily_error(exc: DailyError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post("", response_model=DailyItem, status_code=status.HTTP_201_CREATED)
async def create_daily(
    request: Request,
    file: UploadFile = File(...),
    caption: str = Form(""),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Post a photo daily that appears on the avatar ring for 24 hours."""
    try:
        public_base_url = str(request.base_url).rstrip("/")
        return await _service.create(
            current_user,
            file,
            caption,
            public_base_url,
        )
    except DailyError as exc:
        _raise_daily_error(exc)
        raise


@router.get("", response_model=DailyFeedResponse)
async def list_dailies(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List the current user's and friends' unexpired dailies."""
    return await _service.list_feed(current_user)


@router.get("/history", response_model=DailyHistoryResponse)
async def list_daily_history(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List the current user's dailies including expired ones (archive)."""
    return await _service.list_history(current_user)


@router.delete("/{daily_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_daily(
    daily_id: str,
    current_user: dict = Depends(get_current_user),
) -> Response:
    """Delete one of the current user's dailies."""
    try:
        await _service.delete(current_user, daily_id)
    except DailyError as exc:
        _raise_daily_error(exc)
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)
