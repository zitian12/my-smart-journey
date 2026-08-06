import logging
import sys
from pathlib import Path

# Allow imports from sibling layers (database/, integration/)
_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database.connection import verify_connection
from integration.repositories import UserRepository
from routers import api_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
)

app = FastAPI(title="My Smart Journey")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.on_event("startup")
async def startup() -> None:
    await verify_connection()
    user_repository = UserRepository()
    await user_repository.ensure_indexes()


@app.get("/")
def root() -> dict[str, str]:
    return {"message": "My Smart Journey API is running"}
