"""Friend connection request, accept, decline, and list logic."""

from __future__ import annotations

import logging

from pymongo.errors import DuplicateKeyError

from database.models.connection import Connection
from integration.repositories import (
    ConnectionRepository,
    TripShareRepository,
    UserRepository,
)
from schemas.profile import public_user_from_document

logger = logging.getLogger(__name__)


class ConnectionError(Exception):
    """Domain error with an HTTP-friendly status code."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class ConnectionService:
    """Manage friend requests between registered users."""

    def __init__(
        self,
        connection_repository: ConnectionRepository | None = None,
        user_repository: UserRepository | None = None,
        trip_share_repository: TripShareRepository | None = None,
    ) -> None:
        self._connections = connection_repository or ConnectionRepository()
        self._users = user_repository or UserRepository()
        self._shares = trip_share_repository or TripShareRepository()

    async def request_by_user_id(self, current_user: dict, user_id: str) -> dict:
        """Send (or re-open) a friend request to an existing user by id."""
        requester_id = str(current_user["id"])
        addressee_id = user_id.strip()
        if not addressee_id:
            raise ConnectionError("User id is required", 400)
        if addressee_id == requester_id:
            raise ConnectionError("You cannot add yourself", 400)

        addressee = await self._users.get_user_by_id(addressee_id)
        if addressee is None:
            raise ConnectionError(
                "No account found for that user. They need to sign in "
                "with Google first.",
                404,
            )

        return await self._create_or_update_request(
            requester_id,
            addressee_id,
            addressee,
        )

    async def search_users(self, current_user: dict, query: str) -> dict:
        """Search registered users and include relationship to the current user."""
        cleaned = query.strip()
        if len(cleaned) < 2:
            return {"items": []}

        user_id = str(current_user["id"])
        users = await self._users.search_users(cleaned, exclude_user_id=user_id)
        if not users:
            return {"items": []}

        accepted = await self._connections.list_accepted_for_user(user_id)
        incoming = await self._connections.list_incoming_pending(user_id)
        outgoing = await self._connections.list_outgoing_pending(user_id)

        by_other: dict[str, dict] = {}
        for row in accepted:
            other = (
                row["addressee_id"]
                if row["requester_id"] == user_id
                else row["requester_id"]
            )
            by_other[other] = {"relationship": "friends", "connection_id": row["id"]}
        for row in outgoing:
            by_other[row["addressee_id"]] = {
                "relationship": "pending_out",
                "connection_id": row["id"],
            }
        for row in incoming:
            by_other[row["requester_id"]] = {
                "relationship": "pending_in",
                "connection_id": row["id"],
            }

        items = []
        for user in users:
            rel = by_other.get(user["id"]) or {
                "relationship": "none",
                "connection_id": None,
            }
            items.append(
                {
                    "user": public_user_from_document(user),
                    "relationship": rel["relationship"],
                    "connection_id": rel["connection_id"],
                }
            )
        return {"items": items}

    async def _create_or_update_request(
        self,
        requester_id: str,
        addressee_id: str,
        addressee: dict,
    ) -> dict:
        existing = await self._connections.get_between(requester_id, addressee_id)

        if existing is None:
            try:
                created = await self._connections.create(
                    Connection(
                        requester_id=requester_id,
                        addressee_id=addressee_id,
                    )
                )
            except DuplicateKeyError as exc:
                raise ConnectionError(
                    "A connection request already exists",
                    409,
                ) from exc
            return self._to_item(created, requester_id, addressee)

        status = existing.get("status")
        if status == "accepted":
            raise ConnectionError("You are already connected", 409)
        if status == "pending":
            if existing.get("requester_id") == requester_id:
                raise ConnectionError("Friend request already sent", 409)
            updated = await self._connections.update_status(
                existing["id"],
                "accepted",
            )
            if updated is None:
                raise ConnectionError("Connection not found", 404)
            return self._to_item(updated, requester_id, addressee)

        reopened = await self._connections.reopen_as_pending(
            existing["id"],
            requester_id,
            addressee_id,
        )
        if reopened is None:
            raise ConnectionError("Connection not found", 404)
        return self._to_item(reopened, requester_id, addressee)

    async def list_friends(self, current_user: dict) -> list[dict]:
        """Return accepted friends for the current user."""
        user_id = str(current_user["id"])
        rows = await self._connections.list_accepted_for_user(user_id)
        return await self._hydrate_items(rows, user_id)

    async def list_pending(self, current_user: dict) -> dict:
        """Return incoming and outgoing pending requests."""
        user_id = str(current_user["id"])
        incoming_rows = await self._connections.list_incoming_pending(user_id)
        outgoing_rows = await self._connections.list_outgoing_pending(user_id)
        return {
            "incoming": await self._hydrate_items(incoming_rows, user_id),
            "outgoing": await self._hydrate_items(outgoing_rows, user_id),
        }

    async def accept(self, current_user: dict, connection_id: str) -> dict:
        """Accept an incoming friend request."""
        user_id = str(current_user["id"])
        connection = await self._require_connection(connection_id)
        if connection.get("addressee_id") != user_id:
            raise ConnectionError("Connection not found", 404)
        if connection.get("status") != "pending":
            raise ConnectionError("This request is no longer pending", 400)

        updated = await self._connections.update_status(connection_id, "accepted")
        if updated is None:
            raise ConnectionError("Connection not found", 404)

        other = await self._other_user(updated, user_id)
        return self._to_item(updated, user_id, other)

    async def decline(self, current_user: dict, connection_id: str) -> dict:
        """Decline an incoming friend request."""
        user_id = str(current_user["id"])
        connection = await self._require_connection(connection_id)
        if connection.get("addressee_id") != user_id:
            raise ConnectionError("Connection not found", 404)
        if connection.get("status") != "pending":
            raise ConnectionError("This request is no longer pending", 400)

        updated = await self._connections.update_status(connection_id, "declined")
        if updated is None:
            raise ConnectionError("Connection not found", 404)

        other = await self._other_user(updated, user_id)
        return self._to_item(updated, user_id, other)

    async def remove(self, current_user: dict, connection_id: str) -> None:
        """Cancel a pending request or unfriend an accepted connection."""
        user_id = str(current_user["id"])
        connection = await self._require_connection(connection_id)
        requester_id = connection.get("requester_id")
        addressee_id = connection.get("addressee_id")
        if user_id not in {requester_id, addressee_id}:
            raise ConnectionError("Connection not found", 404)

        status = connection.get("status")
        if status == "pending" and requester_id != user_id:
            raise ConnectionError(
                "Decline incoming requests instead of deleting them",
                400,
            )

        other_id = addressee_id if requester_id == user_id else requester_id
        await self._connections.delete(connection_id)
        if status == "accepted" and other_id:
            await self._shares.delete_between_users(user_id, str(other_id))

    async def _require_connection(self, connection_id: str) -> dict:
        connection = await self._connections.get_by_id(connection_id)
        if connection is None:
            raise ConnectionError("Connection not found", 404)
        return connection

    async def _other_user(self, connection: dict, current_user_id: str) -> dict:
        other_id = (
            connection["addressee_id"]
            if connection["requester_id"] == current_user_id
            else connection["requester_id"]
        )
        user = await self._users.get_user_by_id(other_id)
        if user is None:
            return {
                "id": other_id,
                "email": "",
                "full_name": "Unknown user",
                "nickname": "",
                "profile_picture": "",
            }
        return user

    async def _hydrate_items(
        self,
        rows: list[dict],
        current_user_id: str,
    ) -> list[dict]:
        other_ids = []
        for row in rows:
            other_id = (
                row["addressee_id"]
                if row["requester_id"] == current_user_id
                else row["requester_id"]
            )
            other_ids.append(other_id)

        users = await self._users.get_users_by_ids(other_ids)
        by_id = {user["id"]: user for user in users}
        items = []
        for row in rows:
            other_id = (
                row["addressee_id"]
                if row["requester_id"] == current_user_id
                else row["requester_id"]
            )
            other = by_id.get(other_id) or {
                "id": other_id,
                "email": "",
                "full_name": "Unknown user",
                "nickname": "",
                "profile_picture": "",
            }
            items.append(self._to_item(row, current_user_id, other))
        return items

    @staticmethod
    def _to_item(connection: dict, current_user_id: str, other_user: dict) -> dict:
        direction = (
            "outgoing"
            if connection.get("requester_id") == current_user_id
            else "incoming"
        )
        return {
            "id": connection["id"],
            "status": connection.get("status") or "pending",
            "direction": direction,
            "user": public_user_from_document(other_user),
            "created_at": connection.get("created_at"),
        }
