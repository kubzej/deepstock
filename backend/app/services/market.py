# Service layer for yfinance logic 
import yfinance as yf
import pandas as pd
import json
import redis.asyncio as redis
from typing import List, Dict, Optional
from app.core.config import get_settings

class MarketDataService:
    def __init__(self, redis_url: str = "redis://redis:6379/0"):
        self.redis = redis.from_url(redis_url)

    async def get_quotes(self, tickers: List[str]) -> Dict[str, dict]:
        """
        Smart fetcher with cache.
        1. Check Redis for each ticker.
        2. Bulk fetch missing from yfinance.
        3. Cache new results.
        """
        results = {}
        missing = []

        # 1. Try Cache
        for t in tickers:
            cached = await self.redis.get(f"quote:{t}")
            if cached:
                results[t] = json.loads(cached)
            else:
                missing.append(t)

        # 2. Fetch Missing from Yahoo using fast_info (real-time prices)
        if missing:
            for t in missing:
                try:
                    ticker = yf.Ticker(t)
                    info = ticker.fast_info
                    
                    price = info.last_price
                    prev_close = info.previous_close
                    
                    if price is None:
                        continue
                    
                    change = price - prev_close if prev_close else 0
                    change_percent = (change / prev_close) * 100 if prev_close else 0
                    
                    volume = int(info.last_volume) if info.last_volume else 0
                    avg_volume = int(info.ten_day_average_volume) if info.ten_day_average_volume else 0

                    quote = {
                        "symbol": t,
                        "price": round(price, 2),
                        "change": round(change, 2),
                        "changePercent": round(change_percent, 2),
                        "volume": volume,
                        "avgVolume": avg_volume,
                        "lastUpdated": str(pd.Timestamp.now())
                    }

                    results[t] = quote
                    
                    # 3. Cache (TTL 60s for prices)
                    await self.redis.set(f"quote:{t}", json.dumps(quote), ex=60)

                except Exception as e:
                    print(f"Error fetching {t}: {e}")
                    results[t] = None
        
        return results

    async def get_search_results(self, query: str):
        # Redis cache for search query (1 hour)
        cache_key = f"search:{query.lower()}"
        cached = await self.redis.get(cache_key)
        if cached:
            return json.loads(cached)

        try:
            # Use Ticker object for search metadata isn't great in yfinance
            # Typically we use specific API or specialized library. 
            # For now, yfinance doesn't have a direct "search" method exposed easily nicely.
            # We might need to implement a simple exact match fallback or use yq.
            # For MVP: Assume user types valid ticker or use a static list for now?
            # Actually, yfinance DOES NOT have search. We need a workaround.
            # Workaround: Use Yahoo Query 1 API directly via simple HTTP request.
            pass
        except Exception:
            pass
        return []

    async def get_price_history(self, ticker: str, period: str = "1mo") -> List[dict]:
        """
        Get historical price data for charting.
        Periods: 1d, 5d, 1mo, 3mo, 6mo, 1y, 2y, 5y, max
        """
        cache_key = f"history:{ticker}:{period}"
        cached = await self.redis.get(cache_key)
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
            
            await self.redis.set(cache_key, json.dumps(result), ex=ttl)
            return result
            
        except Exception as e:
            print(f"Error fetching history for {ticker}: {e}")
            return []

# Singleton instance
settings = get_settings()
market_service = MarketDataService(redis_url=settings.redis_url)
