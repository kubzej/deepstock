"""
Cron job endpoints - called by Railway cron scheduler
"""
import logging
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from app.core.config import get_settings
from app.core.redis import get_redis
from app.services.price_alerts import price_alert_service
from app.services.earnings_calendar import earnings_calendar_service
from app.services.earnings_alerts import earnings_alert_service

logger = logging.getLogger(__name__)

router = APIRouter()


async def verify_cron_secret(x_cron_secret: Optional[str] = Header(None)):
    """Verify the cron secret to prevent unauthorized access"""
    settings = get_settings()
    if not settings.cron_secret:
        raise HTTPException(status_code=503, detail="Cron not configured")
    if x_cron_secret != settings.cron_secret:
        raise HTTPException(status_code=401, detail="Invalid cron secret")


@router.post("/check-price-alerts")
async def check_price_alerts(x_cron_secret: Optional[str] = Header(None)):
    """
    Check all watchlist price targets and send notifications.
    Called by Railway cron every 5-15 minutes during market hours.
    """
    await verify_cron_secret(x_cron_secret)
    
    redis = get_redis()
    logger.info("Cron check-price-alerts started")

    try:
        result = await price_alert_service.check_all_users(redis)
        logger.info(
            "Cron check-price-alerts finished: users_checked=%d alerts_sent=%d",
            result["users_checked"],
            result["alerts_sent"],
        )
        return {
            "success": True,
            "users_checked": result["users_checked"],
            "alerts_sent": result["alerts_sent"]
        }
    except Exception as e:
        logger.error(f"check-price-alerts failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Chyba při kontrole cenových alertů.")


@router.post("/check-custom-alerts")
async def check_custom_alerts(x_cron_secret: Optional[str] = Header(None)):
    """
    Check all custom price alerts (price_above, price_below, percent_change_day).
    Called by Railway cron every 5-15 minutes during market hours.
    """
    await verify_cron_secret(x_cron_secret)
    
    redis = get_redis()
    logger.info("Cron check-custom-alerts started")

    try:
        result = await price_alert_service.check_custom_alerts(redis)
        logger.info(
            "Cron check-custom-alerts finished: alerts_checked=%d alerts_triggered=%d",
            result["alerts_checked"],
            result["alerts_triggered"],
        )
        return {
            "success": True,
            "alerts_checked": result["alerts_checked"],
            "alerts_triggered": result["alerts_triggered"]
        }
    except Exception as e:
        logger.error(f"check-custom-alerts failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Chyba při kontrole vlastních alertů.")


@router.get("/health")
async def cron_health():
    """Simple health check for cron service"""
    return {"status": "ok"}


@router.post("/check-earnings-alerts")
async def check_earnings_alerts(x_cron_secret: Optional[str] = Header(None)):
    """
    Check earnings calendar and notify users about today's earnings.
    Called daily at 8:00 UTC (9:00 CET).
    """
    await verify_cron_secret(x_cron_secret)
    
    redis = get_redis()
    logger.info("Cron check-earnings-alerts started")

    try:
        refresh_result = await earnings_calendar_service.refresh_due_watchlist_tickers()
        result = await earnings_alert_service.check_all_users(redis)
        logger.info(
            (
                "Cron check-earnings-alerts finished: tickers_due=%d tickers_refreshed=%d orphaned_entries_deleted=%d "
                "users_checked=%d alerts_sent=%d"
            ),
            refresh_result["tickers_due"],
            refresh_result["tickers_refreshed"],
            refresh_result["orphaned_entries_deleted"],
            result["users_checked"],
            result["alerts_sent"],
        )
        return {
            "success": True,
            "tickers_due": refresh_result["tickers_due"],
            "tickers_refreshed": refresh_result["tickers_refreshed"],
            "orphaned_entries_deleted": refresh_result["orphaned_entries_deleted"],
            "users_checked": result["users_checked"],
            "alerts_sent": result["alerts_sent"]
        }
    except Exception as e:
        logger.error(f"check-earnings-alerts failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Chyba při kontrole earnings alertů.")


@router.post("/refresh-earnings-calendar")
async def refresh_earnings_calendar(x_cron_secret: Optional[str] = Header(None)):
    """
    Refresh cached earnings dates for watchlist tickers.
    Called daily by cron.
    """
    await verify_cron_secret(x_cron_secret)
    logger.info("Cron refresh-earnings-calendar started")

    try:
        result = await earnings_calendar_service.refresh_due_watchlist_tickers()
        logger.info(
            "Cron refresh-earnings-calendar finished: tickers_due=%d tickers_refreshed=%d orphaned_entries_deleted=%d",
            result["tickers_due"],
            result["tickers_refreshed"],
            result["orphaned_entries_deleted"],
        )
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"refresh-earnings-calendar failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Chyba při refreshi earnings kalendáře.")


@router.post("/refresh-earnings-calendar-force")
async def refresh_earnings_calendar_force(x_cron_secret: Optional[str] = Header(None)):
    """
    Force-refresh earnings dates for ALL watchlist tickers, bypassing the
    due-check. One-off / manual use — e.g. to backfill rows left stale by a
    previous bug. The scheduled daily job should use /refresh-earnings-calendar.
    """
    await verify_cron_secret(x_cron_secret)
    logger.info("Cron refresh-earnings-calendar-force started")

    try:
        cleanup_result = await earnings_calendar_service.cleanup_orphaned_entries()
        tickers = await earnings_calendar_service.get_watchlist_tickers()
        result = await earnings_calendar_service.refresh_tickers(tickers)
        result.update(cleanup_result)
        logger.info(
            "Cron refresh-earnings-calendar-force finished: tickers_requested=%d tickers_refreshed=%d",
            result["tickers_requested"],
            result["tickers_refreshed"],
        )
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"refresh-earnings-calendar-force failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Chyba při force refreshi earnings kalendáře.")


@router.post("/cleanup-earnings-calendar")
async def cleanup_earnings_calendar(x_cron_secret: Optional[str] = Header(None)):
    """
    Remove earnings cache rows for stocks that are no longer present
    in any watchlist item.
    """
    await verify_cron_secret(x_cron_secret)
    logger.info("Cron cleanup-earnings-calendar started")

    try:
        result = await earnings_calendar_service.cleanup_orphaned_entries()
        logger.info(
            "Cron cleanup-earnings-calendar finished: orphaned_entries_found=%d orphaned_entries_deleted=%d",
            result["orphaned_entries_found"],
            result["orphaned_entries_deleted"],
        )
        return {"success": True, **result}
    except Exception as e:
        logger.error(f"cleanup-earnings-calendar failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Chyba při cleanupu earnings kalendáře.")
