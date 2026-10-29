"""A holding without a live quote must drop out of value and cost together."""
import pytest

from app.services import portfolio as portfolio_module
from app.services.portfolio import PortfolioService


def holding(ticker: str, shares: float, invested_czk: float) -> dict:
    return {
        "shares": shares,
        "total_invested_czk": invested_czk,
        "stocks": {"ticker": ticker, "currency": "CZK", "price_scale": 1},
    }


@pytest.fixture
def snapshot_for(monkeypatch):
    service = PortfolioService()

    async def run(holdings: list[dict], quotes: dict):
        async def get_holdings(_portfolio_id):
            return holdings

        async def get_quotes(_tickers):
            return quotes

        async def get_rates():
            return {"CZK": 1.0}

        monkeypatch.setattr(service, "get_holdings", get_holdings)
        monkeypatch.setattr(portfolio_module.market_service, "get_quotes", get_quotes)
        monkeypatch.setattr(portfolio_module.exchange_service, "get_rates", get_rates)
        return await service.get_portfolio_snapshot("p1", "user-1")

    return run


HOLDINGS = [holding("AAA", 10, 10000), holding("BBB", 20, 20000)]


async def test_all_quotes_present_has_no_missing_tickers(snapshot_for):
    snapshot = await snapshot_for(
        HOLDINGS,
        {"AAA": {"price": 1200, "change": 10}, "BBB": {"price": 1100, "change": 5}},
    )

    assert snapshot.missing_tickers == []
    assert snapshot.total_value_czk == 34000
    assert snapshot.total_cost_czk == 30000
    assert snapshot.total_pnl_czk == 4000


async def test_missing_quote_is_excluded_from_value_and_cost(snapshot_for):
    snapshot = await snapshot_for(HOLDINGS, {"AAA": {"price": 1200, "change": 10}})

    assert snapshot.missing_tickers == ["BBB"]
    assert snapshot.total_value_czk == 12000
    assert snapshot.total_cost_czk == 10000
    assert snapshot.total_pnl_czk == 2000
    assert snapshot.total_pnl_percent == 20.0
    assert snapshot.daily_change_czk == 100


async def test_zero_or_null_price_counts_as_missing(snapshot_for):
    snapshot = await snapshot_for(
        HOLDINGS,
        {"AAA": {"price": 0}, "BBB": {"price": None}},
    )

    assert snapshot.missing_tickers == ["AAA", "BBB"]


async def test_all_quotes_missing_gives_zeros(snapshot_for):
    snapshot = await snapshot_for(HOLDINGS, {})

    assert snapshot.missing_tickers == ["AAA", "BBB"]
    assert snapshot.total_value_czk == 0
    assert snapshot.total_cost_czk == 0
    assert snapshot.total_pnl_czk == 0
    assert snapshot.total_pnl_percent == 0


async def test_same_ticker_in_several_positions_is_listed_once(snapshot_for):
    snapshot = await snapshot_for(
        [holding("AAA", 5, 5000), holding("AAA", 5, 5000)],
        {},
    )

    assert snapshot.missing_tickers == ["AAA"]
