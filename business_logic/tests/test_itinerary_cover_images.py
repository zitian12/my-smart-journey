"""Cover photos for saved trip cards come from catalog destinations — no Google calls."""

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

from services.itinerary_persistence_service import (
    FALLBACK_IMAGE,
    attach_cover_images,
    destination_ids_in_order,
    resolve_cover_image,
    to_summary,
)

PAVILION_ID = "507f1f77bcf86cd799439011"
AQUARIA_ID = "507f191e810c19729de860ea"
SURIA_ID = "507f1f77bcf86cd799439012"

PAVILION_PHOTO = "https://lh3.googleusercontent.com/places/pavilion-cover"
AQUARIA_PHOTO = "https://lh3.googleusercontent.com/places/aquaria-cover"
UNSPLASH_JUNK = (
    "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&q=80"
)


class FakeDestinationRepo:
    def __init__(self, by_id: dict[str, dict]) -> None:
        self.by_id = by_id
        self.calls: list[list[str]] = []

    async def get_by_ids(self, destination_ids: list[str]) -> list[dict]:
        self.calls.append(list(destination_ids))
        return [self.by_id[item] for item in destination_ids if item in self.by_id]


def _dest(dest_id: str, images: list[str]) -> dict:
    return {"id": dest_id, "images": images}


def _doc(
    trip_id: str,
    dest_ids: list[str],
    *,
    image: str = FALLBACK_IMAGE,
    places: list[dict] | None = None,
) -> dict:
    return {
        "id": trip_id,
        "name": f"Trip {trip_id}",
        "start_point": "Sleeping Lion Suites",
        "end_point": "Plaza Low Yat",
        "location": "",
        "days": 1,
        "nights": 0,
        "travelers": 1,
        "hours_per_day": 8,
        "eco_score": 0,
        "status": "upcoming",
        "image": image,
        "is_favourite": False,
        "created_at": None,
        "itinerary": {
            "destinations": [
                {"id": dest_id, "name": f"Stop {index}"}
                for index, dest_id in enumerate(dest_ids)
            ],
            "legs": [],
            "sustainability": {
                "score": 0,
                "total_footprint_kg": 0,
                "baseline_footprint_kg": 0,
                "emissions_reduced_kg": 0,
                "reduction_percent": 0,
            },
        },
        "places": places
        or [
            {"id": "sleeping-lion-suites", "name": "Sleeping Lion Suites"},
            *[
                {"id": dest_id, "name": f"Stop {index}"}
                for index, dest_id in enumerate(dest_ids)
            ],
            {"id": "plaza-low-yat", "name": "Plaza Low Yat"},
        ],
    }


