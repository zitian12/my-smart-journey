"""User repository — data access for the users collection."""

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorCollection

from database.connection import get_database
from database.models import User


class UserRepository:
    """Handles CRUD operations for users in MongoDB."""

    def __init__(self) -> None:
        self._collection: AsyncIOMotorCollection = get_database()["users"]

    async def ensure_indexes(self) -> None:
        """Create indexes for the users collection (email unique)."""
        await self._collection.create_index("email", unique=True)

    async def create_user(self, user: User) -> str:
        """Insert a user and return the inserted document id."""
        result = await self._collection.insert_one(user.model_dump())
        return str(result.inserted_id)

    async def get_user_by_email(self, email: str) -> dict | None:
        """Return a user document by email, or None if not found."""
        document = await self._collection.find_one({"email": email})
        return self._serialize(document)

    async def get_user_by_id(self, user_id: str) -> dict | None:
        """Return a user document by id, or None if not found."""
        try:
            object_id = ObjectId(user_id)
        except InvalidId:
            return None

        document = await self._collection.find_one({"_id": object_id})
        return self._serialize(document)

    @staticmethod
    def _serialize(document: dict | None) -> dict | None:
        if document is None:
            return None
        document["_id"] = str(document["_id"])
        return document
