import json
import logging
from typing import Optional
from pywebpush import webpush, WebPushException
from app.core.config import get_settings
from app.core.supabase import get_supabase_client

logger = logging.getLogger(__name__)


def send_push_notification(
    user_id: str,
    title: str,
    body: str,
    url: Optional[str] = None,
    tag: Optional[str] = None
) -> int:
    """
    Send push notification to all devices of a user.
    Returns number of successfully sent notifications.
    """
    settings = get_settings()
    supabase = get_supabase_client()
    
    if not settings.vapid_private_key:
        logger.warning("VAPID keys not configured, skipping push")
        return 0
    
    # Get user's subscriptions
    result = supabase.table("push_subscriptions").select("*").eq("user_id", user_id).execute()
    subscriptions = result.data or []
    
    if not subscriptions:
        logger.debug(f"No push subscriptions for user {user_id}")
        return 0
    
    payload = json.dumps({
        "title": title,
        "body": body,
        "url": url,
        "tag": tag  # Used for notification grouping
    })
    
    # Prepare VAPID private key - handle escaped newlines
    private_key = settings.vapid_private_key.replace("\\n", "\n")
    
    vapid_claims = {
        "sub": settings.vapid_claim_email
    }
    
    successful = 0
    failed_endpoints = []
    
    for sub in subscriptions:
        subscription_info = {
            "endpoint": sub["endpoint"],
            "keys": {
                "p256dh": sub["p256dh_key"],
                "auth": sub["auth_key"]
            }
        }
        
        try:
            webpush(
                subscription_info=subscription_info,
                data=payload,
                vapid_private_key=private_key,
                vapid_claims=vapid_claims
            )
            successful += 1
            logger.debug(f"Push sent to {sub['endpoint'][:50]}...")
        except WebPushException as e:
            logger.warning(f"Push failed: {e}")
            # If subscription expired (410 Gone) or invalid (404), remove it
            if e.response and e.response.status_code in [404, 410]:
                failed_endpoints.append(sub["id"])
    
    # Clean up invalid subscriptions
    for sub_id in failed_endpoints:
        supabase.table("push_subscriptions").delete().eq("id", sub_id).execute()
        logger.info(f"Removed invalid subscription {sub_id}")
    
    return successful


def subscribe_user(user_id: str, endpoint: str, p256dh: str, auth: str) -> bool:
    """
    Save or update push subscription for a user.
    Returns True if successful.
    """
    supabase = get_supabase_client()
    
    # Check if already exists (by endpoint)
    existing = supabase.table("push_subscriptions").select("id").eq("endpoint", endpoint).execute()
    
    data = {
        "user_id": user_id,
        "endpoint": endpoint,
        "p256dh_key": p256dh,
        "auth_key": auth
    }
    
    if existing.data:
        # Update existing
        supabase.table("push_subscriptions").update(data).eq("id", existing.data[0]["id"]).execute()
    else:
        # Insert new
        supabase.table("push_subscriptions").insert(data).execute()
    
    return True


def unsubscribe_user(user_id: str, endpoint: str) -> bool:
    """Remove a push subscription"""
    supabase = get_supabase_client()
    supabase.table("push_subscriptions").delete().eq("user_id", user_id).eq("endpoint", endpoint).execute()
    return True


def get_notification_settings(user_id: str) -> dict:
    """Get user's notification preferences"""
    supabase = get_supabase_client()
    result = supabase.table("profiles").select(
        "notifications_enabled, alert_buy_enabled, alert_sell_enabled"
    ).eq("id", user_id).single().execute()
    
    return result.data or {
        "notifications_enabled": False,
        "alert_buy_enabled": True,
        "alert_sell_enabled": True
    }


def update_notification_settings(user_id: str, settings: dict) -> dict:
    """Update user's notification preferences"""
    supabase = get_supabase_client()
    
    # Filter out None values
    update_data = {k: v for k, v in settings.items() if v is not None}
    
    if update_data:
        supabase.table("profiles").update(update_data).eq("id", user_id).execute()
    
    return get_notification_settings(user_id)