class CoverImageTests(unittest.TestCase):
    def test_two_trips_get_distinct_first_stop_covers(self) -> None:
        asyncio.run(self._two_trips_get_distinct_first_stop_covers())

    async def _two_trips_get_distinct_first_stop_covers(self) -> None:
        docs = [
            _doc("trip-a", [PAVILION_ID, AQUARIA_ID]),
            _doc("trip-b", [AQUARIA_ID, SURIA_ID]),
        ]
        repo = FakeDestinationRepo(
            {
                PAVILION_ID: _dest(PAVILION_ID, [PAVILION_PHOTO]),
                AQUARIA_ID: _dest(AQUARIA_ID, [AQUARIA_PHOTO]),
                SURIA_ID: _dest(SURIA_ID, []),
            }
        )
        summaries = [to_summary(doc) for doc in docs]
        await attach_cover_images(summaries, docs, destination_repository=repo)

        self.assertEqual(summaries[0]["image"], PAVILION_PHOTO)
        self.assertEqual(summaries[1]["image"], AQUARIA_PHOTO)
        self.assertNotEqual(summaries[0]["image"], summaries[1]["image"])
        self.assertEqual(len(repo.calls), 1)
        self.assertEqual(set(repo.calls[0]), {PAVILION_ID, AQUARIA_ID, SURIA_ID})

    def test_missing_destination_images_keep_fallback(self) -> None:
        asyncio.run(self._missing_destination_images_keep_fallback())

    async def _missing_destination_images_keep_fallback(self) -> None:
        docs = [_doc("trip-empty", [PAVILION_ID])]
        repo = FakeDestinationRepo({PAVILION_ID: _dest(PAVILION_ID, [])})
        summaries = [to_summary(docs[0])]
        await attach_cover_images(summaries, docs, destination_repository=repo)
        self.assertEqual(summaries[0]["image"], FALLBACK_IMAGE)

    def test_skips_untrusted_first_stop_and_uses_next(self) -> None:
        asyncio.run(self._skips_untrusted_first_stop_and_uses_next())

    async def _skips_untrusted_first_stop_and_uses_next(self) -> None:
        docs = [_doc("trip-next", [PAVILION_ID, AQUARIA_ID])]
        repo = FakeDestinationRepo(
            {
                PAVILION_ID: _dest(PAVILION_ID, [UNSPLASH_JUNK]),
                AQUARIA_ID: _dest(AQUARIA_ID, [AQUARIA_PHOTO]),
            }
        )
        summaries = [to_summary(docs[0])]
        await attach_cover_images(summaries, docs, destination_repository=repo)
        self.assertEqual(summaries[0]["image"], AQUARIA_PHOTO)

    def test_keeps_stored_non_fallback_cover(self) -> None:
        asyncio.run(self._keeps_stored_non_fallback_cover())

    async def _keeps_stored_non_fallback_cover(self) -> None:
        stored = "https://lh3.googleusercontent.com/places/already-saved"
        docs = [_doc("trip-kept", [PAVILION_ID], image=stored)]
        repo = FakeDestinationRepo(
            {PAVILION_ID: _dest(PAVILION_ID, [PAVILION_PHOTO])}
        )
        summaries = [to_summary(docs[0])]
        await attach_cover_images(summaries, docs, destination_repository=repo)
        self.assertEqual(summaries[0]["image"], stored)

    def test_resolve_cover_image_uses_first_catalog_stop(self) -> None:
        asyncio.run(self._resolve_cover_image_uses_first_catalog_stop())

    async def _resolve_cover_image_uses_first_catalog_stop(self) -> None:
        itinerary = {
            "destinations": [
                {"id": PAVILION_ID, "name": "Pavilion Kuala Lumpur"},
                {"id": AQUARIA_ID, "name": "Aquaria KLCC"},
            ]
        }
        places = [
            {"id": "sleeping-lion-suites", "name": "Sleeping Lion Suites"},
            {"id": PAVILION_ID, "name": "Pavilion Kuala Lumpur"},
        ]
        repo = FakeDestinationRepo(
            {
                PAVILION_ID: _dest(PAVILION_ID, [PAVILION_PHOTO]),
                AQUARIA_ID: _dest(AQUARIA_ID, [AQUARIA_PHOTO]),
            }
        )
        cover = await resolve_cover_image(
            itinerary=itinerary,
            places=places,
            destination_repository=repo,
        )
        self.assertEqual(cover, PAVILION_PHOTO)

    def test_destination_ids_skip_start_end_slugs(self) -> None:
        doc = _doc("trip-slugs", [PAVILION_ID, AQUARIA_ID])
        self.assertEqual(
            destination_ids_in_order(doc),
            [PAVILION_ID, AQUARIA_ID],
        )

    def test_destination_ids_fall_back_to_catalog_places(self) -> None:
        doc = _doc("trip-places", [], places=[
            {"id": "sleeping-lion-suites", "name": "Hotel"},
            {"id": PAVILION_ID, "name": "Pavilion Kuala Lumpur"},
            {"id": "plaza-low-yat", "name": "Mall"},
        ])
        self.assertEqual(destination_ids_in_order(doc), [PAVILION_ID])


if __name__ == "__main__":
    unittest.main()
