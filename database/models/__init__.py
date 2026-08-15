"""Database document models."""

from .destination import Destination
from .destination_category import DestinationCategory
from .favourite import FavouriteDestination, FavouriteFolder, FavouriteFolderItem
from .itinerary import SavedItinerary
from .user import User

__all__ = [
    "User",
    "Destination",
    "DestinationCategory",
    "SavedItinerary",
    "FavouriteDestination",
    "FavouriteFolder",
    "FavouriteFolderItem",
]
