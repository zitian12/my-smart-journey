"""Authentication endpoints."""

import logging

from fastapi import APIRouter, HTTPException

from integration.repositories import UserRepository
from schemas.auth import AuthResponse, GoogleAuthRequest, LogoutResponse
from services.auth_service import AuthService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])

_user_repository = UserRepository()
_auth_service = AuthService(_user_repository)


@router.post("/google", response_model=AuthResponse)
async def google_sign_in(body: GoogleAuthRequest) -> AuthResponse:
    try:
        return await _auth_service.authenticate_with_google(body.token)
    except ValueError as exc:
        logger.warning("Google sign-in rejected: %s", exc)
        raise HTTPException(status_code=401, detail=str(exc))
    except Exception as exc:
        logger.exception("Google sign-in failed")
        raise HTTPException(
            status_code=500,
            detail=f"Google authentication failed: {exc}",
        )


@router.post("/logout", response_model=LogoutResponse)
async def logout() -> LogoutResponse:
    result = _auth_service.logout()
    return LogoutResponse(message=result["message"])
