"""Day-hub orienteering tests — no Google or Gemini calls."""

from __future__ import annotations

import statistics
import sys
import unittest
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_BL = Path(__file__).resolve().parents[1]
for _path in (_ROOT, _BL):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))

from integration.external_api.geo import (
    haversine_km,
    route_projection,
    split_polyline_by_waypoints,
)
from services.itinerary_generation_service import ItineraryGenerationService
from services.itinerary_poi_selection_service import ItineraryPoiSelectionService


def _poi(
    poi_id: str,
    name: str,
    lat: float,
    lng: float,
    slug: str,
    state: str,
    *,
    featured: bool = False,
    images: bool = True,
) -> dict:
    return {
        "id": poi_id,
        "destination_name": name,
        "latitude": lat,
        "longitude": lng,
        "category_slug": slug,
        "state": state,
        "is_featured": featured,
        "images": ["photo.jpg"] if images else [],
    }


CATALOG = [
    _poi("batu-caves", "Batu Caves", 3.2379, 101.6840, "nature", "Selangor", featured=True),
    _poi("petronas", "Petronas Twin Towers", 3.1579, 101.7116, "culture", "Kuala Lumpur", featured=True),
    _poi("merdeka", "Merdeka Square", 3.1486, 101.6936, "heritage", "Kuala Lumpur", featured=True),
    _poi("pavilion", "Pavilion Kuala Lumpur", 3.1490, 101.7134, "shopping", "Kuala Lumpur", featured=True),
    _poi("bird-park", "Kuala Lumpur Bird Park", 3.1422, 101.6889, "nature", "Kuala Lumpur", featured=True),
    _poi("thean-hou", "Thean Hou Temple", 3.1216, 101.6878, "culture", "Kuala Lumpur", featured=True),
    _poi("kellie", "Kellie's Castle", 4.4750, 101.1450, "heritage", "Perak", featured=True),
    _poi("gua", "Gua Tempurung", 4.4160, 101.1880, "adventure", "Perak", featured=True),
    _poi("tambun", "Lost World of Tambun", 4.6750, 101.1550, "adventure", "Perak", featured=True),
    _poi("ipoh-park", "Ipoh Japanese Garden", 4.5975, 101.0901, "nature", "Perak"),
    _poi("boh", "BOH Tea Centre", 4.5220, 101.3830, "nature", "Pahang", featured=True),
    _poi("kek-lok-si", "Kek Lok Si", 5.3994, 100.2736, "heritage", "Pulau Pinang", featured=True),
    _poi("penang-hill", "Penang Hill", 5.4241, 100.2691, "nature", "Pulau Pinang", featured=True),
    _poi("cornwallis", "Fort Cornwallis", 5.4202, 100.3439, "heritage", "Pulau Pinang", featured=True),
    _poi("ferringhi", "Batu Ferringhi Beach", 5.4706, 100.2453, "nature", "Pulau Pinang", featured=True),
    _poi("gurney", "Gurney Plaza", 5.4381, 100.3094, "shopping", "Pulau Pinang", featured=True),
    _poi("jonker", "Jonker Street", 2.1944, 102.2491, "heritage", "Melaka", featured=True),
    _poi("stadthuys", "Stadthuys", 2.1942, 102.2495, "heritage", "Melaka", featured=True),
    _poi("famosa", "A Famosa", 2.1924, 102.2502, "heritage", "Melaka", featured=True),
    _poi("kuching", "Kuching Waterfront", 1.5575, 110.3442, "culture", "Sarawak", featured=True),
]

KL = {"id": "start-kl", "name": "Kuala Lumpur Sentral", "latitude": 3.1340, "longitude": 101.6860}
PENANG = {
    "id": "end-pg",
    "name": "George Town",
    "latitude": 5.4141,
    "longitude": 100.3288,
}
BATU_STATION = {
    "id": "end-batu",
    "name": "Batu Caves station",
    "latitude": 3.2375,
    "longitude": 101.6810,
}
PUCHONG = {
    "id": "start-pc",
    "name": "Puchong",
    "latitude": 3.0326,
    "longitude": 101.6170,
}
JOHOR_BAHRU = {
    "id": "end-jb",
    "name": "Johor Bahru",
    "latitude": 1.4927,
    "longitude": 103.7414,
}


