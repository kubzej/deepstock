"""
Quote fetching logic - stock quotes and price history
"""
import yfinance as yf
import pandas as pd
import json
import logging
from typing import List, Dict

logger = logging.getLogger(__name__)


async def get_quotes(redis, tickers: List[str]) -> Dict[str, dict]:
    """
    Smart fetcher with cache.
    1. Check Redis for each ticker.
    2. BATCH fetch missing from yfinance (single call).
    3. Cache new results.
    """
    results = {}
    missing = []

    # 1. Try Cache
    for t in tickers:
        cached = await redis.get(f"quote:{t}")
        if cached:
            results[t] = json.loads(cached)
        else:
            missing.append(t)

    # 2. BATCH Fetch Missing from Yahoo
    if missing:
        try:
            # Single batch call for all missing tickers
            batch = yf.Tickers(" ".join(missing))
            
            for t in missing:
                try:
                    ticker_obj = batch.tickers.get(t)
                    if not ticker_obj:
                        continue
                        
                    fast_info = ticker_obj.fast_info
                    full_info = ticker_obj.info
                    
                    # Use regularMarketPrice for consistency with Yahoo
                    price = full_info.get("regularMarketPrice") or fast_info.last_price
                    prev_close = full_info.get("regularMarketPreviousClose") or fast_info.previous_close
                    
                    if price is None:
                        continue
                    
                    # Use Yahoo's own change percent for accuracy (already in %)
                    change_percent = full_info.get("regularMarketChangePercent")
                    if change_percent is None:
                        change_percent = ((price - prev_close) / prev_close) * 100 if prev_close else 0
                    
                    change = full_info.get("regularMarketChange") or (price - prev_close if prev_close else 0)
                    
                    volume = int(fast_info.last_volume) if fast_info.last_volume else 0
                    avg_volume = int(fast_info.ten_day_average_volume) if fast_info.ten_day_average_volume else 0

                    # Get extended hours data from full info
                    pre_market_price = full_info.get("preMarketPrice")
                    post_market_price = full_info.get("postMarketPrice")
                    
                    # Calculate extended hours change percent ourselves (relative to regular close)
                    pre_market_change_pct = None
                    if pre_market_price and price:
                        pre_market_change_pct = ((pre_market_price - price) / price) * 100
                    
                    post_market_change_pct = None
                    if post_market_price and price:
                        post_market_change_pct = ((post_market_price - price) / price) * 100

                    quote = {
                        "symbol": t,
                        "price": round(price, 2),
                        "change": round(change, 2),
                        "changePercent": round(change_percent, 2),
                        "volume": volume,
                        "avgVolume": avg_volume,
                        "preMarketPrice": round(pre_market_price, 2) if pre_market_price else None,
                        "preMarketChangePercent": round(pre_market_change_pct, 2) if pre_market_change_pct else None,
                        "postMarketPrice": round(post_market_price, 2) if post_market_price else None,
                        "postMarketChangePercent": round(post_market_change_pct, 2) if post_market_change_pct else None,
                        "lastUpdated": str(pd.Timestamp.now())
                    }

                    results[t] = quote
                    
                    # 3. Cache (TTL 60s for prices)
                    await redis.set(f"quote:{t}", json.dumps(quote), ex=60)

                except Exception as e:
                    logger.warning(f"Error processing {t}: {e}")
                    results[t] = None
                    
        except Exception as e:
            logger.error(f"Error in batch fetch: {e}")
    
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
