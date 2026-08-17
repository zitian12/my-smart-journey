"""Invite connected friends to view a saved itinerary (read-only)."""

from __future__ import annotations

import logging

from pymongo.errors import DuplicateKeyError

from database.models.trip_share import TripShare
from integration.repositories import (
    ConnectionRepository,
    ItineraryRepository,
    TripShareRepository,
    UserRepository,
)
from schemas.profile import public_user_from_document
from services.itinerary_persistence_service import to_detail, to_summary

logger = logging.getLogger(__name__)


class TripShareError(Exception):
    """Domain error with an HTTP-friendly status code."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.message = message
        self.status_code = status_code


class TripShareService:
    """Create, accept, and list read-only itinerary shares."""

    def __init__(
        self,
        share_repository: TripShareRepository | None = None,
        itinerary_repository: ItineraryRepository | None = None,
        connection_repository: ConnectionRepository | None = None,
        user_repository: UserRepository | None = None,
    ) -> None:
        self._shares = share_repository or TripShareRepository()
        self._itineraries = itinerary_repository or ItineraryRepository()
        self._connections = connection_repository or ConnectionRepository()
        self._users = user_repository or UserRepository()

    async def invite(
        self,
        current_user: dict,
        itinerary_id: str,
        recipient_id: str,
    ) -> dict:
        """Owner invites an accepted friend to view a saved trip."""
        owner_id = str(current_user["id"])
        if recipient_id == owner_id:
            raise TripShareError("You cannot share a trip with yourself", 400)

        itinerary = await self._require_owned_itinerary(itinerary_id, owner_id)
        if not await self._connections.are_accepted_friends(owner_id, recipient_id):
            raise TripShareError(
                "You can only share trips with accepted friends",
                400,
            )

        recipient = await self._users.get_user_by_id(recipient_id)
        if recipient is None:
            raise TripShareError("User not found", 404)

        existing = await self._shares.get_for_recipient(itinerary_id, recipient_id)
        if existing is None:
            try:
                created = await self._shares.create(
                    TripShare(
                        itinerary_id=itinerary_id,
                        owner_id=owner_id,
                        recipient_id=recipient_id,
                    )
                )
            except DuplicateKeyError as exc:
                raise TripShareError("This trip is already shared", 409) from exc
            return self._to_owner_item(created, recipient, itinerary)

        status = existing.get("status")
        if status == "accepted":
            raise TripShareError("This trip is already shared with them", 409)
        if status == "pending":
            raise TripShareError("Invite already sent", 409)

        reopened = await self._shares.reopen_as_pending(existing["id"])
        if reopened is None:
            raise TripShareError("Share not found", 404)
        return self._to_owner_item(reopened, recipient, itinerary)

    async def list_for_itinerary(
        self,
        current_user: dict,
        itinerary_id: str,
    ) -> list[dict]:
        """Owner lists who this trip is shared with."""
        owner_id = str(current_user["id"])
        itinerary = await self._require_owned_itinerary(itinerary_id, owner_id)
        rows = await self._shares.list_for_itinerary(itinerary_id)
        recipient_ids = [row["recipient_id"] for row in rows]
        users = await self._users.get_users_by_ids(recipient_ids)
        by_id = {user["id"]: user for user in users}
        return [
            self._to_owner_item(
                row,
                by_id.get(row["recipient_id"])
                or {
                    "id": row["recipient_id"],
                    "email": "",
                    "full_name": "Unknown user",
                    "nickname": "",
                    "profile_picture": "",
                },
                itinerary,
            )
            for row in rows
        ]

    async def list_shared_with_me(self, current_user: dict) -> list[dict]:
        """Trips the current user has accepted as a viewer."""
        user_id = str(current_user["id"])
        rows = await self._shares.list_accepted_for_recipient(user_id)
        return await self._hydrate_shared_summaries(rows)

    async def list_pending_invites(self, current_user: dict) -> list[dict]:
        """Pending trip invites for the current user."""
        user_id = str(current_user["id"])
        rows = await self._shares.list_pending_for_recipient(user_id)
        return await self._hydrate_invite_items(rows)

    async def list_with_friend(self, current_user: dict, friend_id: str) -> dict:
        """List accepted/pending shares between the current user and a friend."""
        user_id = str(current_user["id"])
        if friend_id == user_id:
            raise TripShareError("Connection not found", 404)
        if not await self._connections.are_accepted_friends(user_id, friend_id):
            raise TripShareError("Connection not found", 404)

        friend = await self._users.get_user_by_id(friend_id)
        if friend is None:
            raise TripShareError("Connection not found", 404)

        rows = await self._shares.list_between_users(user_id, friend_id)
        from_friend_rows = [
            row
            for row in rows
            if row.get("owner_id") == friend_id
            and row.get("recipient_id") == user_id
            and row.get("status") == "accepted"
        ]
        to_friend_rows = [
            row
            for row in rows
            if row.get("owner_id") == user_id
            and row.get("recipient_id") == friend_id
            and row.get("status") in {"pending", "accepted"}
        ]

        itinerary_ids = [row["itinerary_id"] for row in to_friend_rows]
        itineraries = await self._itineraries.list_by_ids(itinerary_ids)
        itinerary_by_id = {doc["id"]: doc for doc in itineraries}
        to_friend = [
            self._to_owner_item(row, friend, itinerary_by_id[row["itinerary_id"]])
            for row in to_friend_rows
            if row["itinerary_id"] in itinerary_by_id
        ]

        return {
            "from_friend": await self._hydrate_invite_items(from_friend_rows),
            "to_friend": to_friend,
        }

    async def accept(self, current_user: dict, share_id: str) -> dict:
        """Recipient accepts a trip invite."""
        return await self._set_recipient_status(current_user, share_id, "accepted")

    async def decline(self, current_user: dict, share_id: str) -> dict:
        """Recipient declines a trip invite."""
        return await self._set_recipient_status(current_user, share_id, "declined")

    async def revoke(
        self,
        current_user: dict,
        itinerary_id: str,
        recipient_id: str,
    ) -> None:
        """Owner removes a friend's access to a trip."""
        owner_id = str(current_user["id"])
        await self._require_owned_itinerary(itinerary_id, owner_id)
        deleted = await self._shares.delete_for_owner_recipient(
            itinerary_id,
            owner_id,
            recipient_id,
        )
        if not deleted:
            raise TripShareError("Share not found", 404)

    async def get_for_viewer(
        self,
        current_user: dict,
        itinerary_id: str,
    ) -> dict | None:
        """Return a trip if the user owns it or has an accepted share."""
        user_id = str(current_user["id"])
        doc = await self._itineraries.get_by_id(itinerary_id)
        if doc is None:
            return None

        if doc.get("user_id") == user_id:
            detail = to_detail(doc)
            detail["is_read_only"] = False
            detail["shared_by"] = None
            return detail

        if not await self._shares.has_accepted_share(itinerary_id, user_id):
            return None

        owner = await self._users.get_user_by_id(str(doc.get("user_id") or ""))
        detail = to_detail(doc)
        detail["is_read_only"] = True
        detail["shared_by"] = public_user_from_document(owner) if owner else None
        return detail

    async def _set_recipient_status(
        self,
        current_user: dict,
        share_id: str,
        status: str,
    ) -> dict:
        user_id = str(current_user["id"])
        share = await self._shares.get_by_id(share_id)
        if share is None or share.get("recipient_id") != user_id:
            raise TripShareError("Share not found", 404)
        if share.get("status") != "pending":
            raise TripShareError("This invite is no longer pending", 400)

        updated = await self._shares.update_status(share_id, status)
        if updated is None:
            raise TripShareError("Share not found", 404)

        items = await self._hydrate_invite_items([updated])
        return items[0]

    async def _require_owned_itinerary(
        self,
        itinerary_id: str,
        owner_id: str,
    ) -> dict:
        itinerary = await self._itineraries.get_by_id(itinerary_id)
        if itinerary is None or itinerary.get("user_id") != owner_id:
            raise TripShareError("Itinerary not found", 404)
        return itinerary

    async def _hydrate_shared_summaries(self, rows: list[dict]) -> list[dict]:
        itinerary_ids = [row["itinerary_id"] for row in rows]
        owner_ids = [row["owner_id"] for row in rows]
        itineraries = await self._itineraries.list_by_ids(itinerary_ids)
        owners = await self._users.get_users_by_ids(owner_ids)
        itinerary_by_id = {doc["id"]: doc for doc in itineraries}
        owner_by_id = {user["id"]: user for user in owners}

        summaries = []
        for row in rows:
            doc = itinerary_by_id.get(row["itinerary_id"])
            if doc is None:
                continue
            owner = owner_by_id.get(row["owner_id"])
            summary = to_summary(doc)
            summary["is_read_only"] = True
            summary["shared_by"] = (
                public_user_from_document(owner) if owner else None
            )
            summaries.append(summary)
        return summaries

    async def _hydrate_invite_items(self, rows: list[dict]) -> list[dict]:
        itinerary_ids = [row["itinerary_id"] for row in rows]
        owner_ids = [row["owner_id"] for row in rows]
        itineraries = await self._itineraries.list_by_ids(itinerary_ids)
        owners = await self._users.get_users_by_ids(owner_ids)
        itinerary_by_id = {doc["id"]: doc for doc in itineraries}
        owner_by_id = {user["id"]: user for user in owners}

        items = []
        for row in rows:
            doc = itinerary_by_id.get(row["itinerary_id"])
            owner = owner_by_id.get(row["owner_id"]) or {
                "id": row["owner_id"],
                "email": "",
                "full_name": "Unknown user",
                "nickname": "",
                "profile_picture": "",
            }
            summary = None
            if doc is not None:
                summary = to_summary(doc)
                summary["is_read_only"] = True
                summary["shared_by"] = public_user_from_document(owner)
            items.append(
                {
                    "id": row["id"],
                    "itinerary_id": row["itinerary_id"],
                    "status": row.get("status") or "pending",
                    "user": public_user_from_document(owner),
                    "itinerary": summary,
                    "created_at": row.get("created_at"),
                }
            )
        return items

    @staticmethod
    def _to_owner_item(share: dict, recipient: dict, itinerary: dict) -> dict:
        summary = to_summary(itinerary)
        return {
            "id": share["id"],
            "itinerary_id": share["itinerary_id"],
            "status": share.get("status") or "pending",
            "user": public_user_from_document(recipient),
            "itinerary": summary,
            "created_at": share.get("created_at"),
        }
