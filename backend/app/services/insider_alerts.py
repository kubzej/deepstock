"""
Insider Trade Alerts Service

Checks insider trades for stocks in user portfolios and watchlists.
Sends push notifications for significant insider purchases/sales.

Strategy:
  - Run once daily (~18:00 UTC) via cron
  - Only check tickers the user holds or watches
  - Only Purchase & Sale (skip option exercises, gifts, etc.)
  - Apply minimum value threshold (default $100K)
  - Group multiple trades per ticker into one notification
  - Soft cap of 5 notifications per user per run → then one summary
  - Track last check timestamp to only notify about new trades
"""

import logging
from datetime import datetime, timezone
from typing import Dict

from app.core.supabase import supabase
from app.services.insider import get_insider_trades
from app.services.push import send_push_notification

logger = logging.getLogger(__name__)

# Max individual notifications before grouping into summary
MAX_NOTIFICATIONS_PER_USER = 5


def _format_value(value: float | None) -> str:
    """Format large dollar values compactly: 9375000 → $9.38M"""
    if value is None:
        return "—"
    abs_val = abs(value)
    if abs_val >= 1_000_000_000:
        return f"${value / 1_000_000_000:.2f}B"
    if abs_val >= 1_000_000:
        return f"${value / 1_000_000:.2f}M"
    if abs_val >= 1_000:
        return f"${value / 1_000:.0f}K"
    return f"${value:.0f}"


def _format_shares(n: int) -> str:
    """Format share count compactly: 50000 → 50K"""
    if n >= 1_000_000:
        return f"{n / 1_000_000:.1f}M"
    if n >= 10_000:
        return f"{n / 1_000:.0f}K"
    if n >= 1_000:
        return f"{n / 1_000:.1f}K"
    return str(n)


