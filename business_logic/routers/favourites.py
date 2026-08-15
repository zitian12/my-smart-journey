"""Authenticated destination favourites and folders APIs."""

from fastapi import APIRouter, Depends, HTTPException, status

from deps import get_current_user
from schemas.destinations import DestinationOut
from schemas.favourites import (
    FavouriteFolderCreateRequest,
    FavouriteFolderOut,
    FavouriteFolderRenameRequest,
    FavouriteIdsOut,
    FavouriteStatusOut,
)
from services.favourite_service import FavouriteService

router = APIRouter(tags=["favourites"])
_service = FavouriteService()


def _user_id(current_user: dict) -> str:
    return str(current_user.get("id") or "")


@router.get("/api/favourites", response_model=list[DestinationOut])
async def list_favourites(
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    return await _service.list_favourites(_user_id(current_user))


@router.get("/api/favourites/ids", response_model=FavouriteIdsOut)
async def list_favourite_ids(
    current_user: dict = Depends(get_current_user),
) -> dict:
    destination_ids = await _service.list_favourite_ids(_user_id(current_user))
    return {"destination_ids": destination_ids}


@router.put(
    "/api/favourites/{destination_id}",
    response_model=FavouriteStatusOut,
)
async def add_favourite(
    destination_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        await _service.add_favourite(_user_id(current_user), destination_id)
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    return {"destination_id": destination_id, "is_favourite": True}


@router.delete(
    "/api/favourites/{destination_id}",
    response_model=FavouriteStatusOut,
)
async def remove_favourite(
    destination_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    removed = await _service.remove_favourite(_user_id(current_user), destination_id)
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Favourite not found",
        )
    return {"destination_id": destination_id, "is_favourite": False}


@router.get("/api/favourite-folders", response_model=list[FavouriteFolderOut])
async def list_folders(
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    return await _service.list_folders(_user_id(current_user))


@router.post(
    "/api/favourite-folders",
    response_model=FavouriteFolderOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_folder(
    body: FavouriteFolderCreateRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        return await _service.create_folder(_user_id(current_user), body.name)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.patch(
    "/api/favourite-folders/{folder_id}",
    response_model=FavouriteFolderOut,
)
async def rename_folder(
    folder_id: str,
    body: FavouriteFolderRenameRequest,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        folder = await _service.rename_folder(
            _user_id(current_user), folder_id, body.name
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    if folder is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found",
        )
    return folder


@router.delete(
    "/api/favourite-folders/{folder_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_folder(
    folder_id: str,
    current_user: dict = Depends(get_current_user),
) -> None:
    deleted = await _service.delete_folder(_user_id(current_user), folder_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found",
        )


@router.get(
    "/api/favourite-folders/{folder_id}/items",
    response_model=list[DestinationOut],
)
async def list_folder_items(
    folder_id: str,
    current_user: dict = Depends(get_current_user),
) -> list[dict]:
    items = await _service.list_folder_items(_user_id(current_user), folder_id)
    if items is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found",
        )
    return items


@router.put(
    "/api/favourite-folders/{folder_id}/items/{destination_id}",
    response_model=FavouriteStatusOut,
)
async def add_folder_item(
    folder_id: str,
    destination_id: str,
    current_user: dict = Depends(get_current_user),
) -> dict:
    try:
        destination = await _service.add_folder_item(
            _user_id(current_user), folder_id, destination_id
        )
    except LookupError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(exc),
        ) from exc
    if destination is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found",
        )
    return {"destination_id": destination_id, "is_favourite": True}


@router.delete(
    "/api/favourite-folders/{folder_id}/items/{destination_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def remove_folder_item(
    folder_id: str,
    destination_id: str,
    current_user: dict = Depends(get_current_user),
) -> None:
    removed = await _service.remove_folder_item(
        _user_id(current_user), folder_id, destination_id
    )
    if removed is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder not found",
        )
    if not removed:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Folder item not found",
        )
