"""
Quote fetching logic - stock quotes and price history

Hybrid approach for efficiency:
1. Basic prices via yf.download() - 1 HTTP request for all tickers, TTL 5min
2. Extended data via .info - runs in background, TTL 1h (pre/post market, avgVolume, earnings)
"""
import yfinance as yf
import pandas as pd
import json
import logging
import math
import asyncio
from concurrent.futures import ThreadPoolExecutor
from typing import List, Dict, Optional, Union
from datetime import datetime
from app.core.cache import CacheTTL

logger = logging.getLogger(__name__)

# Thread pool for background .info fetches (avoid blocking)
_executor = ThreadPoolExecutor(max_workers=4)


def _normalize_ticker_data(df: pd.DataFrame, ticker: str) -> Optional[pd.DataFrame]:
    """
    Normalize yfinance download output to a per-ticker OHLCV frame.

    yfinance can return different column layouts across versions:
    - flat columns for a single ticker: Close, Open, ...
    - MultiIndex with level order (Price, Ticker)
    - MultiIndex with a single ticker still wrapped in the Ticker level
    """
    if df is None or df.empty:
        return None

    ticker = ticker.upper()

    if not isinstance(df.columns, pd.MultiIndex):
        return df

    for level in range(df.columns.nlevels):
        try:
            level_values = df.columns.get_level_values(level)
            if ticker in level_values:
                ticker_data = df.xs(ticker, level=level, axis=1)
                if isinstance(ticker_data, pd.Series):
                    ticker_data = ticker_data.to_frame()
                if isinstance(ticker_data.columns, pd.MultiIndex):
                    ticker_data.columns = ticker_data.columns.get_level_values(0)
                return ticker_data
        except (KeyError, IndexError, ValueError):
            continue

    unique_tickers = set(df.columns.get_level_values(df.columns.nlevels - 1))
    if len(unique_tickers) == 1 and ticker in unique_tickers:
        ticker_data = df.copy()
        ticker_data.columns = ticker_data.columns.get_level_values(0)
        return ticker_data

    return None


def safe_float(value, decimals: int = 2) -> Optional[float]:
    """Safely convert a value to float, handling NaN/inf/None -> None for JSON serialization."""
    if value is None:
        return None
    try:
        f = float(value)
        if math.isnan(f) or math.isinf(f):
            return None
        return round(f, decimals)
    except (ValueError, TypeError):
        return None


def safe_int(value) -> Optional[int]:
    """Safely convert a value to int, handling NaN/inf/None -> None for JSON serialization."""
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
        return int(value)
    except (ValueError, TypeError):
        return None

# Cache TTLs — defined centrally in app.core.cache


def _fetch_extended_data_sync(ticker: str) -> Optional[dict]:
    """
    Synchronous function to fetch extended data for a single ticker.
    Runs in thread pool to avoid blocking async event loop.
    """
    try:
        t = yf.Ticker(ticker)
        info = t.info
        
        ext_data = {}
        
        # Average volume
        avg_volume = safe_int(info.get("averageDailyVolume10Day"))
        if avg_volume:
            ext_data["avgVolume"] = avg_volume
        
        # Pre-market
        pre_market_price = safe_float(info.get("preMarketPrice"))
        if pre_market_price is not None:
            ext_data["preMarketPrice"] = pre_market_price
            pre_market_change = safe_float(info.get("preMarketChangePercent"))
            if pre_market_change is not None:
                # Yahoo returns percent already (e.g., 1.25 = 1.25%), no multiplication needed
                ext_data["preMarketChangePercent"] = pre_market_change
        
        # Post-market
        post_market_price = safe_float(info.get("postMarketPrice"))
        if post_market_price is not None:
            ext_data["postMarketPrice"] = post_market_price
            post_market_change = safe_float(info.get("postMarketChangePercent"))
            if post_market_change is not None:
                # Yahoo returns percent already (e.g., -1.25 = -1.25%), no multiplication needed
                ext_data["postMarketChangePercent"] = post_market_change
        
        # Earnings date
        earnings_ts = info.get("earningsTimestamp")
        if earnings_ts:
            ext_data["earningsDate"] = datetime.fromtimestamp(earnings_ts).date().isoformat()
        
        return ext_data if ext_data else None
        
    except Exception as e:
        logger.warning(f"Error fetching extended data for {ticker}: {e}")
        return None


