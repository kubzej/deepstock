"""Every price in the target prompt is in the quoted unit, including the holding's average cost."""
import json
import sys

import pytest

if sys.version_info < (3, 10):
    pytest.skip("the target prompt module uses PEP 604 annotations", allow_module_level=True)

from app.api.endpoints import ai_watchlist
from app.schemas.ai_watchlist import WatchlistTargetsRequest
from tests.fake_redis import FakeRedis


class Capture:
    """What the model was sent, and the stock row the lookup returns (None = not in the table)."""

    def __init__(self):
        self.prompts = []
        self.stock = {"price_scale": 1}


@pytest.fixture
def capture(monkeypatch):
    seen = Capture()

    async def technicals(_ticker, _period):
        return {"currentPrice": 1300.0, "sma50": 1280.0}

    async def info(_ticker):
        return None

    async def by_ticker(_ticker):
        return dict(seen.stock) if seen.stock is not None else None

    async def llm(_system, user_prompt):
        seen.prompts.append(user_prompt)
        return json.dumps({"buy_target": 1000, "sell_target": 1500, "comment": "ok"}), "model"

    monkeypatch.setattr(ai_watchlist, "get_redis", lambda: FakeRedis())
    monkeypatch.setattr(ai_watchlist.market_service, "get_technical_indicators", technicals)
    monkeypatch.setattr(ai_watchlist.market_service, "get_stock_info", info)
    monkeypatch.setattr(ai_watchlist.stock_service, "get_by_ticker", by_ticker)
    monkeypatch.setattr("app.ai.providers.litellm_client.call_llm", llm)
    return seen


async def suggest(avg_cost):
    generate = ai_watchlist.generate_watchlist_targets.__wrapped__
    return await generate(
        request=None, payload=WatchlistTargetsRequest(ticker="WIZZ.L", avg_cost=avg_cost, shares=50), user_id="u1"
    )


async def test_a_pence_quoted_stock_gets_its_average_cost_in_pence(capture):
    capture.stock["price_scale"] = 0.01

    await suggest(avg_cost=12.96)  # pounds, as the holding stores it

    prompt = capture.prompts[0]
    assert "průměrnou nákupní cenou: $1296.00" in prompt
    assert "buy_target musí být ≤ $1036.80" in prompt
    assert "12.96" not in prompt


async def test_an_ordinary_stock_keeps_its_average_cost(capture):
    await suggest(avg_cost=120.0)

    assert "průměrnou nákupní cenou: $120.00" in capture.prompts[0]
    assert "buy_target musí být ≤ $96.00" in capture.prompts[0]


async def test_an_unknown_stock_is_treated_as_unscaled(capture):
    capture.stock = None  # not in the stocks table yet

    await suggest(avg_cost=120.0)

    assert "průměrnou nákupní cenou: $120.00" in capture.prompts[0]


async def test_without_a_holding_there_is_no_cost_line(capture):
    await suggest(avg_cost=None)

    assert "Investor akcii zatím nedrží." in capture.prompts[0]
