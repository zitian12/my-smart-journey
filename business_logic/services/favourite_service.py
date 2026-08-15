"""User destination favourites and folders."""

from __future__ import annotations

from database.models.favourite import (
    FavouriteDestination,
    FavouriteFolder,
    FavouriteFolderItem,
)
from integration.repositories import (
    DestinationCategoryRepository,
    DestinationRepository,
    FavouriteDestinationRepository,
    FavouriteFolderItemRepository,
    FavouriteFolderRepository,
)
from services.destination_image_service import DestinationImageService


class FavouriteService:
    """Authenticated favourite and folder operations."""

    def __init__(
        self,
        favourite_repository: FavouriteDestinationRepository | None = None,
        folder_repository: FavouriteFolderRepository | None = None,
        folder_item_repository: FavouriteFolderItemRepository | None = None,
        destination_repository: DestinationRepository | None = None,
        category_repository: DestinationCategoryRepository | None = None,
    ) -> None:
        self._favourites = favourite_repository or FavouriteDestinationRepository()
        self._folders = folder_repository or FavouriteFolderRepository()
        self._folder_items = folder_item_repository or FavouriteFolderItemRepository()
        self._destinations = destination_repository or DestinationRepository()
        self._categories = category_repository or DestinationCategoryRepository()

    async def list_favourite_ids(self, user_id: str) -> list[str]:
        return await self._favourites.list_destination_ids(user_id)

    async def list_favourites(self, user_id: str) -> list[dict]:
        favourites = await self._favourites.list_by_user(user_id)
        destination_ids = [
            str(item.get("destination_id") or "")
            for item in favourites
            if item.get("destination_id")
        ]
        return await self._load_destinations_ordered(destination_ids)

    async def add_favourite(self, user_id: str, destination_id: str) -> dict:
        destination = await self._require_active_destination(destination_id)
        await self._favourites.add(
            FavouriteDestination(user_id=user_id, destination_id=destination_id)
        )
        return destination

    async def remove_favourite(self, user_id: str, destination_id: str) -> bool:
        removed = await self._favourites.remove(user_id, destination_id)
        if removed:
            await self._folder_items.delete_destination_for_user(
                user_id, destination_id
            )
        return removed

    async def list_folders(self, user_id: str) -> list[dict]:
        folders = await self._folders.list_by_user(user_id)
        folder_ids = [str(folder.get("id") or "") for folder in folders]
        counts = await self._folder_items.count_by_folder_ids(user_id, folder_ids)
        return [
            {
                "id": folder["id"],
                "name": folder.get("name") or "",
                "item_count": counts.get(folder["id"], 0),
                "created_at": folder.get("created_at"),
                "updated_at": folder.get("updated_at"),
            }
            for folder in folders
        ]

    async def create_folder(self, user_id: str, name: str) -> dict:
        cleaned = name.strip()
        if not cleaned:
            raise ValueError("Folder name is required")
        folder = await self._folders.create(
            FavouriteFolder(user_id=user_id, name=cleaned)
        )
        return {
            "id": folder["id"],
            "name": folder.get("name") or "",
            "item_count": 0,
            "created_at": folder.get("created_at"),
            "updated_at": folder.get("updated_at"),
        }

    async def rename_folder(
        self,
        user_id: str,
        folder_id: str,
        name: str,
    ) -> dict | None:
        cleaned = name.strip()
        if not cleaned:
            raise ValueError("Folder name is required")
        folder = await self._folders.rename(folder_id, user_id, cleaned)
        if folder is None:
            return None
        counts = await self._folder_items.count_by_folder_ids(user_id, [folder_id])
        return {
            "id": folder["id"],
            "name": folder.get("name") or "",
            "item_count": counts.get(folder_id, 0),
            "created_at": folder.get("created_at"),
            "updated_at": folder.get("updated_at"),
        }

    async def delete_folder(self, user_id: str, folder_id: str) -> bool:
        folder = await self._folders.get_for_user(folder_id, user_id)
        if folder is None:
            return False
        await self._folder_items.delete_by_folder(folder_id, user_id)
        return await self._folders.delete(folder_id, user_id)

    async def list_folder_items(self, user_id: str, folder_id: str) -> list[dict] | None:
        folder = await self._folders.get_for_user(folder_id, user_id)
        if folder is None:
            return None
        items = await self._folder_items.list_by_folder(folder_id, user_id)
        destination_ids = [
            str(item.get("destination_id") or "")
            for item in items
            if item.get("destination_id")
        ]
        return await self._load_destinations_ordered(destination_ids)

    async def add_folder_item(
        self,
        user_id: str,
        folder_id: str,
        destination_id: str,
    ) -> dict | None:
        folder = await self._folders.get_for_user(folder_id, user_id)
        if folder is None:
            return None
        destination = await self._require_active_destination(destination_id)
        await self._favourites.add(
            FavouriteDestination(user_id=user_id, destination_id=destination_id)
        )
        await self._folder_items.add(
            FavouriteFolderItem(
                user_id=user_id,
                folder_id=folder_id,
                destination_id=destination_id,
            )
        )
        return destination

    async def remove_folder_item(
        self,
        user_id: str,
        folder_id: str,
        destination_id: str,
    ) -> bool | None:
        folder = await self._folders.get_for_user(folder_id, user_id)
        if folder is None:
            return None
        return await self._folder_items.remove(folder_id, user_id, destination_id)

    async def _require_active_destination(self, destination_id: str) -> dict:
        destination = await self._destinations.get_by_id(destination_id)
        if destination is None or not destination.get("is_active", True):
            raise LookupError("Destination not found")
        return await self._enrich_one(destination)

    async def _load_destinations_ordered(
        self,
        destination_ids: list[str],
    ) -> list[dict]:
        if not destination_ids:
            return []
        destinations = await self._destinations.get_by_ids(destination_ids)
        lookup = {
            dest["id"]: dest
            for dest in destinations
            if dest and dest.get("is_active", True)
        }
        category_lookup = await self._category_lookup()
        ordered: list[dict] = []
        for destination_id in destination_ids:
            destination = lookup.get(destination_id)
            if destination is None:
                continue
            ordered.append(self._enrich(destination, category_lookup))
        return ordered

    async def _enrich_one(self, destination: dict) -> dict:
        category_lookup = await self._category_lookup()
        return self._enrich(destination, category_lookup)

    async def _category_lookup(self) -> dict[str, dict]:
        categories = await self._categories.list_active()
        lookup: dict[str, dict] = {}
        for category in categories:
            lookup[category["id"]] = category
            lookup[category["slug"]] = category
            lookup[category["slug"].lower()] = category
        return lookup

    @staticmethod
    def _enrich(destination: dict, category_lookup: dict[str, dict]) -> dict:
        category = category_lookup.get(destination.get("category_id") or "")
        enriched = dict(destination)
        enriched["category_name"] = category["name"] if category else None
        enriched["category_slug"] = category["slug"] if category else None
        enriched["is_featured"] = bool(destination.get("is_featured", False))
        enriched["images"] = DestinationImageService.real_images(
            destination.get("images")
        )
        if DestinationImageService.is_template_description(
            enriched.get("description")
        ):
            enriched["description"] = ""
        return enriched
