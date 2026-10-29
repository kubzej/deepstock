"""Every yfinance call site goes through the gateway, and the request pattern towards Yahoo stays what it was."""
import asyncio
from datetime import datetime, timedelta, timezone

import pytest

from app.services import performance
from app.services.market import (
    earnings_data,
    financials,
    options_quotes,
    quotes,
    stock_info,
    technical,
)
from tests.fake_supabase import FakeSupabase
from tests.fake_redis import FakeRedis
from tests.fake_yahoo import FakeYahoo

INTERACTIVE = "yahoo-interactive"
BACKGROUND = "yahoo-background"


@pytest.fixture
def yahoo(monkeypatch):
    return FakeYahoo().install(monkeypatch)


@pytest.fixture
def redis():
    return FakeRedis()


def lanes(fake: FakeYahoo) -> set:
    return {thread.rsplit("_", 1)[0] for thread in fake.threads}


# ── each site runs off the event loop, in the right lane ──────────────────────────────

async def test_quotes_download_runs_in_the_interactive_lane(yahoo, redis):
    result = await quotes.get_quotes(redis, ["AAPL"], include_extended=False)

    assert result["AAPL"]["price"] is not None
    assert lanes(yahoo) == {INTERACTIVE}


async def test_extended_quote_data_runs_in_the_background_lane(yahoo, redis):
    await quotes.get_quotes(redis, ["AAPL"], include_extended=True, extended_sync=True)

    assert yahoo.count("info") == 1
    assert {t for w, t in yahoo.calls if w == "info"} and all(
        t.startswith(BACKGROUND) for w, t in yahoo.calls if w == "info"
    )
    assert all(t.startswith(INTERACTIVE) for w, t in yahoo.calls if w.startswith("download"))


async def test_price_history_download_runs_in_the_interactive_lane(yahoo, redis):
    result = await quotes.get_batch_price_history(redis, ["AAPL", "MSFT"], "1mo")

    assert len(result["AAPL"]) > 0
    assert lanes(yahoo) == {INTERACTIVE}


async def test_stock_info_runs_in_the_interactive_lane(yahoo, redis):
    await stock_info.get_stock_info(redis, "AAPL")

    assert yahoo.count("info") >= 1
    assert lanes(yahoo) == {INTERACTIVE}


async def test_technical_history_runs_in_the_interactive_lane(yahoo, redis):
    result = await technical.get_technical_indicators(redis, "AAPL", "1y")

    assert result is not None
    assert lanes(yahoo) == {INTERACTIVE}


async def test_financials_run_in_the_interactive_lane(yahoo, redis):
    result = await financials.get_historical_financials(redis, "AAPL")

    assert result["years"][-1] == "5Y Avg"
    assert lanes(yahoo) == {INTERACTIVE}


async def test_earnings_data_runs_in_the_interactive_lane(yahoo, redis):
    await earnings_data.get_earnings_data(redis, "AAPL", force_refresh=True)

    assert yahoo.count("earnings_history") == 1
    assert lanes(yahoo) == {INTERACTIVE}


async def test_option_quotes_run_in_the_interactive_lane(yahoo, redis):
    result = await options_quotes.get_option_quotes(redis, ["AAPL261218C00200000"])

    assert result["AAPL261218C00200000"]["price"] == 187.5
    assert lanes(yahoo) == {INTERACTIVE}


@pytest.fixture
def performance_setup(monkeypatch, redis, yahoo):
    db = FakeSupabase()
    db.tables["portfolios"] = [{"id": "p1", "user_id": "u1"}]
    start = datetime.now(timezone.utc) - timedelta(days=20)
    db.tables["transactions"] = [{
        "id": "t1", "portfolio_id": "p1", "stock_id": "s1", "type": "BUY", "executed_at": start.isoformat(),
        "shares": 10, "total_amount": 1000.0, "total_amount_czk": None, "exchange_rate_to_czk": 20.0, "currency": "USD",
        "fees": 0.0, "source_transaction_id": None,
        "stocks": {"ticker": "AAPL", "currency": "USD", "price_scale": 1},
    }]

    async def rates():
        return {"USD": 20.0, "CZK": 1.0}

    monkeypatch.setattr(performance, "supabase", db)
    monkeypatch.setattr(performance, "get_redis", lambda: redis)
    monkeypatch.setattr(performance.exchange_service, "get_rates", rates)
    return redis


