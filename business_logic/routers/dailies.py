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


def _public_base_url(request: Request) -> str:
    return str(request.base_url).rstrip("/")


@router.post("", response_model=DailyItem, status_code=status.HTTP_201_CREATED)
async def create_daily(
    request: Request,
    file: UploadFile | None = File(None),
    kind: str = Form("photo"),
    caption: str = Form(""),
    itinerary_id: str = Form(""),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Post a photo, text, or trip daily that appears on the avatar ring for 24 hours."""
    try:
        return await _service.create(
            current_user,
            kind=kind,
            caption=caption,
            public_base_url=_public_base_url(request),
            file=file,
            itinerary_id=itinerary_id,
        )
    except DailyError as exc:
        _raise_daily_error(exc)
        raise


@router.get("", response_model=DailyFeedResponse)
async def list_dailies(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List the current user's and friends' unexpired dailies."""
    return await _service.list_feed(current_user, _public_base_url(request))


@router.get("/history", response_model=DailyHistoryResponse)
async def list_daily_history(
    request: Request,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List the current user's dailies including expired ones (archive)."""
    return await _service.list_history(current_user, _public_base_url(request))


@router.get("/{daily_id}/image")
async def get_daily_image(daily_id: str) -> Response:
    """Stream a daily photo stored in MongoDB."""
    try:
        data, content_type = await _service.get_image(daily_id)
    except DailyError as exc:
        _raise_daily_error(exc)
        raise
    return Response(content=data, media_type=content_type)


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
