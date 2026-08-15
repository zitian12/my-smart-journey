"""Destination image helpers. Card photos must come from Google Places only."""

from __future__ import annotations

import logging
import re

from config import GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX, SERPAPI_API_KEY
from integration.external_api.google_image_client import GoogleImageClient
from integration.external_api.serpapi_image_client import SerpApiImageClient
from integration.external_api.wikimedia_image_client import WikimediaImageClient

logger = logging.getLogger(__name__)

# Legacy Unsplash KL Twin Towers URL — treat as invalid / clear from DB.
FALLBACK_IMAGE = (
    "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&q=80"
)

_TEMPLATE_VISITOR_STOP = re.compile(
    r"is a visitor stop in .+, Malaysia\.?$",
    re.IGNORECASE,
)
_TEMPLATE_CATEGORY_DEST = re.compile(
    r"is a .+ destination in .+, Malaysia\.?$",
    re.IGNORECASE,
)

_UNTRUSTED_HOST_FRAGMENTS = (
    "wikimedia.org",
    "wikipedia.org",
    "unsplash.com",
    "upload.wikimedia",
)


class DestinationImageService:
    """Legacy SerpApi/Wiki helpers remain for optional tools; UI uses Places only."""

    def __init__(
        self,
        serpapi_client: SerpApiImageClient | None = None,
        google_client: GoogleImageClient | None = None,
        wiki_client: WikimediaImageClient | None = None,
    ) -> None:
        self._serpapi = serpapi_client or SerpApiImageClient(api_key=SERPAPI_API_KEY)
        self._google = google_client or GoogleImageClient(
            api_key=GOOGLE_CSE_API_KEY,
            cx=GOOGLE_CSE_CX,
        )
        self._wiki = wiki_client or WikimediaImageClient()

    async def fetch_images(self, destination_name: str, state: str = "") -> list[str]:
        """Deprecated for destination cards — prefer Places Photo via place_id."""
        if self._serpapi.is_configured:
            serp_images = await self._serpapi.fetch_images(destination_name, state)
            if serp_images:
                return serp_images
        if self._google.is_configured:
            google_images = await self._google.fetch_images(destination_name, state)
            if google_images:
                return google_images
        wiki_images = await self._wiki.fetch_images(destination_name, state)
        return wiki_images or []

    async def fetch_images_free(
        self,
        destination_name: str,
        state: str = "",
    ) -> list[str]:
        """Do not use for cards — always returns empty (Places-only policy)."""
        return []

    async def fetch_wiki_summary(
        self,
        destination_name: str,
        state: str = "",
    ) -> dict:
        """Wikipedia extract only (no images for destination cards)."""
        summary = await self._wiki.fetch_summary(destination_name, state)
        return {
            "description": str(summary.get("description") or "").strip(),
            "images": [],
        }

    @staticmethod
    def is_fallback_url(url: str) -> bool:
        text = url or ""
        return text.strip() == FALLBACK_IMAGE or FALLBACK_IMAGE.split("?")[0] in text

    @classmethod
    def is_places_image_url(cls, url: str) -> bool:
        """True for Google Places / Maps photo host URLs only."""
        text = (url or "").strip()
        if not text or cls.is_fallback_url(text):
            return False
        lower = text.lower()
        if any(fragment in lower for fragment in _UNTRUSTED_HOST_FRAGMENTS):
            return False
        return (
            "googleusercontent.com" in lower
            or "places.googleapis.com" in lower
            or "ggpht.com" in lower
            or "google.com/maps" in lower
        )

    @classmethod
    def is_fallback_images(cls, images: list[str] | None) -> bool:
        """True when there is no trusted Places photo URL."""
        return len(cls.real_images(images)) == 0

    @classmethod
    def real_images(cls, images: list[str] | None) -> list[str]:
        """Keep only Places-trusted photo URLs."""
        if not images:
            return []
        return [url for url in images if url and cls.is_places_image_url(url)]

    @staticmethod
    def is_template_description(description: str | None) -> bool:
        """True for empty or known auto-generated template sentences."""
        text = (description or "").strip()
        if not text:
            return True
        if _TEMPLATE_VISITOR_STOP.search(text):
            return True
        if _TEMPLATE_CATEGORY_DEST.search(text):
            return True
        return False

    @staticmethod
    def template_description(name: str, state: str = "") -> str:
        """Deprecated — do not use for user-facing copy."""
        place = (name or "").strip() or "This place"
        region = (state or "").strip()
        if region:
            return f"{place} is a visitor stop in {region}, Malaysia."
        return f"{place} is a visitor stop in Malaysia."
