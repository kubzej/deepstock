"""
Thin facade over the split MCP research-context domain services.
"""
from __future__ import annotations

from typing import Iterable, Literal, Optional

from app.services.research_context_activity import ActivityFilterError
from app.services.research_context_activity import activity_portfolio_context_service
from app.services.research_context_journal import journal_context_service
from app.services.research_context_market import market_context_service
from app.services.research_context_market import VALID_TECHNICAL_INDICATORS
from app.services.research_context_watchlist import watchlist_context_service

TechnicalPeriod = Literal["1w", "1mo", "3mo", "6mo", "1y", "2y"]


class ResearchContextService:
    async def get_stock_context(self, ticker: str, user_id: str) -> dict:
        return await market_context_service.get_stock_context(
            ticker,
            user_id,
            activity_context_builder=activity_portfolio_context_service.build_activity_context,
            journal_context_builder=journal_context_service.build_journal_context,
            watchlist_context_builder=watchlist_context_service.build_watchlist_context,
        )

    async def get_stock_journal_archive(self, ticker: str, user_id: str, limit: int = 10) -> dict:
        return await journal_context_service.get_stock_journal_archive(
            ticker,
            user_id,
            limit=limit,
        )

    async def get_portfolio_journal_archive(self, portfolio_id: str, user_id: str, limit: int = 10) -> dict:
        return await journal_context_service.get_portfolio_journal_archive(
            portfolio_id,
            user_id,
            limit=limit,
        )

    async def get_journal_report_content(self, report_id: str, user_id: str) -> dict:
        return await journal_context_service.get_journal_report_content(report_id, user_id)

    async def get_journal_note_content(self, note_id: str, user_id: str) -> dict:
        return await journal_context_service.get_journal_note_content(note_id, user_id)

    async def save_stock_journal_note(self, ticker: str, content: str, user_id: str) -> dict:
        return await journal_context_service.save_stock_journal_note(ticker, content, user_id)

    async def save_portfolio_journal_note(self, portfolio_id: str, content: str, user_id: str) -> dict:
        return await journal_context_service.save_portfolio_journal_note(
            portfolio_id,
            content,
            user_id,
        )

    async def get_ticker_activity(
        self,
        ticker: str,
        user_id: str,
        period: str = "ALL",
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> dict:
        return await activity_portfolio_context_service.get_ticker_activity(
            ticker=ticker,
            user_id=user_id,
            period=period,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
            cursor=cursor,
        )

    async def get_portfolio_activity(
        self,
        user_id: str,
        portfolio_id: Optional[str] = None,
        period: str = "ALL",
        from_date: Optional[str] = None,
        to_date: Optional[str] = None,
        limit: int = 50,
        cursor: Optional[str] = None,
    ) -> dict:
        return await activity_portfolio_context_service.get_portfolio_activity(
            user_id=user_id,
            portfolio_id=portfolio_id,
            period=period,
            from_date=from_date,
            to_date=to_date,
            limit=limit,
            cursor=cursor,
        )

    async def get_technical_history(
        self,
        ticker: str,
        user_id: str,
        period: TechnicalPeriod = "6mo",
        indicators: Optional[Iterable[str]] = None,
    ) -> dict:
        return await market_context_service.get_technical_history(
            ticker,
            user_id,
            period=period,
            indicators=indicators,
        )

    async def list_portfolios(self, user_id: str) -> dict:
        return await activity_portfolio_context_service.list_portfolios(user_id)

    async def list_watchlists(self, user_id: str) -> dict:
        return await watchlist_context_service.list_watchlists(user_id)

    async def get_watchlist_items(self, watchlist_id: str, user_id: str) -> dict:
        return await watchlist_context_service.get_watchlist_items(watchlist_id, user_id)

    async def get_portfolio_context(
        self,
        user_id: str,
        portfolio_id: Optional[str] = None,
        recent_limit: int = 20,
    ) -> dict:
        return await activity_portfolio_context_service.get_portfolio_context(
            user_id=user_id,
            portfolio_id=portfolio_id,
            recent_limit=recent_limit,
        )

    async def get_portfolio_performance(
        self,
        user_id: str,
        portfolio_id: Optional[str] = None,
        period: str = "1Y",
    ) -> dict:
        return await activity_portfolio_context_service.get_portfolio_performance(
            user_id=user_id,
            portfolio_id=portfolio_id,
            period=period,
        )

    async def get_market_context(self, user_id: str) -> dict:
        return await market_context_service.get_market_context(user_id)


research_context_service = ResearchContextService()
