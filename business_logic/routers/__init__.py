from fastapi import APIRouter

from routers import auth, test_db, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(test_db.router)