async def _fetch_and_cache_extended_data(redis, ticker: str, delay: float = 0):
    """
    Fetch extended data in background and cache it.
    Fire-and-forget - errors are logged but don't propagate.
    delay: seconds to wait before fetching (used to stagger burst requests)
    """
    try:
        if delay > 0:
            await asyncio.sleep(delay)
        loop = asyncio.get_event_loop()
        ext_data = await loop.run_in_executor(_executor, _fetch_extended_data_sync, ticker)

        if ext_data:
            await redis.set(f"quote_ext:{ticker}", json.dumps(ext_data), ex=CacheTTL.QUOTE_EXTENDED)
            logger.debug(f"Cached extended data for {ticker}")
    except Exception as e:
        logger.warning(f"Background fetch failed for {ticker}: {e}")


async def get_quotes(redis, tickers: List[str], include_extended: bool = True) -> Dict[str, dict]:
    """
    Smart fetcher with two-tier caching:
    1. Basic quotes (price, change, volume) via yf.download() - fast, 1 request
    2. Extended data (pre/post market, avgVolume, earnings) via .info - slower, cached longer
    """
    results = {}
    
    # ========================================
    # TIER 1: Basic quotes via yf.download()
    # ========================================
    missing_basic = []
    
    for t in tickers:
        cached = await redis.get(f"quote:{t}")
        if cached:
            results[t] = json.loads(cached)
        else:
            missing_basic.append(t)
    
    if missing_basic:
        try:
            # Single batch download for all missing tickers
            df = yf.download(
                " ".join(missing_basic), 
                period="2d",  # Need 2 days for previous close
                interval="1d",
                auto_adjust=False,
                progress=False,
                threads=True
            )
            
            if df.empty:
                logger.warning(
                    "yf.download() returned empty DataFrame for %d tickers %s — "
                    "possible Yahoo Finance rate limit (429) or connectivity issue",
                    len(missing_basic), missing_basic,
                )
            else:
                for t in missing_basic:
                    try:
                        ticker_data = _normalize_ticker_data(df, t)
                        
                        if ticker_data is None or ticker_data.empty:
                            continue

                        if "Close" not in ticker_data.columns:
                            logger.warning(f"Missing Close column for {t}, skipping")
                            continue

                        ticker_data = ticker_data.dropna(subset=["Close"])
                        if ticker_data.empty:
                            logger.warning(f"No valid Close rows for {t}, skipping")
                            continue
                        
                        # Get latest row
                        latest = ticker_data.iloc[-1]
                        price = safe_float(latest["Close"])
                        volume = safe_int(latest["Volume"]) or 0
                        
                        # Skip if we couldn't get a valid price
                        if price is None:
                            logger.warning(f"No valid price for {t}, skipping")
                            continue
                        
                        # Get previous close from second-to-last row
                        prev_close = None
                        change = 0
                        change_percent = 0
                        if len(ticker_data) >= 2:
                            prev_close = safe_float(ticker_data.iloc[-2]["Close"])
                            if prev_close is not None:
                                change = safe_float(price - prev_close)
                                change_percent = safe_float((price - prev_close) / prev_close * 100)
                        
                        quote = {
                            "symbol": t,
                            "price": price,
                            "previousClose": prev_close,
                            "change": change or 0,
                            "changePercent": change_percent or 0,
                            "volume": volume,
                            "lastUpdated": str(pd.Timestamp.now())
                        }
                        
                        results[t] = quote
                        await redis.set(f"quote:{t}", json.dumps(quote), ex=CacheTTL.QUOTE_BASIC)
                        
                    except Exception as e:
                        logger.warning(f"Error processing {t} from download: {e}")
                        
        except Exception as e:
            logger.error(f"Error in yf.download batch: {e}")
    
    if not include_extended:
        return results

    # ========================================
    # TIER 2: Extended data via .info (longer TTL)
    # Check cache first, schedule background fetch for missing
    # ========================================
    missing_extended = []
    
    for t in tickers:
        if t not in results:
            continue
        cached_ext = await redis.get(f"quote_ext:{t}")
        if cached_ext:
            # Merge cached extended data into results
            ext_data = json.loads(cached_ext)
            results[t].update(ext_data)
        else:
            missing_extended.append(t)
    
    # Fire-and-forget: schedule background fetch for missing extended data
    # Staggered with 0.5s delay per ticker to avoid burst on Yahoo Finance
    if missing_extended:
        for i, t in enumerate(missing_extended):
            asyncio.create_task(_fetch_and_cache_extended_data(redis, t, delay=i * 0.5))
        logger.debug(f"Scheduled staggered background fetch for {len(missing_extended)} tickers")
    
    return results


