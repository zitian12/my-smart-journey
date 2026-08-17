"""Google Sign-In authentication service."""

import logging
from datetime import datetime, timedelta, timezone

import jwt
from google.auth.transport import requests
from google.oauth2 import id_token
from pymongo.errors import DuplicateKeyError

from config import (
    GOOGLE_CLIENT_ID,
    JWT_ALGORITHM,
    JWT_EXPIRE_MINUTES,
    JWT_SECRET,
)
from database.models import User
from integration.repositories import UserRepository
from schemas.auth import AuthResponse, UserResponse

logger = logging.getLogger(__name__)


class AuthService:
    """Handles Google authentication and JWT token management."""

    def __init__(self, user_repository: UserRepository) -> None:
        self._user_repository = user_repository

    def verify_google_token(self, token: str) -> dict:
        """Verify a Google ID token and return the user info payload."""
        if not GOOGLE_CLIENT_ID:
            raise ValueError("GOOGLE_CLIENT_ID is not configured")

        return id_token.verify_oauth2_token(
            token,
            requests.Request(),
            GOOGLE_CLIENT_ID,
            clock_skew_in_seconds=60,
        )

    def create_access_token(self, user_id: str, email: str) -> str:
        """Create a JWT access token for the authenticated user."""
        if not JWT_SECRET:
            raise ValueError("JWT_SECRET is not configured")

        expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
        payload = {
            "sub": user_id,
            "email": email,
            "exp": expire,
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    async def authenticate_with_google(self, google_token: str) -> AuthResponse:
        """Verify Google token, create or update user, and return JWT."""
        google_user = self.verify_google_token(google_token)

        google_id = google_user["sub"]
        email = google_user.get("email", "")
        full_name = google_user.get("name", "")
        profile_picture = google_user.get("picture", "")

        if not email:
            raise ValueError("Google account email is required")

        user = await self._user_repository.get_user_by_google_id(google_id)

        if user is None:
            logger.info("New Google sign-in — creating user: %s", email)
            new_user = User(
                google_id=google_id,
                email=email,
                full_name=full_name,
                profile_picture=profile_picture,
            )
            try:
                user_id = await self._user_repository.create_user(new_user)
            except DuplicateKeyError:
                logger.info(
                    "User already exists (race condition) — loading by google_id: %s",
                    email,
                )
                user = await self._user_repository.get_user_by_google_id(google_id)
                if user is None:
                    raise ValueError("Failed to load user after duplicate key error")
                await self._user_repository.update_last_login(user["id"], email)
            else:
                user = await self._user_repository.get_user_by_id(user_id)
                if user is None:
                    raise ValueError("Failed to load user after creation")
                logger.info("User created and saved: %s", email)
        else:
            logger.info("Existing user sign-in — updating last_login: %s", email)
            await self._user_repository.update_last_login(user["id"], email)
            user = await self._user_repository.get_user_by_id(user["id"])

        if user is None:
            raise ValueError("Failed to load user after authentication")

        access_token = self.create_access_token(user["id"], user["email"])

        return AuthResponse(
            access_token=access_token,
            user=UserResponse(
                id=user["id"],
                email=user["email"],
                full_name=user.get("full_name") or "",
                profile_picture=user.get("profile_picture") or "",
                nickname=user.get("nickname") or "",
                bio=user.get("bio") or "",
                phone=user.get("phone") or "",
                created_at=user.get("created_at"),
            ),
        )

    def logout(self) -> dict[str, str]:
        """Return logout confirmation. Client should clear the stored JWT."""
        return {"message": "Logged out successfully"}
