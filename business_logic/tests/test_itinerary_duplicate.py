"""Duplicate clones a saved itinerary snapshot without sharing favourite/id."""

from __future__ import annotations

import asyncio
import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_BL = Path(__file__).resolve().parents[1]
for _path in (_ROOT, _BL):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

from database.models.itinerary import SavedItinerary
from services.itinerary_persistence_service import ItineraryPersistenceService

PAVILION_ID = "507f1f77bcf86cd799439011"
ORIGINAL_ID = "64f1a2b3c4d5e6f7a8b9c0d1"
COPIED_ID = "64f1a2b3c4d5e6f7a8b9c0d2"
COVER = "https://lh3.googleusercontent.com/places/pavilion-cover"


class FakeItineraryRepo:
    def __init__(self, source: dict) -> None:
        self.source = source
        self.created: dict | None = None

    async def get_by_id(self, itinerary_id: str) -> dict | None:
        if itinerary_id != self.source["id"]:
            return None
        return self.source

    async def create(self, itinerary: SavedItinerary) -> dict:
        dumped = itinerary.model_dump()
        dumped["id"] = COPIED_ID
        self.created = dumped
        return dumped


class FakeDestinationRepo:
    async def get_by_ids(self, destination_ids: list[str]) -> list[dict]:
        return []


def _source_doc(*, user_id: str = "user-1") -> dict:
    return {
        "id": ORIGINAL_ID,
        "user_id": user_id,
        "name": "Song → Sabah State Railway",
        "start_point": "Song",
        "end_point": "Sabah State Railway",
        "location": "DBKU Cat Museum · Chimney Museum, Malaysia",
        "days": 3,
        "nights": 2,
        "hours_per_day": 5,
        "travelers": 1,
        "eco_score": 0,
        "status": "upcoming",
        "image": COVER,
        "is_favourite": True,
        "itinerary": {
            "destinations": [
                {"id": PAVILION_ID, "name": "DBKU Cat Museum"},
            ],
            "legs": [{"from_place": {"id": "a"}, "to_place": {"id": "b"}}],
        },
        "places": [
            {"id": PAVILION_ID, "name": "DBKU Cat Museum", "image": COVER},
        ],
    }


class DuplicateItineraryTests(unittest.TestCase):
    def test_duplicate_copies_snapshot_with_new_id(self) -> None:
        asyncio.run(self._duplicate_copies_snapshot_with_new_id())

    async def _duplicate_copies_snapshot_with_new_id(self) -> None:
        source = _source_doc()
        repo = FakeItineraryRepo(source)
        service = ItineraryPersistenceService(
            repository=repo,  # type: ignore[arg-type]
            share_repository=object(),  # type: ignore[arg-type]
            destination_repository=FakeDestinationRepo(),  # type: ignore[arg-type]
        )

        summary = await service.duplicate_for_user(ORIGINAL_ID, "user-1")
        created = repo.created
        assert summary is not None
        assert created is not None

        self.assertEqual(summary["id"], COPIED_ID)
        self.assertNotEqual(summary["id"], ORIGINAL_ID)
        self.assertEqual(summary["name"], "Song → Sabah State Railway (copy)")
        self.assertFalse(summary["is_favourite"])
        self.assertEqual(created["start_point"], source["start_point"])
        self.assertEqual(created["end_point"], source["end_point"])
        self.assertEqual(created["location"], source["location"])
        self.assertEqual(created["days"], 3)
        self.assertEqual(created["nights"], 2)
        self.assertEqual(created["travelers"], 1)
        self.assertEqual(created["hours_per_day"], 5)
        self.assertEqual(created["image"], COVER)
        self.assertEqual(
            created["itinerary"]["destinations"][0]["id"],
            PAVILION_ID,
        )
        self.assertEqual(created["places"][0]["id"], PAVILION_ID)
        created["places"][0]["name"] = "mutated"
        self.assertEqual(source["places"][0]["name"], "DBKU Cat Museum")

    def test_duplicate_rejects_other_users(self) -> None:
        asyncio.run(self._duplicate_rejects_other_users())

    async def _duplicate_rejects_other_users(self) -> None:
        repo = FakeItineraryRepo(_source_doc(user_id="owner"))
        service = ItineraryPersistenceService(
            repository=repo,  # type: ignore[arg-type]
            share_repository=object(),  # type: ignore[arg-type]
            destination_repository=FakeDestinationRepo(),  # type: ignore[arg-type]
        )
        result = await service.duplicate_for_user(ORIGINAL_ID, "other-user")
        self.assertIsNone(result)
        self.assertIsNone(repo.created)


if __name__ == "__main__":
    unittest.main()
