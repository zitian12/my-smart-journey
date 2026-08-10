"""User profile management service."""

import logging
import re
import uuid
from pathlib import Path

from fastapi import UploadFile

from integration.repositories import UserRepository
from schemas.profile import ProfileUpdateRequest, UserProfileResponse

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads" / "avatars"
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_AVATAR_BYTES = 2 * 1024 * 1024
PHONE_PATTERN = re.compile(r"^[+\d\s().-]{0,30}$")


class ProfileService:
    """Handles reading and updating the current user's profile."""

    def __init__(self, user_repository: UserRepository) -> None:
        self._user_repository = user_repository

    @staticmethod
    def to_response(user: dict) -> UserProfileResponse:
        return UserProfileResponse(
            id=user["id"],
            email=user["email"],
            full_name=user.get("full_name") or "",
            profile_picture=user.get("profile_picture") or "",
            nickname=user.get("nickname") or "",
            bio=user.get("bio") or "",
            phone=user.get("phone") or "",
            created_at=user.get("created_at"),
        )

    def get_profile(self, user: dict) -> UserProfileResponse:
        return self.to_response(user)

    async def update_profile(
        self,
        user: dict,
        payload: ProfileUpdateRequest,
    ) -> UserProfileResponse:
        full_name = payload.full_name.strip()
        if not full_name:
            raise ValueError("Full name is required")

        phone = payload.phone.strip()
        if phone and not PHONE_PATTERN.fullmatch(phone):
            raise ValueError("Phone number contains invalid characters")

        updated = await self._user_repository.update_profile(
            user["id"],
            {
                "full_name": full_name,
                "nickname": payload.nickname.strip(),
                "bio": payload.bio.strip(),
                "phone": phone,
            },
        )
        if updated is None:
            raise ValueError("User not found")

        return self.to_response(updated)

    async def upload_avatar(
        self,
        user: dict,
        file: UploadFile,
        public_base_url: str,
    ) -> UserProfileResponse:
        content_type = (file.content_type or "").lower()
        extension = ALLOWED_CONTENT_TYPES.get(content_type)
        if extension is None:
            raise ValueError("Avatar must be a JPEG, PNG, or WebP image")

        data = await file.read()
        if not data:
            raise ValueError("Uploaded file is empty")
        if len(data) > MAX_AVATAR_BYTES:
            raise ValueError("Avatar must be 2 MB or smaller")

        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{user['id']}_{uuid.uuid4().hex}{extension}"
        destination = UPLOAD_DIR / filename
        destination.write_bytes(data)

        avatar_url = f"{public_base_url.rstrip('/')}/uploads/avatars/{filename}"
        updated = await self._user_repository.update_profile(
            user["id"],
            {"profile_picture": avatar_url},
        )
        if updated is None:
            raise ValueError("User not found")

        logger.info("Avatar uploaded for user %s -> %s", user["id"], filename)
        return self.to_response(updated)

    async def delete_account(self, user: dict) -> None:
        deleted = await self._user_repository.delete_user(user["id"])
        if not deleted:
            raise ValueError("User not found")
        logger.info("Account deleted for user %s", user["id"])
