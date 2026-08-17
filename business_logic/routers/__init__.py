from fastapi import APIRouter

from routers import auth, connections, dailies, destinations, itinerary, test_db, users

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(connections.router)
api_router.include_router(dailies.router)
api_router.include_router(destinations.router)
api_router.include_router(itinerary.router)
api_router.include_router(test_db.router)
