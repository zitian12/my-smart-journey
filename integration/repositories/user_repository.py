"""User repository — data access for the users collection."""

import logging
from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection

from database.connection import get_database
from database.models import User

logger = logging.getLogger(__name__)


class UserRepository:
    """Handles CRUD operations for users in MongoDB."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()["users"]

    async def ensure_indexes(self) -> None:
        """Create indexes for the users collection."""
        index_info = await self._collection.index_information()

        for field in ("email", "google_id"):
            legacy_name = f"{field}_1"
            if legacy_name in index_info and "partialFilterExpression" not in index_info[legacy_name]:
                await self._collection.drop_index(legacy_name)
                logger.info("Dropped legacy index: %s", legacy_name)

        await self._collection.create_index(
            "email",
            unique=True,
            partialFilterExpression={"email": {"$exists": True, "$type": "string"}},
        )
        await self._collection.create_index(
            "google_id",
            unique=True,
            partialFilterExpression={"google_id": {"$exists": True, "$type": "string"}},
        )
        logger.info("Ensured indexes on users collection (email, google_id)")

    async def create_user(self, user: User) -> str:
        """Insert a user and return the inserted document id."""
        document = user.model_dump()
        result = await self._collection.insert_one(document)

        if not result.acknowledged:
            raise RuntimeError("MongoDB did not acknowledge the user insert")

        user_id = str(result.inserted_id)
        logger.info(
            "User document written to MongoDB — email=%s id=%s collection=users",
            user.email,
            user_id,
        )
        return user_id

    async def get_user_by_email(self, email: str) -> dict | None:
        """Return a user document by email, or None if not found."""
        document = await self._collection.find_one({"email": email})
        return self._serialize(document)

    async def get_user_by_google_id(self, google_id: str) -> dict | None:
        """Return a user document by Google id, or None if not found."""
        document = await self._collection.find_one({"google_id": google_id})
        return self._serialize(document)

    async def get_user_by_id(self, user_id: str) -> dict | None:
        """Return a user document by id, or None if not found."""
        try:
            object_id = ObjectId(user_id)
        except InvalidId:
            return None

        document = await self._collection.find_one({"_id": object_id})
        return self._serialize(document)

    async def update_last_login(self, user_id: str, email: str) -> None:
        """Update the last_login timestamp for a user."""
        result = await self._collection.update_one(
            {"_id": ObjectId(user_id)},
            {"$set": {"last_login": datetime.now(timezone.utc)}},
        )

        if result.matched_count == 0:
            raise RuntimeError(f"User not found for last_login update: {user_id}")

        logger.info(
            "Updated last_login in MongoDB — email=%s id=%s",
            email,
            user_id,
        )

    @staticmethod
    def _serialize(document: dict | None) -> dict | None:
        if document is None:
            return None
        return {
            "id": str(document["_id"]),
            "google_id": document.get("google_id"),
            "email": document["email"],
            "full_name": document.get("full_name"),
            "profile_picture": document.get("profile_picture"),
            "created_at": document.get("created_at"),
            "last_login": document.get("last_login"),
        }
