"""In-memory stand-in for yfinance that records which thread each blocking call ran in."""
import threading
import time
from contextlib import contextmanager

import numpy as np
import pandas as pd
import yfinance


def ohlcv(rows: int = 30, start: str = "2026-01-02", base: float = 100.0) -> pd.DataFrame:
    index = pd.date_range(start, periods=rows, freq="B", tz="UTC")
    close = base + np.arange(rows, dtype=float) * 0.5
    return pd.DataFrame(
        {"Open": close - 0.3, "High": close + 1, "Low": close - 1, "Close": close, "Volume": 10_000 + np.arange(rows)},
        index=index,
    )


def statement(rows: list, scale: float) -> pd.DataFrame:
    columns = [pd.Timestamp(f"{2025 - i}-09-30") for i in range(3)]
    return pd.DataFrame({c: {r: scale * (1 + 0.1 * j) for j, r in enumerate(rows)} for c in columns})


INFO = {
    "regularMarketPrice": 187.5, "currentPrice": 187.5, "regularMarketPreviousClose": 185.0, "marketState": "REGULAR",
    "averageDailyVolume10Day": 5_000_000, "longName": "Apple Inc.", "sector": "Technology", "industry": "Consumer Electronics",
    "currency": "USD", "marketCap": 2_900_000_000_000, "enterpriseValue": 2_950_000_000_000, "totalRevenue": 383_000_000_000,
    "revenueGrowth": 0.12, "freeCashflow": 99_000_000_000, "sharesOutstanding": 15_500_000_000, "trailingEps": 6.43, "bookValue": 4.15,
}
ESTIMATE = pd.DataFrame({"avg": [6.4, 7.0, 7.9, 8.8]}, index=["0q", "+1q", "0y", "+1y"])


class FakeYahoo:
    """
    Replaces yfinance.Ticker / Tickers / download. `calls` lists (what, thread name) in call order;
    `peak` is the highest number of calls that were in flight at once.
    """

    def __init__(self, delay: float = 0.0):
        self.delay = delay
        self.calls: list = []
        self.peak = 0
        self.income_empty = False
        self.download_kwargs: list = []
        self._active = 0
        self._lock = threading.Lock()

    @property
    def what(self) -> list:
        return [what for what, _ in self.calls]

    @property
    def threads(self) -> set:
        return {thread for _, thread in self.calls}

    def count(self, prefix: str) -> int:
        return sum(1 for what in self.what if what.startswith(prefix))

    @contextmanager
    def _busy(self, what: str):
        with self._lock:
            self.calls.append((what, threading.current_thread().name))
            self._active += 1
            self.peak = max(self.peak, self._active)
        try:
            if self.delay:
                time.sleep(self.delay)
            yield
        finally:
            with self._lock:
                self._active -= 1

    def install(self, monkeypatch) -> "FakeYahoo":
        fake = self

        class Ticker:
            def __init__(self, symbol, *args, **kwargs):
                self.symbol = symbol

            def _read(self, what, value):
                with fake._busy(what):
                    return value

            @property
            def info(self):
                return self._read("info", dict(INFO))

            @property
            def income_stmt(self):
                empty = pd.DataFrame()
                return self._read("income_stmt", empty if fake.income_empty else statement(
                    ["Total Revenue", "Gross Profit", "Operating Income", "EBITDA", "Net Income", "Diluted Average Shares"], 1e11))

            @property
            def balance_sheet(self):
                return self._read("balance_sheet", statement(["Total Assets", "Stockholders Equity", "Total Debt"], 5e10))

            @property
            def cashflow(self):
                return self._read("cashflow", statement(["Free Cash Flow"], 2e10))

            @property
            def earnings_estimate(self):
                return self._read("earnings_estimate", ESTIMATE.copy())

            @property
            def revenue_estimate(self):
                return self._read("revenue_estimate", ESTIMATE.copy() * 1e9)

            def history(self, period=None, interval="1d", auto_adjust=True, **kwargs):
                with fake._busy(f"history:{self.symbol}"):
                    return ohlcv(500 if period == "2y" else 1500, start="2024-01-02")

            def __getattr__(self, name):  # the other earnings tables
                if name in ("earnings_history", "eps_trend", "eps_revisions", "growth_estimates"):
                    return self._read(name, ESTIMATE.copy())
                raise AttributeError(name)

        class Tickers:
            def __init__(self, symbols, *args, **kwargs):
                self.tickers = {symbol: Ticker(symbol) for symbol in symbols.split()}

        def download(tickers, *args, **kwargs):
            symbols = tickers.split() if isinstance(tickers, str) else list(tickers)
            with fake._busy(f"download:{','.join(symbols)}"):
                fake.download_kwargs.append(kwargs)
                frame = ohlcv(5 if kwargs.get("period") == "5d" else 22, start="2026-10-01")
                if len(symbols) == 1:
                    return frame
                return pd.concat({s: frame for s in symbols}, axis=1).swaplevel(0, 1, axis=1).sort_index(axis=1)

        monkeypatch.setattr(yfinance, "Ticker", Ticker)
        monkeypatch.setattr(yfinance, "Tickers", Tickers)
        monkeypatch.setattr(yfinance, "download", download)
        return self
