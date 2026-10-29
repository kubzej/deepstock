"""RSI, ATR and ADX follow Wilder's definition; Bollinger bands use the population deviation."""
import numpy as np
import pandas as pd
import pytest

from app.services.market.technical import _add_indicators, _calculate_rsi, _wilder_average

WINDOW = 14
EXPECTED_COLUMNS = {
    "sma50", "sma200", "rsi14", "macd", "macd_signal", "macd_histogram", "bb_middle", "bb_upper",
    "bb_lower", "stoch_k", "stoch_d", "atr14", "atr_percent", "obv", "obv_sma", "adx", "plus_di",
    "minus_di", "volume_sma20",
}


def random_ohlcv(rows: int = 500, seed: int = 7) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    close = pd.Series(100 * np.exp(np.cumsum(rng.normal(0.0004, 0.015, rows))))
    return pd.DataFrame(
        {
            "close": close,
            "high": close * (1 + rng.uniform(0, 0.01, rows)),
            "low": close * (1 - rng.uniform(0, 0.01, rows)),
            "volume": rng.integers(1_000, 5_000, rows).astype(float),
        }
    )


# ── Textbook Wilder smoothing, written independently of the pandas shortcut ───────────

def wilder_reference(values: pd.Series, window: int = WINDOW) -> pd.Series:
    """First average is the plain mean of the first `window` values, then avg = (avg * (n - 1) + x) / n."""
    out = pd.Series(np.nan, index=values.index)
    start = values.first_valid_index()
    seed_at = start + window - 1
    average = values.iloc[start:seed_at + 1].mean()
    out.iloc[seed_at] = average
    for position in range(seed_at + 1, len(values)):
        average = (average * (window - 1) + values.iloc[position]) / window
        out.iloc[position] = average
    return out


def reference_rsi(close: pd.Series) -> pd.Series:
    delta = close.diff().fillna(0)
    gain = wilder_reference(delta.clip(lower=0))
    loss = wilder_reference((-delta).clip(lower=0))
    return 100 - 100 / (1 + gain / loss)


def reference_atr_and_adx(frame: pd.DataFrame):
    high, low, close = frame["high"], frame["low"], frame["close"]
    true_range = pd.concat(
        [high - low, (high - close.shift()).abs(), (low - close.shift()).abs()], axis=1
    ).max(axis=1)
    up, down = high.diff(), low.shift() - low
    plus_dm = pd.Series(np.where((up > down) & (up > 0), up, 0.0))
    minus_dm = pd.Series(np.where((down > up) & (down > 0), down, 0.0))
    atr = wilder_reference(true_range)
    plus_di = 100 * wilder_reference(plus_dm) / atr
    minus_di = 100 * wilder_reference(minus_dm) / atr
    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di)
    return atr, plus_di, minus_di, wilder_reference(dx)


def close_enough(actual: pd.Series, expected: pd.Series) -> bool:
    # the pandas average starts from the first value instead of a seeded mean; the gap fades out geometrically
    tail = slice(-100, None)
    return bool(np.allclose(actual.iloc[tail], expected.iloc[tail], rtol=1e-6, atol=1e-6))


def test_rsi_matches_the_textbook_definition():
    close = random_ohlcv()["close"]

    assert close_enough(_calculate_rsi(close), reference_rsi(close))


def test_atr_di_and_adx_match_the_textbook_definition():
    frame = _add_indicators(random_ohlcv())
    atr, plus_di, minus_di, adx = reference_atr_and_adx(frame)

    assert close_enough(frame["atr14"], atr)
    assert close_enough(frame["plus_di"], plus_di)
    assert close_enough(frame["minus_di"], minus_di)
    assert close_enough(frame["adx"], adx)


def test_a_large_day_leaving_the_window_does_not_make_the_average_jump():
    spike = pd.Series([1.0] * 40)
    spike.iloc[20] = 100.0

    smoothed = _wilder_average(spike)

    after_spike = smoothed.iloc[21:].diff().dropna()
    assert after_spike.abs().max() < 1  # a 14-day plain mean would drop by 100 / 14 ≈ 7.1 at once


def test_rows_before_the_first_full_window_stay_empty():
    smoothed = _wilder_average(pd.Series(np.arange(1.0, 31.0)))

    assert smoothed.iloc[:WINDOW - 1].isna().all()
    assert smoothed.iloc[WINDOW - 1:].notna().all()


def test_adx_needs_two_windows_of_data():
    frame = _add_indicators(random_ohlcv())

    assert frame["adx"].iloc[:2 * WINDOW - 2].isna().all()
    assert frame["adx"].iloc[2 * WINDOW - 2:].notna().all()


def test_bollinger_bands_are_two_population_deviations_wide():
    frame = _add_indicators(random_ohlcv())
    last_twenty = frame["close"].iloc[-20:]

    half_width = frame["bb_upper"].iloc[-1] - frame["bb_middle"].iloc[-1]

    assert half_width == pytest.approx(2 * np.std(last_twenty))  # numpy std is the population one


def test_every_indicator_column_the_consumers_read_is_produced():
    frame = _add_indicators(random_ohlcv())

    assert EXPECTED_COLUMNS <= set(frame.columns)
