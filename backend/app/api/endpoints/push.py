"""
Push Notification API endpoints
"""
from fastapi import APIRouter, HTTPException, Depends
from app.core.auth import get_current_user_id
from app.core.config import get_settings
from app.schemas.push import (
    PushSubscription, 
    NotificationSettings, 
    NotificationSettingsUpdate,
    TestNotification
)
from app.services.push import (
    subscribe_user,
    unsubscribe_user,
    get_notification_settings,
    update_notification_settings,
    send_push_notification
)

router = APIRouter()


@router.get("/vapid-key")
async def get_vapid_public_key():
    """Get the VAPID public key for client-side subscription"""
    settings = get_settings()
    if not settings.vapid_public_key:
        raise HTTPException(status_code=503, detail="Push notifications not configured")
    return {"publicKey": settings.vapid_public_key}


@router.post("/subscribe")
async def subscribe(
    subscription: PushSubscription,
    user_id: str = Depends(get_current_user_id)
):
    """Subscribe the current device to push notifications"""
    try:
        subscribe_user(
            user_id=user_id,
            endpoint=subscription.endpoint,
            p256dh=subscription.keys.get("p256dh", ""),
            auth=subscription.keys.get("auth", "")
        )
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/unsubscribe")
async def unsubscribe(
    subscription: PushSubscription,
    user_id: str = Depends(get_current_user_id)
):
    """Unsubscribe the current device from push notifications"""
    try:
        unsubscribe_user(user_id=user_id, endpoint=subscription.endpoint)
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/settings", response_model=NotificationSettings)
async def get_settings_endpoint(user_id: str = Depends(get_current_user_id)):
    """Get current notification settings"""
    return get_notification_settings(user_id)


@router.patch("/settings", response_model=NotificationSettings)
async def update_settings_endpoint(
    settings: NotificationSettingsUpdate,
    user_id: str = Depends(get_current_user_id)
):
    """Update notification settings"""
    return update_notification_settings(user_id, settings.model_dump(exclude_unset=True))


@router.post("/test")
async def send_test_notification(
    request: TestNotification,
    user_id: str = Depends(get_current_user_id)
):
    """Send a test notification to the current user"""
    sent = send_push_notification(
        user_id=user_id,
        title=request.title,
        body=request.body,
        url="/nastaveni"
    )
    
    if sent == 0:
        return {"success": False, "message": "Žádná aktivní odběratelská zařízení"}
    
    return {"success": True, "devices": sent}
