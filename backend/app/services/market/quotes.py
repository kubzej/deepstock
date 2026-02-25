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
from typing import List, Dict
from datetime import datetime

logger = logging.getLogger(__name__)

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
                        price = float(latest["Close"])
                        volume = int(latest["Volume"]) if pd.notna(latest["Volume"]) else 0
                        
                        # Get previous close from second-to-last row
                        prev_close = None
                        change = 0
                        change_percent = 0
                        if len(ticker_data) >= 2:
                            prev_close = float(ticker_data.iloc[-2]["Close"])
                            change = price - prev_close
                            change_percent = (change / prev_close * 100) if prev_close else 0
                        
                        quote = {
                            "symbol": t,
                            "price": round(price, 2),
                            "previousClose": round(prev_close, 2) if prev_close else None,
                            "change": round(change, 2),
                            "changePercent": round(change_percent, 2),
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
                    avg_volume = info.get("averageDailyVolume10Day")
                    if avg_volume:
                        ext_data["avgVolume"] = int(avg_volume)
                    
                    # Pre-market
                    pre_market_price = info.get("preMarketPrice")
                    if pre_market_price:
                        ext_data["preMarketPrice"] = round(pre_market_price, 2)
                        # Calculate pre-market change vs regular close
                        if results[t].get("price"):
                            pct = ((pre_market_price - results[t]["price"]) / results[t]["price"]) * 100
                            ext_data["preMarketChangePercent"] = round(pct, 2)
                    
                    # Post-market
                    post_market_price = info.get("postMarketPrice")
                    if post_market_price:
                        ext_data["postMarketPrice"] = round(post_market_price, 2)
                        if results[t].get("price"):
                            pct = ((post_market_price - results[t]["price"]) / results[t]["price"]) * 100
                            ext_data["postMarketChangePercent"] = round(pct, 2)
                    
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
            result.append({
                "date": idx.isoformat(),
                "open": round(float(row["Open"]), 2),
                "high": round(float(row["High"]), 2),
                "low": round(float(row["Low"]), 2),
                "close": round(float(row["Close"]), 2),
                "volume": int(row["Volume"]) if pd.notna(row["Volume"]) else 0
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
