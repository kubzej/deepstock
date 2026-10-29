"""The advisor endpoint feeds the prompt with market-value weights built from the snapshot, quotes and rates."""
import pytest

from app.api.endpoints import ai_portfolio
from app.schemas.ai_portfolio import PortfolioAdvisorRequest
from app.schemas.portfolio import PortfolioSnapshot
from tests.fake_redis import FakeRedis


def holding(ticker, shares, sector, currency):
    return {
        "shares": shares, "total_invested_czk": 100000.0, "avg_cost_per_share": 100.0,
        "stocks": {"ticker": ticker, "currency": currency, "sector": sector, "price_scale": 1},
    }


@pytest.fixture
def prompts(monkeypatch):
    sent = []

    async def holdings(_portfolio_id):
        return [holding("AAPL", 10, "Technology", "USD"), holding("CEZ", 10, "Utilities", "CZK")]

    async def snapshot(portfolio_id, user_id):
        return PortfolioSnapshot(
            total_value_czk=400000.0, total_cost_czk=200000.0, total_pnl_czk=200000.0,
            total_pnl_percent=100.0, daily_change_czk=0.0, daily_change_percent=0.0,
        )

    async def quotes(_tickers):
        return {"AAPL": {"price": 1500.0}, "CEZ": {"price": 10000.0}}

    async def no_technicals(*_args):
        return None

    async def no_transactions(*_args, **_kwargs):
        return []

    async def no_search(*_args, **_kwargs):
        return []

    async def rates():
        return {"USD": 20.0, "CZK": 1.0}

    async def llm(system_prompt, user_prompt):
        sent.append(user_prompt)
        return "# Report", "test-model"

    async def portfolios(_user_id):
        return [{"id": "p1", "name": "Main"}]

    async def no_report_saved(**_kwargs):
        return None

    monkeypatch.setattr(ai_portfolio, "get_redis", lambda: FakeRedis())
    monkeypatch.setattr(ai_portfolio.portfolio_service, "get_user_portfolios", portfolios)
    monkeypatch.setattr(ai_portfolio.portfolio_service, "get_holdings", holdings)
    monkeypatch.setattr(ai_portfolio.portfolio_service, "get_portfolio_snapshot", snapshot)
    monkeypatch.setattr(ai_portfolio.portfolio_service, "get_transactions", no_transactions)
    monkeypatch.setattr(ai_portfolio.options_service, "get_holdings", no_transactions)
    monkeypatch.setattr(ai_portfolio.market_service, "get_quotes", quotes)
    monkeypatch.setattr(ai_portfolio.market_service, "get_technical_indicators", no_technicals)
    monkeypatch.setattr(ai_portfolio.tavily_client, "search", no_search)
    monkeypatch.setattr(ai_portfolio.exchange_service, "get_rates", rates)
    monkeypatch.setattr("app.ai.providers.litellm_client.call_llm", llm)
    monkeypatch.setattr(ai_portfolio, "_save_portfolio_report_to_journal", no_report_saved)
    return sent


async def test_the_prompt_carries_weights_from_current_market_value(prompts):
    generate = ai_portfolio.generate_portfolio_advisor.__wrapped__

    response = await generate(request=None, payload=PortfolioAdvisorRequest(portfolio_id="p1"), user_id="u1")

    assert response.markdown == "# Report"
    prompt = prompts[0]
    # AAPL 10 x 1500 USD x 20 = 300 000 CZK, CEZ 10 x 10 000 CZK = 100 000 CZK: only right if rates are applied
    assert "Technology: 75%" in prompt and "Utilities: 25%" in prompt
    assert "AAPL: 75% | CEZ: 25%" in prompt
