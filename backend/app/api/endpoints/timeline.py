from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.auth import get_current_user_id
from app.schemas.timeline import TimelineResponse
from app.services.timeline import timeline_service

router = APIRouter()


@router.get('', response_model=TimelineResponse)
async def list_timeline_events(
    limit: int = Query(30, ge=1, le=100),
    cursor: str | None = Query(None),
    user_id: str = Depends(get_current_user_id),
):
    try:
        return await timeline_service.list_events(user_id, limit=limit, cursor=cursor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