class FakeMaps:
    def route_waypoints(self, points, mode="driving"):
        del points, mode
        return []

    def route_pair(self, a, b, mode="driving"):
        del a, b, mode
        return None


class FakeStepMaps:
    def route_waypoints(self, points, mode="driving"):
        if mode == "transit":
            return []
        if len(points) < 2:
            return []
        kind = "walk" if mode == "walking" else "drive"
        duration = 40 if mode == "walking" else 5
        legs = []
        for a, b in zip(points, points[1:]):
            legs.append(
                {
                    "distance_km": 1.5,
                    "duration_min": duration,
                    "is_estimated": False,
                    "path": [
                        [a[0], a[1]],
                        [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
                        [b[0], b[1]],
                    ],
                    "steps": [
                        {
                            "kind": kind,
                            "instruction": "Head toward Jalan 1/2",
                            "maneuver": "straight",
                            "distance_m": 110,
                            "duration_min": 1,
                        },
                        {
                            "kind": kind,
                            "instruction": "Turn right onto Jalan 1/2",
                            "maneuver": "turn-right",
                            "distance_m": 290,
                            "duration_min": 2,
                        },
                    ],
                }
            )
        return legs

    def route_pair(self, a, b, mode="driving"):
        legs = self.route_waypoints([a, b], mode=mode)
        if not legs:
            return None
        return legs[0]


class FakeRapidMaps:
    def route_waypoints(self, points, mode="driving"):
        if mode != "transit" or len(points) < 2:
            return []
        legs = []
        for a, b in zip(points, points[1:]):
            legs.append(
                {
                    "distance_km": 6.7,
                    "duration_min": 29,
                    "is_estimated": False,
                    "transit_kind": "train",
                    "path": [
                        [a[0], a[1]],
                        [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
                        [b[0], b[1]],
                    ],
                    "steps": [
                        {
                            "kind": "walk",
                            "instruction": "Walk to KL Sentral",
                            "distance_m": 180,
                            "duration_min": 3,
                        },
                        {
                            "kind": "transit",
                            "line": "LRT Kelana Jaya Line",
                            "agency": "Rapid KL",
                            "vehicle": "train",
                            "from_stop": "KL Sentral",
                            "to_stop": "KLCC",
                            "num_stops": 4,
                            "distance_m": 4500,
                            "duration_min": 12,
                        },
                        {
                            "kind": "transit",
                            "line": "Rapid Bus T815",
                            "agency": "Rapid KL",
                            "vehicle": "bus",
                            "from_stop": "KLCC",
                            "to_stop": "Pavilion",
                            "num_stops": 6,
                            "distance_m": 2200,
                            "duration_min": 14,
                        },
                    ],
                }
            )
        return legs

    def route_pair(self, a, b, mode="driving"):
        legs = self.route_waypoints([a, b], mode=mode)
        if not legs:
            return None
        return legs[0]


class FakeOsrm:
    def route_waypoints(self, points, mode="driving", include_steps=False):
        del points, mode, include_steps
        return []


class FakeThinLongLegMaps:
    """Short legs have a rich polyline; the long middle leg has steps but only 2 path points."""

    def route_waypoints(self, points, mode="driving"):
        if mode != "driving" or len(points) < 2:
            return []
        legs = []
        for index, (a, b) in enumerate(zip(points, points[1:])):
            long_leg = index == 1
            path = [[a[0], a[1]], [b[0], b[1]]]
            if not long_leg:
                path = [
                    [a[0], a[1]],
                    [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
                    [b[0], b[1]],
                ]
            instruction = "Get on E9" if long_leg else "Head toward Jalan 1/2"
            legs.append(
                {
                    "distance_km": 24.2 if long_leg else 5.5,
                    "duration_min": 31 if long_leg else 9,
                    "is_estimated": False,
                    "path": path,
                    "steps": [
                        {
                            "kind": "drive",
                            "instruction": instruction,
                            "maneuver": "ramp-right" if long_leg else "straight",
                            "distance_m": 18200 if long_leg else 110,
                            "duration_min": 22 if long_leg else 1,
                        },
                        {
                            "kind": "drive",
                            "instruction": "Follow E9 toward Putrajaya"
                            if long_leg
                            else "Turn right onto Jalan 1/2",
                            "maneuver": "straight",
                            "distance_m": 6000 if long_leg else 290,
                            "duration_min": 9 if long_leg else 2,
                        },
                    ],
                }
            )
        return legs

    def route_pair(self, a, b, mode="driving"):
        legs = self.route_waypoints([a, b], mode=mode)
        if not legs:
            return None
        return legs[0]


class FakeGeometryOsrm:
    def __init__(self) -> None:
        self.last_include_steps = False

    def route_waypoints(self, points, mode="driving", include_steps=False):
        del mode
        self.last_include_steps = include_steps
        legs = []
        for a, b in zip(points, points[1:]):
            row = {
                "distance_km": 99.0,
                "duration_min": 999,
                "is_estimated": False,
                "path": [
                    [a[0], a[1]],
                    [a[0] + 0.01, a[1] + 0.01],
                    [b[0], b[1]],
                ],
            }
            if include_steps:
                row["steps"] = [
                    {
                        "kind": "drive",
                        "instruction": "OSRM only",
                        "distance_m": 100,
                        "duration_min": 1,
                    }
                ]
            legs.append(row)
        return legs


def _mean_progress(stops: list[dict], start: dict, end: dict) -> float:
    start_pt = (float(start["latitude"]), float(start["longitude"]))
    end_pt = (float(end["latitude"]), float(end["longitude"]))
    values = [
        route_projection(
            (float(s["latitude"]), float(s["longitude"])),
            start_pt,
            end_pt,
        )[0]
        for s in stops
    ]
    return sum(values) / len(values)


def _median_span_km(stops: list[dict]) -> float | None:
    if len(stops) < 2:
        return None
    dists = []
    for i, left in enumerate(stops):
        a = (float(left["latitude"]), float(left["longitude"]))
        for right in stops[i + 1 :]:
            dists.append(
                haversine_km(
                    a,
                    (float(right["latitude"]), float(right["longitude"])),
                )
            )
    return statistics.median(dists)


class ItineraryPoiSelectionTests(unittest.TestCase):
    def setUp(self) -> None:
        self.selector = ItineraryPoiSelectionService()

    def test_kl_penang_hubs_are_monotonic_and_compact(self) -> None:
        picked = self.selector.select_from_pool(
            CATALOG,
            start=KL,
            end=PENANG,
            days=3,
            interests=["nature", "culture"],
            hours_per_day=8,
        )
        ids = {str(p["id"]) for p in picked}
        self.assertNotIn("jonker", ids)
        self.assertNotIn("stadthuys", ids)
        self.assertNotIn("kuching", ids)

        progress_by_day: list[float] = []
        for day in range(1, 4):
            day_stops = [p for p in picked if int(p["day"]) == day]
            if not day_stops:
                continue
            self.assertGreaterEqual(len(day_stops), 1)
            self.assertLessEqual(len(day_stops), 4)
            progress_by_day.append(_mean_progress(day_stops, KL, PENANG))
            span = _median_span_km(day_stops)
            if span is not None:
                self.assertLess(span, 40.0)
            labels = {str(p.get("hub_label") or "") for p in day_stops}
            self.assertTrue(any(labels))

        self.assertGreaterEqual(len(progress_by_day), 2)
        self.assertEqual(progress_by_day, sorted(progress_by_day))

        counts = [len([p for p in picked if int(p["day"]) == d]) for d in range(1, 4)]
        occupied = [c for c in counts if c > 0]
        self.assertTrue(all(2 <= c <= 4 for c in occupied), counts)

    def test_same_city_does_not_pull_distant_corridor_stops(self) -> None:
        picked = self.selector.select_from_pool(
            CATALOG,
            start=KL,
            end=BATU_STATION,
            days=2,
            interests=["culture"],
            hours_per_day=8,
        )
        ids = {str(p["id"]) for p in picked}
        self.assertNotIn("kek-lok-si", ids)
        self.assertNotIn("penang-hill", ids)
        self.assertNotIn("kuching", ids)
        mid = (
            (KL["latitude"] + BATU_STATION["latitude"]) / 2.0,
            (KL["longitude"] + BATU_STATION["longitude"]) / 2.0,
        )
        for stop in picked:
            dist = haversine_km(
                (float(stop["latitude"]), float(stop["longitude"])),
                mid,
            )
            self.assertLess(dist, 80.0, stop["name"])

    def test_nature_interest_prefers_nature_when_available(self) -> None:
        picked = self.selector.select_from_pool(
            CATALOG,
            start=KL,
            end=PENANG,
            days=3,
            interests=["nature"],
            hours_per_day=8,
        )
        for day in range(1, 4):
            day_stops = [p for p in picked if int(p["day"]) == day]
            if not day_stops:
                continue
            slugs = [str(p.get("category_slug") or "") for p in day_stops]
            self.assertIn(
                "nature",
                slugs,
                f"day {day} missing nature stop: {day_stops}",
            )

    def test_puchong_jb_spreads_past_kl_when_catalog_is_kl_heavy(self) -> None:
        catalog = list(CATALOG)
        for index in range(8):
            catalog.append(
                _poi(
                    f"kl-mall-{index}",
                    f"KL Mall {index}",
                    3.140 + index * 0.003,
                    101.690 + index * 0.003,
                    "shopping",
                    "Kuala Lumpur",
                    featured=True,
                )
            )
        catalog.extend(
            [
                _poi(
                    "seremban-lake",
                    "Seremban Lake Garden",
                    2.7258,
                    101.9378,
                    "nature",
                    "Negeri Sembilan",
                    featured=True,
                ),
                _poi(
                    "muar-emas",
                    "Muar Tanjung Emas",
                    2.0442,
                    102.5689,
                    "culture",
                    "Johor",
                    featured=True,
                ),
                _poi(
                    "legoland",
                    "LEGOLAND Malaysia",
                    1.4273,
                    103.6319,
                    "adventure",
                    "Johor",
                    featured=True,
                ),
            ]
        )
        picked = self.selector.select_from_pool(
            catalog,
            start=PUCHONG,
            end=JOHOR_BAHRU,
            days=4,
            interests=["nature", "culture"],
            hours_per_day=8,
        )
        ids = {str(p["id"]) for p in picked}
        self.assertNotIn("kuching", ids)
        progress_by_day = []
        for day in range(1, 5):
            day_stops = [p for p in picked if int(p["day"]) == day]
            if not day_stops:
                continue
            progress_by_day.append(
                _mean_progress(day_stops, PUCHONG, JOHOR_BAHRU)
            )
        self.assertTrue(
            any(0.35 <= value <= 0.8 for value in progress_by_day),
            progress_by_day,
        )
        self.assertFalse(
            all(value < 0.2 for value in progress_by_day),
            progress_by_day,
        )


class ItineraryGenerationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = ItineraryGenerationService(
            maps_client=FakeMaps(),
            osrm_client=FakeOsrm(),
        )

    def test_hero_is_kept_when_over_daily_budget(self) -> None:
        result = self.service.generate(
            {
                "start": KL,
                "end": BATU_STATION,
                "days": 1,
                "nights": 0,
                "hours_per_day": 3,
                "interests": [],
                "preferred_mode": "driving",
                "destinations": [
                    {
                        "id": "batu-caves",
                        "name": "Batu Caves",
                        "latitude": 3.2379,
                        "longitude": 101.6840,
                        "category_slug": "nature",
                        "day": 1,
                        "hub_label": "Selangor",
                        "is_hero": True,
                        "stay_min": 400,
                    },
                    {
                        "id": "pavilion",
                        "name": "Pavilion Kuala Lumpur",
                        "latitude": 3.1490,
                        "longitude": 101.7134,
                        "category_slug": "shopping",
                        "day": 1,
                        "hub_label": "Selangor",
                        "is_hero": False,
                        "stay_min": 180,
                    },
                ],
            }
        )
        ids = [d["id"] for d in result["destinations"]]
        self.assertIn("batu-caves", ids)
        self.assertTrue(any(d.get("hub_label") for d in result["destinations"]))

    def test_assigned_days_are_not_reshuffled_across_hubs(self) -> None:
        result = self.service.generate(
            {
                "start": KL,
                "end": PENANG,
                "days": 3,
                "nights": 2,
                "hours_per_day": 8,
                "interests": [],
                "preferred_mode": "driving",
                "destinations": [
                    {
                        "id": "petronas",
                        "name": "Petronas Twin Towers",
                        "latitude": 3.1579,
                        "longitude": 101.7116,
                        "category_slug": "culture",
                        "day": 1,
                        "hub_label": "Kuala Lumpur",
                        "is_hero": True,
                    },
                    {
                        "id": "kellie",
                        "name": "Kellie's Castle",
                        "latitude": 4.4750,
                        "longitude": 101.1450,
                        "category_slug": "heritage",
                        "day": 2,
                        "hub_label": "Perak",
                        "is_hero": True,
                    },
                    {
                        "id": "kek-lok-si",
                        "name": "Kek Lok Si",
                        "latitude": 5.3994,
                        "longitude": 100.2736,
                        "category_slug": "heritage",
                        "day": 3,
                        "hub_label": "Pulau Pinang",
                        "is_hero": True,
                    },
                ],
            }
        )
        by_id = {d["id"]: d for d in result["destinations"]}
        self.assertEqual(by_id["petronas"]["day"], 1)
        self.assertEqual(by_id["kellie"]["day"], 2)
        self.assertEqual(by_id["kek-lok-si"]["day"], 3)
        self.assertEqual(by_id["kellie"]["hub_label"], "Perak")
        self.assertTrue(
            any("straight line" in note.lower() for note in result["notes"])
        )


    def _short_trip_payload(self, preferred_mode: str) -> dict:
        return {
            "start": KL,
            "end": BATU_STATION,
            "days": 1,
            "nights": 0,
            "hours_per_day": 8,
            "interests": [],
            "preferred_mode": preferred_mode,
            "destinations": [
                {
                    "id": "merdeka",
                    "name": "Merdeka Square",
                    "latitude": 3.1486,
                    "longitude": 101.6936,
                    "category_slug": "heritage",
                    "stay_min": 60,
                }
            ],
        }

    def test_walking_duration_exceeds_driving(self) -> None:
        driving = self.service.generate(self._short_trip_payload("driving"))
        walking = self.service.generate(self._short_trip_payload("walking"))
        self.assertEqual(driving["legs"][0]["selected_mode"], "driving")
        self.assertEqual(walking["legs"][0]["selected_mode"], "walking")
        self.assertGreater(
            walking["legs"][0]["duration_min"],
            driving["legs"][0]["duration_min"],
        )
        walk_opt = next(
            opt
            for opt in walking["legs"][0]["transport_options"]
            if opt["mode"] == "walking"
        )
        self.assertEqual(walk_opt["carbon_kg"], 0)

    def test_walking_packing_drops_far_stop(self) -> None:
        payload = {
            "start": KL,
            "end": BATU_STATION,
            "days": 1,
            "nights": 0,
            "hours_per_day": 8,
            "interests": [],
            "destinations": [
                {
                    "id": "merdeka",
                    "name": "Merdeka Square",
                    "latitude": 3.1486,
                    "longitude": 101.6936,
                    "category_slug": "heritage",
                    "stay_min": 60,
                },
                {
                    "id": "klang",
                    "name": "Klang",
                    "latitude": 3.0333,
                    "longitude": 101.4500,
                    "category_slug": "culture",
                    "stay_min": 90,
                },
            ],
        }
        driving = self.service.generate({**payload, "preferred_mode": "driving"})
        walking = self.service.generate({**payload, "preferred_mode": "walking"})
        self.assertIn("klang", [d["id"] for d in driving["destinations"]])
        self.assertNotIn("klang", [d["id"] for d in walking["destinations"]])

    def test_transit_falls_back_to_driving(self) -> None:
        result = self.service.generate(self._short_trip_payload("transit"))
        self.assertTrue(result["legs"])
        self.assertTrue(
            all(leg["selected_mode"] == "driving" for leg in result["legs"])
        )
        self.assertTrue(
            any("没有公共交通" in note for note in result["notes"])
        )

    def test_driving_and_walking_keep_turn_steps(self) -> None:
        service = ItineraryGenerationService(
            maps_client=FakeStepMaps(),
            osrm_client=FakeOsrm(),
        )
        driving = service.generate(self._short_trip_payload("driving"))
        walking = service.generate(self._short_trip_payload("walking"))
        drive_steps = driving["legs"][0]["steps"]
        walk_steps = walking["legs"][0]["steps"]
        self.assertTrue(
            any("Turn right onto Jalan 1/2" in str(s.get("instruction")) for s in drive_steps)
        )
        self.assertEqual(drive_steps[0]["kind"], "drive")
        self.assertEqual(walk_steps[0]["kind"], "walk")
        self.assertTrue(
            any(s.get("maneuver") == "turn-right" for s in walk_steps)
        )

    def test_transit_keeps_rapid_kl_line_steps(self) -> None:
        service = ItineraryGenerationService(
            maps_client=FakeRapidMaps(),
            osrm_client=FakeOsrm(),
        )
        result = service.generate(self._short_trip_payload("transit"))
        self.assertTrue(
            all(leg["selected_mode"] == "transit" for leg in result["legs"])
        )
        steps = result["legs"][0]["steps"]
        lines = [str(s.get("line") or "") for s in steps]
        self.assertTrue(any("LRT Kelana Jaya" in line for line in lines))
        self.assertTrue(any("Rapid Bus T815" in line for line in lines))
        transit_opt = next(
            opt
            for opt in result["legs"][0]["transport_options"]
            if opt["mode"] == "transit"
        )
        rail = round(4.5 * 0.041, 3)
        bus = round(2.2 * 0.105, 3)
        self.assertEqual(transit_opt["carbon_kg"], round(rail + bus, 3))


class DirectionsStepParseTests(unittest.TestCase):
    def test_strips_html_and_reads_transit_details(self) -> None:
        from integration.external_api.google_maps_client import GoogleMapsClient

        leg = {
            "steps": [
                {
                    "travel_mode": "WALKING",
                    "html_instructions": "Walk to <b>KL Sentral</b>",
                    "distance": {"value": 120},
                    "duration": {"value": 90},
                    "maneuver": "straight",
                },
                {
                    "travel_mode": "TRANSIT",
                    "html_instructions": "Take the <b>LRT</b>",
                    "distance": {"value": 3200},
                    "duration": {"value": 540},
                    "transit_details": {
                        "num_stops": 3,
                        "departure_stop": {"name": "KL Sentral"},
                        "arrival_stop": {"name": "KLCC"},
                        "line": {
                            "name": "Kelana Jaya Line",
                            "short_name": "KJ",
                            "agencies": [{"name": "Rapid KL"}],
                            "vehicle": {"type": "SUBWAY"},
                        },
                    },
                },
            ]
        }
        steps = GoogleMapsClient._parse_leg_steps(leg, route_mode="transit")
        self.assertEqual(steps[0]["kind"], "walk")
        self.assertEqual(steps[0]["instruction"], "Walk to KL Sentral")
        self.assertEqual(steps[1]["kind"], "transit")
        self.assertEqual(steps[1]["vehicle"], "train")
        self.assertEqual(steps[1]["agency"], "Rapid KL")
        self.assertIn("Kelana Jaya", steps[1]["line"])
        self.assertEqual(steps[1]["from_stop"], "KL Sentral")
        self.assertEqual(steps[1]["to_stop"], "KLCC")

    def test_nested_steps_flatten_empty_parent(self) -> None:
        from integration.external_api.google_maps_client import GoogleMapsClient

        leg = {
            "steps": [
                {
                    "travel_mode": "DRIVING",
                    "html_instructions": "",
                    "distance": {"value": 20000},
                    "duration": {"value": 1200},
                    "steps": [
                        {
                            "travel_mode": "DRIVING",
                            "html_instructions": "Follow <b>E9</b> toward Putrajaya",
                            "distance": {"value": 18000},
                            "duration": {"value": 1100},
                            "maneuver": "straight",
                        }
                    ],
                }
            ]
        }
        steps = GoogleMapsClient._parse_leg_steps(leg, route_mode="driving")
        self.assertEqual(len(steps), 1)
        self.assertIn("Follow E9", steps[0]["instruction"])
        self.assertEqual(steps[0]["kind"], "drive")

    def test_nested_steps_keep_parent_instruction(self) -> None:
        from integration.external_api.google_maps_client import GoogleMapsClient

        leg = {
            "steps": [
                {
                    "travel_mode": "DRIVING",
                    "html_instructions": "Get on <b>E9</b>",
                    "distance": {"value": 20000},
                    "duration": {"value": 1200},
                    "steps": [
                        {
                            "travel_mode": "DRIVING",
                            "html_instructions": "Follow <b>E9</b> toward Putrajaya",
                            "distance": {"value": 18000},
                            "duration": {"value": 1100},
                        }
                    ],
                }
            ]
        }
        steps = GoogleMapsClient._parse_leg_steps(leg, route_mode="driving")
        self.assertEqual(len(steps), 1)
        self.assertEqual(steps[0]["instruction"], "Get on E9")


class RoadMergeTests(unittest.TestCase):
    def test_thin_long_leg_keeps_google_steps(self) -> None:
        osrm = FakeGeometryOsrm()
        service = ItineraryGenerationService(
            maps_client=FakeThinLongLegMaps(),
            osrm_client=osrm,
        )
        points = [
            (3.0730, 101.6070),
            (3.1000, 101.6500),
            (2.9264, 101.6964),
            (2.9300, 101.7000),
        ]
        legs = service._route_road(points, mode="driving")
        self.assertEqual(len(legs), 3)
        long_leg = legs[1]
        instructions = [str(step.get("instruction") or "") for step in long_leg["steps"]]
        self.assertIn("Get on E9", instructions)
        self.assertTrue(any("Follow E9" in text for text in instructions))
        self.assertGreaterEqual(len(long_leg["path"]), 3)
        self.assertEqual(long_leg["duration_min"], 31)
        self.assertEqual(long_leg["distance_km"], 24.2)
        self.assertFalse(osrm.last_include_steps)
        self.assertFalse(
            any("OSRM only" in text for text in instructions),
        )

    def test_osrm_steps_when_google_has_none(self) -> None:
        class NoStepMaps:
            def route_waypoints(self, points, mode="driving"):
                del mode
                return [
                    {
                        "distance_km": 5.5,
                        "duration_min": 9,
                        "is_estimated": False,
                        "path": [
                            [a[0], a[1]],
                            [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2],
                            [b[0], b[1]],
                        ],
                        "steps": [],
                    }
                    for a, b in zip(points, points[1:])
                ]

        osrm = FakeGeometryOsrm()
        service = ItineraryGenerationService(
            maps_client=NoStepMaps(),
            osrm_client=osrm,
        )
        legs = service._route_road(
            [(3.07, 101.60), (3.10, 101.65)],
            mode="driving",
        )
        self.assertTrue(osrm.last_include_steps)
        self.assertEqual(legs[0]["steps"][0]["instruction"], "OSRM only")
        self.assertEqual(legs[0]["duration_min"], 9)


class PolylineSplitTests(unittest.TestCase):
    def test_split_polyline_follows_waypoint_order(self) -> None:
        line = [[0.0, 0.0], [0.1, 0.1], [0.2, 0.2], [0.3, 0.3], [0.4, 0.4]]
        waypoints = [(0.0, 0.0), (0.2, 0.2), (0.4, 0.4)]
        chunks = split_polyline_by_waypoints(line, waypoints)
        self.assertEqual(len(chunks), 2)
        self.assertGreaterEqual(len(chunks[0]), 2)
        self.assertGreaterEqual(len(chunks[1]), 2)
        self.assertEqual(chunks[0][0], [0.0, 0.0])
        self.assertEqual(chunks[-1][-1], [0.4, 0.4])


if __name__ == "__main__":
    unittest.main()
