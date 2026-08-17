"""Data access repositories."""

from .connection_repository import ConnectionRepository
from .daily_repository import DailyRepository
from .destination_category_repository import DestinationCategoryRepository
from .destination_repository import DestinationRepository
from .favourite_repository import (
    FavouriteDestinationRepository,
    FavouriteFolderItemRepository,
    FavouriteFolderRepository,
)
from .itinerary_repository import ItineraryRepository
from .trip_share_repository import TripShareRepository
from .user_repository import UserRepository

__all__ = [
    "UserRepository",
    "DestinationRepository",
    "DestinationCategoryRepository",
    "ItineraryRepository",
    "FavouriteDestinationRepository",
    "FavouriteFolderRepository",
    "FavouriteFolderItemRepository",
    "ConnectionRepository",
    "TripShareRepository",
    "DailyRepository",
]
