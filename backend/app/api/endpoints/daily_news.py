from fastapi import APIRouter, Depends, HTTPException

from app.core.auth import get_current_user_id
from app.schemas.daily_news import (
    DailyBriefingScopeOptions,
    DailyBriefingScopeUpdate,
    DailyBriefingSettings,
    DailyBriefingSettingsUpdate,
    DailyNewsReport,
    DailyNewsSourceList,
)
from app.services.daily_news import daily_news_service
from app.services.daily_news_settings import daily_news_settings_service

router = APIRouter()


@router.get("/settings", response_model=DailyBriefingSettings)
async def get_daily_briefing_settings(user_id: str = Depends(get_current_user_id)):
    return await daily_news_settings_service.get_settings(user_id)


@router.put("/settings", response_model=DailyBriefingSettings)
async def update_daily_briefing_settings(
    payload: DailyBriefingSettingsUpdate,
    user_id: str = Depends(get_current_user_id),
):
    return await daily_news_settings_service.update_settings(user_id, payload.model_dump())


@router.get("/scope-options", response_model=DailyBriefingScopeOptions)
async def get_daily_briefing_scope_options(user_id: str = Depends(get_current_user_id)):
    return await daily_news_settings_service.get_scope_options(user_id)


@router.put("/scope", response_model=DailyBriefingScopeOptions)
async def update_daily_briefing_scope(
    payload: DailyBriefingScopeUpdate,
    user_id: str = Depends(get_current_user_id),
):
    try:
        await daily_news_settings_service.replace_scope_items(
            user_id,
            [item.model_dump(exclude={"id", "user_id", "source_name", "item_count"}) for item in payload.items],
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return await daily_news_settings_service.get_scope_options(user_id)


@router.get("/reports/{report_id}", response_model=DailyNewsReport)
async def get_daily_news_report(
    report_id: str,
    user_id: str = Depends(get_current_user_id),
):
    report = await daily_news_service.get_report(report_id, user_id)
    if not report:
        raise HTTPException(status_code=404, detail="Report nenalezen")
    return report


@router.get("/reports/{report_id}/sources", response_model=DailyNewsSourceList)
async def get_daily_news_sources(
    report_id: str,
    user_id: str = Depends(get_current_user_id),
):
    try:
        return {"sources": await daily_news_service.get_sources(report_id, user_id)}
    except ValueError:
        raise HTTPException(status_code=404, detail="Report nenalezen")

