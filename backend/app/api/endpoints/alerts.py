"""
Price Alerts API endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from typing import List
from app.services.price_alerts import price_alert_service
from app.schemas.price_alerts import (
    PriceAlertCreate,
    PriceAlertUpdate,
    PriceAlertResponse,
    PriceAlertResetRequest,
)
from app.core.auth import get_current_user_id


router = APIRouter()


@router.get("/")
async def get_alerts(
    user_id: str = Depends(get_current_user_id)
) -> List[dict]:
    """Get all price alerts for the authenticated user."""
    return await price_alert_service.get_user_alerts(user_id)


@router.get("/active")
async def get_active_alerts(
    user_id: str = Depends(get_current_user_id)
) -> List[dict]:
    """Get only active (enabled, non-triggered) alerts."""
    return await price_alert_service.get_active_alerts(user_id)


@router.get("/{alert_id}")
async def get_alert(
    alert_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Get a single alert by ID."""
    alert = await price_alert_service.get_alert(alert_id, user_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert nenalezen")
    return alert


@router.post("/")
async def create_alert(
    data: PriceAlertCreate,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Create a new price alert."""
    return await price_alert_service.create_alert(user_id, data)


@router.put("/{alert_id}")
async def update_alert(
    alert_id: str,
    data: PriceAlertUpdate,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Update a price alert."""
    result = await price_alert_service.update_alert(alert_id, user_id, data)
    if not result:
        raise HTTPException(status_code=404, detail="Alert nenalezen")
    return result


@router.delete("/{alert_id}")
async def delete_alert(
    alert_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Delete a price alert."""
    success = await price_alert_service.delete_alert(alert_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="Alert nenalezen")
    return {"success": True}


@router.post("/{alert_id}/reset")
async def reset_alert(
    alert_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Reset a triggered alert back to active state."""
    result = await price_alert_service.reset_alert(alert_id, user_id)
    if not result:
        raise HTTPException(status_code=404, detail="Alert nenalezen")
    return result


@router.post("/{alert_id}/toggle")
async def toggle_alert(
    alert_id: str,
    user_id: str = Depends(get_current_user_id)
) -> dict:
    """Toggle alert enabled/disabled state."""
    alert = await price_alert_service.get_alert(alert_id, user_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert nenalezen")
    
    # Toggle the current state
    new_state = not alert.get("is_enabled", True)
    result = await price_alert_service.update_alert(
        alert_id, 
        user_id, 
        PriceAlertUpdate(is_enabled=new_state)
    )
    return result
