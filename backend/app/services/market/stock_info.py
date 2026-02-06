"""
Stock info and fundamental insights generation
"""
import yfinance as yf
import pandas as pd
import json
import logging
from typing import List, Optional

logger = logging.getLogger(__name__)


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


def generate_insights(data: dict) -> List[dict]:
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


async def get_stock_info(redis, ticker: str) -> Optional[dict]:
    """
    Get detailed stock info including fundamentals and valuation metrics.
    Uses yfinance .info which includes everything we need.
    """
    cache_key = f"stock_info:{ticker}"
    cached = await redis.get(cache_key)
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
        result["insights"] = generate_insights(result)
        
        # Cache for 5 minutes (fundamentals don't change often)
        await redis.set(cache_key, json.dumps(result), ex=300)
        return result
        
    except Exception as e:
        logger.error(f"Error fetching stock info for {ticker}: {e}")
        return None
