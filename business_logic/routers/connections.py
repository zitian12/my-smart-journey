"""Friend connection endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Response, status

from deps import get_current_user
from schemas.connections import (
    ConnectionCreateRequest,
    ConnectionItem,
    PendingConnectionsResponse,
)
from services.connection_service import ConnectionError, ConnectionService

router = APIRouter(prefix="/api/connections", tags=["connections"])
_service = ConnectionService()


def _raise_connection_error(exc: ConnectionError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post("", response_model=ConnectionItem, status_code=status.HTTP_201_CREATED)
async def create_connection(
    body: ConnectionCreateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Send a friend request to an existing Google user by id."""
    try:
        return await _service.request_by_user_id(current_user, body.user_id)
    except ConnectionError as exc:
        _raise_connection_error(exc)
        raise


@router.get("", response_model=list[ConnectionItem])
async def list_connections(
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    """List accepted friends."""
    return await _service.list_friends(current_user)


@router.get("/pending", response_model=PendingConnectionsResponse)
async def list_pending_connections(
    current_user: dict = Depends(get_current_user),
) -> dict:
    """List incoming and outgoing pending friend requests."""
    return await _service.list_pending(current_user)


@router.post("/{connection_id}/accept", response_model=ConnectionItem)
async def accept_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Accept an incoming friend request."""
    try:
        return await _service.accept(current_user, connection_id)
    except ConnectionError as exc:
        _raise_connection_error(exc)
        raise


@router.post("/{connection_id}/decline", response_model=ConnectionItem)
async def decline_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    """Decline an incoming friend request."""
    try:
        return await _service.decline(current_user, connection_id)
    except ConnectionError as exc:
        _raise_connection_error(exc)
        raise


@router.delete("/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_connection(
    connection_id: str,
    current_user: dict = Depends(get_current_user),
) -> Response:
    """Cancel a sent request or remove an accepted friend."""
    try:
        await _service.remove(current_user, connection_id)
    except ConnectionError as exc:
        _raise_connection_error(exc)
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)
