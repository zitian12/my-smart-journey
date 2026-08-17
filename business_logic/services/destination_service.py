"""Public destination query service."""

from __future__ import annotations

from integration.repositories import (
    DestinationCategoryRepository,
    DestinationRepository,
)


class DestinationService:
    """Read-side destination and category queries for the public API."""

    def __init__(
        self,
        destination_repository: DestinationRepository | None = None,
        category_repository: DestinationCategoryRepository | None = None,
    ) -> None:
        self._destinations = destination_repository or DestinationRepository()
        self._categories = category_repository or DestinationCategoryRepository()

    async def list_categories(self) -> list[dict]:
        """Return active destination categories."""
        return await self._categories.list_active()

    async def list_destinations(
        self,
        *,
        name: str | None = None,
        state: str | None = None,
        category: str | None = None,
    ) -> list[dict]:
        """Return active destinations filtered by name, state, and/or category slug/id."""
        category_id = None
        category_lookup = await self._category_lookup()

        if category:
            matched = category_lookup.get(category.lower()) or category_lookup.get(
                category
            )
            if matched is None:
                by_id = await self._categories.get_by_id(category)
                if by_id is None:
                    return []
                category_id = by_id["id"]
            else:
                category_id = matched["id"]

        destinations = await self._destinations.list_destinations(
            name=name,
            state=state,
            category_id=category_id,
        )
        return [self._enrich(dest, category_lookup) for dest in destinations]

    async def get_destination(self, destination_id: str) -> dict | None:
        """Return a single destination with category metadata, or None."""
        destination = await self._destinations.get_by_id(destination_id)
        if destination is None or not destination.get("is_active", True):
            return None

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
        return enriched
