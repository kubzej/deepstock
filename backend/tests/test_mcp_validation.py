import os
from unittest.mock import AsyncMock

import pytest

os.environ["DEBUG"] = "false"

from app.services.research_context import (
    ActivityFilterError,
    ResearchContextService,
    _resolve_activity_window,
)


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
async def test_get_ticker_activity_rejects_unknown_ticker(mocker):
    service = ResearchContextService()
    mocker.patch(
        "app.services.research_context.ResearchContextService._get_stock_row",
        new=AsyncMock(return_value=None),
    )

    with pytest.raises(ValueError, match="Ticker NVDA not found"):
        await service.get_ticker_activity(
            ticker="NVDA",
            user_id="user-1",
        )


@pytest.mark.asyncio
async def test_get_ticker_activity_does_not_require_market_provider(mocker):
    service = ResearchContextService()
    stock_row = {"id": "stock-1", "ticker": "NVDA"}
    mocker.patch(
        "app.services.research_context.ResearchContextService._get_stock_row",
        new=AsyncMock(return_value=stock_row),
    )
    mocker.patch(
        "app.services.research_context.ResearchContextService._build_activity_context",
        new=AsyncMock(
            return_value={
                "position_summary": {
                    "has_position": True,
                    "shares": 10.0,
                    "total_cost": 1000.0,
                    "market_value": None,
                    "unrealized_pnl": None,
                    "currency": "USD",
                },
                "option_summary": {
                    "has_option_activity": False,
                    "open_positions": 0,
                    "contracts": 0,
                    "open_holdings": [],
                },
            }
        ),
    )
    mocker.patch(
        "app.services.research_context.ResearchContextService._get_mixed_activity_feed",
        new=AsyncMock(
            return_value={
                "period": "ALL",
                "from_date": None,
                "to_date": "2026-04-19",
                "limit": 50,
                "cursor": None,
                "next_cursor": None,
                "has_more": False,
                "transactions": [],
            }
        ),
    )

    response = await service.get_ticker_activity(
        ticker="NVDA",
        user_id="user-1",
    )

    assert response["ticker"] == "NVDA"
    assert response["transactions"] == []
    assert response["position_summary"]["market_value"] is None
    assert response["position_summary"]["unrealized_pnl"] is None
