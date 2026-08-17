"""Trip share repository — data access for the trip_shares collection."""

import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection

from database.connection import get_database
from database.models.trip_share import TripShare

logger = logging.getLogger(__name__)


class TripShareRepository:
    """Handles CRUD operations for itinerary shares in MongoDB."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()["trip_shares"]

    async def ensure_indexes(self) -> None:
        """Create indexes for the trip_shares collection."""
        await self._collection.create_index(
            [("itinerary_id", 1), ("recipient_id", 1)],
            unique=True,
        )
        await self._collection.create_index("owner_id")
        await self._collection.create_index(
            [("recipient_id", 1), ("status", 1)]
        )
        logger.info("Ensured indexes on trip_shares collection")

    async def create(self, share: TripShare) -> dict:
        """Insert a trip share and return the serialized document."""
        document = share.model_dump()
        result = await self._collection.insert_one(document)
        if not result.acknowledged:
            raise RuntimeError("MongoDB did not acknowledge the trip share insert")

        inserted = await self._collection.find_one({"_id": result.inserted_id})
        if inserted is None:
            raise RuntimeError("Failed to load inserted trip share")

        logger.info(
            "Trip share created — id=%s itinerary=%s recipient=%s",
            result.inserted_id,
            share.itinerary_id,
            share.recipient_id,
        )
        return self._serialize(inserted)

    async def get_by_id(self, share_id: str) -> dict | None:
        """Return a trip share by id, or None."""
        try:
            object_id = ObjectId(share_id)
        except InvalidId:
            return None

        document = await self._collection.find_one({"_id": object_id})
        return self._serialize(document)

    async def get_for_recipient(
        self,
        itinerary_id: str,
        recipient_id: str,
    ) -> dict | None:
        """Return a share of an itinerary for a specific recipient."""
        document = await self._collection.find_one(
            {"itinerary_id": itinerary_id, "recipient_id": recipient_id}
        )
        return self._serialize(document)

    async def list_for_itinerary(self, itinerary_id: str) -> list[dict]:
        """Return all shares for an itinerary, newest first."""
        cursor = self._collection.find({"itinerary_id": itinerary_id}).sort(
            "created_at", -1
        )
        documents = await cursor.to_list(length=200)
        return [self._serialize(doc) for doc in documents]

    async def list_accepted_for_recipient(self, recipient_id: str) -> list[dict]:
        """Return accepted shares visible to the recipient."""
        cursor = self._collection.find(
            {"recipient_id": recipient_id, "status": "accepted"}
        ).sort("updated_at", -1)
        documents = await cursor.to_list(length=500)
        return [self._serialize(doc) for doc in documents]

    async def list_pending_for_recipient(self, recipient_id: str) -> list[dict]:
        """Return pending trip invites for the recipient."""
        cursor = self._collection.find(
            {"recipient_id": recipient_id, "status": "pending"}
        ).sort("created_at", -1)
        documents = await cursor.to_list(length=200)
        return [self._serialize(doc) for doc in documents if doc]

    async def list_between_users(self, user_a: str, user_b: str) -> list[dict]:
        """Return shares in either direction between two users."""
        cursor = self._collection.find(
            {
                "$or": [
                    {"owner_id": user_a, "recipient_id": user_b},
                    {"owner_id": user_b, "recipient_id": user_a},
                ]
            }
        ).sort("updated_at", -1)
        documents = await cursor.to_list(length=500)
        shares: list[dict] = []
        for document in documents:
            serialized = self._serialize(document)
            if serialized is not None:
                shares.append(serialized)
        return shares

    async def has_accepted_share(
        self,
        itinerary_id: str,
        recipient_id: str,
    ) -> bool:
        """Return True if the recipient can view the itinerary."""
        document = await self._collection.find_one(
            {
                "itinerary_id": itinerary_id,
                "recipient_id": recipient_id,
                "status": "accepted",
            }
        )
        return document is not None

    async def update_status(self, share_id: str, status: str) -> dict | None:
        """Update share status and return the serialized document."""
        try:
            object_id = ObjectId(share_id)
        except InvalidId:
            return None

        result = await self._collection.update_one(
            {"_id": object_id},
            {
                "$set": {
                    "status": status,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        if result.matched_count == 0:
            return None
        return await self.get_by_id(share_id)

    async def reopen_as_pending(self, share_id: str) -> dict | None:
        """Reuse a declined share as a new pending invite."""
        return await self.update_status(share_id, "pending")

    async def delete(self, share_id: str) -> bool:
        """Delete a trip share by id. Returns True if removed."""
        try:
            object_id = ObjectId(share_id)
        except InvalidId:
            return False

        result = await self._collection.delete_one({"_id": object_id})
        return result.deleted_count > 0

    async def delete_for_itinerary(self, itinerary_id: str) -> int:
        """Delete all shares for an itinerary. Returns deleted count."""
        result = await self._collection.delete_many({"itinerary_id": itinerary_id})
        if result.deleted_count:
            logger.info(
                "Deleted trip shares for itinerary — id=%s count=%s",
                itinerary_id,
                result.deleted_count,
            )
        return result.deleted_count

    async def delete_between_users(self, user_a: str, user_b: str) -> int:
        """Revoke shares in either direction between two users."""
        result = await self._collection.delete_many(
            {
                "$or": [
                    {"owner_id": user_a, "recipient_id": user_b},
                    {"owner_id": user_b, "recipient_id": user_a},
                ]
            }
        )
        if result.deleted_count:
            logger.info(
                "Deleted trip shares between users — a=%s b=%s count=%s",
                user_a,
                user_b,
                result.deleted_count,
            )
        return result.deleted_count

    async def delete_for_owner_recipient(
        self,
        itinerary_id: str,
        owner_id: str,
        recipient_id: str,
    ) -> bool:
        """Owner revokes a share for a recipient."""
        result = await self._collection.delete_one(
            {
                "itinerary_id": itinerary_id,
                "owner_id": owner_id,
                "recipient_id": recipient_id,
            }
        )
        return result.deleted_count > 0

    @staticmethod
    def _serialize(document: dict | None) -> dict | None:
        if document is None:
            return None

        created_at = document.get("created_at")
        updated_at = document.get("updated_at")
        return {
            "id": str(document["_id"]),
            "itinerary_id": document.get("itinerary_id") or "",
            "owner_id": document.get("owner_id") or "",
            "recipient_id": document.get("recipient_id") or "",
            "status": document.get("status") or "pending",
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else created_at,
            "updated_at": updated_at.isoformat()
            if isinstance(updated_at, datetime)
            else updated_at,
        }
