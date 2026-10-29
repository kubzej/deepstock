"""RSI must stay defined when there are no losses or no movement."""
import numpy as np
import pandas as pd

from app.services.market.technical import _calculate_rsi


def series(values) -> pd.Series:
    return pd.Series(values, dtype=float)


def test_only_gains_in_the_window_is_100():
    assert _calculate_rsi(series(np.arange(100, 130))).iloc[-1] == 100


def test_only_losses_in_the_window_is_0():
    assert _calculate_rsi(series(np.arange(130, 100, -1))).iloc[-1] == 0


def test_no_movement_is_neutral_50():
    assert _calculate_rsi(series([100] * 30)).iloc[-1] == 50


def test_recovery_after_losses_approaches_but_never_reaches_100():
    close = series(list(np.arange(130, 110, -1)) + list(np.arange(110, 140)))

    rsi = _calculate_rsi(close)

    assert 90 < rsi.iloc[-1] < 100  # old losses fade out gradually, they do not drop out of a window
    assert rsi.iloc[-1] > rsi.iloc[24]


def test_rows_before_the_first_full_window_stay_empty():
    rsi = _calculate_rsi(series(np.arange(100, 130)))

    assert rsi.iloc[:13].isna().all()
    assert rsi.iloc[13:].notna().all()


def test_history_shorter_than_the_window_is_all_empty():
    assert _calculate_rsi(series(np.arange(100, 110))).isna().all()
