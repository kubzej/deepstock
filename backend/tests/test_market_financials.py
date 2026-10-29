"""Revenue growth is the figure Yahoo reports (latest quarter vs the same quarter a year earlier), everywhere."""
import pytest

from app.services.market import financials, stock_info
from tests.fake_redis import FakeRedis
from tests.fake_yahoo import FakeYahoo, INFO


@pytest.fixture
def yahoo(monkeypatch):
    return FakeYahoo().install(monkeypatch)


async def test_stock_info_reports_the_yahoo_revenue_growth(yahoo):
    result = await stock_info.get_stock_info(FakeRedis(), "AAPL")

    assert result["revenueGrowth"] == INFO["revenueGrowth"]


async def test_historical_ltm_column_reports_the_yahoo_revenue_growth(yahoo):
    result = await financials.get_historical_financials(FakeRedis(), "AAPL")

    ltm = result["years"].index("LTM")
    assert result["growth"]["revenue_growth"][ltm] == INFO["revenueGrowth"]


async def test_historical_ltm_growth_is_empty_when_yahoo_reports_none(yahoo, monkeypatch):
    monkeypatch.setitem(INFO, "revenueGrowth", None)

    result = await financials.get_historical_financials(FakeRedis(), "AAPL")

    assert result["growth"]["revenue_growth"][result["years"].index("LTM")] is None
