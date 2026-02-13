"""
Price Alerts Service - Check custom alerts and watchlist targets, send push notifications
"""
import logging
from datetime import datetime, timezone
from typing import List, Dict, Optional
from app.core.supabase import supabase
from app.services.market.quotes import get_quotes
from app.services.push import send_push_notification
from app.schemas.price_alerts import (
    PriceAlertCreate,
    PriceAlertUpdate,
    PriceAlertTriggerInfo,
)

logger = logging.getLogger(__name__)


class PriceAlertService:
    
    async def check_all_users(self, redis) -> Dict[str, int]:
        """
        Check price alerts for all users with notifications enabled.
        Returns summary of alerts sent.
        """
        # Get all users with notifications enabled
        users_response = supabase.table("profiles") \
            .select("id, notifications_enabled, alert_buy_enabled, alert_sell_enabled") \
            .eq("notifications_enabled", True) \
            .execute()
        
        if not users_response.data:
            logger.info("No users with notifications enabled")
            return {"users_checked": 0, "alerts_sent": 0}
        
        total_alerts = 0
        users_checked = 0
        
        for user in users_response.data:
            try:
                alerts = await self.check_user_alerts(
                    redis=redis,
                    user_id=user["id"],
                    alert_buy_enabled=user.get("alert_buy_enabled", True),
                    alert_sell_enabled=user.get("alert_sell_enabled", True)
                )
                total_alerts += alerts
                users_checked += 1
            except Exception as e:
                logger.error(f"Error checking alerts for user {user['id']}: {e}")
        
        return {"users_checked": users_checked, "alerts_sent": total_alerts}
    
    async def check_user_alerts(
        self, 
        redis, 
        user_id: str, 
        alert_buy_enabled: bool = True,
        alert_sell_enabled: bool = True
    ) -> int:
        """
        Check and send price alerts for a single user.
        Returns number of alerts sent.
        """
        if not alert_buy_enabled and not alert_sell_enabled:
            return 0
        
        # Get all watchlist items with targets for this user
        # First get user's watchlist IDs
        watchlists_response = supabase.table("watchlists") \
            .select("id") \
            .eq("user_id", user_id) \
            .execute()
        
        if not watchlists_response.data:
            return 0
        
        watchlist_ids = [w["id"] for w in watchlists_response.data]
        
        # Get items with targets from these watchlists
        items_response = supabase.table("watchlist_items") \
            .select("*, stocks(ticker, name)") \
            .in_("watchlist_id", watchlist_ids) \
            .execute()
        
        if not items_response.data:
            return 0
        
        # Filter items that have at least one target set and have stock info
        items_with_targets = [
            item for item in items_response.data
            if (item.get("target_buy_price") or item.get("target_sell_price")) 
               and item.get("stocks")
        ]
        
        if not items_with_targets:
            return 0
        
        # Get unique tickers from stock data
        tickers = list(set(
            item["stocks"]["ticker"] 
            for item in items_with_targets 
            if item.get("stocks", {}).get("ticker")
        ))
        
        if not tickers:
            return 0
        
        # Fetch current prices
        quotes = await get_quotes(redis, tickers)
        
        alerts_sent = 0
        
        for item in items_with_targets:
            stock = item.get("stocks", {})
            ticker = stock.get("ticker")
            stock_name = stock.get("name", ticker)
            
            if not ticker or ticker not in quotes:
                continue
            
            current_price = quotes[ticker].get("price")
            if not current_price:
                continue
            
            # Check BUY alert
            if alert_buy_enabled:
                target_buy = item.get("target_buy_price")
                if target_buy and current_price <= float(target_buy):
                    # Check anti-spam: only notify if target changed
                    last_alert_price = item.get("last_buy_alert_price")
                    # Compare as strings to handle Decimal precision
                    if str(last_alert_price) != str(target_buy):
                        sent = await self._send_buy_alert(user_id, item, current_price)
                        if sent:
                            alerts_sent += 1
                            await self._update_last_buy_alert(item["id"], target_buy)
            
            # Check SELL alert
            if alert_sell_enabled:
                target_sell = item.get("target_sell_price")
                if target_sell and current_price >= float(target_sell):
                    # Check anti-spam: only notify if target changed
                    last_alert_price = item.get("last_sell_alert_price")
                    # Compare as strings to handle Decimal precision
                    if str(last_alert_price) != str(target_sell):
                        sent = await self._send_sell_alert(user_id, item, current_price)
                        if sent:
                            alerts_sent += 1
                            await self._update_last_sell_alert(item["id"], target_sell)
        
        return alerts_sent
    
    async def _send_buy_alert(self, user_id: str, item: dict, current_price: float) -> bool:
        """Send buy opportunity notification."""
        stock = item.get("stocks", {})
        ticker = stock.get("ticker", "Unknown")
        stock_name = stock.get("name", ticker)
        target = float(item.get("target_buy_price", 0))
        
        title = f"🟢 Nákupní příležitost: {ticker}"
        body = f"{stock_name} je na ${current_price:.2f} (cíl: ${target:.2f})"
        
        sent = send_push_notification(
            user_id=user_id,
            title=title,
            body=body,
            url=f"/watchlists",
            tag=f"buy-{ticker}"
        )
        return sent > 0
    
    async def _send_sell_alert(self, user_id: str, item: dict, current_price: float) -> bool:
        """Send sell target reached notification."""
        stock = item.get("stocks", {})
        ticker = stock.get("ticker", "Unknown")
        stock_name = stock.get("name", ticker)
        target = float(item.get("target_sell_price", 0))
        
        title = f"🔴 Prodejní cíl dosažen: {ticker}"
        body = f"{stock_name} je na ${current_price:.2f} (cíl: ${target:.2f})"
        
        sent = send_push_notification(
            user_id=user_id,
            title=title,
            body=body,
            url=f"/watchlists",
            tag=f"sell-{ticker}"
        )
        return sent > 0
    
    async def _update_last_buy_alert(self, item_id: str, target_price: float):
        """Update last buy alert tracking."""
        try:
            supabase.table("watchlist_items") \
                .update({
                    "last_buy_alert_price": target_price,
                    "last_buy_alert_at": datetime.utcnow().isoformat()
                }) \
                .eq("id", item_id) \
                .execute()
        except Exception as e:
            logger.error(f"Failed to update buy alert tracking: {e}")
    
    async def _update_last_sell_alert(self, item_id: str, target_price: float):
        """Update last sell alert tracking."""
        try:
            supabase.table("watchlist_items") \
                .update({
                    "last_sell_alert_price": target_price,
                    "last_sell_alert_at": datetime.utcnow().isoformat()
                }) \
                .eq("id", item_id) \
                .execute()
        except Exception as e:
            logger.error(f"Failed to update sell alert tracking: {e}")

    # ==========================================
    # CUSTOM PRICE ALERTS CRUD
    # ==========================================
    
    async def get_user_alerts(self, user_id: str) -> List[dict]:
        """Get all custom alerts for a user with stock info."""
        response = supabase.table("price_alerts") \
            .select("*, stocks(ticker, name)") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .execute()
        return response.data
    
    async def get_active_alerts(self, user_id: str) -> List[dict]:
        """Get only active (non-triggered, enabled) alerts for a user."""
        response = supabase.table("price_alerts") \
            .select("*, stocks(ticker, name)") \
            .eq("user_id", user_id) \
            .eq("is_enabled", True) \
            .eq("is_triggered", False) \
            .order("created_at", desc=True) \
            .execute()
        return response.data
    
    async def get_alert(self, alert_id: str, user_id: str) -> Optional[dict]:
        """Get a single alert by ID."""
        response = supabase.table("price_alerts") \
            .select("*, stocks(ticker, name)") \
            .eq("id", alert_id) \
            .eq("user_id", user_id) \
            .execute()
        return response.data[0] if response.data else None
    
    async def create_alert(self, user_id: str, data: PriceAlertCreate) -> dict:
        """Create a new custom price alert."""
        insert_data = {
            "user_id": user_id,
            "stock_id": data.stock_id,
            "condition_type": data.condition_type,
            "condition_value": data.condition_value,
            "is_enabled": data.is_enabled if data.is_enabled is not None else True,
            "repeat_after_trigger": data.repeat_after_trigger if data.repeat_after_trigger is not None else False,
        }
        
        if data.notes is not None:
            insert_data["notes"] = data.notes
        
        response = supabase.table("price_alerts") \
            .insert(insert_data) \
            .execute()
        
        # Fetch with stock info
        return await self.get_alert(response.data[0]["id"], user_id)
    
    async def update_alert(self, alert_id: str, user_id: str, data: PriceAlertUpdate) -> Optional[dict]:
        """Update a custom alert."""
        update_data = {}
        
        if data.condition_type is not None:
            update_data["condition_type"] = data.condition_type
        if data.condition_value is not None:
            update_data["condition_value"] = data.condition_value
        if data.is_enabled is not None:
            update_data["is_enabled"] = data.is_enabled
        if data.repeat_after_trigger is not None:
            update_data["repeat_after_trigger"] = data.repeat_after_trigger
        if data.notes is not None:
            update_data["notes"] = data.notes
        
        if not update_data:
            return await self.get_alert(alert_id, user_id)
        
        response = supabase.table("price_alerts") \
            .update(update_data) \
            .eq("id", alert_id) \
            .eq("user_id", user_id) \
            .execute()
        
        if not response.data:
            return None
        
        return await self.get_alert(alert_id, user_id)
    
    async def delete_alert(self, alert_id: str, user_id: str) -> bool:
        """Delete a custom alert."""
        response = supabase.table("price_alerts") \
            .delete() \
            .eq("id", alert_id) \
            .eq("user_id", user_id) \
            .execute()
        return len(response.data) > 0
    
    async def reset_alert(self, alert_id: str, user_id: str) -> Optional[dict]:
        """Reset a triggered alert to active state."""
        response = supabase.table("price_alerts") \
            .update({
                "is_triggered": False,
                "triggered_at": None,
            }) \
            .eq("id", alert_id) \
            .eq("user_id", user_id) \
            .execute()
        
        if not response.data:
            return None
        
        return await self.get_alert(alert_id, user_id)

    # ==========================================
    # CUSTOM ALERT CHECKING (for cron job)
    # ==========================================
    
    async def get_all_pending_alerts(self) -> List[dict]:
        """
        Get all enabled, non-triggered custom alerts across all users.
        Used by cron job to check alerts.
        """
        response = supabase.table("price_alerts") \
            .select("*, stocks(ticker, name)") \
            .eq("is_enabled", True) \
            .eq("is_triggered", False) \
            .execute()
        return response.data
    
    async def mark_alert_triggered(self, alert_id: str) -> dict:
        """Mark a custom alert as triggered with timestamp."""
        now = datetime.now(timezone.utc).isoformat()
        response = supabase.table("price_alerts") \
            .update({
                "is_triggered": True,
                "triggered_at": now,
            }) \
            .eq("id", alert_id) \
            .execute()
        return response.data[0] if response.data else None
    
    def check_alert_condition(
        self, 
        alert: dict, 
        current_price: float, 
        previous_close: float
    ) -> PriceAlertTriggerInfo:
        """
        Check if a custom alert condition is met.
        
        Args:
            alert: The alert dict with condition_type, condition_value
            current_price: Current market price
            previous_close: Previous day's closing price
        
        Returns:
            PriceAlertTriggerInfo with is_triggered and current_value
        """
        condition_type = alert["condition_type"]
        condition_value = float(alert["condition_value"])
        
        if condition_type == "price_above":
            return PriceAlertTriggerInfo(
                is_triggered=current_price >= condition_value,
                current_value=current_price
            )
        
        elif condition_type == "price_below":
            return PriceAlertTriggerInfo(
                is_triggered=current_price <= condition_value,
                current_value=current_price
            )
        
        elif condition_type == "percent_change_day":
            if previous_close == 0:
                return PriceAlertTriggerInfo(
                    is_triggered=False,
                    current_value=0
                )
            
            percent_change = ((current_price - previous_close) / previous_close) * 100
            
            # Check if absolute change exceeds threshold
            return PriceAlertTriggerInfo(
                is_triggered=abs(percent_change) >= abs(condition_value),
                current_value=percent_change
            )
        
        logger.warning(f"Unknown condition type: {condition_type}")
        return PriceAlertTriggerInfo(
            is_triggered=False,
            current_value=0
        )
    
    async def check_custom_alerts(self, redis) -> Dict[str, int]:
        """
        Check all custom price alerts and send notifications.
        Returns summary of alerts checked and triggered.
        """
        pending_alerts = await self.get_all_pending_alerts()
        
        if not pending_alerts:
            return {"alerts_checked": 0, "alerts_triggered": 0}
        
        # Group alerts by ticker for efficient quote fetching
        alerts_by_ticker: Dict[str, List[dict]] = {}
        for alert in pending_alerts:
            stock = alert.get("stocks", {})
            ticker = stock.get("ticker")
            if ticker:
                if ticker not in alerts_by_ticker:
                    alerts_by_ticker[ticker] = []
                alerts_by_ticker[ticker].append(alert)
        
        if not alerts_by_ticker:
            return {"alerts_checked": 0, "alerts_triggered": 0}
        
        # Fetch current prices for all relevant tickers
        tickers = list(alerts_by_ticker.keys())
        quotes = await get_quotes(redis, tickers)
        
        alerts_triggered = 0
        
        for ticker, alerts in alerts_by_ticker.items():
            quote = quotes.get(ticker, {})
            current_price = quote.get("price")
            previous_close = quote.get("previousClose", quote.get("price", 0))
            
            if not current_price:
                continue
            
            for alert in alerts:
                trigger_info = self.check_alert_condition(
                    alert, current_price, previous_close
                )
                
                if trigger_info.is_triggered:
                    # Mark as triggered
                    await self.mark_alert_triggered(alert["id"])
                    
                    # Send push notification
                    await self._send_custom_alert_notification(
                        alert, current_price, trigger_info.current_value
                    )
                    
                    alerts_triggered += 1
                    
                    # If repeat_after_trigger, reset immediately
                    if alert.get("repeat_after_trigger"):
                        await self.reset_alert(alert["id"], alert["user_id"])
        
        return {
            "alerts_checked": len(pending_alerts),
            "alerts_triggered": alerts_triggered
        }
    
    async def _send_custom_alert_notification(
        self, 
        alert: dict, 
        current_price: float,
        current_value: float
    ) -> bool:
        """Send notification for a triggered custom alert."""
        stock = alert.get("stocks", {})
        ticker = stock.get("ticker", "Unknown")
        stock_name = stock.get("name", ticker)
        condition_type = alert.get("condition_type")
        condition_value = float(alert.get("condition_value", 0))
        user_id = alert.get("user_id")
        
        # Build notification message based on condition type
        if condition_type == "price_above":
            title = f"⬆️ {ticker} nad ${condition_value:.2f}"
            body = f"{stock_name} je na ${current_price:.2f}"
        elif condition_type == "price_below":
            title = f"⬇️ {ticker} pod ${condition_value:.2f}"
            body = f"{stock_name} je na ${current_price:.2f}"
        elif condition_type == "percent_change_day":
            direction = "+" if current_value >= 0 else ""
            title = f"📊 {ticker} změna {direction}{current_value:.1f}%"
            body = f"{stock_name} překročil práh ±{abs(condition_value):.1f}%"
        else:
            title = f"🔔 Alert: {ticker}"
            body = f"Cena: ${current_price:.2f}"
        
        sent = send_push_notification(
            user_id=user_id,
            title=title,
            body=body,
            url=f"/alerts",
            tag=f"alert-{alert['id']}"
        )
        return sent > 0


price_alert_service = PriceAlertService()
