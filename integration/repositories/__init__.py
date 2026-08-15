"""Data access repositories."""

from .destination_category_repository import DestinationCategoryRepository
from .destination_repository import DestinationRepository
from .favourite_repository import (
    FavouriteDestinationRepository,
    FavouriteFolderItemRepository,
    FavouriteFolderRepository,
)
from .itinerary_repository import ItineraryRepository
from .user_repository import UserRepository

__all__ = [
    "UserRepository",
    "DestinationRepository",
    "DestinationCategoryRepository",
    "ItineraryRepository",
    "FavouriteDestinationRepository",
    "FavouriteFolderRepository",
    "FavouriteFolderItemRepository",
]
