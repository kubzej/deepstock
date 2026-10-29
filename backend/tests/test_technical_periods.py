"""Technical analysis periods are calendar spans over a one-row-per-trading-day history."""
import re
from pathlib import Path
from typing import get_args

import numpy as np
import pandas as pd
import pytest

from app.services.market import technical
from app.services.market.technical import (
    TECHNICAL_PERIOD_DAYS,
    TechnicalPeriod,
    _slice_to_period,
    get_technical_indicators,
)

ROWS = 500  # roughly the 2y of trading days the raw loader returns
LAST_DAY = "2026-10-27"
INDICATORS = (
    "sma50 sma200 rsi14 macd macd_signal macd_histogram bb_upper bb_middle bb_lower "
    "stoch_k stoch_d atr14 atr_percent obv obv_sma adx plus_di minus_di volume_sma20"
).split()


def make_history(rows: int = ROWS) -> pd.DataFrame:
    dates = pd.bdate_range(end=LAST_DAY, periods=rows, tz="UTC")
    steps = np.arange(rows, dtype=float)
    frame = pd.DataFrame(
        {
            "date": dates,
            "close": 100 + steps * 0.1,
            "high": 101 + steps * 0.1,
            "low": 99 + steps * 0.1,
            "volume": 1_000 + steps,
        }
    )
    for position, name in enumerate(INDICATORS):
        frame[name] = steps + position  # distinct, rising, so obv trend/divergence are computable
    return frame


class FakeRedis:
    def __init__(self):
        self.reads = 0
        self.writes: dict[str, str] = {}

    async def get(self, _key):
        self.reads += 1
        return None

    async def set(self, key, value, ex=None):
        self.writes[key] = value


@pytest.fixture
def history(monkeypatch):
    frame = make_history()

    async def raw_history(_redis, _ticker):
        return frame

    monkeypatch.setattr(technical, "get_raw_history_with_indicators", raw_history)
    return frame


@pytest.mark.parametrize("period", list(TECHNICAL_PERIOD_DAYS))
def test_slice_covers_the_calendar_span_ending_on_the_latest_row(period):
    frame = make_history()
    cutoff = frame["date"].iloc[-1] - pd.Timedelta(days=TECHNICAL_PERIOD_DAYS[period])

    window = _slice_to_period(frame, period)

    assert window["date"].iloc[-1] == frame["date"].iloc[-1]
    assert (window["date"] >= cutoff).all()
    assert len(window) == int((frame["date"] >= cutoff).sum())  # nothing inside the span is missing


def test_one_year_is_a_year_of_trading_days_not_365_rows():
    window = _slice_to_period(make_history(), "1y")

    assert 250 <= len(window) <= 262
    assert (window["date"].iloc[-1] - window["date"].iloc[0]).days <= 365


def test_longest_period_returns_the_whole_history():
    frame = make_history()

    assert len(_slice_to_period(frame, "2y")) == len(frame)


@pytest.mark.parametrize("period", list(TECHNICAL_PERIOD_DAYS))
async def test_result_names_its_period_and_windows_the_history_series(history, period):
    result = await get_technical_indicators(FakeRedis(), "AAPL", period)

    assert result["period"] == period
    assert len(result["priceHistory"]) == len(_slice_to_period(history, period))


async def test_period_high_and_fibonacci_come_only_from_the_window(history):
    # 70 rows back is ~98 calendar days: inside the old tail(90) window, outside a real 3 months
    history.loc[history.index[-70], "high"] = 5_000

    three_months = await get_technical_indicators(FakeRedis(), "AAPL", "3mo")
    six_months = await get_technical_indicators(FakeRedis(), "AAPL", "6mo")

    assert three_months["periodHigh"] < 5_000
    assert three_months["fibonacciLevels"]["1000"] == three_months["periodHigh"]
    assert six_months["periodHigh"] == 5_000


async def test_indicator_values_and_signals_do_not_depend_on_the_period(history):
    results = {
        period: await get_technical_indicators(FakeRedis(), "AAPL", period) for period in TECHNICAL_PERIOD_DAYS
    }

    windowed = {"period", "fibonacciLevels", "fibonacciPosition", "nearestFibLevel", "periodHigh", "periodLow"}
    series = {key for key in results["1y"] if key.endswith("History")}
    expected = {k: v for k, v in results["1y"].items() if k not in windowed | series | {"lastUpdated"}}
    for period, result in results.items():
        actual = {k: v for k, v in result.items() if k not in windowed | series | {"lastUpdated"}}
        assert actual == expected, period


async def test_obv_signals_exist_even_for_a_window_shorter_than_their_lookback(history):
    # price keeps rising while OBV falls over the last 25 rows: bearish divergence
    history.loc[history.index[-25:], "obv"] = np.arange(25, 0, -1) * 1_000.0

    one_week = await get_technical_indicators(FakeRedis(), "AAPL", "1w")
    one_year = await get_technical_indicators(FakeRedis(), "AAPL", "1y")

    assert len(one_week["priceHistory"]) < 20
    assert one_week["obvDivergence"] == "bearish"
    assert one_week["obvTrend"] == "bearish"
    assert (one_week["obvDivergence"], one_week["obvTrend"]) == (one_year["obvDivergence"], one_year["obvTrend"])


async def test_unknown_period_is_rejected_before_any_cache_access():
    redis = FakeRedis()

    with pytest.raises(ValueError):
        await get_technical_indicators(redis, "AAPL", "5d")

    assert redis.reads == 0 and redis.writes == {}


# ── The same list also lives in files that cannot import this module ──────────────────

PERIODS = set(TECHNICAL_PERIOD_DAYS)
REPO_ROOT = Path(__file__).resolve().parents[2]


def test_technical_period_type_matches_the_day_table():
    assert set(get_args(TechnicalPeriod)) == PERIODS


def _read_or_skip(relative_path: str) -> str:
    path = REPO_ROOT / relative_path
    if not path.exists():
        pytest.skip(f"{relative_path} is not part of this checkout")
    return path.read_text()


def test_mcp_server_period_list_matches():
    source = _read_or_skip("mcp/deepstock_mcp.py")
    declared = re.search(r"TechnicalPeriod = Literal\[(.*?)\]", source).group(1)

    assert set(re.findall(r'"([^"]+)"', declared)) == PERIODS


def test_frontend_period_list_matches():
    source = _read_or_skip("frontend/src/lib/api/market.ts")
    declared = re.search(r"export type TechnicalPeriod = ([^;]+);", source).group(1)

    assert set(re.findall(r"'([^']+)'", declared)) == PERIODS
