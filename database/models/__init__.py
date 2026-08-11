"""Database document models."""

from .destination import Destination
from .destination_category import DestinationCategory
from .user import User

__all__ = ["User", "Destination", "DestinationCategory"]
