"""
Option quote fetching logic
"""
import yfinance as yf
import pandas as pd
import json
import asyncio
import logging
from typing import List, Dict, Optional
from concurrent.futures import ThreadPoolExecutor

logger = logging.getLogger(__name__)


def _fetch_option_quotes_batch(occ_symbols: List[str]) -> Dict[str, Optional[dict]]:
    """
    Fetch multiple option quotes using yf.Tickers batch object.
    This shares the HTTP session across all tickers for better performance.
    
    Note: yfinance doesn't have true batch .info, but yf.Tickers shares session
    which reduces connection overhead.
    """
    results = {}
    
    if not occ_symbols:
        return results
    
    try:
        # Create batch ticker object - shares HTTP session
        batch = yf.Tickers(" ".join(occ_symbols))
        
        for occ in occ_symbols:
            try:
                ticker_obj = batch.tickers.get(occ)
                if not ticker_obj:
                    results[occ] = None
                    continue
                
                # .info is still per-ticker, but session is shared
                info = ticker_obj.info
                
                if not info or info.get("regularMarketPrice") is None:
                    results[occ] = None
                    continue
                
                quote = {
                    "symbol": occ,
                    "price": info.get("regularMarketPrice"),
                    "bid": info.get("bid"),
                    "ask": info.get("ask"),
                    "previousClose": info.get("regularMarketPreviousClose"),
                    "volume": info.get("volume") or 0,
                    "openInterest": info.get("openInterest"),
                    "impliedVolatility": info.get("impliedVolatility"),
                    "lastUpdated": str(pd.Timestamp.now()),
                }
                
                # Calculate change from previous close
                if quote["price"] and quote.get("previousClose"):
                    quote["change"] = round(quote["price"] - quote["previousClose"], 4)
                    quote["changePercent"] = round(
                        (quote["change"] / quote["previousClose"]) * 100, 2
                    )
                else:
                    quote["change"] = 0
                    quote["changePercent"] = 0
                
                results[occ] = quote
                
            except Exception as e:
                logger.warning(f"Error fetching option quote for {occ}: {e}")
                results[occ] = None
                
    except Exception as e:
        logger.error(f"Error creating batch tickers: {e}")
        # Fallback: return empty dict, will be handled by caller
    
    return results


async def get_option_quotes(redis, occ_symbols: List[str]) -> Dict[str, dict]:
    """
    Fetch option quotes for OCC symbols.
    Uses cache first, then batch fetches missing via yf.Tickers (shared session).
    
    Optimization: Uses yf.Tickers batch object which shares HTTP session,
    plus ThreadPoolExecutor for non-blocking async execution.
    """
    results = {}
    missing = []

    # 1. Try Cache
    for occ in occ_symbols:
        cached = await redis.get(f"option_quote:{occ}")
        if cached:
            results[occ] = json.loads(cached)
        else:
            missing.append(occ)

    # 2. Batch fetch missing from Yahoo using shared session
    if missing:
        loop = asyncio.get_event_loop()
        
        # Run batch fetch in thread pool (non-blocking)
        with ThreadPoolExecutor(max_workers=1) as executor:
            fetched = await loop.run_in_executor(
                executor, 
                _fetch_option_quotes_batch, 
                missing
            )
        
        # Process results and cache
        for occ, quote in fetched.items():
            results[occ] = quote
            
            # Cache successful fetches (60s TTL for option prices)
            if quote is not None:
                await redis.set(f"option_quote:{occ}", json.dumps(quote), ex=60)
    
    return results
