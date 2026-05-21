import os
from unittest.mock import AsyncMock

os.environ["DEBUG"] = "false"

from app.services.options import OptionsService


class _FakeUpsertQuery:
    def __init__(self, sink: list[dict], payload: dict):
        self._sink = sink
        self._payload = payload

    def execute(self):
        self._sink.append(self._payload)
        return {"data": [self._payload]}


class _FakeTableQuery:
    def __init__(self, sink: list[dict]):
        self._sink = sink

    def upsert(self, payload: dict, on_conflict: str):
        assert on_conflict == "option_symbol"
        return _FakeUpsertQuery(self._sink, payload)


class _FakeSupabase:
    def __init__(self):
        self.upserts: list[dict] = []

    def table(self, name: str):
        assert name == "option_prices"
        return _FakeTableQuery(self.upserts)


async def test_fetch_live_prices_uses_shared_option_quote_cache(mocker):
    service = OptionsService()
    fake_supabase = _FakeSupabase()
    fake_redis = object()
    shared_quotes = {
        "AAPL250117C00150000": {
            "price": 12.34,
            "bid": 12.1,
            "ask": 12.6,
            "volume": 250,
            "openInterest": 500,
            "impliedVolatility": 0.2234,
            "lastUpdated": "2026-05-21T10:00:00Z",
        },
        "MSFT250117P00400000": None,
    }

    get_quotes_mock = AsyncMock(return_value=shared_quotes)

    mocker.patch("app.services.options.supabase", fake_supabase)
    mocker.patch("app.services.options.get_redis", return_value=fake_redis)
    mocker.patch("app.services.options.get_option_quotes", get_quotes_mock)

    result = await service.fetch_live_prices(
        ["AAPL250117C00150000", "MSFT250117P00400000"]
    )

    get_quotes_mock.assert_awaited_once_with(
        fake_redis,
        ["AAPL250117C00150000", "MSFT250117P00400000"],
    )
    assert result == [
        {
            "option_symbol": "AAPL250117C00150000",
            "price": 12.34,
            "bid": 12.1,
            "ask": 12.6,
            "volume": 250,
            "open_interest": 500,
            "implied_volatility": 0.2234,
            "updated_at": "2026-05-21T10:00:00Z",
        }
    ]
    assert fake_supabase.upserts == result


async def test_fetch_live_prices_skips_quote_without_price(mocker):
    service = OptionsService()
    fake_supabase = _FakeSupabase()

    mocker.patch("app.services.options.supabase", fake_supabase)
    mocker.patch("app.services.options.get_redis", return_value=object())
    mocker.patch(
        "app.services.options.get_option_quotes",
        AsyncMock(
            return_value={
                "NVDA260116C00150000": {
                    "price": None,
                    "bid": 1.0,
                    "ask": 1.2,
                    "volume": 10,
                    "openInterest": 20,
                    "impliedVolatility": 0.5,
                    "lastUpdated": "2026-05-21T10:00:00Z",
                }
            }
        ),
    )

    result = await service.fetch_live_prices(["NVDA260116C00150000"])

    assert result == []
    assert fake_supabase.upserts == []
