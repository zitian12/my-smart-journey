"""Resolve destination images: SerpApi Google Images → CSE → Wikipedia → fallback."""

from __future__ import annotations

import logging

from config import GOOGLE_CSE_API_KEY, GOOGLE_CSE_CX, SERPAPI_API_KEY
from integration.external_api.google_image_client import GoogleImageClient
from integration.external_api.serpapi_image_client import SerpApiImageClient
from integration.external_api.wikimedia_image_client import WikimediaImageClient

logger = logging.getLogger(__name__)

FALLBACK_IMAGE = (
    "https://images.unsplash.com/photo-1596422846543-75c6fc197f07?w=800&q=80"
)


class DestinationImageService:
    """Prefer SerpApi Google Images, then Google CSE, Wikipedia, then fallback."""

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
        """Return the best available image URLs for a destination."""
        if self._serpapi.is_configured:
            serp_images = await self._serpapi.fetch_images(destination_name, state)
            if serp_images:
                return serp_images
            logger.info(
                "SerpApi images unavailable for %s; trying fallbacks",
                destination_name,
            )

        if self._google.is_configured:
            google_images = await self._google.fetch_images(destination_name, state)
            if google_images:
                return google_images

        wiki_images = await self._wiki.fetch_images(destination_name, state)
        if wiki_images:
            return wiki_images

        return [FALLBACK_IMAGE]
