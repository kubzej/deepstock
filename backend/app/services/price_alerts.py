"""
Price Alerts Service - Check watchlist targets and send push notifications
"""
import logging
from datetime import datetime
from typing import List, Dict, Optional
from app.core.supabase import supabase
from app.services.market.quotes import get_quotes
from app.services.push import PushService

logger = logging.getLogger(__name__)


class PriceAlertService:
    def __init__(self):
        self.push_service = PushService()
    
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
        
        return await self.push_service.send_push_notification(
            user_id=user_id,
            title=title,
            body=body,
            url=f"/watchlists",
            tag=f"buy-{ticker}"
        )
    
    async def _send_sell_alert(self, user_id: str, item: dict, current_price: float) -> bool:
        """Send sell target reached notification."""
        stock = item.get("stocks", {})
        ticker = stock.get("ticker", "Unknown")
        stock_name = stock.get("name", ticker)
        target = float(item.get("target_sell_price", 0))
        
        title = f"🔴 Prodejní cíl dosažen: {ticker}"
        body = f"{stock_name} je na ${current_price:.2f} (cíl: ${target:.2f})"
        
        return await self.push_service.send_push_notification(
            user_id=user_id,
            title=title,
            body=body,
            url=f"/watchlists",
            tag=f"sell-{ticker}"
        )
    
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


price_alert_service = PriceAlertService()
