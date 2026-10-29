"""The MCP position summary must value a holding in real share prices, like the rest of the app."""
import pytest

from app.services import research_context_activity as activity_module
from app.services.research_context_activity import activity_portfolio_context_service
from tests.fake_supabase import FakeSupabase


@pytest.fixture
def summary_for(monkeypatch):
    async def run(price_scale: float, quote_price):
        monkeypatch.setattr(activity_module, "supabase", FakeSupabase())

        async def get_by_ticker(_ticker):
            return {"id": "s1", "ticker": "VOD.L", "currency": "GBP", "price_scale": price_scale}

        async def get_user_portfolios(_user_id):
            return [{"id": "p1", "name": "Main"}]

        async def get_all_holdings(_user_id):
            return [
                {
                    "shares": 10,
                    "total_cost": 50,
                    "stocks": {"ticker": "VOD.L", "currency": "GBP", "price_scale": price_scale},
                }
            ]

        async def no_options(*_args, **_kwargs):
            return []

        async def identity(rows):
            return rows

        monkeypatch.setattr(activity_module.stock_service, "get_by_ticker", get_by_ticker)
        monkeypatch.setattr(activity_module.portfolio_service, "get_user_portfolios", get_user_portfolios)
        monkeypatch.setattr(activity_module.portfolio_service, "get_all_holdings", get_all_holdings)
        monkeypatch.setattr(activity_module.portfolio_service, "_annotate_transactions", identity)
        monkeypatch.setattr(activity_module.options_service, "get_transactions", no_options)
        monkeypatch.setattr(activity_module.options_service, "get_all_holdings_for_user", no_options)

        context = await activity_portfolio_context_service.build_activity_context(
            "VOD.L", user_id="u1", stock_price=quote_price
        )
        return context["position_summary"]

    return run


async def test_unscaled_stock_is_valued_at_the_quote(summary_for):
    summary = await summary_for(price_scale=1, quote_price=6)

    assert summary["market_value"] == 60
    assert summary["unrealized_pnl"] == 10


async def test_pence_quote_is_scaled_to_real_share_price(summary_for):
    # LSE quotes in pence: 520 means 5.20 per share
    summary = await summary_for(price_scale=0.01, quote_price=520)

    assert summary["market_value"] == 52
    assert summary["unrealized_pnl"] == 2
    assert summary["total_cost"] == 50


async def test_missing_quote_leaves_valuation_empty(summary_for):
    summary = await summary_for(price_scale=0.01, quote_price=None)

    assert summary["has_position"] is True
    assert summary["market_value"] is None
    assert summary["unrealized_pnl"] is None
