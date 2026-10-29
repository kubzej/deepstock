"""The insider cache holds the whole lookback window, whatever period the first caller asked for."""
import inspect
import sys
from datetime import date, timedelta

import pytest

if sys.version_info < (3, 10):
    pytest.skip("the insider module uses PEP 604 annotations", allow_module_level=True)

from app.services import insider
from app.services.insider import INSIDER_LOOKBACK_MONTHS, get_insider_trades


class FakeRedis:
    def __init__(self):
        self.store: dict[str, str] = {}

    async def get(self, key):
        return self.store.get(key)

    async def set(self, key, value, ex=None):
        self.store[key] = value


def days_ago(days: int) -> str:
    return (date.today() - timedelta(days=days)).isoformat()


@pytest.fixture
def edgar(monkeypatch):
    """One Form 4 filed 30, 120 and 300 days ago; counts the filings actually downloaded."""
    downloads: list[str] = []
    filings = [
        {"accession": f"a{age}", "accession_nodash": f"a{age}", "primary_doc": f"doc{age}.xml", "filing_date": days_ago(age)}
        for age in (30, 120, 300, 500)
    ]

    async def resolve_cik(_redis, _ticker):
        return "123"

    async def form4_index(_cik, max_filings):
        return filings

    class Response:
        status_code = 200

        def __init__(self, text):
            self.text = text

    class Client:
        def __init__(self, **_kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def get(self, url):
            downloads.append(url)
            return Response(url.rsplit("/", 1)[1].removeprefix("doc").removesuffix(".xml"))

    def parse(xml_text, filing_date, _filing_url):
        return [{"trade_type": "Purchase", "shares": 10, "trade_date": filing_date, "filing_date": filing_date}]

    monkeypatch.setattr(insider, "_resolve_cik", resolve_cik)
    monkeypatch.setattr(insider, "_fetch_form4_index", form4_index)
    monkeypatch.setattr(insider, "_parse_form4_xml", parse)
    monkeypatch.setattr(insider.httpx, "AsyncClient", Client)
    return downloads


def filed(trades):
    return [t["filing_date"] for t in trades]


async def test_short_request_does_not_shorten_a_later_long_one(edgar):
    redis = FakeRedis()

    six = await get_insider_trades(redis, "aapl", months=6)
    twelve = await get_insider_trades(redis, "AAPL", months=12)

    assert filed(six) == [days_ago(30), days_ago(120)]
    assert filed(twelve) == [days_ago(30), days_ago(120), days_ago(300)]
    assert len(edgar) == 3  # the 12-month answer came from the cache the 6-month call filled


async def test_filings_older_than_the_lookback_are_never_downloaded(edgar):
    await get_insider_trades(FakeRedis(), "AAPL", months=1)

    assert not any("doc500" in url for url in edgar)


async def test_cache_hit_is_narrowed_to_the_requested_months(edgar):
    redis = FakeRedis()
    await get_insider_trades(redis, "AAPL")

    one = await get_insider_trades(redis, "AAPL", months=1)

    assert filed(one) == [days_ago(30)]
    assert len(edgar) == 3


def test_default_request_spans_the_whole_lookback():
    default = inspect.signature(get_insider_trades).parameters["months"].default
    assert default == INSIDER_LOOKBACK_MONTHS