async def test_performance_download_runs_in_the_interactive_lane_with_unadjusted_prices(yahoo, performance_setup):
    result = await performance.get_stock_performance("u1", period="1M")

    assert result.data
    assert lanes(yahoo) == {INTERACTIVE}
    assert yahoo.download_kwargs[0]["auto_adjust"] is False


async def test_performance_cache_key_is_versioned(yahoo, performance_setup):
    await performance.get_stock_performance("u1", period="1M")

    assert [k for k in performance_setup.store if k.startswith("perf:stock:")] == ["perf:stock:v2:u1:all:1M::"]


# ── the pattern of requests towards Yahoo ─────────────────────────────────────────────

async def test_financials_ask_nothing_more_once_the_ticker_has_no_statements(yahoo, redis):
    yahoo.income_empty = True

    assert await financials.get_historical_financials(redis, "ETF") is None

    assert yahoo.what == ["info", "income_stmt", "balance_sheet", "cashflow"]


async def test_financials_read_everything_in_one_ordered_pass(yahoo, redis):
    await financials.get_historical_financials(redis, "AAPL")

    assert yahoo.what == [
        "info", "income_stmt", "balance_sheet", "cashflow", "history:AAPL", "earnings_estimate", "revenue_estimate",
    ]


async def test_stock_info_reads_the_info_once_and_hands_it_to_the_financials(yahoo, redis):
    result = await stock_info.get_stock_info(redis, "AAPL")

    assert yahoo.count("info") == 1
    assert yahoo.what[:2] == ["info", "income_stmt"]
    assert result["valuation"] is not None and result["insights"] is not None


async def test_financials_read_the_info_themselves_without_a_caller_that_has_it(yahoo, redis):
    await financials.get_historical_financials(redis, "AAPL")

    assert yahoo.count("info") == 1


async def test_financials_use_the_info_they_are_given(yahoo, redis):
    result = await financials.get_historical_financials(redis, "AAPL", {"currency": "EUR", "sharesOutstanding": 1})

    assert yahoo.count("info") == 0
    assert result["currency"] == "EUR"


async def test_cached_results_never_reach_yahoo(yahoo, redis):
    await financials.get_historical_financials(redis, "AAPL")
    await stock_info.get_stock_info(redis, "AAPL")
    yahoo.calls.clear()

    await financials.get_historical_financials(redis, "AAPL")
    await stock_info.get_stock_info(redis, "AAPL")

    assert yahoo.calls == []


async def test_concurrent_requests_for_the_same_cold_ticker_ask_yahoo_once(monkeypatch, redis):
    yahoo = FakeYahoo(delay=0.1).install(monkeypatch)

    await asyncio.gather(*[stock_info.get_stock_info(redis, "AAPL") for _ in range(4)])

    # one read for stock info, handed on to the financials it pulls in; four callers add none
    assert yahoo.count("info") == 1


async def test_concurrent_quote_requests_download_once_and_fetch_extended_data_once(monkeypatch, redis):
    yahoo = FakeYahoo(delay=0.1).install(monkeypatch)

    await asyncio.gather(*[
        quotes.get_quotes(redis, ["AAPL", "MSFT"], include_extended=True, extended_sync=True) for _ in range(3)
    ])

    assert yahoo.count("download") == 1
    assert yahoo.count("info") == 2  # one per ticker, not one per request


async def test_a_fan_out_over_many_tickers_never_exceeds_one_call_at_a_time(monkeypatch, redis):
    yahoo = FakeYahoo(delay=0.02).install(monkeypatch)
    tickers = [f"T{i}" for i in range(12)]

    results = await asyncio.gather(*[technical.get_technical_indicators(redis, t, "3mo") for t in tickers])

    assert all(results)
    assert yahoo.count("history") == 12
    assert yahoo.peak == 1  # the AI advisor / MCP fan-outs used to be serial by accident


async def test_slow_provider_does_not_freeze_unrelated_requests(monkeypatch, redis):
    FakeYahoo(delay=0.15).install(monkeypatch)
    ticks = 0

    async def ticker():
        nonlocal ticks
        while True:
            await asyncio.sleep(0.01)
            ticks += 1

    task = asyncio.create_task(ticker())
    await financials.get_historical_financials(redis, "AAPL")
    task.cancel()

    assert ticks >= 20  # seven sequential 0.15 s reads, loop alive throughout
