"""Connection repository — data access for the connections collection."""

import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection

from database.connection import get_database
from database.models.connection import Connection

logger = logging.getLogger(__name__)


class ConnectionRepository:
    """Handles CRUD operations for user connections in MongoDB."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()["connections"]

    async def ensure_indexes(self) -> None:
        """Create indexes for the connections collection."""
        await self._collection.create_index(
            [("requester_id", 1), ("addressee_id", 1)],
            unique=True,
        )
        await self._collection.create_index("requester_id")
        await self._collection.create_index("addressee_id")
        await self._collection.create_index([("addressee_id", 1), ("status", 1)])
        logger.info("Ensured indexes on connections collection")

    async def create(self, connection: Connection) -> dict:
        """Insert a connection and return the serialized document."""
        document = connection.model_dump()
        result = await self._collection.insert_one(document)
        if not result.acknowledged:
            raise RuntimeError("MongoDB did not acknowledge the connection insert")

        inserted = await self._collection.find_one({"_id": result.inserted_id})
        if inserted is None:
            raise RuntimeError("Failed to load inserted connection")

        logger.info(
            "Connection created — id=%s requester=%s addressee=%s",
            result.inserted_id,
            connection.requester_id,
            connection.addressee_id,
        )
        return self._serialize(inserted)

    async def get_by_id(self, connection_id: str) -> dict | None:
        """Return a connection by id, or None."""
        try:
            object_id = ObjectId(connection_id)
        except InvalidId:
            return None

        document = await self._collection.find_one({"_id": object_id})
        return self._serialize(document)

    async def get_between(self, user_a: str, user_b: str) -> dict | None:
        """Return a connection between two users in either direction."""
        document = await self._collection.find_one(
            {
                "$or": [
                    {"requester_id": user_a, "addressee_id": user_b},
                    {"requester_id": user_b, "addressee_id": user_a},
                ]
            }
        )
        return self._serialize(document)

    async def list_accepted_for_user(self, user_id: str) -> list[dict]:
        """Return accepted connections involving the user."""
        cursor = self._collection.find(
            {
                "status": "accepted",
                "$or": [
                    {"requester_id": user_id},
                    {"addressee_id": user_id},
                ],
            }
        ).sort("updated_at", -1)
        documents = await cursor.to_list(length=500)
        return [self._serialize(doc) for doc in documents]

    async def list_incoming_pending(self, user_id: str) -> list[dict]:
        """Return pending requests addressed to the user."""
        cursor = self._collection.find(
            {"addressee_id": user_id, "status": "pending"}
        ).sort("created_at", -1)
        documents = await cursor.to_list(length=200)
        return [self._serialize(doc) for doc in documents]

    async def list_outgoing_pending(self, user_id: str) -> list[dict]:
        """Return pending requests sent by the user."""
        cursor = self._collection.find(
            {"requester_id": user_id, "status": "pending"}
        ).sort("created_at", -1)
        documents = await cursor.to_list(length=200)
        return [self._serialize(doc) for doc in documents]

    async def are_accepted_friends(self, user_a: str, user_b: str) -> bool:
        """Return True if the two users have an accepted connection."""
        document = await self._collection.find_one(
            {
                "status": "accepted",
                "$or": [
                    {"requester_id": user_a, "addressee_id": user_b},
                    {"requester_id": user_b, "addressee_id": user_a},
                ],
            }
        )
        return document is not None

    async def update_status(self, connection_id: str, status: str) -> dict | None:
        """Update connection status and return the serialized document."""
        try:
            object_id = ObjectId(connection_id)
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
        return await self.get_by_id(connection_id)

    async def reopen_as_pending(
        self,
        connection_id: str,
        requester_id: str,
        addressee_id: str,
    ) -> dict | None:
        """Reuse a declined row as a new pending request."""
        try:
            object_id = ObjectId(connection_id)
        except InvalidId:
            return None

        result = await self._collection.update_one(
            {"_id": object_id},
            {
                "$set": {
                    "requester_id": requester_id,
                    "addressee_id": addressee_id,
                    "status": "pending",
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        if result.matched_count == 0:
            return None
        return await self.get_by_id(connection_id)

    async def delete(self, connection_id: str) -> bool:
        """Delete a connection by id. Returns True if removed."""
        try:
            object_id = ObjectId(connection_id)
        except InvalidId:
            return False

        result = await self._collection.delete_one({"_id": object_id})
        if result.deleted_count == 0:
            return False

        logger.info("Deleted connection — id=%s", connection_id)
        return True

    @staticmethod
    def _serialize(document: dict | None) -> dict | None:
        if document is None:
            return None

        created_at = document.get("created_at")
        updated_at = document.get("updated_at")
        return {
            "id": str(document["_id"]),
            "requester_id": document.get("requester_id") or "",
            "addressee_id": document.get("addressee_id") or "",
            "status": document.get("status") or "pending",
            "created_at": created_at.isoformat()
            if isinstance(created_at, datetime)
            else created_at,
            "updated_at": updated_at.isoformat()
            if isinstance(updated_at, datetime)
            else updated_at,
        }
