import os
from unittest.mock import AsyncMock

import pytest

os.environ["DEBUG"] = "false"

from app.services.research_context import (
    ActivityFilterError,
    ResearchContextService,
    _resolve_activity_window,
)
from app.services.research_context_activity import ActivityPortfolioContextService


class _FakeSupabaseResponse:
    def __init__(self, data):
        self.data = data


class _FakeSupabaseQuery:
    def __init__(self, data):
        self.data = data
        self.eq_calls = []
        self.gte_calls = []
        self.lt_calls = []

    def select(self, *_args, **_kwargs):
        return self

    def in_(self, *_args, **_kwargs):
        return self

    def order(self, *_args, **_kwargs):
        return self

    def limit(self, *_args, **_kwargs):
        return self

    def eq(self, *args, **kwargs):
        self.eq_calls.append((args, kwargs))
        return self

    def gte(self, *args, **kwargs):
        self.gte_calls.append((args, kwargs))
        return self

    def lt(self, *args, **kwargs):
        self.lt_calls.append((args, kwargs))
        return self

    def execute(self):
        return _FakeSupabaseResponse(self.data)


class _FakeSupabase:
    def __init__(self, query):
        self.query = query
        self.tables = []

    def table(self, table_name):
        self.tables.append(table_name)
        return self.query


@pytest.mark.asyncio
async def test_get_portfolio_performance_rejects_invalid_period():
    service = ResearchContextService()

    with pytest.raises(ValueError, match="Unsupported portfolio performance period"):
        await service.get_portfolio_performance(
            user_id="user-1",
            portfolio_id=None,
            period="10Y",
        )


@pytest.mark.asyncio
async def test_get_technical_history_rejects_invalid_indicators():
    service = ResearchContextService()

    with pytest.raises(ValueError, match="Unsupported technical indicators"):
        await service.get_technical_history(
            ticker="NVDA",
            user_id="user-1",
            period="6mo",
            indicators=["price", "moon_phase"],
        )


def test_activity_window_rejects_invalid_period():
    with pytest.raises(ActivityFilterError, match="Unsupported activity period"):
        _resolve_activity_window(period="10Y")


def test_activity_window_rejects_invalid_date_range():
    with pytest.raises(ActivityFilterError, match="from_date cannot be after to_date"):
        _resolve_activity_window(
            period="ALL",
            from_date="2026-04-18",
            to_date="2026-04-17",
        )


def test_activity_window_rejects_invalid_cursor():
    with pytest.raises(ActivityFilterError, match="Invalid cursor"):
        _resolve_activity_window(period="ALL", cursor="not-a-datetime")


@pytest.mark.asyncio
async def test_fetch_stock_activity_rows_without_stock_filter_returns_portfolio_rows(mocker):
    service = ActivityPortfolioContextService()
    stock_row = {
        "id": "tx-stock-1",
        "portfolio_id": "portfolio-main",
        "stocks": {"ticker": "NVDA"},
    }
    query = _FakeSupabaseQuery([stock_row])
    supabase = _FakeSupabase(query)
    mocker.patch("app.services.research_context_activity.supabase", supabase)
    mocker.patch(
        "app.services.research_context_activity.portfolio_service._annotate_transactions",
        new=AsyncMock(return_value=[stock_row]),
    )

    rows = await service.fetch_stock_activity_rows(
        portfolio_ids=["portfolio-main"],
        portfolio_names={"portfolio-main": "Main"},
        stock_id=None,
        limit=50,
        lower_bound=None,
        upper_bound=None,
    )

    assert supabase.tables == ["transactions"]
    assert query.eq_calls == []
    assert rows == [{**stock_row, "portfolio_name": "Main"}]


@pytest.mark.asyncio
async def test_get_ticker_activity_delegates_to_activity_service(mocker):
    service = ResearchContextService()
    expected = {
        "ticker": "NVDA",
        "period": "ALL",
        "from_date": None,
        "to_date": "2026-04-19",
        "limit": 25,
        "cursor": None,
        "next_cursor": None,
        "has_more": False,
        "position_summary": {
            "has_position": True,
            "shares": 10.0,
            "total_cost": 1000.0,
            "market_value": None,
            "unrealized_pnl": None,
            "currency": "USD",
        },
        "transactions": [],
        "option_summary": {
            "has_option_activity": False,
            "open_positions": 0,
            "contracts": 0,
            "open_holdings": [],
        },
    }
    get_ticker_activity = mocker.patch(
        "app.services.research_context.activity_portfolio_context_service.get_ticker_activity",
        new=AsyncMock(
            return_value=expected
        ),
    )

    response = await service.get_ticker_activity(
        ticker="NVDA",
        user_id="user-1",
        limit=25,
    )

    assert response == expected
    get_ticker_activity.assert_awaited_once_with(
        ticker="NVDA",
        user_id="user-1",
        period="ALL",
        from_date=None,
        to_date=None,
        limit=25,
        cursor=None,
    )
