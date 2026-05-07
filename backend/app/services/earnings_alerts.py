"""
Earnings Alerts Service - Notify users about today's earnings
"""
import logging
from datetime import datetime, date
from typing import Dict
from app.core.supabase import supabase
from app.services.earnings_calendar import earnings_calendar_service
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

        logger.info(
            "Starting earnings alert check for %d users with notifications enabled",
            len(users_response.data),
        )
        
        total_alerts = 0
        users_checked = 0
        users_skipped = 0
        
        for user in users_response.data:
            # Skip users who disabled earnings alerts
            if user.get("alert_earnings_enabled") is False:
                users_skipped += 1
                logger.info("Skipping earnings alerts for user %s because alert_earnings_enabled=false", user["id"])
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

        logger.info(
            "Finished earnings alert check: users_checked=%d users_skipped=%d alerts_sent=%d",
            users_checked,
            users_skipped,
            total_alerts,
        )
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
            logger.info("User %s has no watchlists for earnings alerts", user_id)
            return 0
        
        watchlist_ids = [w["id"] for w in watchlists_response.data]
        
        # Get items from these watchlists
        items_response = supabase.table("watchlist_items") \
            .select("*, stocks(ticker, name)") \
            .in_("watchlist_id", watchlist_ids) \
            .execute()
        
        if not items_response.data:
            logger.info("User %s has no watchlist items for earnings alerts", user_id)
            return 0
        
        # Get unique tickers
        tickers = list(set(
            item["stocks"]["ticker"] 
            for item in items_response.data 
            if item.get("stocks", {}).get("ticker")
        ))
        
        if not tickers:
            logger.info("User %s has no resolved tickers for earnings alerts", user_id)
            return 0

        logger.info(
            "Checking earnings alerts for user %s: watchlists=%d watchlist_items=%d unique_tickers=%d",
            user_id,
            len(watchlist_ids),
            len(items_response.data),
            len(tickers),
        )
        
        earnings_today_by_ticker = await earnings_calendar_service.get_tickers_with_earnings_on(
            date.fromisoformat(today_str)
        )
        logger.info(
            "Earnings today lookup for %s returned %d tickers (sample=%s)",
            today_str,
            len(earnings_today_by_ticker),
            list(sorted(earnings_today_by_ticker.keys()))[:10],
        )

        # Find tickers with earnings TODAY
        earnings_today = []
        for ticker in tickers:
            if ticker in earnings_today_by_ticker:
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
            logger.info("User %s has no watchlist tickers with earnings today", user_id)
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
            else:
                logger.info(
                    "Skipping duplicate earnings alert for user %s ticker %s on %s",
                    user_id,
                    stock["ticker"],
                    today_str,
                )
        
        if not alerts_to_send:
            logger.info("User %s has only already-sent earnings alerts for %s", user_id, today_str)
            return 0

        logger.info(
            "User %s will receive %d earnings alerts today (tickers=%s)",
            user_id,
            len(alerts_to_send),
            [stock["ticker"] for stock in alerts_to_send],
        )
        
        # Send notification(s)
        alerts_sent = 0
        for stock in alerts_to_send:
            sent = await self._send_earnings_alert(user_id, stock)
            if sent:
                alerts_sent += 1
            else:
                logger.warning(
                    "Push send returned no deliveries for earnings alert user=%s ticker=%s",
                    user_id,
                    stock["ticker"],
                )
        
        logger.info("User %s earnings alert run finished: alerts_sent=%d", user_id, alerts_sent)
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
