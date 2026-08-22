import logging
import sys
from pathlib import Path

# Allow imports from sibling layers (database/, integration/)
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from database.connection import verify_connection
from config import CORS_ORIGINS
from integration.repositories import (
    ConnectionRepository,
    DailyRepository,
    DestinationCategoryRepository,
    DestinationRepository,
    FavouriteDestinationRepository,
    FavouriteFolderItemRepository,
    FavouriteFolderRepository,
    ItineraryRepository,
    TripShareRepository,
    UserRepository,
)
from routers import api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

_UPLOADS_DIR = Path(__file__).resolve().parent / "uploads"
_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
(_UPLOADS_DIR / "avatars").mkdir(parents=True, exist_ok=True)
(_UPLOADS_DIR / "dailies").mkdir(parents=True, exist_ok=True)

app = FastAPI(title="My Smart Journey")

_cors_origins = CORS_ORIGINS if CORS_ORIGINS else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.mount("/uploads", StaticFiles(directory=str(_UPLOADS_DIR)), name="uploads")


@app.on_event("startup")
async def startup() -> None:
    await verify_connection()
    user_repository = UserRepository()
    await user_repository.ensure_indexes()

    category_repository = DestinationCategoryRepository()
    await category_repository.ensure_indexes()

    destination_repository = DestinationRepository()
    await destination_repository.ensure_indexes()

    itinerary_repository = ItineraryRepository()
    await itinerary_repository.ensure_indexes()

    favourite_destination_repository = FavouriteDestinationRepository()
    await favourite_destination_repository.ensure_indexes()

    favourite_folder_repository = FavouriteFolderRepository()
    await favourite_folder_repository.ensure_indexes()

    favourite_folder_item_repository = FavouriteFolderItemRepository()
    await favourite_folder_item_repository.ensure_indexes()

    connection_repository = ConnectionRepository()
    await connection_repository.ensure_indexes()

    trip_share_repository = TripShareRepository()
    await trip_share_repository.ensure_indexes()

    daily_repository = DailyRepository()
    await daily_repository.ensure_indexes()


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "My Smart Journey API is running"}
