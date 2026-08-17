"""Current-user profile endpoints."""

import logging

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile

from deps import get_current_user
from integration.repositories import UserRepository
from schemas.connections import UserSearchResponse
from schemas.profile import ProfileUpdateRequest, UserProfileResponse
from services.connection_service import ConnectionService
from services.profile_service import ProfileService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/users", tags=["users"])

_user_repository = UserRepository()
_profile_service = ProfileService(_user_repository)
_connection_service = ConnectionService(user_repository=_user_repository)


@router.get("/search", response_model=UserSearchResponse)
async def search_users(
    q: str = Query("", max_length=100),
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Search registered users by name, nickname, or email."""
    return await _connection_service.search_users(current_user, q)


@router.get("/me", response_model=UserProfileResponse)
async def get_my_profile(
    current_user: dict = Depends(get_current_user),
) -> UserProfileResponse:
    return _profile_service.get_profile(current_user)


@router.patch("/me", response_model=UserProfileResponse)
async def update_my_profile(
    body: ProfileUpdateRequest,
    current_user: dict = Depends(get_current_user),
) -> UserProfileResponse:
    try:
        return await _profile_service.update_profile(current_user, body)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        logger.exception("Failed to update profile")
        raise HTTPException(status_code=500, detail="Failed to update profile")


@router.post("/me/avatar", response_model=UserProfileResponse)
async def upload_my_avatar(
    request: Request,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
) -> UserProfileResponse:
    try:
        public_base_url = str(request.base_url).rstrip("/")
        return await _profile_service.upload_avatar(
            current_user,
            file,
            public_base_url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        logger.exception("Failed to upload avatar")
        raise HTTPException(status_code=500, detail="Failed to upload avatar")


@router.delete("/me")
async def delete_my_account(
    current_user: dict = Depends(get_current_user),
) -> dict[str, str]:
    try:
        await _profile_service.delete_account(current_user)
        return {"message": "Account deleted successfully"}
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except Exception:
        logger.exception("Failed to delete account")
        raise HTTPException(status_code=500, detail="Failed to delete account")
