"""Create, list, and delete 24-hour photo dailies."""

from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone

from fastapi import UploadFile

from database.models.daily import Daily, DailyTripSnapshot
from integration.repositories import (
    ConnectionRepository,
    DailyRepository,
    UserRepository,
)
from schemas.profile import public_user_from_document
from services.itinerary_persistence_service import ItineraryPersistenceService

logger = logging.getLogger(__name__)

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
        self._itineraries = ItineraryPersistenceService()

    async def create(
        self,
        current_user: dict,
        *,
        kind: str,
        caption: str,
        public_base_url: str,
        file: UploadFile | None = None,
        itinerary_id: str = "",
    ) -> dict:
        """Store a photo, text, or trip daily for 24 hours."""
        cleaned_kind = (kind or "photo").strip().lower()
        if cleaned_kind not in {"photo", "text", "trip"}:
            raise DailyError("Daily must be a photo, text, or trip", 400)

        cleaned_caption = caption.strip()
        if len(cleaned_caption) > MAX_CAPTION_LENGTH:
            raise DailyError("Caption must be 140 characters or fewer", 400)

        user_id = str(current_user["id"])
        now = datetime.now(timezone.utc)
        image_bytes: bytes | None = None
        content_type: str | None = None
        trip: DailyTripSnapshot | None = None

        if cleaned_kind == "photo":
            image_bytes, content_type = await self._read_photo(file)
        elif cleaned_kind == "text":
            if not cleaned_caption:
                raise DailyError("Text daily needs a caption", 400)
        else:
            trip = await self._trip_snapshot(current_user, itinerary_id)

        created = await self._dailies.create(
            Daily(
                user_id=user_id,
                kind=cleaned_kind,
                caption=cleaned_caption,
                trip=trip,
                created_at=now,
                expires_at=now + DAILY_TTL,
            ),
            image_bytes=image_bytes,
            content_type=content_type,
        )
        return self._to_item(created, public_base_url)

    async def _read_photo(
        self,
        file: UploadFile | None,
    ) -> tuple[bytes, str]:
        if file is None or not (file.filename or "").strip():
            raise DailyError("Photo daily needs an image", 400)
        content_type = (file.content_type or "").lower()
        if content_type not in ALLOWED_CONTENT_TYPES:
            raise DailyError("Daily must be a JPEG, PNG, or WebP image", 400)

        data = await file.read()
        if not data:
            raise DailyError("Uploaded file is empty", 400)
        if len(data) > MAX_DAILY_BYTES:
            raise DailyError("Daily must be 2 MB or smaller", 400)
        return data, content_type

    async def _trip_snapshot(
        self,
        current_user: dict,
        itinerary_id: str,
    ) -> DailyTripSnapshot:
        cleaned_id = itinerary_id.strip()
        if not cleaned_id:
            raise DailyError("Trip daily needs a saved trip", 400)
        detail = await self._itineraries.get_for_user(
            cleaned_id,
            str(current_user["id"]),
        )
        if detail is None:
            raise DailyError("Trip not found", 404)
        return DailyTripSnapshot(
            id=str(detail.get("id") or cleaned_id),
            name=str(detail.get("name") or "Trip"),
            location=str(detail.get("location") or ""),
            date=str(detail.get("date") or ""),
            days=int(detail.get("days") or 1),
            image=str(detail.get("image") or ""),
        )

    async def list_feed(self, current_user: dict, public_base_url: str = "") -> dict:
        """Return the current user's dailies and friends' unexpired dailies."""
        user_id = str(current_user["id"])
        friend_ids = await self._friend_ids(user_id)
        rows = await self._dailies.list_unexpired_for_users(
            [user_id, *friend_ids]
        )

        by_user: dict[str, list[dict]] = defaultdict(list)
        for row in rows:
            by_user[row["user_id"]].append(self._to_item(row, public_base_url))

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

    async def list_history(self, current_user: dict, public_base_url: str = "") -> dict:
        """Return the current user's dailies including expired ones."""
        user_id = str(current_user["id"])
        rows = await self._dailies.list_for_user(user_id)
        return {"items": [self._to_item(row, public_base_url) for row in rows]}

    async def get_image(self, daily_id: str) -> tuple[bytes, str]:
        """Return stored image bytes for a daily."""
        image = await self._dailies.get_image(daily_id)
        if image is None:
            raise DailyError("Daily image not found", 404)
        return image

    async def delete(self, current_user: dict, daily_id: str) -> None:
        """Delete the current user's daily."""
        existing = await self._dailies.get_by_id(daily_id)
        if existing is None or existing.get("user_id") != str(current_user["id"]):
            raise DailyError("Daily not found", 404)

        removed = await self._dailies.delete(daily_id)
        if removed is None:
            raise DailyError("Daily not found", 404)

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
    def _to_item(daily: dict, public_base_url: str = "") -> dict:
        image_url = daily.get("image_url") or ""
        if image_url.startswith("/") and public_base_url:
            image_url = f"{public_base_url.rstrip('/')}{image_url}"
        return {
            "id": daily["id"],
            "kind": daily.get("kind") or "photo",
            "image_url": image_url,
            "caption": daily.get("caption") or "",
            "trip": daily.get("trip"),
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
