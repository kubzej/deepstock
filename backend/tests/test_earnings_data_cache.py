"""A failed earnings fetch (e.g. a Yahoo rate limit) is not cached; blocks Yahoo does not have still are."""
import pytest
from yfinance.exceptions import YFRateLimitError

from app.services.market import earnings_data
from tests.fake_redis import FakeRedis


class Ticker:
    """Stand-in for yfinance.Ticker: `broken` maps an accessor to the exception it raises."""
    broken: dict = {}

    def __init__(self, symbol):
        self.symbol = symbol

    def _read(self, name):
        if name in self.broken:
            raise self.broken[name]
        return None

    earnings_history = property(lambda self: self._read("earnings_history"))
    earnings_estimate = property(lambda self: self._read("earnings_estimate"))
    revenue_estimate = property(lambda self: self._read("revenue_estimate"))
    eps_trend = property(lambda self: self._read("eps_trend"))
    eps_revisions = property(lambda self: self._read("eps_revisions"))
    growth_estimates = property(lambda self: self._read("growth_estimates"))


@pytest.fixture
def broken(monkeypatch):
    monkeypatch.setattr(earnings_data.yf, "Ticker", Ticker)
    monkeypatch.setattr(Ticker, "broken", {})
    return Ticker.broken


def test_rate_limit_on_one_block_fails_the_whole_fetch(broken):
    broken["eps_trend"] = YFRateLimitError()

    with pytest.raises(YFRateLimitError):
        earnings_data._fetch_earnings_data_sync("AAPL")


def test_block_missing_for_this_ticker_stays_empty_without_failing(broken):
    broken["eps_trend"] = ValueError("not available for this exchange")

    result = earnings_data._fetch_earnings_data_sync("AAPL")

    assert result["epsTrend"] == earnings_data._EMPTY["epsTrend"]


async def test_failed_fetch_is_not_cached(broken):
    broken["earnings_estimate"] = YFRateLimitError()
    redis = FakeRedis()

    result = await earnings_data.get_earnings_data(redis, "AAPL", force_refresh=True)

    assert result == earnings_data._EMPTY
    assert redis.store == {}


async def test_next_request_after_a_failure_fetches_again(broken):
    redis = FakeRedis()
    broken["earnings_estimate"] = YFRateLimitError()
    await earnings_data.get_earnings_data(redis, "AAPL")

    broken.clear()
    await earnings_data.get_earnings_data(redis, "AAPL")

    assert "earnings_data:AAPL" in redis.store


async def test_successful_fetch_is_cached(broken):
    redis = FakeRedis()

    await earnings_data.get_earnings_data(redis, "AAPL")

    assert "earnings_data:AAPL" in redis.store
