from pydantic import BaseModel
from typing import Optional


class PushSubscription(BaseModel):
    """Web Push subscription from browser"""
    endpoint: str
    keys: dict  # Contains p256dh and auth


class NotificationSettings(BaseModel):
    """User notification preferences"""
    notifications_enabled: bool
    alert_buy_enabled: bool
    alert_sell_enabled: bool
    alert_earnings_enabled: bool


class NotificationSettingsUpdate(BaseModel):
    """Update notification preferences"""
    notifications_enabled: Optional[bool] = None
    alert_buy_enabled: Optional[bool] = None
    alert_sell_enabled: Optional[bool] = None
    alert_earnings_enabled: Optional[bool] = None


class TestNotification(BaseModel):
    """Request for test notification"""
    title: str = "DeepStock Test"
    body: str = "Testovací notifikace funguje!"
