import pandas as pd

from app.services.market.quotes import _normalize_ticker_data


def test_normalize_single_ticker_multiindex_frame() -> None:
    columns = pd.MultiIndex.from_tuples(
        [
            ("Close", "UBER"),
            ("High", "UBER"),
            ("Low", "UBER"),
            ("Open", "UBER"),
            ("Volume", "UBER"),
        ],
        names=["Price", "Ticker"],
    )
    df = pd.DataFrame(
        [[73.33, 74.87, 72.69, 73.29, 16397000]],
        columns=columns,
    )

    result = _normalize_ticker_data(df, "UBER")

    assert result is not None
    assert list(result.columns) == ["Close", "High", "Low", "Open", "Volume"]
    assert float(result.iloc[0]["Close"]) == 73.33


def test_normalize_multi_ticker_frame_extracts_requested_ticker() -> None:
    columns = pd.MultiIndex.from_tuples(
        [
            ("Close", "AAPL"),
            ("Close", "UBER"),
            ("Volume", "AAPL"),
            ("Volume", "UBER"),
        ],
        names=["Price", "Ticker"],
    )
    df = pd.DataFrame(
        [[250.12, 73.33, 36889900, 16397000]],
        columns=columns,
    )

    result = _normalize_ticker_data(df, "UBER")

    assert result is not None
    assert list(result.columns) == ["Close", "Volume"]
    assert float(result.iloc[0]["Close"]) == 73.33


def test_normalize_flat_frame_returns_original_columns() -> None:
    df = pd.DataFrame(
        [{"Close": 73.33, "High": 74.87, "Low": 72.69, "Open": 73.29, "Volume": 16397000}]
    )

    result = _normalize_ticker_data(df, "UBER")

    assert result is not None
    assert list(result.columns) == ["Close", "High", "Low", "Open", "Volume"]