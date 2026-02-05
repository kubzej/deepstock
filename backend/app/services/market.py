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
        2. BATCH fetch missing from yfinance (single call).
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
                            
                        info = ticker_obj.fast_info
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
                        print(f"Error processing {t}: {e}")
                        results[t] = None
                        
            except Exception as e:
                print(f"Error in batch fetch: {e}")
        
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

    async def get_option_quotes(self, occ_symbols: List[str]) -> Dict[str, dict]:
        """
        Fetch option quotes for OCC symbols.
        Uses same pattern as stock quotes - cache first, batch fetch missing.
        """
        results = {}
        missing = []

        # 1. Try Cache
        for occ in occ_symbols:
            cached = await self.redis.get(f"option_quote:{occ}")
            if cached:
                results[occ] = json.loads(cached)
            else:
                missing.append(occ)

        # 2. Fetch missing from Yahoo
        if missing:
            for occ in missing:
                try:
                    t = yf.Ticker(occ)
                    # For options, we need to use .info as .fast_info doesn't work
                    info = t.info
                    
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
                    
                    # Cache (60s TTL for option prices)
                    await self.redis.set(f"option_quote:{occ}", json.dumps(quote), ex=60)
                    
                except Exception as e:
                    print(f"Error fetching option quote for {occ}: {e}")
                    results[occ] = None
        
        return results

    async def get_stock_info(self, ticker: str) -> Optional[dict]:
        """
        Get detailed stock info including fundamentals and valuation metrics.
        Uses yfinance .info which includes everything we need.
        """
        cache_key = f"stock_info:{ticker}"
        cached = await self.redis.get(cache_key)
        if cached:
            return json.loads(cached)

        try:
            t = yf.Ticker(ticker)
            info = t.info
            
            if not info or info.get("regularMarketPrice") is None:
                return None
            
            # Extract key metrics
            result = {
                "symbol": ticker,
                "name": info.get("longName") or info.get("shortName"),
                "sector": info.get("sector"),
                "industry": info.get("industry"),
                "country": info.get("country"),
                "exchange": info.get("exchange"),
                "currency": info.get("currency"),
                "description": info.get("longBusinessSummary"),
                
                # Price data
                "price": info.get("regularMarketPrice"),
                "previousClose": info.get("regularMarketPreviousClose"),
                "change": info.get("regularMarketChange"),
                "changePercent": info.get("regularMarketChangePercent"),
                "dayHigh": info.get("dayHigh"),
                "dayLow": info.get("dayLow"),
                "fiftyTwoWeekHigh": info.get("fiftyTwoWeekHigh"),
                "fiftyTwoWeekLow": info.get("fiftyTwoWeekLow"),
                "volume": info.get("volume"),
                "avgVolume": info.get("averageVolume"),
                
                # Valuation metrics
                "marketCap": info.get("marketCap"),
                "enterpriseValue": info.get("enterpriseValue"),
                "trailingPE": info.get("trailingPE"),
                "forwardPE": info.get("forwardPE"),
                "pegRatio": info.get("pegRatio"),
                "priceToBook": info.get("priceToBook"),
                "priceToSales": info.get("priceToSalesTrailing12Months"),
                "enterpriseToRevenue": info.get("enterpriseToRevenue"),
                "enterpriseToEbitda": info.get("enterpriseToEbitda"),
                
                # Fundamentals
                "revenue": info.get("totalRevenue"),
                "revenueGrowth": info.get("revenueGrowth"),
                "grossMargin": info.get("grossMargins"),
                "operatingMargin": info.get("operatingMargins"),
                "profitMargin": info.get("profitMargins"),
                "eps": info.get("trailingEps"),
                "forwardEps": info.get("forwardEps"),
                "roe": info.get("returnOnEquity"),
                "roa": info.get("returnOnAssets"),
                "debtToEquity": info.get("debtToEquity"),
                "currentRatio": info.get("currentRatio"),
                "quickRatio": info.get("quickRatio"),
                "freeCashflow": info.get("freeCashflow"),
                
                # Dividends
                "dividendYield": info.get("dividendYield"),
                "dividendRate": info.get("dividendRate"),
                "payoutRatio": info.get("payoutRatio"),
                
                # Analyst targets
                "targetHighPrice": info.get("targetHighPrice"),
                "targetLowPrice": info.get("targetLowPrice"),
                "targetMeanPrice": info.get("targetMeanPrice"),
                "recommendationKey": info.get("recommendationKey"),
                "numberOfAnalystOpinions": info.get("numberOfAnalystOpinions"),
                
                "lastUpdated": str(pd.Timestamp.now()),
            }
            
            # Generate insights from fundamentals
            result["insights"] = self._generate_insights(result)
            
            # Cache for 5 minutes (fundamentals don't change often)
            await self.redis.set(cache_key, json.dumps(result), ex=300)
            return result
            
        except Exception as e:
            print(f"Error fetching stock info for {ticker}: {e}")
            return None

    def _generate_insights(self, data: dict) -> List[dict]:
        """
        Generate automatic fundamental analysis insights.
        Returns list of insights with type (positive/warning/info), title, and description.
        
        Implements 3 layers:
        1. Universal Red/Green Flags
        2. Contextual Combinations
        3. Sector-Specific Rules
        """
        insights = []
        sector = data.get("sector") or ""
        
        # ============================================================
        # SECTOR RULES CONFIGURATION
        # ============================================================
        # Each sector has different "normal" thresholds
        
        SECTOR_RULES = {
            "Technology": {
                "debt_equity_warning": 80,      # Tech should have low debt
                "debt_equity_ok": 50,
                "gross_margin_warning": 30,     # Tech needs high margins
                "gross_margin_good": 50,
                "pe_high": 40,                  # Higher P/E tolerated
                "pe_low": 15,
                "roe_good": 15,
                "ignore_debt": False,
                "ignore_pe": False,
                "sector_label": "technologickou",
            },
            "Financial Services": {
                "debt_equity_warning": 9999,    # Ignore - banks have deposits as "debt"
                "debt_equity_ok": 9999,
                "gross_margin_warning": 0,      # Not applicable
                "gross_margin_good": 0,
                "pe_high": 15,
                "pe_low": 8,
                "roe_good": 10,                 # 10% is already good for banks
                "ignore_debt": True,            # Don't warn about debt
                "ignore_pe": False,
                "pb_matters": True,             # Price/Book is key metric
                "pb_cheap": 1.0,
                "pb_expensive": 2.0,
                "sector_label": "finanční",
            },
            "Utilities": {
                "debt_equity_warning": 250,     # High debt is normal
                "debt_equity_ok": 150,
                "gross_margin_warning": 20,
                "gross_margin_good": 35,
                "pe_high": 25,
                "pe_low": 12,
                "roe_good": 8,
                "div_yield_expected": 0.03,     # Expect >3% dividend
                "ignore_debt": False,
                "ignore_pe": False,
                "sector_label": "utility",
            },
            "Energy": {
                "debt_equity_warning": 200,     # Capital intensive
                "debt_equity_ok": 100,
                "gross_margin_warning": 15,
                "gross_margin_good": 30,
                "pe_high": 20,
                "pe_low": 8,
                "roe_good": 10,
                "div_yield_expected": 0.03,
                "ignore_debt": False,
                "ignore_pe": False,
                "sector_label": "energetickou",
            },
            "Real Estate": {
                "debt_equity_warning": 150,
                "debt_equity_ok": 100,
                "gross_margin_warning": 0,
                "gross_margin_good": 0,
                "pe_high": 50,                  # P/E often inflated due to depreciation
                "pe_low": 15,
                "roe_good": 5,
                "div_yield_expected": 0.04,     # REITs should have high yield
                "ignore_debt": False,
                "ignore_pe": True,              # P/E is misleading for REITs
                "payout_ratio_ok": 1.5,         # REITs can have >100% payout
                "sector_label": "nemovitostní",
            },
            "Healthcare": {
                "debt_equity_warning": 100,
                "debt_equity_ok": 60,
                "gross_margin_warning": 30,
                "gross_margin_good": 50,
                "pe_high": 35,
                "pe_low": 15,
                "roe_good": 12,
                "ignore_debt": False,
                "ignore_pe": False,
                "sector_label": "zdravotnickou",
            },
            "Consumer Cyclical": {
                "debt_equity_warning": 120,
                "debt_equity_ok": 80,
                "gross_margin_warning": 25,
                "gross_margin_good": 40,
                "pe_high": 25,
                "pe_low": 12,
                "roe_good": 12,
                "ignore_debt": False,
                "ignore_pe": False,
                "sector_label": "spotřebitelskou cyklickou",
            },
            "Consumer Defensive": {
                "debt_equity_warning": 100,
                "debt_equity_ok": 60,
                "gross_margin_warning": 25,
                "gross_margin_good": 40,
                "pe_high": 25,
                "pe_low": 15,
                "roe_good": 15,
                "div_yield_expected": 0.02,
                "ignore_debt": False,
                "ignore_pe": False,
                "sector_label": "spotřebitelskou defenzivní",
            },
            "Industrials": {
                "debt_equity_warning": 120,
                "debt_equity_ok": 80,
                "gross_margin_warning": 20,
                "gross_margin_good": 35,
                "pe_high": 25,
                "pe_low": 12,
                "roe_good": 12,
                "ignore_debt": False,
                "ignore_pe": False,
                "sector_label": "průmyslovou",
            },
            "Basic Materials": {
                "debt_equity_warning": 100,
                "debt_equity_ok": 60,
                "gross_margin_warning": 15,
                "gross_margin_good": 30,
                "pe_high": 20,
                "pe_low": 10,
                "roe_good": 10,
                "ignore_debt": False,
                "ignore_pe": False,
                "sector_label": "materiálovou",
            },
            "Communication Services": {
                "debt_equity_warning": 150,
                "debt_equity_ok": 100,
                "gross_margin_warning": 30,
                "gross_margin_good": 50,
                "pe_high": 30,
                "pe_low": 12,
                "roe_good": 12,
                "ignore_debt": False,
                "ignore_pe": False,
                "sector_label": "komunikační",
            },
        }
        
        # Default rules for unknown sectors
        DEFAULT_RULES = {
            "debt_equity_warning": 150,
            "debt_equity_ok": 100,
            "gross_margin_warning": 20,
            "gross_margin_good": 40,
            "pe_high": 30,
            "pe_low": 15,
            "roe_good": 15,
            "ignore_debt": False,
            "ignore_pe": False,
            "sector_label": "",
        }
        
        rules = SECTOR_RULES.get(sector, DEFAULT_RULES)
        
        # Helper to safely get numeric values
        def get_num(key: str) -> Optional[float]:
            val = data.get(key)
            return float(val) if val is not None else None
        
        # ============================================================
        # LAYER 1: UNIVERSAL RED FLAGS (with sector adjustments)
        # ============================================================
        
        # Liquidity risk (universal - always matters)
        current_ratio = get_num("currentRatio")
        if current_ratio is not None and current_ratio < 1.0:
            insights.append({
                "type": "warning",
                "title": "Riziko likvidity",
                "description": f"Current Ratio je {current_ratio:.2f}, což je pod 1.0. Firma může mít problémy splácet krátkodobé závazky.",
            })
        
        # High debt (sector-adjusted)
        debt_equity = get_num("debtToEquity")
        if not rules.get("ignore_debt", False):
            if debt_equity is not None and debt_equity > rules["debt_equity_warning"]:
                sector_context = f" pro {rules['sector_label']} firmu" if rules.get("sector_label") else ""
                insights.append({
                    "type": "warning",
                    "title": "Vysoké zadlužení",
                    "description": f"Debt/Equity je {debt_equity:.0f}%, což je vysoké{sector_context}. Limit pro tento sektor je {rules['debt_equity_warning']:.0f}%.",
                })
        
        # Unsustainable dividend (sector-adjusted for REITs)
        payout_ratio = get_num("payoutRatio")
        payout_limit = rules.get("payout_ratio_ok", 1.0)
        if payout_ratio is not None and payout_ratio > payout_limit:
            if sector == "Real Estate":
                # For REITs, only warn if extremely high
                if payout_ratio > 1.5:
                    insights.append({
                        "type": "warning",
                        "title": "Extrémně vysoký payout",
                        "description": f"Payout Ratio je {payout_ratio * 100:.0f}%. I pro REIT je to neobvykle vysoké.",
                    })
            else:
                insights.append({
                    "type": "warning",
                    "title": "Neudržitelná dividenda",
                    "description": f"Payout Ratio je {payout_ratio * 100:.0f}%. Firma vyplácí více na dividendách, než vydělává.",
                })
        
        # Negative EPS (universal)
        eps = get_num("eps")
        if eps is not None and eps < 0:
            insights.append({
                "type": "warning",
                "title": "Ztrátová společnost",
                "description": f"EPS je {eps:.2f}. Firma aktuálně negeneruje zisk.",
            })
        
        # Negative FCF (universal)
        fcf = get_num("freeCashflow")
        if fcf is not None and fcf < 0:
            insights.append({
                "type": "warning",
                "title": "Záporný cash flow",
                "description": "Free Cash Flow je záporný. Firma spotřebovává hotovost.",
            })
        
        # Declining revenue (universal)
        rev_growth = get_num("revenueGrowth")
        if rev_growth is not None and rev_growth < -0.05:
            insights.append({
                "type": "warning",
                "title": "Klesající tržby",
                "description": f"Tržby klesly o {abs(rev_growth * 100):.1f}% meziročně.",
            })
        
        # Low gross margin for sector (sector-specific)
        gross_margin = get_num("grossMargin")
        if gross_margin is not None and rules["gross_margin_warning"] > 0:
            if gross_margin < rules["gross_margin_warning"] / 100:
                sector_context = f" pro {rules['sector_label']} firmu" if rules.get("sector_label") else ""
                insights.append({
                    "type": "warning",
                    "title": "Nízká hrubá marže",
                    "description": f"Gross Margin {gross_margin * 100:.1f}% je nízká{sector_context}. Očekává se alespoň {rules['gross_margin_warning']}%.",
                })
        
        # ============================================================
        # LAYER 1: UNIVERSAL GREEN FLAGS (with sector adjustments)
        # ============================================================
        
        # PEG undervalued (universal)
        peg = get_num("pegRatio")
        if peg is not None and 0 < peg < 1.0:
            insights.append({
                "type": "positive",
                "title": "Podhodnocené vzhledem k růstu",
                "description": f"PEG Ratio je {peg:.2f}. Akcie je levná vzhledem k očekávanému růstu (PEG < 1).",
            })
        
        # Excellent ROE (sector-adjusted)
        roe = get_num("roe")
        roe_threshold = rules.get("roe_good", 15) / 100
        if roe is not None and roe > roe_threshold:
            sector_context = f" pro {rules['sector_label']} sektor" if rules.get("sector_label") else ""
            insights.append({
                "type": "positive",
                "title": "Silná návratnost kapitálu",
                "description": f"ROE je {roe * 100:.1f}%, což překračuje {rules['roe_good']}% (dobré{sector_context}).",
            })
        
        # High gross margin (sector-adjusted)
        if gross_margin is not None and rules["gross_margin_good"] > 0:
            if gross_margin > rules["gross_margin_good"] / 100:
                insights.append({
                    "type": "positive",
                    "title": "Silná hrubá marže",
                    "description": f"Gross Margin {gross_margin * 100:.1f}% je nad očekávanou úrovní {rules['gross_margin_good']}% pro tento sektor.",
                })
        
        # Strong liquidity (universal)
        if current_ratio is not None and current_ratio > 2.0:
            insights.append({
                "type": "positive",
                "title": "Silná likvidita",
                "description": f"Current Ratio je {current_ratio:.2f}. Robustní finanční polštář.",
            })
        
        # Low debt for sector
        if not rules.get("ignore_debt", False):
            if debt_equity is not None and 0 <= debt_equity < rules["debt_equity_ok"]:
                insights.append({
                    "type": "positive",
                    "title": "Konzervativní zadlužení",
                    "description": f"Debt/Equity {debt_equity:.0f}% je pod bezpečnou hranicí {rules['debt_equity_ok']}% pro tento sektor.",
                })
        
        # Strong growth (universal)
        if rev_growth is not None and rev_growth > 0.20:
            insights.append({
                "type": "positive",
                "title": "Silný růst tržeb",
                "description": f"Tržby rostou o {rev_growth * 100:.1f}% meziročně.",
            })
        
        # ============================================================
        # LAYER 2: CONTEXTUAL COMBINATIONS
        # ============================================================
        
        trailing_pe = get_num("trailingPE")
        forward_pe = get_num("forwardPE")
        
        # Earnings growth expected
        if trailing_pe is not None and forward_pe is not None and forward_pe < trailing_pe * 0.85:
            insights.append({
                "type": "positive",
                "title": "Očekávaný růst zisků",
                "description": f"Forward P/E ({forward_pe:.1f}) je nižší než Trailing P/E ({trailing_pe:.1f}). Očekává se růst.",
            })
        
        # Earnings decline expected
        if trailing_pe is not None and forward_pe is not None and forward_pe > trailing_pe * 1.15:
            insights.append({
                "type": "warning",
                "title": "Očekávaný pokles zisků",
                "description": f"Forward P/E ({forward_pe:.1f}) je vyšší než Trailing P/E ({trailing_pe:.1f}). Očekává se pokles.",
            })
        
        # P/E analysis (sector-adjusted, skip for REITs)
        if not rules.get("ignore_pe", False) and trailing_pe is not None:
            if trailing_pe > rules["pe_high"] and (rev_growth is None or rev_growth < 0.15):
                insights.append({
                    "type": "warning",
                    "title": "Vysoká valuace",
                    "description": f"P/E {trailing_pe:.1f} je nad {rules['pe_high']} (běžné pro {sector or 'tento sektor'}) bez odpovídajícího růstu.",
                })
            elif 0 < trailing_pe < rules["pe_low"] and (rev_growth is None or rev_growth > 0):
                insights.append({
                    "type": "positive",
                    "title": "Nízká valuace",
                    "description": f"P/E {trailing_pe:.1f} je pod {rules['pe_low']}. Může být podhodnocená.",
                })
        
        # Healthy dividend (universal)
        div_yield = get_num("dividendYield")
        if div_yield is not None and div_yield > 0.02 and payout_ratio is not None and payout_ratio < 0.6:
            insights.append({
                "type": "positive",
                "title": "Zdravá dividenda",
                "description": f"Výnos {div_yield * 100:.2f}% s Payout Ratio {payout_ratio * 100:.0f}%. Udržitelná s prostorem pro růst.",
            })
        
        # Strong profitability combo (universal)
        op_margin = get_num("operatingMargin")
        if op_margin is not None and op_margin > 0.25 and roe is not None and roe > 0.15:
            insights.append({
                "type": "positive",
                "title": "Kvalitní business model",
                "description": f"Operating Margin {op_margin * 100:.1f}% + ROE {roe * 100:.1f}% = konkurenční výhoda.",
            })
        
        # ============================================================
        # LAYER 2b: ADDITIONAL METRICS (not sector-specific)
        # ============================================================
        
        # Market Cap classification
        market_cap = get_num("marketCap")
        if market_cap is not None:
            if market_cap >= 200e9:  # $200B+
                insights.append({
                    "type": "info",
                    "title": "Mega Cap",
                    "description": f"Tržní kapitalizace ${market_cap/1e9:.0f}B. Jedna z největších firem na světě, vysoká stabilita.",
                })
            elif market_cap >= 10e9:  # $10B+
                insights.append({
                    "type": "info",
                    "title": "Large Cap",
                    "description": f"Tržní kapitalizace ${market_cap/1e9:.1f}B. Zavedená firma s nižší volatilitou.",
                })
            elif market_cap >= 2e9:  # $2B+
                insights.append({
                    "type": "info",
                    "title": "Mid Cap",
                    "description": f"Tržní kapitalizace ${market_cap/1e9:.1f}B. Růstový potenciál s přiměřeným rizikem.",
                })
            elif market_cap >= 300e6:  # $300M+
                insights.append({
                    "type": "info",
                    "title": "Small Cap",
                    "description": f"Tržní kapitalizace ${market_cap/1e6:.0f}M. Vyšší volatilita, ale růstový potenciál.",
                })
            else:
                insights.append({
                    "type": "warning",
                    "title": "Micro Cap",
                    "description": f"Tržní kapitalizace ${market_cap/1e6:.0f}M. Vysoké riziko, nízká likvidita.",
                })
        
        # EV/EBITDA analysis
        ev_ebitda = get_num("enterpriseToEbitda")
        if ev_ebitda is not None:
            if 0 < ev_ebitda < 8:
                insights.append({
                    "type": "positive",
                    "title": "Nízké EV/EBITDA",
                    "description": f"EV/EBITDA je {ev_ebitda:.1f}. Firma je levná z pohledu provozního zisku.",
                })
            elif ev_ebitda > 20:
                insights.append({
                    "type": "warning",
                    "title": "Vysoké EV/EBITDA",
                    "description": f"EV/EBITDA je {ev_ebitda:.1f}. Drahá valuace, očekává se vysoký růst.",
                })
        
        # Profit Margin analysis
        profit_margin = get_num("profitMargin")
        if profit_margin is not None:
            if profit_margin > 0.25:
                insights.append({
                    "type": "positive",
                    "title": "Vynikající čistá marže",
                    "description": f"Profit Margin {profit_margin * 100:.1f}% je špičková. Firma má silnou cenovou sílu.",
                })
            elif profit_margin < 0.05 and profit_margin > 0:
                insights.append({
                    "type": "warning",
                    "title": "Nízká čistá marže",
                    "description": f"Profit Margin {profit_margin * 100:.1f}% je slabá. Malý prostor pro chyby.",
                })
        
        # Quick Ratio (stricter than Current Ratio)
        quick_ratio = get_num("quickRatio")
        if quick_ratio is not None:
            if quick_ratio < 0.5:
                insights.append({
                    "type": "warning",
                    "title": "Nízká okamžitá likvidita",
                    "description": f"Quick Ratio {quick_ratio:.2f} je pod 0.5. Bez zásob má firma málo hotovosti.",
                })
            elif quick_ratio > 1.5:
                insights.append({
                    "type": "positive",
                    "title": "Silná okamžitá likvidita",
                    "description": f"Quick Ratio {quick_ratio:.2f}. Dostatek hotovosti bez nutnosti prodeje zásob.",
                })
        
        # ROA analysis
        roa = get_num("roa")
        if roa is not None:
            if roa > 0.15:
                insights.append({
                    "type": "positive",
                    "title": "Vynikající ROA",
                    "description": f"Return on Assets {roa * 100:.1f}% překračuje 15%. Efektivní využití majetku.",
                })
            elif roa < 0.03 and roa > 0:
                insights.append({
                    "type": "warning",
                    "title": "Nízké ROA",
                    "description": f"Return on Assets {roa * 100:.1f}% je pod 3%. Neefektivní využití aktiv.",
                })
        
        # Volume analysis (unusual activity)
        volume = get_num("volume")
        avg_volume = get_num("avgVolume")
        if volume is not None and avg_volume is not None and avg_volume > 0:
            volume_ratio = volume / avg_volume
            if volume_ratio > 3:
                insights.append({
                    "type": "info",
                    "title": "Neobvykle vysoký objem",
                    "description": f"Dnešní objem je {volume_ratio:.1f}× vyšší než průměr. Zvýšený zájem investorů.",
                })
            elif volume_ratio < 0.3:
                insights.append({
                    "type": "info",
                    "title": "Nízký objem",
                    "description": f"Dnešní objem je jen {volume_ratio * 100:.0f}% průměru. Nízká aktivita.",
                })
        
        # EPS growth (TTM vs Forward)
        forward_eps = get_num("forwardEps")
        if eps is not None and forward_eps is not None and eps > 0:
            eps_growth = (forward_eps - eps) / eps
            if eps_growth > 0.20:
                insights.append({
                    "type": "positive",
                    "title": "Očekávaný růst EPS",
                    "description": f"Forward EPS ({forward_eps:.2f}) je o {eps_growth * 100:.0f}% vyšší než TTM ({eps:.2f}). Silný výhled.",
                })
            elif eps_growth < -0.15:
                insights.append({
                    "type": "warning",
                    "title": "Očekávaný pokles EPS",
                    "description": f"Forward EPS ({forward_eps:.2f}) je o {abs(eps_growth) * 100:.0f}% nižší než TTM ({eps:.2f}). Slabý výhled.",
                })
        
        # P/S analysis
        ps = get_num("priceToSales")
        if ps is not None:
            if 0 < ps < 1:
                insights.append({
                    "type": "positive",
                    "title": "Nízké P/S",
                    "description": f"Price/Sales {ps:.2f} je pod 1. Velmi levně oceněná firma vůči tržbám.",
                })
            elif ps > 15:
                insights.append({
                    "type": "warning",
                    "title": "Vysoké P/S",
                    "description": f"Price/Sales {ps:.1f} je nad 15. Vysoká očekávání růstu tržeb.",
                })
        
        # ============================================================
        # LAYER 3: SECTOR-SPECIFIC INSIGHTS
        # ============================================================
        
        # Financial Services: P/B analysis
        if sector == "Financial Services" and rules.get("pb_matters"):
            pb = get_num("priceToBook")
            if pb is not None:
                if pb < rules["pb_cheap"]:
                    insights.append({
                        "type": "positive",
                        "title": "Levná finanční firma",
                        "description": f"P/B je {pb:.2f}, pod 1.0. Obchoduje se pod účetní hodnotou.",
                    })
                elif pb > rules["pb_expensive"]:
                    insights.append({
                        "type": "info",
                        "title": "Dražší finanční firma",
                        "description": f"P/B je {pb:.2f}, nad 2.0. Premium valuace pro finanční sektor.",
                    })
        
        # Utilities/Energy: Expected dividend
        expected_div = rules.get("div_yield_expected")
        if expected_div and div_yield is not None:
            if div_yield < expected_div:
                insights.append({
                    "type": "info",
                    "title": "Nízká dividenda pro sektor",
                    "description": f"Dividendový výnos {div_yield * 100:.2f}% je pod očekávanou úrovní {expected_div * 100:.0f}% pro {sector}.",
                })
            elif div_yield > expected_div * 1.5:
                insights.append({
                    "type": "positive",
                    "title": "Nadprůměrná dividenda",
                    "description": f"Dividendový výnos {div_yield * 100:.2f}% výrazně překračuje očekávání pro {sector}.",
                })
        
        # Real Estate: Warn about P/E being misleading
        if sector == "Real Estate" and trailing_pe is not None:
            insights.append({
                "type": "info",
                "title": "P/E není vhodná metrika",
                "description": "Pro REITs je P/E zkresleno odpisy. Použijte FFO nebo P/FFO pro správné hodnocení.",
            })
        
        return insights

    async def _get_raw_history_with_indicators(self, ticker: str) -> Optional[pd.DataFrame]:
        """
        L1 Cache: Get raw 2-year history with all indicators calculated.
        Cached for 1 hour to minimize yfinance calls.
        
        Returns DataFrame with all indicator columns, or None if not available.
        """
        cache_key = f"raw_technical:{ticker}"
        cached = await self.redis.get(cache_key)
        
        if cached:
            # Reconstruct DataFrame from cached JSON
            data = json.loads(cached)
            df = pd.DataFrame(data)
            # Handle mixed timezone issue by converting to UTC
            df['date'] = pd.to_datetime(df['date'], utc=True)
            return df
        
        try:
            t = yf.Ticker(ticker)
            # Get 2 years of history (need ~250 days for SMA200)
            hist = t.history(period="2y", interval="1d")
            
            if hist.empty or len(hist) < 50:
                return None
            
            df = hist.copy()
            df = df.reset_index()
            df.columns = df.columns.str.lower()
            
            # Rename 'date' column if needed
            if 'date' not in df.columns and 'datetime' not in df.columns:
                df = df.rename(columns={df.columns[0]: 'date'})
            
            # ============================================================
            # CALCULATE ALL INDICATORS
            # ============================================================
            
            # SMA (Simple Moving Average)
            df['sma50'] = df['close'].rolling(window=50).mean()
            df['sma200'] = df['close'].rolling(window=200).mean()
            
            # RSI (Relative Strength Index)
            delta = df['close'].diff()
            gain = delta.where(delta > 0, 0).rolling(window=14).mean()
            loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
            rs = gain / loss.replace(0, float('nan'))
            df['rsi14'] = 100 - (100 / (1 + rs))
            
            # MACD (Moving Average Convergence Divergence)
            ema12 = df['close'].ewm(span=12, adjust=False).mean()
            ema26 = df['close'].ewm(span=26, adjust=False).mean()
            df['macd'] = ema12 - ema26
            df['macd_signal'] = df['macd'].ewm(span=9, adjust=False).mean()
            df['macd_histogram'] = df['macd'] - df['macd_signal']
            
            # Bollinger Bands
            df['bb_middle'] = df['close'].rolling(window=20).mean()
            bb_std = df['close'].rolling(window=20).std()
            df['bb_upper'] = df['bb_middle'] + (bb_std * 2)
            df['bb_lower'] = df['bb_middle'] - (bb_std * 2)
            
            # Stochastic Oscillator
            low14 = df['low'].rolling(window=14).min()
            high14 = df['high'].rolling(window=14).max()
            df['stoch_k'] = 100 * ((df['close'] - low14) / (high14 - low14))
            df['stoch_d'] = df['stoch_k'].rolling(window=3).mean()
            
            # ATR (Average True Range)
            tr1 = df['high'] - df['low']
            tr2 = (df['high'] - df['close'].shift()).abs()
            tr3 = (df['low'] - df['close'].shift()).abs()
            tr = pd.concat([tr1, tr2, tr3], axis=1).max(axis=1)
            df['atr14'] = tr.rolling(window=14).mean()
            df['atr_percent'] = (df['atr14'] / df['close']) * 100
            
            # OBV (On-Balance Volume)
            obv = [0]
            for i in range(1, len(df)):
                if df['close'].iloc[i] > df['close'].iloc[i-1]:
                    obv.append(obv[-1] + df['volume'].iloc[i])
                elif df['close'].iloc[i] < df['close'].iloc[i-1]:
                    obv.append(obv[-1] - df['volume'].iloc[i])
                else:
                    obv.append(obv[-1])
            df['obv'] = obv
            df['obv_sma'] = df['obv'].rolling(window=20).mean()
            
            # ADX (Average Directional Index)
            plus_dm = df['high'].diff()
            minus_dm = df['low'].shift() - df['low']
            plus_dm = plus_dm.where((plus_dm > minus_dm) & (plus_dm > 0), 0)
            minus_dm = minus_dm.where((minus_dm > plus_dm) & (minus_dm > 0), 0)
            
            atr14_for_adx = tr.rolling(window=14).mean()
            plus_di = 100 * (plus_dm.rolling(window=14).mean() / atr14_for_adx)
            minus_di = 100 * (minus_dm.rolling(window=14).mean() / atr14_for_adx)
            dx = 100 * (abs(plus_di - minus_di) / (plus_di + minus_di))
            df['adx'] = dx.rolling(window=14).mean()
            df['plus_di'] = plus_di
            df['minus_di'] = minus_di
            
            # Volume analysis
            df['volume_sma20'] = df['volume'].rolling(window=20).mean()
            
            # ============================================================
            # CACHE RAW DATA (1 hour TTL)
            # ============================================================
            
            # Convert to JSON-serializable format
            df_for_cache = df.copy()
            df_for_cache['date'] = df_for_cache['date'].astype(str)
            cache_data = df_for_cache.to_dict(orient='records')
            
            # Cache for 1 hour (3600 seconds)
            await self.redis.set(cache_key, json.dumps(cache_data), ex=3600)
            
            return df
            
        except Exception as e:
            print(f"Error fetching raw history for {ticker}: {e}")
            import traceback
            traceback.print_exc()
            return None

    async def get_technical_indicators(self, ticker: str, period: str = "1y") -> Optional[dict]:
        """
        Calculate technical indicators for a stock.
        Returns current values and historical data for charts.
        
        Uses 2-layer caching:
        - L1: Raw 2y history with indicators (1 hour TTL) - saves yfinance calls
        - L2: Filtered result per period (5 min TTL) - fast response
        
        Indicators:
        - SMA (50, 200)
        - RSI (14)
        - MACD (12, 26, 9)
        - Bollinger Bands (20, 2)
        - Stochastic (14, 3, 3)
        - ATR (14)
        - OBV
        - ADX (14)
        """
        # L2 Cache: Check for pre-computed result for this period
        cache_key = f"technical:{ticker}:{period}"
        cached = await self.redis.get(cache_key)
        if cached:
            return json.loads(cached)

        try:
            # L1 Cache: Get raw data with all indicators (may be cached)
            df = await self._get_raw_history_with_indicators(ticker)
            
            if df is None or len(df) < 50:
                return None
            
            # ============================================================
            # FILTER DATA BY PERIOD
            # ============================================================
            
            period_days = {
                "1w": 7,
                "1mo": 30,
                "3mo": 90,
                "6mo": 180,
                "1y": 365,
                "2y": 730,
            }
            days = period_days.get(period, 365)
            df_filtered = df.tail(days).copy()
            
            # ============================================================
            # GET CURRENT VALUES
            # ============================================================
            
            last = df_filtered.iloc[-1]
            current_price = float(last['close']) if pd.notna(last['close']) else None
            
            def safe_float(val):
                return round(float(val), 4) if pd.notna(val) else None
            
            # Current indicator values
            current = {
                "ticker": ticker,
                "currentPrice": current_price,
                "sma50": safe_float(last['sma50']),
                "sma200": safe_float(last['sma200']),
                "rsi14": safe_float(last['rsi14']),
                "macd": safe_float(last['macd']),
                "macdSignal": safe_float(last['macd_signal']),
                "macdHistogram": safe_float(last['macd_histogram']),
                "bollingerUpper": safe_float(last['bb_upper']),
                "bollingerMiddle": safe_float(last['bb_middle']),
                "bollingerLower": safe_float(last['bb_lower']),
                "stochasticK": safe_float(last['stoch_k']),
                "stochasticD": safe_float(last['stoch_d']),
                "atr14": safe_float(last['atr14']),
                "atrPercent": safe_float(last['atr_percent']),
                "obv": safe_float(last['obv']),
                "adx": safe_float(last['adx']),
                "plusDI": safe_float(last['plus_di']),
                "minusDI": safe_float(last['minus_di']),
                "currentVolume": int(last['volume']) if pd.notna(last['volume']) else None,
                "avgVolume20": safe_float(last['volume_sma20']),
            }
            
            # Calculate derived values
            if current["currentPrice"] and current["sma50"]:
                current["priceVsSma50"] = round(
                    ((current["currentPrice"] - current["sma50"]) / current["sma50"]) * 100, 2
                )
            else:
                current["priceVsSma50"] = None
                
            if current["currentPrice"] and current["sma200"]:
                current["priceVsSma200"] = round(
                    ((current["currentPrice"] - current["sma200"]) / current["sma200"]) * 100, 2
                )
            else:
                current["priceVsSma200"] = None
            
            # Bollinger position (0-100, 0=lower band, 100=upper band)
            if current["bollingerUpper"] and current["bollingerLower"] and current["currentPrice"]:
                bb_range = current["bollingerUpper"] - current["bollingerLower"]
                if bb_range > 0:
                    current["bollingerPosition"] = round(
                        ((current["currentPrice"] - current["bollingerLower"]) / bb_range) * 100, 1
                    )
                else:
                    current["bollingerPosition"] = 50
            else:
                current["bollingerPosition"] = None
            
            # Volume change vs average
            if current["currentVolume"] and current["avgVolume20"]:
                current["volumeChange"] = round(
                    ((current["currentVolume"] - current["avgVolume20"]) / current["avgVolume20"]) * 100, 1
                )
            else:
                current["volumeChange"] = None
            
            # ============================================================
            # GENERATE SIGNALS
            # ============================================================
            
            signals = self._generate_technical_signals(current, df_filtered)
            current.update(signals)
            
            # ============================================================
            # BUILD HISTORY ARRAYS FOR CHARTS
            # ============================================================
            
            def format_date(dt):
                if hasattr(dt, 'isoformat'):
                    return dt.isoformat()
                return str(dt)
            
            # Price + SMA history
            price_history = []
            for _, row in df_filtered.iterrows():
                price_history.append({
                    "date": format_date(row['date']),
                    "price": safe_float(row['close']),
                    "sma50": safe_float(row['sma50']),
                    "sma200": safe_float(row['sma200']),
                })
            
            # MACD history
            macd_history = []
            for _, row in df_filtered.iterrows():
                macd_history.append({
                    "date": format_date(row['date']),
                    "macd": safe_float(row['macd']),
                    "signal": safe_float(row['macd_signal']),
                    "histogram": safe_float(row['macd_histogram']),
                })
            
            # Bollinger history
            bollinger_history = []
            for _, row in df_filtered.iterrows():
                bollinger_history.append({
                    "date": format_date(row['date']),
                    "price": safe_float(row['close']),
                    "upper": safe_float(row['bb_upper']),
                    "middle": safe_float(row['bb_middle']),
                    "lower": safe_float(row['bb_lower']),
                })
            
            # Stochastic history
            stochastic_history = []
            for _, row in df_filtered.iterrows():
                stochastic_history.append({
                    "date": format_date(row['date']),
                    "k": safe_float(row['stoch_k']),
                    "d": safe_float(row['stoch_d']),
                })
            
            # RSI history
            rsi_history = []
            for _, row in df_filtered.iterrows():
                rsi_history.append({
                    "date": format_date(row['date']),
                    "rsi": safe_float(row['rsi14']),
                })
            
            # Volume history
            volume_history = []
            for _, row in df_filtered.iterrows():
                avg_vol = safe_float(row['volume_sma20'])
                vol = int(row['volume']) if pd.notna(row['volume']) else 0
                volume_history.append({
                    "date": format_date(row['date']),
                    "volume": vol,
                    "avgVolume": avg_vol,
                    "isAboveAvg": vol > (avg_vol or 0) if avg_vol else False,
                })
            
            # ATR history
            atr_history = []
            for _, row in df_filtered.iterrows():
                atr_history.append({
                    "date": format_date(row['date']),
                    "atr": safe_float(row['atr14']),
                    "atrPercent": safe_float(row['atr_percent']),
                })
            
            # OBV history
            obv_history = []
            for _, row in df_filtered.iterrows():
                obv_history.append({
                    "date": format_date(row['date']),
                    "obv": safe_float(row['obv']),
                    "obvSma": safe_float(row['obv_sma']),
                })
            
            # ADX history
            adx_history = []
            for _, row in df_filtered.iterrows():
                adx_history.append({
                    "date": format_date(row['date']),
                    "adx": safe_float(row['adx']),
                    "plusDI": safe_float(row['plus_di']),
                    "minusDI": safe_float(row['minus_di']),
                })
            
            # ============================================================
            # BUILD RESULT
            # ============================================================
            
            result = {
                **current,
                "priceHistory": price_history,
                "macdHistory": macd_history,
                "bollingerHistory": bollinger_history,
                "stochasticHistory": stochastic_history,
                "rsiHistory": rsi_history,
                "volumeHistory": volume_history,
                "atrHistory": atr_history,
                "obvHistory": obv_history,
                "adxHistory": adx_history,
                "lastUpdated": str(pd.Timestamp.now()),
            }
            
            # Cache for 5 minutes
            await self.redis.set(cache_key, json.dumps(result), ex=300)
            return result
            
        except Exception as e:
            print(f"Error calculating technical indicators for {ticker}: {e}")
            import traceback
            traceback.print_exc()
            return None

    def _generate_technical_signals(self, current: dict, df: pd.DataFrame) -> dict:
        """
        Generate signal interpretations from technical indicators.
        """
        signals = {}
        
        # MACD Trend
        macd = current.get("macd")
        macd_signal = current.get("macdSignal")
        if macd is not None and macd_signal is not None:
            if macd > macd_signal:
                signals["macdTrend"] = "bullish"
            elif macd < macd_signal:
                signals["macdTrend"] = "bearish"
            else:
                signals["macdTrend"] = "neutral"
        else:
            signals["macdTrend"] = None
        
        # Bollinger Signal
        bb_pos = current.get("bollingerPosition")
        if bb_pos is not None:
            if bb_pos > 100:
                signals["bollingerSignal"] = "overbought"
            elif bb_pos < 0:
                signals["bollingerSignal"] = "oversold"
            else:
                signals["bollingerSignal"] = "neutral"
        else:
            signals["bollingerSignal"] = None
        
        # Stochastic Signal
        stoch_k = current.get("stochasticK")
        if stoch_k is not None:
            if stoch_k > 80:
                signals["stochasticSignal"] = "overbought"
            elif stoch_k < 20:
                signals["stochasticSignal"] = "oversold"
            else:
                signals["stochasticSignal"] = "neutral"
        else:
            signals["stochasticSignal"] = None
        
        # Volume Signal
        vol_change = current.get("volumeChange")
        if vol_change is not None:
            if vol_change > 50:
                signals["volumeSignal"] = "high"
            elif vol_change < -50:
                signals["volumeSignal"] = "low"
            else:
                signals["volumeSignal"] = "normal"
        else:
            signals["volumeSignal"] = None
        
        # ATR Signal (volatility)
        atr_pct = current.get("atrPercent")
        if atr_pct is not None:
            if atr_pct > 5:
                signals["atrSignal"] = "high"
            elif atr_pct < 2:
                signals["atrSignal"] = "low"
            else:
                signals["atrSignal"] = "normal"
        else:
            signals["atrSignal"] = None
        
        # OBV Trend (compare last value to 20-period SMA)
        obv = current.get("obv")
        if obv is not None and len(df) >= 20:
            obv_values = df['obv'].tail(20).tolist()
            obv_start = obv_values[0] if obv_values else 0
            obv_end = obv_values[-1] if obv_values else 0
            if obv_end > obv_start * 1.05:
                signals["obvTrend"] = "bullish"
            elif obv_end < obv_start * 0.95:
                signals["obvTrend"] = "bearish"
            else:
                signals["obvTrend"] = "neutral"
        else:
            signals["obvTrend"] = None
        
        # OBV Divergence (price up + OBV down = bearish, price down + OBV up = bullish)
        if len(df) >= 20:
            price_start = df['close'].iloc[-20] if pd.notna(df['close'].iloc[-20]) else None
            price_end = df['close'].iloc[-1] if pd.notna(df['close'].iloc[-1]) else None
            obv_start = df['obv'].iloc[-20] if pd.notna(df['obv'].iloc[-20]) else None
            obv_end = df['obv'].iloc[-1] if pd.notna(df['obv'].iloc[-1]) else None
            
            if all([price_start, price_end, obv_start, obv_end]):
                price_up = price_end > price_start
                obv_up = obv_end > obv_start
                
                if price_up and not obv_up:
                    signals["obvDivergence"] = "bearish"
                elif not price_up and obv_up:
                    signals["obvDivergence"] = "bullish"
                else:
                    signals["obvDivergence"] = None
            else:
                signals["obvDivergence"] = None
        else:
            signals["obvDivergence"] = None
        
        # ADX Signal (trend strength)
        adx = current.get("adx")
        if adx is not None:
            if adx >= 40:
                signals["adxSignal"] = "strong"
            elif adx >= 25:
                signals["adxSignal"] = "moderate"
            elif adx >= 20:
                signals["adxSignal"] = "weak"
            else:
                signals["adxSignal"] = "no-trend"
        else:
            signals["adxSignal"] = None
        
        # ADX Trend direction (+DI vs -DI)
        plus_di = current.get("plusDI")
        minus_di = current.get("minusDI")
        if plus_di is not None and minus_di is not None:
            if plus_di > minus_di * 1.1:
                signals["adxTrend"] = "bullish"
            elif minus_di > plus_di * 1.1:
                signals["adxTrend"] = "bearish"
            else:
                signals["adxTrend"] = "neutral"
        else:
            signals["adxTrend"] = None
        
        # Trend Signal (overall based on SMAs)
        price = current.get("currentPrice")
        sma50 = current.get("sma50")
        sma200 = current.get("sma200")
        
        if price and sma50 and sma200:
            price_above_50 = price > sma50
            price_above_200 = price > sma200
            golden_cross = sma50 > sma200
            
            if golden_cross and price_above_50 and price_above_200:
                signals["trendSignal"] = "strong_bullish"
                signals["trendDescription"] = "Golden Cross s cenou nad oběma průměry. Silný růstový trend."
            elif golden_cross and price_above_50:
                signals["trendSignal"] = "bullish"
                signals["trendDescription"] = "Golden Cross aktivní. Cena nad 50 DMA, vznikající uptrend."
            elif golden_cross:
                signals["trendSignal"] = "mixed"
                signals["trendDescription"] = "Golden Cross aktivní, ale cena pod průměry. Možná korekce."
            elif not golden_cross and not price_above_50 and not price_above_200:
                signals["trendSignal"] = "strong_bearish"
                signals["trendDescription"] = "Death Cross s cenou pod oběma průměry. Silný klesající trend."
            elif not golden_cross and not price_above_50:
                signals["trendSignal"] = "bearish"
                signals["trendDescription"] = "Death Cross aktivní. Cena pod 50 DMA, klesající trend."
            else:
                signals["trendSignal"] = "mixed"
                signals["trendDescription"] = "Protichůdné signály. Vyčkejte na jasný směr."
        else:
            signals["trendSignal"] = None
            signals["trendDescription"] = "Nedostatek dat pro určení trendu."
        
        return signals


# Singleton instance
settings = get_settings()
market_service = MarketDataService(redis_url=settings.redis_url)
