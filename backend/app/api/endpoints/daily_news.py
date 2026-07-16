import logging

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query

from app.core.auth import get_current_user_id
from app.schemas.daily_news import (
    DailyBriefingScopeOptions,
    DailyBriefingScopeUpdate,
    DailyBriefingSettings,
    DailyBriefingSettingsUpdate,
    DailyNewsReport,
    DailyNewsReportList,
    DailyNewsSourceList,
    GenerateDailyBriefingResponse,
)
from app.services.daily_news import daily_news_service
from app.services.daily_news_settings import daily_news_settings_service

logger = logging.getLogger(__name__)

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


@router.get("/reports", response_model=DailyNewsReportList)
async def list_daily_news_reports(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user_id: str = Depends(get_current_user_id),
):
    return {
        "reports": await daily_news_service.list_reports(user_id, limit=limit, offset=offset),
        "limit": limit,
        "offset": offset,
    }


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


@router.post("/generate", response_model=GenerateDailyBriefingResponse)
async def generate_daily_news_report(
    background_tasks: BackgroundTasks,
    force: bool = Query(False),
    user_id: str = Depends(get_current_user_id),
):
    try:
        report = await daily_news_service.start_manual_report(user_id, force=force)
    except ValueError as exc:
        raise HTTPException(status_code=409, detail=str(exc))

    if report["status"] == "running":
        background_tasks.add_task(
            daily_news_service.run_for_user,
            user_id,
            trigger_type="manual",
            force=True,
            report_id=report["id"],
        )

    return {"report_id": report["id"], "status": report["status"]}
