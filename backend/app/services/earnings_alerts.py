"""
Earnings Alerts Service - Notify users about today's earnings
"""
import logging
from datetime import datetime, date
from typing import Dict
from app.core.supabase import supabase
from app.services.market.quotes import get_quotes
from app.services.push import send_push_notification
from app.core.cache import CacheTTL

logger = logging.getLogger(__name__)


class EarningsAlertService:
    
    async def check_all_users(self, redis) -> Dict[str, int]:
        """
        Check earnings for all users with notifications enabled.
        Sends notification for stocks with earnings TODAY.
        """
        today_str = date.today().isoformat()
        
        # Get all users with notifications AND earnings alerts enabled
        users_response = supabase.table("profiles") \
            .select("id, notifications_enabled, alert_earnings_enabled") \
            .eq("notifications_enabled", True) \
            .execute()
        
        if not users_response.data:
            logger.info("No users with notifications enabled")
            return {"users_checked": 0, "alerts_sent": 0}
        
        total_alerts = 0
        users_checked = 0
        
        for user in users_response.data:
            # Skip users who disabled earnings alerts
            if user.get("alert_earnings_enabled") is False:
                continue
                
            try:
                alerts = await self.check_user_earnings(
                    redis=redis,
                    user_id=user["id"],
                    today_str=today_str
                )
                total_alerts += alerts
                users_checked += 1
            except Exception as e:
                logger.error(f"Error checking earnings for user {user['id']}: {e}")
        
        return {"users_checked": users_checked, "alerts_sent": total_alerts}
    
    async def check_user_earnings(
        self, 
        redis, 
        user_id: str,
        today_str: str
    ) -> int:
        """
        Check and send earnings alerts for a single user.
        Returns number of alerts sent.
        """
        # Get all watchlist items for this user
        watchlists_response = supabase.table("watchlists") \
            .select("id") \
            .eq("user_id", user_id) \
            .execute()
        
        if not watchlists_response.data:
            return 0
        
        watchlist_ids = [w["id"] for w in watchlists_response.data]
        
        # Get items from these watchlists
        items_response = supabase.table("watchlist_items") \
            .select("*, stocks(ticker, name)") \
            .in_("watchlist_id", watchlist_ids) \
            .execute()
        
        if not items_response.data:
            return 0
        
        # Get unique tickers
        tickers = list(set(
            item["stocks"]["ticker"] 
            for item in items_response.data 
            if item.get("stocks", {}).get("ticker")
        ))
        
        if not tickers:
            return 0
        
        # Fetch quotes (includes earningsDate)
        quotes = await get_quotes(redis, tickers)
        
        # Find tickers with earnings TODAY
        earnings_today = []
        for ticker in tickers:
            quote = quotes.get(ticker)
            if quote and quote.get("earningsDate") == today_str:
                # Get stock name from items
                stock_name = next(
                    (item["stocks"]["name"] for item in items_response.data 
                     if item.get("stocks", {}).get("ticker") == ticker),
                    ticker
                )
                earnings_today.append({
                    "ticker": ticker,
                    "name": stock_name
                })
        
        if not earnings_today:
            return 0
        
        # Check anti-spam: only notify once per ticker per day
        alerts_to_send = []
        for stock in earnings_today:
            cache_key = f"earnings_alert:{user_id}:{stock['ticker']}:{today_str}"
            already_sent = await redis.get(cache_key)
            if not already_sent:
                alerts_to_send.append(stock)
                # Mark as sent (expires in 24h)
                await redis.set(cache_key, "1", ex=CacheTTL.ALERT_SENT)
        
        if not alerts_to_send:
            return 0
        
        # Send notification(s)
        alerts_sent = 0
        for stock in alerts_to_send:
            sent = await self._send_earnings_alert(user_id, stock)
            if sent:
                alerts_sent += 1
        
        return alerts_sent
    
    async def _send_earnings_alert(self, user_id: str, stock: dict) -> bool:
        """Send earnings notification."""
        ticker = stock["ticker"]
        stock_name = stock["name"]
        
        title = f"📅 Earnings dnes: {ticker}"
        body = f"{stock_name} dnes hlásí výsledky"
        
        sent = send_push_notification(
            user_id=user_id,
            title=title,
            body=body,
            url=f"/stocks/{ticker}",
            tag=f"earnings-{ticker}"
        )
        return sent > 0


earnings_alert_service = EarningsAlertService()