def _history_interval_and_ttl(period: str) -> tuple[str, int]:
    if period in ["1d", "5d"]:
        return ("15m" if period == "1d" else "30m", CacheTTL.PRICE_HISTORY_INTRADAY)
    if period in ["1mo", "3mo"]:
        return ("1d", CacheTTL.PRICE_HISTORY_SHORT)
    return ("1wk", CacheTTL.PRICE_HISTORY_LONG)


def _serialize_history_frame(hist: pd.DataFrame) -> List[dict]:
    if hist is None or hist.empty:
        return []

    result = []
    for idx, row in hist.iterrows():
        close_price = safe_float(row["Close"])
        if close_price is None:
            continue
        result.append({
            "date": idx.isoformat(),
            "open": safe_float(row["Open"]) or close_price,
            "high": safe_float(row["High"]) or close_price,
            "low": safe_float(row["Low"]) or close_price,
            "close": close_price,
            "volume": safe_int(row["Volume"]) or 0
        })
    return result


async def get_price_history(redis, ticker: str, period: str = "1mo") -> List[dict]:
    """
    Get historical price data for charting.
    Periods: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max
    """
    cache_key = f"history:{ticker}:{period}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)

    try:
        t = yf.Ticker(ticker)
        interval, ttl = _history_interval_and_ttl(period)
        hist = t.history(period=period, interval=interval)

        if hist.empty:
            return []

        result = _serialize_history_frame(hist)
        await redis.set(cache_key, json.dumps(result), ex=ttl)
        return result

    except Exception as e:
        logger.error(f"Error fetching history for {ticker}: {e}")
        return []


async def get_batch_price_history(
    redis,
    tickers: List[str],
    period: str = "1mo",
) -> Dict[str, List[dict]]:
    """
    Get historical price data for multiple tickers in one Yahoo batch request.
    Uses per-ticker Redis cache, but fetches all cache misses together.
    """
    unique_tickers = list(dict.fromkeys(t.upper() for t in tickers if t))
    if not unique_tickers:
        return {}

    results: Dict[str, List[dict]] = {}
    missing: List[str] = []

    for ticker in unique_tickers:
        cache_key = f"history:{ticker}:{period}"
        cached = await redis.get(cache_key)
        if cached:
            results[ticker] = json.loads(cached)
        else:
            missing.append(ticker)

    if not missing:
        return results

    try:
        interval, ttl = _history_interval_and_ttl(period)
        df = yf.download(
            " ".join(missing),
            period=period,
            interval=interval,
            auto_adjust=False,
            progress=False,
            threads=True,
        )

        if df.empty:
            logger.warning(
                "yf.download() returned empty history DataFrame for %d tickers %s",
                len(missing), missing,
            )
        else:
            for ticker in missing:
                try:
                    ticker_data = _normalize_ticker_data(df, ticker)
                    if ticker_data is None or ticker_data.empty:
                        results[ticker] = []
                        continue

                    ticker_data = ticker_data.dropna(subset=["Close"])
                    serialized = _serialize_history_frame(ticker_data)
                    results[ticker] = serialized
                    await redis.set(
                        f"history:{ticker}:{period}",
                        json.dumps(serialized),
                        ex=ttl,
                    )
                except Exception as e:
                    logger.warning(f"Error processing history for {ticker}: {e}")
                    results[ticker] = []
    except Exception as e:
        logger.error(f"Error in yf.download history batch for {missing}: {e}")
        for ticker in missing:
            results.setdefault(ticker, [])

    return results
