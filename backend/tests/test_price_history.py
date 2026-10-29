"""Chart history is one code path with unadjusted prices, whichever endpoint asks first."""
import pandas as pd
import pytest

from app.services.market import quotes, technical
from app.services.market.quotes import get_batch_price_history, get_price_history


class FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, ex=None):
        self.store[key] = value


def ohlcv(rows: int = 3) -> pd.DataFrame:
    index = pd.date_range("2026-10-20", periods=rows, freq="D", tz="UTC")
    return pd.DataFrame(
        {"Open": 10.0, "High": 11.0, "Low": 9.0, "Close": 10.5, "Volume": 100}, index=index
    )


@pytest.fixture
def download(monkeypatch):
    calls: list[dict] = []
    frames: dict[str, pd.DataFrame] = {"AAPL": ohlcv()}

    def fake_download(tickers, **kwargs):
        calls.append({"tickers": tickers, **kwargs})
        return frames[tickers.split()[0]] if tickers.split()[0] in frames else pd.DataFrame()

    monkeypatch.setattr(quotes.yf, "download", fake_download)
    return calls, frames


async def test_single_and_batch_fetch_unadjusted_prices_into_the_same_cache(download):
    calls, _ = download
    redis = FakeRedis()

    single = await get_price_history(redis, "aapl", "1mo")
    batch = await get_batch_price_history(redis, ["AAPL"], "1mo")

    assert single == batch["AAPL"] and len(single) == 3
    assert len(calls) == 1  # the batch call was served from what the single call cached
    assert calls[0]["auto_adjust"] is False
    assert list(redis.store) == ["history:v2:AAPL:1mo"]


async def test_cache_written_by_batch_serves_single(download):
    calls, _ = download
    redis = FakeRedis()

    batch = await get_batch_price_history(redis, ["AAPL"], "1mo")
    single = await get_price_history(redis, "AAPL", "1mo")

    assert single == batch["AAPL"]
    assert len(calls) == 1


async def test_empty_history_is_not_cached(download):
    calls, frames = download
    frames["AAPL"] = ohlcv().assign(Close=float("nan"))  # rows arrive, none usable
    redis = FakeRedis()

    assert await get_price_history(redis, "AAPL", "1mo") == []
    assert redis.store == {}

    frames["AAPL"] = ohlcv()
    assert len(await get_price_history(redis, "AAPL", "1mo")) == 3
    assert len(calls) == 2  # the earlier empty answer did not stick


async def test_unknown_ticker_returns_empty_list(download):
    assert await get_price_history(FakeRedis(), "NOPE", "1mo") == []


async def test_old_unversioned_cache_entries_are_ignored(download):
    redis = FakeRedis()
    redis.store["history:AAPL:1mo"] = '[{"close": 1}]'

    assert len(await get_price_history(redis, "AAPL", "1mo")) == 3


async def test_technical_history_is_fetched_unadjusted_under_a_versioned_key(monkeypatch):
    captured: dict = {}

    class FakeTicker:
        def __init__(self, _symbol):
            pass

        def history(self, **kwargs):
            captured.update(kwargs)
            return ohlcv(60)

    monkeypatch.setattr(technical.yf, "Ticker", FakeTicker)
    redis = FakeRedis()

    frame = await technical.get_raw_history_with_indicators(redis, "AAPL")

    assert frame is not None
    assert captured["auto_adjust"] is False
    assert list(redis.store) == ["raw_technical:v2:AAPL"]
