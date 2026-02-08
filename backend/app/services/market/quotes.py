"""
Quote fetching logic - stock quotes and price history
"""
import yfinance as yf
import pandas as pd
import json
import logging
from typing import List, Dict, Optional
from datetime import datetime, date

logger = logging.getLogger(__name__)


async def get_earnings_for_ticker(redis, ticker_obj, symbol: str) -> Optional[dict]:
    """
    Get earnings data for a ticker. Cached separately with 24h TTL.
    ticker_obj can be None - will create one if needed.
    """
    cache_key = f"earnings:{symbol}"
    cached = await redis.get(cache_key)
    if cached:
        return json.loads(cached)
    
    try:
        # Create ticker object if not provided
        if ticker_obj is None:
            ticker_obj = yf.Ticker(symbol)
            
        calendar = ticker_obj.calendar
        if calendar is None or (isinstance(calendar, pd.DataFrame) and calendar.empty):
            return None
        
        # Extract earnings date
        earnings_date = None
        if isinstance(calendar, dict):
            ed = calendar.get("Earnings Date")
            if ed:
                # Can be a list of dates or single date
                if isinstance(ed, list) and len(ed) > 0:
                    earnings_date = ed[0]
                else:
                    earnings_date = ed
        elif isinstance(calendar, pd.DataFrame):
            if "Earnings Date" in calendar.columns:
                ed = calendar["Earnings Date"].iloc[0] if len(calendar) > 0 else None
                earnings_date = ed
        
        # Convert to ISO string
        earnings_date_str = None
        if earnings_date:
            if isinstance(earnings_date, date):
                # datetime.date object
                earnings_date_str = earnings_date.isoformat()
            elif hasattr(earnings_date, 'date'):
                # datetime.datetime object - extract date part
                earnings_date_str = earnings_date.date().isoformat()
            elif hasattr(earnings_date, 'isoformat'):
                earnings_date_str = earnings_date.isoformat()
            elif isinstance(earnings_date, str):
                earnings_date_str = earnings_date
        
        if not earnings_date_str:
            return None
        
        earnings_data = {
            "earningsDate": earnings_date_str,
        }
        
        # Cache for 24 hours
        await redis.set(cache_key, json.dumps(earnings_data), ex=86400)
        return earnings_data
        
    except Exception as e:
        logger.debug(f"No earnings data for {symbol}: {e}")
        return None


async def get_quotes(redis, tickers: List[str]) -> Dict[str, dict]:
    """
    Smart fetcher with cache.
    1. Check Redis for each ticker.
    2. BATCH fetch missing from yfinance (single call).
    3. Cache new results.
    4. Add earnings data to all quotes (cached separately for 24h).
    """
    results = {}
    missing = []
    cached_tickers = []

    # 1. Try Cache
    for t in tickers:
        cached = await redis.get(f"quote:{t}")
        if cached:
            results[t] = json.loads(cached)
            cached_tickers.append(t)
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
                    
                    # Add earnings data (cached separately for 24h)
                    earnings = await get_earnings_for_ticker(redis, ticker_obj, t)
                    if earnings:
                        quote["earningsDate"] = earnings.get("earningsDate")

                    results[t] = quote
                    
                    # 3. Cache (TTL 60s for prices)
                    await redis.set(f"quote:{t}", json.dumps(quote), ex=60)

                except Exception as e:
                    logger.warning(f"Error processing {t}: {e}")
                    results[t] = None
                    
        except Exception as e:
            logger.error(f"Error in batch fetch: {e}")
    
    # 4. Add earnings data for cached quotes (earnings have separate 24h cache)
    for t in cached_tickers:
        if results.get(t) and "earningsDate" not in results[t]:
            earnings = await get_earnings_for_ticker(redis, None, t)
            if earnings:
                results[t]["earningsDate"] = earnings.get("earningsDate")
    
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
