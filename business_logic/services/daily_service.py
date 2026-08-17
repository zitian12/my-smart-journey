"""Create, list, and delete 24-hour photo dailies."""

from __future__ import annotations

import logging
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urlparse

from fastapi import UploadFile

from database.models.daily import Daily
from integration.repositories import (
    ConnectionRepository,
    DailyRepository,
    UserRepository,
)
from schemas.profile import public_user_from_document

logger = logging.getLogger(__name__)

UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads" / "dailies"
ALLOWED_CONTENT_TYPES = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
}
MAX_DAILY_BYTES = 2 * 1024 * 1024
MAX_CAPTION_LENGTH = 140
DAILY_TTL = timedelta(hours=24)


class DailyError(Exception):
    """Domain error with an HTTP-friendly status code."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class DailyService:
    """Manage friends-only photo dailies that expire after 24 hours."""

    def __init__(
        self,
        daily_repository: DailyRepository | None = None,
        connection_repository: ConnectionRepository | None = None,
        user_repository: UserRepository | None = None,
    ) -> None:
        self._dailies = daily_repository or DailyRepository()
        self._connections = connection_repository or ConnectionRepository()
        self._users = user_repository or UserRepository()

    async def create(
        self,
        current_user: dict,
        file: UploadFile,
        caption: str,
        public_base_url: str,
    ) -> dict:
        """Store an uploaded photo as a 24-hour daily."""
        content_type = (file.content_type or "").lower()
        extension = ALLOWED_CONTENT_TYPES.get(content_type)
        if extension is None:
            raise DailyError("Daily must be a JPEG, PNG, or WebP image", 400)

        data = await file.read()
        if not data:
            raise DailyError("Uploaded file is empty", 400)
        if len(data) > MAX_DAILY_BYTES:
            raise DailyError("Daily must be 2 MB or smaller", 400)

        cleaned_caption = caption.strip()
        if len(cleaned_caption) > MAX_CAPTION_LENGTH:
            raise DailyError("Caption must be 140 characters or fewer", 400)

        user_id = str(current_user["id"])
        UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
        filename = f"{user_id}_{uuid.uuid4().hex}{extension}"
        destination = UPLOAD_DIR / filename
        destination.write_bytes(data)

        image_url = f"{public_base_url.rstrip('/')}/uploads/dailies/{filename}"
        now = datetime.now(timezone.utc)
        created = await self._dailies.create(
            Daily(
                user_id=user_id,
                image_url=image_url,
                caption=cleaned_caption,
                created_at=now,
                expires_at=now + DAILY_TTL,
            )
        )
        return self._to_item(created)

    async def list_feed(self, current_user: dict) -> dict:
        """Return the current user's dailies and friends' unexpired dailies."""
        user_id = str(current_user["id"])
        friend_ids = await self._friend_ids(user_id)
        rows = await self._dailies.list_unexpired_for_users(
            [user_id, *friend_ids]
        )

        by_user: dict[str, list[dict]] = defaultdict(list)
        for row in rows:
            by_user[row["user_id"]].append(self._to_item(row))

        users = await self._users.get_users_by_ids(friend_ids)
        by_id = {user["id"]: user for user in users}

        friends: list[dict] = []
        ranked = sorted(
            friend_ids,
            key=lambda friend_id: by_user[friend_id][-1]["created_at"]
            if by_user[friend_id]
            else "",
            reverse=True,
        )
        for friend_id in ranked:
            items = by_user.get(friend_id) or []
            if not items:
                continue
            friends.append(
                {
                    "user": public_user_from_document(
                        by_id.get(friend_id) or self._unknown_user(friend_id)
                    ),
                    "items": items,
                }
            )

        return {
            "me": {
                "user": public_user_from_document(current_user),
                "items": by_user.get(user_id) or [],
            },
            "friends": friends,
        }

    async def list_history(self, current_user: dict) -> dict:
        """Return the current user's dailies including expired ones."""
        user_id = str(current_user["id"])
        rows = await self._dailies.list_for_user(user_id)
        return {"items": [self._to_item(row) for row in rows]}

    async def delete(self, current_user: dict, daily_id: str) -> None:
        """Delete the current user's daily before it expires."""
        existing = await self._dailies.get_by_id(daily_id)
        if existing is None or existing.get("user_id") != str(current_user["id"]):
            raise DailyError("Daily not found", 404)

        removed = await self._dailies.delete(daily_id)
        if removed is None:
            raise DailyError("Daily not found", 404)

        self._unlink_image(removed.get("image_url") or "")

    async def _friend_ids(self, user_id: str) -> list[str]:
        rows = await self._connections.list_accepted_for_user(user_id)
        ids: list[str] = []
        seen: set[str] = set()
        for row in rows:
            other_id = (
                row["addressee_id"]
                if row["requester_id"] == user_id
                else row["requester_id"]
            )
            if other_id and other_id not in seen:
                seen.add(other_id)
                ids.append(other_id)
        return ids

    @staticmethod
    def _to_item(daily: dict) -> dict:
        return {
            "id": daily["id"],
            "image_url": daily.get("image_url") or "",
            "caption": daily.get("caption") or "",
            "created_at": daily.get("created_at"),
            "expires_at": daily.get("expires_at"),
        }

    @staticmethod
    def _unknown_user(user_id: str) -> dict:
        return {
            "id": user_id,
            "email": "",
            "full_name": "Unknown user",
            "nickname": "",
            "profile_picture": "",
            "bio": "",
        }

    @staticmethod
    def _unlink_image(image_url: str) -> None:
        if not image_url:
            return
        filename = Path(urlparse(image_url).path).name
        if not filename:
            return
        path = (UPLOAD_DIR / filename).resolve()
        try:
            path.relative_to(UPLOAD_DIR.resolve())
        except ValueError:
            return
        if path.is_file():
            path.unlink()
            logger.info("Deleted daily file — %s", filename)
