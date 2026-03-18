"""
Journal API endpoints - channels, sections, entries
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import List, Optional
from app.services.journal import (
    journal_service,
    SectionCreate,
    SectionUpdate,
    ChannelCreate,
    ChannelUpdate,
    EntryCreate,
    EntryUpdate,
)
from app.core.auth import get_current_user_id
from app.core.redis import get_redis

router = APIRouter()


# ============================================
# SECTIONS
# ============================================

@router.get("/sections")
async def get_sections(user_id: str = Depends(get_current_user_id)) -> List[dict]:
    return await journal_service.get_sections()


@router.post("/sections")
async def create_section(
    data: SectionCreate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    return await journal_service.create_section(data)


@router.patch("/sections/{section_id}")
async def update_section(
    section_id: str,
    data: SectionUpdate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    result = await journal_service.update_section(section_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Sekce nenalezena")
    return result


@router.delete("/sections/{section_id}")
async def delete_section(
    section_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    await journal_service.delete_section(section_id)
    return {"success": True}


# ============================================
# CHANNELS
# ============================================

@router.get("/channels")
async def get_channels(user_id: str = Depends(get_current_user_id)) -> List[dict]:
    return await journal_service.get_channels()


@router.post("/channels")
async def create_channel(
    data: ChannelCreate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    return await journal_service.create_custom_channel(data)


@router.patch("/channels/{channel_id}")
async def update_channel(
    channel_id: str,
    data: ChannelUpdate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    result = await journal_service.update_channel(channel_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Kanál nenalezen")
    return result


@router.delete("/channels/{channel_id}")
async def delete_channel(
    channel_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    success = await journal_service.delete_custom_channel(channel_id)
    if not success:
        raise HTTPException(status_code=400, detail="Nelze smazat tento kanál")
    return {"success": True}


# ============================================
# ENTRIES
# ============================================

@router.get("/entries")
async def get_entries(
    channel_id: Optional[str] = Query(None),
    ticker: Optional[str] = Query(None),
    cursor: Optional[str] = Query(None, description="ISO timestamp — entries older than this"),
    limit: int = Query(50, ge=1, le=100),
    user_id: str = Depends(get_current_user_id),
) -> List[dict]:
    if not channel_id and not ticker:
        raise HTTPException(status_code=400, detail="Požadován channel_id nebo ticker")
    return await journal_service.get_entries(
        channel_id=channel_id,
        ticker=ticker,
        cursor=cursor,
        limit=limit,
    )


@router.post("/entries")
async def create_entry(
    data: EntryCreate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    redis = get_redis()
    return await journal_service.create_entry(data, redis=redis)


@router.patch("/entries/{entry_id}")
async def update_entry(
    entry_id: str,
    data: EntryUpdate,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    result = await journal_service.update_entry(entry_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Záznam nenalezen")
    return result


@router.delete("/entries/{entry_id}")
async def delete_entry(
    entry_id: str,
    user_id: str = Depends(get_current_user_id),
) -> dict:
    await journal_service.delete_entry(entry_id)
    return {"success": True}
