"""Google Places API (New) client — catalog discovery only, Pro field mask."""

from __future__ import annotations

import logging
import os
from typing import Any

import requests

logger = logging.getLogger(__name__)

TEXT_SEARCH_URL = "https://places.googleapis.com/v1/places:searchText"
NEARBY_SEARCH_URL = "https://places.googleapis.com/v1/places:searchNearby"
PLACE_DETAILS_URL = "https://places.googleapis.com/v1/{place_name}"
PHOTO_MEDIA_URL = "https://places.googleapis.com/v1/{photo_name}/media"

# Pro SKU only for catalog discovery: name + coordinates + types + address.
FIELD_MASK = (
    "places.id,places.displayName,places.location,"
    "places.types,places.formattedAddress"
)
# On-demand detail enrichment.
ENRICH_FIELD_MASK = "id,editorialSummary,photos"
PHOTOS_ONLY_FIELD_MASK = "id,photos"
_MAX_RESULTS = 20
_PHOTO_MAX_WIDTH = 1200


class GooglePlacesClient:
    """Malaysia-scoped Text Search and Nearby Search (Places API New)."""

    def __init__(
        self,
        api_key: str | None = None,
        *,
        timeout: float = 20.0,
    ) -> None:
        self._api_key = (api_key or os.getenv("GOOGLE_MAPS_API_KEY") or "").strip()
        self._timeout = timeout
        self._request_count = 0

    @property
    def available(self) -> bool:
        return bool(self._api_key)

    @property
    def request_count(self) -> int:
        return self._request_count

    def text_search(
        self,
        *,
        text_query: str,
        included_type: str,
        region_code: str = "MY",
    ) -> list[dict[str, Any]]:
        """One Text Search Pro request (max 20 places). No pagination."""
        body: dict[str, Any] = {
            "textQuery": text_query,
            "includedType": included_type,
            "maxResultCount": _MAX_RESULTS,
            "regionCode": region_code,
            "languageCode": "en",
            "strictTypeFiltering": True,
        }
        return self._search(TEXT_SEARCH_URL, body)

    def nearby_search(
        self,
        *,
        latitude: float,
        longitude: float,
        included_type: str,
        radius_m: float = 25000.0,
        region_code: str = "MY",
    ) -> list[dict[str, Any]]:
        """One Nearby Search Pro request (max 20 places). No pagination."""
        body: dict[str, Any] = {
            "includedTypes": [included_type],
            "maxResultCount": _MAX_RESULTS,
            "rankPreference": "POPULARITY",
            "regionCode": region_code,
            "languageCode": "en",
            "locationRestriction": {
                "circle": {
                    "center": {
                        "latitude": latitude,
                        "longitude": longitude,
                    },
                    "radius": radius_m,
                }
            },
        }
        return self._search(NEARBY_SEARCH_URL, body)

    def find_place_id(
        self,
        *,
        text_query: str,
        region_code: str = "MY",
    ) -> str | None:
        """One Text Search Pro request without type filter; return best place id."""
        query = (text_query or "").strip()
        if not query or not self.available:
            return None
        body: dict[str, Any] = {
            "textQuery": query,
            "maxResultCount": 5,
            "regionCode": region_code,
            "languageCode": "en",
        }
        places = self._search(TEXT_SEARCH_URL, body)
        if not places:
            return None
        return str(places[0].get("place_id") or "").strip() or None

    def get_place_enrichment(
        self,
        place_id: str,
        *,
        include_summary: bool = True,
    ) -> dict[str, Any]:
        """Fetch optional editorialSummary + one photo URL for a place.

        Bills Place Details (Atmosphere if editorialSummary requested) and
        optionally Place Photos Media once. Does not request reviews.
        """
        empty = {"description": "", "photo_name": None, "image_url": None}
        if not self.available:
            return empty

        resource = self._place_resource_name(place_id)
        if not resource:
            return empty

        url = PLACE_DETAILS_URL.format(place_name=resource)
        field_mask = ENRICH_FIELD_MASK if include_summary else PHOTOS_ONLY_FIELD_MASK
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self._api_key,
            "X-Goog-FieldMask": field_mask,
        }
        try:
            response = requests.get(url, headers=headers, timeout=self._timeout)
            self._request_count += 1
            if response.status_code == 429:
                logger.warning("Google Places Details rate-limited (429)")
                return empty
            if not response.ok:
                logger.warning(
                    "Google Places Details HTTP %s: %s",
                    response.status_code,
                    response.text[:400],
                )
                return empty
            payload = response.json()
        except Exception:
            logger.exception("Google Places Details failed place_id=%s", place_id)
            return empty

        description = ""
        if include_summary:
            summary = payload.get("editorialSummary") or {}
            if isinstance(summary, dict):
                description = str(summary.get("text") or "").strip()

        photo_name = None
        photos = payload.get("photos") or []
        if isinstance(photos, list) and photos:
            first = photos[0] if isinstance(photos[0], dict) else {}
            photo_name = str(first.get("name") or "").strip() or None

        image_url = None
        if photo_name:
            image_url = self._photo_media_url(photo_name)

        return {
            "description": description,
            "photo_name": photo_name,
            "image_url": image_url,
        }

    def _photo_media_url(self, photo_name: str) -> str | None:
        url = PHOTO_MEDIA_URL.format(photo_name=photo_name)
        params = {
            "maxWidthPx": _PHOTO_MAX_WIDTH,
            "skipHttpRedirect": "true",
        }
        headers = {"X-Goog-Api-Key": self._api_key}
        try:
            response = requests.get(
                url,
                params=params,
                headers=headers,
                timeout=self._timeout,
            )
            self._request_count += 1
            if response.status_code == 429:
                logger.warning("Google Places Photo media rate-limited (429)")
                return None
            if not response.ok:
                logger.warning(
                    "Google Places Photo media HTTP %s: %s",
                    response.status_code,
                    response.text[:400],
                )
                return None
            payload = response.json()
        except Exception:
            logger.exception("Google Places Photo media failed name=%s", photo_name)
            return None

        photo_uri = str(payload.get("photoUri") or "").strip()
        return photo_uri or None

    @staticmethod
    def _place_resource_name(place_id: str) -> str | None:
        cleaned = (place_id or "").strip()
        if not cleaned:
            return None
        if cleaned.startswith("places/"):
            return cleaned
        return f"places/{cleaned}"

    def _search(self, url: str, body: dict[str, Any]) -> list[dict[str, Any]]:
        if not self.available:
            logger.warning("Google Places skipped — GOOGLE_MAPS_API_KEY is empty")
            return []

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self._api_key,
            "X-Goog-FieldMask": FIELD_MASK,
        }
        try:
            response = requests.post(
                url,
                json=body,
                headers=headers,
                timeout=self._timeout,
            )
            self._request_count += 1
            if response.status_code == 429:
                logger.warning("Google Places rate-limited (429)")
                return []
            if not response.ok:
                logger.warning(
                    "Google Places HTTP %s: %s",
                    response.status_code,
                    response.text[:400],
                )
                return []
            payload = response.json()
        except Exception:
            logger.exception("Google Places request failed url=%s", url)
            return []

        raw_places = payload.get("places") or []
        parsed: list[dict[str, Any]] = []
        for item in raw_places:
            place = self._parse_place(item)
            if place is not None:
                parsed.append(place)
        logger.info(
            "Places returned %s/%s places request=%s",
            len(parsed),
            len(raw_places),
            self._request_count,
        )
        return parsed

    @staticmethod
    def _parse_place(item: dict[str, Any]) -> dict[str, Any] | None:
        if not isinstance(item, dict):
            return None
        place_id = str(item.get("id") or "").strip()
        display = item.get("displayName") or {}
        name = ""
        if isinstance(display, dict):
            name = str(display.get("text") or "").strip()
        location = item.get("location") or {}
        try:
            latitude = float(location["latitude"])
            longitude = float(location["longitude"])
        except (KeyError, TypeError, ValueError):
            return None
        if not name or not place_id:
            return None
        types = item.get("types") or []
        if not isinstance(types, list):
            types = []
        return {
            "place_id": place_id,
            "destination_name": name,
            "latitude": latitude,
            "longitude": longitude,
            "location": str(item.get("formattedAddress") or "").strip(),
            "types": [str(t) for t in types if t],
        }
