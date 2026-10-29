"""Start of each named performance period, shared by the stock and the options performance."""
from datetime import date, datetime, timedelta

import pandas as pd
import pytest

from app.services import performance as performance_module
from app.services.performance import _period_start_date

TODAY = date(2026, 3, 18)
FIRST_TRANSACTION = date(2025, 6, 15)


@pytest.mark.parametrize(
    "period, expected",
    [
        ("1W", date(2026, 3, 11)),
        ("1M", date(2026, 2, 16)),
        ("3M", date(2025, 12, 18)),
        ("6M", date(2025, 9, 19)),
        ("1Y", date(2025, 3, 18)),
        ("MTD", date(2026, 3, 1)),
        ("YTD", date(2026, 1, 1)),
        ("ALL", FIRST_TRANSACTION),
        ("unknown", date(2025, 3, 18)),  # falls back to one year
    ],
)
def test_start_of_each_period(period, expected):
    assert _period_start_date(period, TODAY, FIRST_TRANSACTION) == expected


def test_month_to_date_on_the_first_of_a_month_starts_today():
    assert _period_start_date("MTD", date(2026, 3, 1), FIRST_TRANSACTION) == date(2026, 3, 1)


def test_year_to_date_on_new_years_day_starts_today():
    assert _period_start_date("YTD", date(2026, 1, 1), FIRST_TRANSACTION) == date(2026, 1, 1)


class FakeRedis:
    async def get(self, _key):
        return None

    async def set(self, *_args, **_kwargs):
        return None


def option_tx(tx_id, symbol, action, day, premium):
    return {
        "id": tx_id,
        "portfolio_id": "p1",
        "option_symbol": symbol,
        "action": action,
        "contracts": 1,
        "premium": premium,
        "fees": 0,
        "date": day.isoformat(),
        "exchange_rate_to_czk": 20.0,
    }


@pytest.fixture
def options_env(monkeypatch):
    from tests.fake_supabase import FakeSupabase

    today = datetime.now().date()
    db = FakeSupabase()
    db.tables["portfolios"] = [{"id": "p1", "user_id": "u1"}]
    db.tables["option_transactions"] = [
        # closed more than a month ago: realized 1 x 100 x 20 = 2000 CZK
        option_tx("a1", "AAPL250117C00150000", "STO", today - timedelta(days=40), 2.0),
        option_tx("a2", "AAPL250117C00150000", "BTC", today - timedelta(days=35), 1.0),
        # opened and closed today: realized 2 x 100 x 20 = 4000 CZK
        option_tx("b1", "MSFT250117C00300000", "STO", today, 3.0),
        option_tx("b2", "MSFT250117C00300000", "BTC", today, 1.0),
    ]
    monkeypatch.setattr(performance_module, "supabase", db)
    monkeypatch.setattr(performance_module, "get_redis", lambda: FakeRedis())
    return db


async def test_options_performance_month_to_date_counts_only_this_months_realized_profit(options_env):
    result = await performance_module.get_options_performance("u1", period="MTD")

    assert result.total_return == 4000
    assert result.data[0].date == datetime.now().date().replace(day=1).isoformat()


async def test_options_performance_one_year_counts_everything(options_env):
    result = await performance_module.get_options_performance("u1", period="1Y")

    assert result.total_return == 6000


async def test_options_performance_accepts_every_period_the_api_documents(options_env):
    for period in ("1W", "1M", "3M", "6M", "MTD", "YTD", "1Y", "ALL"):
        result = await performance_module.get_options_performance("u1", period=period)
        assert isinstance(result.total_return, float)
