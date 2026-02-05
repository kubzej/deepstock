"""
Watchlist API endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.services.watchlist import (
    watchlist_service,
    WatchlistCreate,
    WatchlistUpdate,
    WatchlistItemCreate,
    WatchlistItemUpdate,
    TagCreate,
    TagUpdate,
)
from app.core.auth import get_current_user_id
from pydantic import BaseModel


router = APIRouter()


# ============================================
# WATCHLISTS
# ============================================

@router.get("/")
async def get_watchlists(user_id: str = Depends(get_current_user_id)) -> List[dict]:
    """Get all watchlists for the authenticated user with item counts."""
    return await watchlist_service.get_user_watchlists(user_id)


@router.get("/{watchlist_id}")
async def get_watchlist(
    watchlist_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Get a single watchlist by ID."""
    watchlist = await watchlist_service.get_watchlist(watchlist_id, user_id)
    if not watchlist:
        raise HTTPException(status_code=404, detail="Watchlist nenalezen")
    return watchlist


@router.post("/")
async def create_watchlist(
    data: WatchlistCreate,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Create a new watchlist."""
    return await watchlist_service.create_watchlist(user_id, data)


@router.put("/{watchlist_id}")
async def update_watchlist(
    watchlist_id: str,
    data: WatchlistUpdate,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Update a watchlist."""
    result = await watchlist_service.update_watchlist(watchlist_id, user_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Watchlist nenalezen")
    return result


@router.delete("/{watchlist_id}")
async def delete_watchlist(
    watchlist_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Delete a watchlist and all its items."""
    success = await watchlist_service.delete_watchlist(watchlist_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Watchlist nenalezen")
    return {"success": True}


class ReorderRequest(BaseModel):
    watchlist_ids: List[str]


@router.post("/reorder")
async def reorder_watchlists(
    data: ReorderRequest,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Reorder watchlists by providing ordered list of IDs."""
    await watchlist_service.reorder_watchlists(user_id, data.watchlist_ids)
    return {"success": True}


# ============================================
# WATCHLIST ITEMS
# ============================================

@router.get("/{watchlist_id}/items")
async def get_watchlist_items(
    watchlist_id: str,
    user_id: str = Depends(get_current_user_id)
) -> List[dict]:
    """Get all items in a watchlist with stock info."""
    return await watchlist_service.get_watchlist_items(watchlist_id)


@router.post("/{watchlist_id}/items")
async def add_item(
    watchlist_id: str,
    data: WatchlistItemCreate,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Add a stock to a watchlist."""
    try:
        return await watchlist_service.add_item(watchlist_id, data)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.put("/items/{item_id}")
async def update_item(
    item_id: str,
    data: WatchlistItemUpdate,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Update a watchlist item (targets, notes, sector)."""
    result = await watchlist_service.update_item(item_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Položka nenalezena")
    return result


@router.delete("/items/{item_id}")
async def delete_item(
    item_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Remove an item from a watchlist."""
    success = await watchlist_service.delete_item(item_id)
    if not success:
        raise HTTPException(status_code=404, detail="Položka nenalezena")
    return {"success": True}


class MoveItemRequest(BaseModel):
    target_watchlist_id: str


@router.post("/items/{item_id}/move")
async def move_item(
    item_id: str,
    data: MoveItemRequest,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Move an item to another watchlist."""
    try:
        result = await watchlist_service.move_item(item_id, data.target_watchlist_id)
        if not result:
            raise HTTPException(status_code=404, detail="Položka nenalezena")
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ============================================
# TAGS
# ============================================

@router.get("/tags/all")
async def get_tags(user_id: str = Depends(get_current_user_id)) -> List[dict]:
    """Get all tags for the authenticated user."""
    return await watchlist_service.get_user_tags(user_id)


@router.post("/tags")
async def create_tag(
    data: TagCreate,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Create a new tag."""
    try:
        return await watchlist_service.create_tag(user_id, data)
    except Exception as e:
        if "duplicate" in str(e).lower() or "unique" in str(e).lower():
            raise HTTPException(status_code=400, detail="Tag s tímto názvem již existuje")
        raise


@router.put("/tags/{tag_id}")
async def update_tag(
    tag_id: str,
    data: TagUpdate,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Update a tag."""
    result = await watchlist_service.update_tag(tag_id, user_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Tag nenalezen")
    return result


@router.delete("/tags/{tag_id}")
async def delete_tag(
    tag_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Delete a tag."""
    success = await watchlist_service.delete_tag(tag_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Tag nenalezen")
    return {"success": True}


# ============================================
# ITEM TAGS (assignments)
# ============================================

@router.get("/items/{item_id}/tags")
async def get_item_tags(
    item_id: str,
    user_id: str = Depends(get_current_user_id)
) -> List[dict]:
    """Get all tags assigned to an item."""
    return await watchlist_service.get_item_tags(item_id)


class SetItemTagsRequest(BaseModel):
    tag_ids: List[str]


@router.put("/items/{item_id}/tags")
async def set_item_tags(
    item_id: str,
    data: SetItemTagsRequest,
    user_id: str = Depends(get_current_user_id)
) -> List[dict]:
    """Replace all tags on an item."""
    return await watchlist_service.set_item_tags(item_id, data.tag_ids)


@router.post("/items/{item_id}/tags/{tag_id}")
async def add_tag_to_item(
    item_id: str,
    tag_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Add a tag to an item."""
    success = await watchlist_service.add_tag_to_item(item_id, tag_id)
    return {"success": success}


@router.delete("/items/{item_id}/tags/{tag_id}")
async def remove_tag_from_item(
    item_id: str,
    tag_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Remove a tag from an item."""
    success = await watchlist_service.remove_tag_from_item(item_id, tag_id)
    return {"success": success}
