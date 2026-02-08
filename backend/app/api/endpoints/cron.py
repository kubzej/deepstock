"""
Cron job endpoints - called by Railway cron scheduler
"""
from fastapi import APIRouter, HTTPException, Header
from typing import Optional
from app.core.config import get_settings
from app.core.redis import get_redis
from app.services.price_alerts import price_alert_service
from app.services.earnings_alerts import earnings_alert_service

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
    
    redis = await get_redis()
    
    try:
        result = await price_alert_service.check_all_users(redis)
        return {
            "success": True,
            "users_checked": result["users_checked"],
            "alerts_sent": result["alerts_sent"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
    
    redis = await get_redis()
    
    try:
        result = await earnings_alert_service.check_all_users(redis)
        return {
            "success": True,
            "users_checked": result["users_checked"],
            "alerts_sent": result["alerts_sent"]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
