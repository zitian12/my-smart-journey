from fastapi import APIRouter

from routers import test_db

api_router = APIRouter()
api_router.include_router(test_db.router)
