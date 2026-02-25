"""
Quote fetching logic - stock quotes and price history

Hybrid approach for efficiency:
1. Basic prices via yf.download() - 1 HTTP request for all tickers, TTL 5min
2. Extended data via .info - N requests but TTL 15min (pre/post market, avgVolume, earnings)
"""
import yfinance as yf
import pandas as pd
import json
import logging
import math
from typing import List, Dict, Optional, Union
from datetime import datetime

logger = logging.getLogger(__name__)


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

# Cache TTLs
BASIC_QUOTE_TTL = 300      # 5 minutes for prices
EXTENDED_DATA_TTL = 900    # 15 minutes for pre/post market, avgVolume, earnings


async def get_quotes(redis, tickers: List[str]) -> Dict[str, dict]:
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
                progress=False,
                threads=True
            )
            
            if not df.empty:
                # Handle single vs multiple tickers (yfinance returns different structure)
                is_multi = len(missing_basic) > 1
                
                for t in missing_basic:
                    try:
                        if is_multi:
                            ticker_data = df.xs(t, level=1, axis=1) if t in df.columns.get_level_values(1) else None
                        else:
                            ticker_data = df
                        
                        if ticker_data is None or ticker_data.empty:
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
                        await redis.set(f"quote:{t}", json.dumps(quote), ex=BASIC_QUOTE_TTL)
                        
                    except Exception as e:
                        logger.warning(f"Error processing {t} from download: {e}")
                        
        except Exception as e:
            logger.error(f"Error in yf.download batch: {e}")
    
    # ========================================
    # TIER 2: Extended data via .info (longer TTL)
    # ========================================
    missing_extended = []
    
    for t in tickers:
        if t not in results:
            continue
        cached_ext = await redis.get(f"quote_ext:{t}")
        if cached_ext:
            # Merge extended data into results
            ext_data = json.loads(cached_ext)
            results[t].update(ext_data)
        else:
            missing_extended.append(t)
    
    if missing_extended:
        try:
            batch = yf.Tickers(" ".join(missing_extended))
            
            for t in missing_extended:
                try:
                    ticker_obj = batch.tickers.get(t)
                    if not ticker_obj:
                        continue
                    
                    info = ticker_obj.info
                    
                    # Extended data only
                    ext_data = {}
                    
                    # Average volume
                    avg_volume = safe_int(info.get("averageDailyVolume10Day"))
                    if avg_volume:
                        ext_data["avgVolume"] = avg_volume
                    
                    # Pre-market
                    pre_market_price = safe_float(info.get("preMarketPrice"))
                    if pre_market_price is not None:
                        ext_data["preMarketPrice"] = pre_market_price
                        # Calculate pre-market change vs regular close
                        if results[t].get("price"):
                            pct = safe_float(((pre_market_price - results[t]["price"]) / results[t]["price"]) * 100)
                            if pct is not None:
                                ext_data["preMarketChangePercent"] = pct
                    
                    # Post-market
                    post_market_price = safe_float(info.get("postMarketPrice"))
                    if post_market_price is not None:
                        ext_data["postMarketPrice"] = post_market_price
                        if results[t].get("price"):
                            pct = safe_float(((post_market_price - results[t]["price"]) / results[t]["price"]) * 100)
                            if pct is not None:
                                ext_data["postMarketChangePercent"] = pct
                    
                    # Earnings date
                    earnings_ts = info.get("earningsTimestamp")
                    if earnings_ts:
                        ext_data["earningsDate"] = datetime.fromtimestamp(earnings_ts).date().isoformat()
                    
                    # Merge into results
                    results[t].update(ext_data)
                    
                    # Cache extended data separately with longer TTL
                    await redis.set(f"quote_ext:{t}", json.dumps(ext_data), ex=EXTENDED_DATA_TTL)
                    
                except Exception as e:
                    logger.warning(f"Error fetching extended data for {t}: {e}")
                    
        except Exception as e:
            logger.error(f"Error in extended data batch: {e}")
    
    return results


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
        
        # Determine interval based on period
        interval = "1d"
        if period in ["1d", "5d"]:
            interval = "15m" if period == "1d" else "30m"
        elif period in ["1mo", "3mo"]:
            interval = "1d"
        else:
            interval = "1wk"
        
        hist = t.history(period=period, interval=interval)
        
        if hist.empty:
            return []
        
        # Convert to list of dicts for JSON
        result = []
        for idx, row in hist.iterrows():
            close_price = safe_float(row["Close"])
            # Skip rows with invalid close price
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
        
        # Cache based on period (shorter periods = shorter TTL)
        ttl = 300  # 5 min default
        if period in ["1d", "5d"]:
            ttl = 60  # 1 min for intraday
        elif period in ["1mo", "3mo"]:
            ttl = 3600  # 1 hour
        else:
            ttl = 86400  # 1 day for longer periods
        
        await redis.set(cache_key, json.dumps(result), ex=ttl)
        return result
        
    except Exception as e:
        logger.error(f"Error fetching history for {ticker}: {e}")
        return []
