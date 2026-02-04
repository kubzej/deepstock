# Service layer for yfinance logic 
import yfinance as yf
import pandas as pd
import json
import redis.asyncio as redis
from typing import List, Dict, Optional

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

        # 2. Fetch Missing from Yahoo
        if missing:
            try:
                # yfinance batch download
                # We use download for price history to get correct "change" data
                # period="5d" acts as a buffer for weekends/holidays
                tickers_str = " ".join(missing)
                data = yf.download(tickers_str, period="5d", progress=False, group_by='ticker')
                
                # Handling single vs multiple tickers structure in yfinance
                # If only 1 ticker, structure is different (DataFrame directly), so we normalize
                is_single = len(missing) == 1
                
                for t in missing:
                    try:
                        df = data if is_single else data[t]
                        
                        if df.empty:
                            continue

                        # Extract latest valid close
                        last_row = df.iloc[-1]
                        prev_row = df.iloc[-2] if len(df) > 1 else last_row
                        
                        price = float(last_row['Close'])
                        prev_close = float(prev_row['Close'])
                        change = price - prev_close
                        change_percent = (change / prev_close) * 100 if prev_close else 0
                        
                        # Volume data
                        volume = int(last_row['Volume']) if pd.notna(last_row['Volume']) else 0
                        avg_volume = int(df['Volume'].mean()) if not df['Volume'].isna().all() else 0

                        quote = {
                            "symbol": t,
                            "price": round(price, 2),
                            "change": round(change, 2),
                            "changePercent": round(change_percent, 2),
                            "volume": volume,
                            "avgVolume": avg_volume,
                            "lastUpdated": str(last_row.name)
                        }

                        results[t] = quote
                        
                        # 3. Cache (TTL 60s for prices)
                        await self.redis.set(f"quote:{t}", json.dumps(quote), ex=60)

                    except Exception as e:
                        print(f"Error parse {t}: {e}")
                        results[t] = None

            except Exception as e:
                print(f"Batch fetch error: {e}")
        
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

# Singleton instance
market_service = MarketDataService()