class InsiderAlertService:

    async def check_all_users(self, redis) -> Dict[str, int]:
        """
        Check insider trades for all users with notifications enabled.
        Returns summary of alerts sent.
        """
        # Get users with notifications + insider alerts enabled
        users_response = (
            supabase.table("profiles")
            .select(
                "id, notifications_enabled, alert_insider_enabled, "
                "insider_min_value, last_insider_check_at"
            )
            .eq("notifications_enabled", True)
            .execute()
        )

        if not users_response.data:
            logger.info("No users with notifications enabled")
            return {"users_checked": 0, "alerts_sent": 0}

        total_alerts = 0
        users_checked = 0

        for user in users_response.data:
            # Skip users who disabled insider alerts
            if user.get("alert_insider_enabled") is False:
                continue

            try:
                alerts = await self.check_user_insider_trades(
                    redis=redis,
                    user_id=user["id"],
                    min_value=user.get("insider_min_value") or 100_000,
                    last_check_at=user.get("last_insider_check_at"),
                )
                total_alerts += alerts
                users_checked += 1
            except Exception as e:
                logger.error(
                    "Error checking insider trades for user %s: %s",
                    user["id"],
                    e,
                )

        return {"users_checked": users_checked, "alerts_sent": total_alerts}

    async def check_user_insider_trades(
        self,
        redis,
        user_id: str,
        min_value: int = 100_000,
        last_check_at: str | None = None,
    ) -> int:
        """
        Check insider trades for a single user's tickers.
        Returns number of notifications sent.
        """
        # Collect unique tickers from portfolio holdings + watchlists
        tickers = await self._get_user_tickers(user_id)

        if not tickers:
            # Update timestamp even if no tickers, so we don't re-check
            self._update_last_check(user_id)
            return 0

        # Determine cutoff: trades newer than this are "new"
        if last_check_at:
            cutoff = last_check_at[:10]  # YYYY-MM-DD
        else:
            # First run — don't spam with historical data, only future trades
            self._update_last_check(user_id)
            return 0

        # Collect new significant trades per ticker
        ticker_alerts: dict[str, list[dict]] = {}

        for ticker in tickers:
            try:
                trades = await get_insider_trades(redis, ticker)
            except Exception as e:
                logger.warning("Failed to fetch insider trades for %s: %s", ticker, e)
                continue

            # Filter: new trades since last check, Purchase/Sale only, above threshold
            new_trades = [
                t
                for t in trades
                if t.get("trade_date", "") > cutoff
                and t.get("trade_type") in ("Purchase", "Sale")
                and (t.get("total_value") or 0) >= min_value
            ]

            if new_trades:
                ticker_alerts[ticker] = new_trades

        if not ticker_alerts:
            self._update_last_check(user_id)
            return 0

        # Send notifications (with soft cap)
        alerts_sent = self._send_alerts(user_id, ticker_alerts)

        # Update last check timestamp
        self._update_last_check(user_id)

        return alerts_sent

    async def _get_user_tickers(self, user_id: str) -> set[str]:
        """
        Get all unique US tickers from user's portfolios and watchlists.
        Insider data is only available for US stocks.
        """
        tickers: set[str] = set()

        # Portfolio holdings: get tickers from transactions
        try:
            portfolios = (
                supabase.table("portfolios")
                .select("id")
                .eq("user_id", user_id)
                .execute()
            )
            if portfolios.data:
                portfolio_ids = [p["id"] for p in portfolios.data]
                # Get distinct tickers from transactions in these portfolios
                for pid in portfolio_ids:
                    txs = (
                        supabase.table("transactions")
                        .select("stock_id")
                        .eq("portfolio_id", pid)
                        .execute()
                    )
                    if txs.data:
                        stock_ids = list(set(t["stock_id"] for t in txs.data))
                        stocks = (
                            supabase.table("stocks")
                            .select("ticker")
                            .in_("id", stock_ids)
                            .execute()
                        )
                        if stocks.data:
                            for s in stocks.data:
                                ticker = s["ticker"]
                                # Only US tickers (no dot suffix like .L, .DE)
                                if "." not in ticker:
                                    tickers.add(ticker)
        except Exception as e:
            logger.warning("Failed to get portfolio tickers for user %s: %s", user_id, e)

        # Watchlist items
        try:
            watchlists = (
                supabase.table("watchlists")
                .select("id")
                .eq("user_id", user_id)
                .execute()
            )
            if watchlists.data:
                wl_ids = [w["id"] for w in watchlists.data]
                items = (
                    supabase.table("watchlist_items")
                    .select("*, stocks(ticker)")
                    .in_("watchlist_id", wl_ids)
                    .execute()
                )
                if items.data:
                    for item in items.data:
                        ticker = item.get("stocks", {}).get("ticker", "")
                        if ticker and "." not in ticker:
                            tickers.add(ticker)
        except Exception as e:
            logger.warning("Failed to get watchlist tickers for user %s: %s", user_id, e)

        return tickers

    def _send_alerts(
        self, user_id: str, ticker_alerts: dict[str, list[dict]]
    ) -> int:
        """
        Send push notifications for insider trades.
        Groups by ticker. Applies soft cap.
        """
        alerts_sent = 0
        overflow: list[tuple[str, int, float]] = []  # (ticker, count, total_value)

        for ticker, trades in ticker_alerts.items():
            if alerts_sent >= MAX_NOTIFICATIONS_PER_USER:
                # Collect for summary
                total_val = sum(t.get("total_value") or 0 for t in trades)
                overflow.append((ticker, len(trades), total_val))
                continue

            # Determine if buy or sell dominant
            buys = [t for t in trades if t["trade_type"] == "Purchase"]
            sells = [t for t in trades if t["trade_type"] == "Sale"]

            if len(trades) == 1:
                # Single trade — detailed notification
                trade = trades[0]
                is_buy = trade["trade_type"] == "Purchase"
                emoji = "🟢" if is_buy else "🔴"
                action = "nákup" if is_buy else "prodej"

                title = f"{emoji} Insider {action}: {ticker}"
                name = trade.get("insider_name", "Neznámý")
                shares = _format_shares(trade.get("shares", 0))
                value = _format_value(trade.get("total_value"))
                verb = "koupil" if is_buy else "prodal"
                body = f"{name} {verb} {shares} akcií za {value}"
            else:
                # Multiple trades — grouped
                total_value = sum(t.get("total_value") or 0 for t in trades)

                if buys and not sells:
                    emoji = "🟢"
                    title = f"{emoji} {len(trades)} insider nákupy: {ticker}"
                    body = f"Celkem {_format_value(total_value)}"
                elif sells and not buys:
                    emoji = "🔴"
                    title = f"{emoji} {len(trades)} insider prodeje: {ticker}"
                    body = f"Celkem {_format_value(total_value)}"
                else:
                    emoji = "📊"
                    title = f"{emoji} {len(trades)} insider obchody: {ticker}"
                    buy_val = sum(t.get("total_value") or 0 for t in buys)
                    sell_val = sum(t.get("total_value") or 0 for t in sells)
                    body = (
                        f"Nákupy {_format_value(buy_val)}, "
                        f"prodeje {_format_value(sell_val)}"
                    )

            sent = send_push_notification(
                user_id=user_id,
                title=title,
                body=body,
                url=f"/akcie/{ticker}",
                tag=f"insider-{ticker}",
            )
            if sent > 0:
                alerts_sent += 1

        # Send overflow summary if any
        if overflow:
            total_tickers = len(overflow)
            total_trades = sum(c for _, c, _ in overflow)
            total_value = sum(v for _, _, v in overflow)
            ticker_list = ", ".join(t for t, _, _ in overflow[:3])
            if total_tickers > 3:
                ticker_list += f" +{total_tickers - 3}"

            title = f"📊 Další insider obchody ({total_trades})"
            body = f"{ticker_list} — celkem {_format_value(total_value)}"

            sent = send_push_notification(
                user_id=user_id,
                title=title,
                body=body,
                url="/",
                tag="insider-summary",
            )
            if sent > 0:
                alerts_sent += 1

        return alerts_sent

    def _update_last_check(self, user_id: str):
        """Update the last insider check timestamp for a user."""
        try:
            supabase.table("profiles").update(
                {"last_insider_check_at": datetime.now(timezone.utc).isoformat()}
            ).eq("id", user_id).execute()
        except Exception as e:
            logger.error("Failed to update last_insider_check_at: %s", e)


insider_alert_service = InsiderAlertService()
