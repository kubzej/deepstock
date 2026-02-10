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


# ─── Fair Value / Valuation Models ────────────────────────────────────────────

# Sector-based typical P/E ranges for P/E-based valuation
SECTOR_PE_BENCHMARKS = {
    "Technology": {"low": 20, "mid": 28, "high": 35},
    "Communication Services": {"low": 16, "mid": 22, "high": 30},
    "Consumer Cyclical": {"low": 14, "mid": 20, "high": 28},
    "Consumer Defensive": {"low": 16, "mid": 22, "high": 26},
    "Healthcare": {"low": 16, "mid": 22, "high": 30},
    "Financial Services": {"low": 10, "mid": 14, "high": 18},
    "Industrials": {"low": 14, "mid": 18, "high": 24},
    "Energy": {"low": 8, "mid": 12, "high": 18},
    "Utilities": {"low": 14, "mid": 18, "high": 22},
    "Basic Materials": {"low": 10, "mid": 15, "high": 20},
    "Real Estate": {"low": 14, "mid": 18, "high": 24},
}


def _graham_valuation(data: dict) -> Optional[dict]:
    """
    Benjamin Graham's intrinsic value formula:
    V = EPS × (8.5 + 2g) × 4.4 / Y
    where g = growth rate (%), Y = AAA bond yield
    
    Limitations (handled below):
    - Does NOT work for negative/very low EPS (skip if EPS < 1.0)
    - Unreliable for high-growth companies (>15% → low confidence)
    - Designed for stable, profitable value stocks
    - Y should ideally come from live bond data (FRED API), 
      currently approximated at 5% (US 10Y ~ 4-5% in 2025-2026)
    """
    eps = data.get("eps")
    forward_eps = data.get("forwardEps")
    price = data.get("price")
    earnings_growth = data.get("earningsGrowth")
    revenue_growth = data.get("revenueGrowth")
    
    # Skip: negative or very low EPS — Graham is meaningless here
    if not eps or eps < 1.0 or not price:
        return None
    
    # Estimate growth rate: prefer earnings growth, fallback to revenue growth
    growth = None
    if earnings_growth is not None and earnings_growth > 0:
        growth = earnings_growth * 100  # Convert to percentage
    elif forward_eps and eps and forward_eps > eps:
        growth = ((forward_eps / eps) - 1) * 100
    elif revenue_growth is not None and revenue_growth > 0:
        growth = revenue_growth * 100
    
    if growth is None or growth < 0:
        return None
    
    # Cap growth at 15% — Graham was designed for stable value stocks
    growth = min(growth, 15)
    
    # AAA corporate bond yield proxy
    # TODO: fetch dynamically from FRED API (series AAA or DGS10)
    bond_yield = 5.0
    
    fair_value = eps * (8.5 + 2 * growth) * 4.4 / bond_yield
    
    if fair_value <= 0:
        return None
    
    upside = ((fair_value / price) - 1) * 100
    
    # Sanity check: if fair value is more than 3× price, the formula
    # is giving unrealistic results (e.g. cheap P/E + high growth = nonsense)
    if upside > 200:
        return None
    
    # Lower confidence for higher growth (Graham was meant for g < 10%)
    confidence = "medium"
    if growth > 10:
        confidence = "low"
    
    return {
        "method": "Graham Formula",
        "description": "Grahamova formule: V = EPS × (8.5 + 2g) × 4.4/Y",
        "tooltip": "Klasická formule Benjamina Grahama (otce hodnotového investování). Ocení akcii na základě aktuálního zisku a očekávaného růstu. Nejlépe funguje pro stabilní, ziskové firmy s mírným růstem.",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "eps": round(eps, 2),
            "growthRate": round(growth, 1),
            "bondYield": bond_yield,
        },
        "confidence": confidence,
    }


def _dcf_valuation(data: dict) -> Optional[dict]:
    """
    Simplified DCF using Free Cash Flow per share.
    Projects FCF growth for 5 years, then terminal value with perpetuity growth.
    Discount rate = 10% (typical equity cost of capital).
    """
    fcf = data.get("freeCashflow")
    shares = data.get("sharesOutstanding")
    price = data.get("price")
    revenue_growth = data.get("revenueGrowth")
    earnings_growth = data.get("earningsGrowth")
    
    if not fcf or fcf <= 0 or not shares or shares <= 0 or not price:
        return None
    
    fcf_per_share = fcf / shares
    
    # Estimate growth: prefer earnings, fallback to revenue
    growth = None
    if earnings_growth is not None and earnings_growth > 0:
        growth = earnings_growth
    elif revenue_growth is not None and revenue_growth > 0:
        growth = revenue_growth
    
    if growth is None or growth <= 0:
        growth = 0.05  # Default 5%
    
    # Cap growth at 25%
    growth = min(growth, 0.25)
    
    discount_rate = 0.10
    terminal_growth = 0.03  # 3% perpetuity growth
    projection_years = 5
    
    # Project future FCF and discount back
    total_pv = 0
    projected_fcf = fcf_per_share
    for year in range(1, projection_years + 1):
        # Fade growth linearly toward terminal growth
        year_growth = growth - (growth - terminal_growth) * (year / projection_years)
        projected_fcf = projected_fcf * (1 + year_growth)
        pv = projected_fcf / ((1 + discount_rate) ** year)
        total_pv += pv
    
    # Terminal value (Gordon Growth Model)
    terminal_fcf = projected_fcf * (1 + terminal_growth)
    terminal_value = terminal_fcf / (discount_rate - terminal_growth)
    terminal_pv = terminal_value / ((1 + discount_rate) ** projection_years)
    
    fair_value = total_pv + terminal_pv
    
    if fair_value <= 0:
        return None
    
    upside = ((fair_value / price) - 1) * 100
    
    return {
        "method": "DCF (zjednodušený)",
        "description": f"Diskontované cash flow, {projection_years} let projekce, 10% diskont",
        "tooltip": "Diskontované cash flow — zlatý standard valuace. Projektuje budoucí volné peněžní toky firmy a diskontuje je na dnešní hodnotu. Čím víc firma generuje hotovosti, tím vyšší hodnota.",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "fcfPerShare": round(fcf_per_share, 2),
            "growthRate": round(growth * 100, 1),
            "discountRate": round(discount_rate * 100, 1),
            "terminalGrowth": round(terminal_growth * 100, 1),
        },
        "confidence": "medium",
    }


def _pe_based_valuation(data: dict) -> Optional[dict]:
    """
    Fair value based on sector P/E range applied to forward EPS.
    P/E is interpolated between sector low↔high based on company quality score.
    
    Quality score (0–1) considers:
    - ROE: >15% = good, >25% = great
    - Profit margin: >10% = good, >20% = great
    - Revenue growth: >5% = good, >15% = great
    - Debt/Equity: <50 = good, <20 = great
    """
    forward_eps = data.get("forwardEps")
    eps = data.get("eps")
    price = data.get("price")
    sector = data.get("sector")
    
    # Use forward EPS if available, otherwise trailing
    used_eps = forward_eps if forward_eps and forward_eps > 0 else eps
    if not used_eps or used_eps <= 0 or not price:
        return None
    
    benchmark = SECTOR_PE_BENCHMARKS.get(sector, {"low": 14, "mid": 18, "high": 24})
    
    # Calculate quality score (0–1) from available fundamentals
    scores = []
    
    roe = data.get("roe")
    if roe is not None:
        # 0% → 0, 15% → 0.5, 30%+ → 1.0
        scores.append(min(max(roe / 0.30, 0), 1.0))
    
    profit_margin = data.get("profitMargin")
    if profit_margin is not None:
        # 0% → 0, 10% → 0.5, 20%+ → 1.0
        scores.append(min(max(profit_margin / 0.20, 0), 1.0))
    
    revenue_growth = data.get("revenueGrowth")
    if revenue_growth is not None:
        # 0% → 0, 10% → 0.5, 20%+ → 1.0
        scores.append(min(max(revenue_growth / 0.20, 0), 1.0))
    
    debt_to_equity = data.get("debtToEquity")
    if debt_to_equity is not None:
        # 0 → 1.0, 50 → 0.5, 100+ → 0.0 (inverted — lower debt = better)
        scores.append(min(max(1.0 - debt_to_equity / 100, 0), 1.0))
    
    # Quality = average of available scores, default 0.5 if no data
    quality = sum(scores) / len(scores) if scores else 0.5
    
    # Interpolate P/E: low + quality × (high - low)
    fair_pe = benchmark["low"] + quality * (benchmark["high"] - benchmark["low"])
    fair_pe = round(fair_pe, 1)
    
    fair_value = used_eps * fair_pe
    
    if fair_value <= 0:
        return None
    
    upside = ((fair_value / price) - 1) * 100
    eps_type = "forward" if forward_eps and forward_eps > 0 else "trailing"
    
    # Better confidence when we have more quality signals
    confidence = "medium" if len(scores) >= 3 else "low"
    
    return {
        "method": "P/E sektorový",
        "description": f"P/E {fair_pe}× (rozsah {benchmark['low']}–{benchmark['high']}, kvalita {quality:.0%}) × {eps_type} EPS",
        "tooltip": "Porovnává P/E firmy s typickým rozsahem pro daný sektor. Férové P/E se odvozuje od kvality firmy (ROE, marže, růst, zadlužení) — lepší firma si zaslouží vyšší násobek.",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "eps": round(used_eps, 2),
            "epsType": eps_type,
            "sectorPE": fair_pe,
            "kvalita": f"{quality:.0%}",
            "sector": sector or "N/A",
        },
        "confidence": confidence,
    }


def _analyst_target_valuation(data: dict) -> Optional[dict]:
    """
    Uses analyst consensus target price.
    """
    target = data.get("targetMeanPrice")
    price = data.get("price")
    num_analysts = data.get("numberOfAnalystOpinions")
    target_high = data.get("targetHighPrice")
    target_low = data.get("targetLowPrice")
    
    if not target or not price:
        return None
    
    upside = ((target / price) - 1) * 100
    
    confidence = "low"
    if num_analysts and num_analysts >= 10:
        confidence = "high"
    elif num_analysts and num_analysts >= 5:
        confidence = "medium"
    
    return {
        "method": "Analytici (konsenzus)",
        "description": f"Průměrný cíl {num_analysts or '?'} analytiků",
        "tooltip": "Průměrná cílová cena analytiků z Wall Street. Čím více analytiků pokrývá akcii, tím spolehlivější konsenzus. Nezapomeňte, že analytici mají tendenci být optimističtí.",
        "fairValue": round(target, 2),
        "upside": round(upside, 1),
        "inputs": {
            "targetHigh": round(target_high, 2) if target_high else None,
            "targetLow": round(target_low, 2) if target_low else None,
            "numAnalysts": num_analysts,
            "recommendation": data.get("recommendationKey"),
        },
        "confidence": confidence,
    }


def _book_value_valuation(data: dict) -> Optional[dict]:
    """
    Fair value based on book value per share.
    Only useful for traditional asset-heavy industries where book value
    reflects real economic value (banks, insurance, REITs, utilities).
    Excluded: fintech, software, asset-light businesses.
    """
    book_value = data.get("bookValue")
    price = data.get("price")
    sector = data.get("sector")
    industry = data.get("industry") or ""
    
    if not book_value or book_value <= 0 or not price:
        return None
    
    # Only for sectors where book value matters
    pb_multiples = {
        "Financial Services": 1.3,
        "Real Estate": 1.2,
        "Basic Materials": 1.5,
        "Utilities": 1.6,
        "Energy": 1.4,
    }
    
    if sector not in pb_multiples:
        return None
    
    # Exclude asset-light / fintech industries within Financial Services
    excluded_industries = {
        "credit services", "financial data & stock exchanges",
        "financial conglomerates", "capital markets",
        "insurance - diversified", "insurance brokers",
        "software", "internet content & information",
    }
    if industry.lower() in excluded_industries:
        return None
    
    fair_pb = pb_multiples[sector]
    fair_value = book_value * fair_pb
    upside = ((fair_value / price) - 1) * 100
    
    return {
        "method": "Účetní hodnota",
        "description": f"Účetní hodnota × {fair_pb}× P/B (typický pro {sector})",
        "tooltip": "Ocenění na základě účetní hodnoty (aktiva minus závazky). Smysluplné hlavně pro banky, pojišťovny a firmy s velkými fyzickými aktivy. Pro technologické firmy je irelevantní.",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "bookValue": round(book_value, 2),
            "fairPB": fair_pb,
            "sector": sector,
        },
        "confidence": "low",
    }


def _ddm_valuation(data: dict) -> Optional[dict]:
    """
    Dividend Discount Model (Gordon Growth Model).
    V = D1 / (r - g)
    Only for stable dividend-paying stocks.
    """
    dividend = data.get("dividendRate")  # annual dividend per share
    payout_ratio = data.get("payoutRatio")
    earnings_growth = data.get("earningsGrowth")  # decimal
    price = data.get("price")

    if not dividend or dividend <= 0 or not price:
        return None

    # Need a reasonable payout ratio (not paying out more than earnings)
    if payout_ratio and payout_ratio > 1.0:
        return None

    # Dividend growth estimate: use earnings growth but cap conservatively
    if earnings_growth and earnings_growth > 0:
        div_growth = min(earnings_growth, 0.06)  # cap at 6%
    else:
        div_growth = 0.03  # default 3% for stable dividend payers

    # Cost of equity (discount rate) - simplified CAPM
    beta = data.get("beta") or 1.0
    risk_free = 0.04  # ~4% long-term treasury
    equity_premium = 0.05  # ~5% equity risk premium
    r = max(risk_free + beta * equity_premium, 0.08)  # floor at 8%

    # Gordon formula requires r > g
    if r <= div_growth + 0.01:
        return None

    d1 = dividend * (1 + div_growth)  # next year's dividend
    fair_value = d1 / (r - div_growth)

    # Sanity check
    upside = ((fair_value / price) - 1) * 100
    if upside > 200 or upside < -70:
        return None

    # Confidence: higher for stable low-growth dividend stocks
    dividend_yield = data.get("dividendYield") or 0
    if dividend_yield > 0.02 and div_growth <= 0.05 and payout_ratio and payout_ratio < 0.8:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "method": "Dividendový model",
        "description": f"Gordon Growth: D₁ ${d1:.2f} / ({r:.1%} − {div_growth:.1%})",
        "tooltip": "Gordonův dividendový model — oceňuje akcii jako součet všech budoucích dividend. Funguje nejlépe pro stabilní dividendové plátce (utility, consumer staples). Nezahrnuje růst ceny.",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "dividend": round(dividend, 2),
            "divGrowth": round(div_growth * 100, 1),
            "discountRate": round(r * 100, 1),
            "beta": round(beta, 2),
        },
        "confidence": confidence,
    }


def _ev_ebitda_valuation(data: dict) -> Optional[dict]:
    """
    EV/EBITDA-based fair value.
    Compares company's EV/EBITDA to sector typical range.
    More reliable than P/E — ignores capital structure and tax differences.
    """
    ev_ebitda = data.get("enterpriseToEbitda")
    enterprise_value = data.get("enterpriseValue")
    shares = data.get("sharesOutstanding")
    price = data.get("price")
    sector = data.get("sector")

    if not ev_ebitda or ev_ebitda <= 0 or not enterprise_value or not shares or not price:
        return None

    # Sector typical EV/EBITDA ranges
    sector_ev_ebitda = {
        "Technology": {"low": 12, "mid": 18, "high": 25},
        "Healthcare": {"low": 10, "mid": 15, "high": 22},
        "Financial Services": {"low": 6, "mid": 10, "high": 14},
        "Consumer Cyclical": {"low": 8, "mid": 12, "high": 18},
        "Consumer Defensive": {"low": 10, "mid": 14, "high": 18},
        "Industrials": {"low": 8, "mid": 12, "high": 17},
        "Energy": {"low": 4, "mid": 7, "high": 10},
        "Utilities": {"low": 8, "mid": 11, "high": 14},
        "Real Estate": {"low": 12, "mid": 16, "high": 22},
        "Basic Materials": {"low": 6, "mid": 9, "high": 13},
        "Communication Services": {"low": 8, "mid": 12, "high": 18},
    }

    benchmarks = sector_ev_ebitda.get(sector)
    if not benchmarks:
        return None

    # Calculate EBITDA from EV and multiple
    ebitda = enterprise_value / ev_ebitda

    # Fair EV/EBITDA = sector mid (could improve with quality score later)
    fair_multiple = benchmarks["mid"]
    fair_ev = ebitda * fair_multiple

    # Net debt = EV - market cap
    market_cap = price * shares
    net_debt = enterprise_value - market_cap

    # Fair equity value = fair EV - net debt
    fair_equity = fair_ev - net_debt
    fair_value = fair_equity / shares

    if fair_value <= 0:
        return None

    upside = ((fair_value / price) - 1) * 100

    # Sanity
    if upside > 200 or upside < -70:
        return None

    # Confidence based on how far current multiple is from normal range
    if benchmarks["low"] <= ev_ebitda <= benchmarks["high"]:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "method": "EV/EBITDA",
        "description": f"Aktuální {ev_ebitda:.1f}× vs. sektorový průměr {fair_multiple:.0f}×",
        "tooltip": "Porovnává hodnotu celé firmy (včetně dluhu) vůči provoznímu zisku před odpisy. Spolehlivější než P/E, protože eliminuje vliv kapitálové struktury a daní. Oblíbený nástroj M&A analytiků.",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "evEbitda": round(ev_ebitda, 1),
            "fairMultiple": fair_multiple,
            "ebitda": round(ebitda / 1e9, 2),
            "sector": sector,
        },
        "confidence": confidence,
    }


def _epv_valuation(data: dict) -> Optional[dict]:
    """
    Earnings Power Value (Bruce Greenwald).
    EPV = normalized EPS / cost of capital.
    Conservative "floor" value — assumes zero growth.
    """
    eps = data.get("eps")
    price = data.get("price")
    beta = data.get("beta") or 1.0

    if not eps or eps <= 0 or not price:
        return None

    # Cost of equity
    risk_free = 0.04
    equity_premium = 0.05
    r = max(risk_free + beta * equity_premium, 0.08)  # floor at 8%

    # EPV = EPS / r (perpetuity of current earnings, no growth)
    fair_value = eps / r

    if fair_value <= 0:
        return None

    upside = ((fair_value / price) - 1) * 100

    # This is a conservative floor — most growth stocks will show negative upside
    # Skip if too far below price (not useful signal)
    if upside < -60:
        return None

    # Always low-medium confidence (it's a floor estimate)
    confidence = "low"
    if -10 <= upside <= 30:
        confidence = "medium"  # near current price = earnings alone justify it

    return {
        "method": "Výnosová síla (EPV)",
        "description": f"EPS ${eps:.2f} / {r:.1%} náklad kapitálu (bez růstu)",
        "tooltip": "Výnosová síla dle Bruce Greenwalda — kolik firma stojí, kdyby její zisky nerostly. Konzervativní ‚podlaha' hodnoty. Pokud je cena pod EPV, trh oceňuje firmu pod její výdělečnou schopností.",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "eps": round(eps, 2),
            "costOfEquity": round(r * 100, 1),
            "beta": round(beta, 2),
        },
        "confidence": confidence,
    }


def _peg_valuation(data: dict) -> Optional[dict]:
    """
    PEG-based fair value (Peter Lynch).
    Fair P/E = expected earnings growth rate (in %).
    PEG = 1.0 means fairly valued.
    Works best for GARP stocks with 8-25% growth.
    """
    eps = data.get("eps")
    forward_pe = data.get("forwardPE")
    earnings_growth = data.get("earningsGrowth")  # decimal, e.g. 0.18
    price = data.get("price")

    if not eps or eps <= 0 or not price or not earnings_growth:
        return None

    growth_pct = earnings_growth * 100  # e.g. 18.3%

    # Only meaningful for moderate growth stocks (8-30%)
    if growth_pct < 8 or growth_pct > 30:
        return None

    # Fair P/E = growth rate (PEG = 1.0)
    fair_pe = growth_pct
    fair_value = eps * fair_pe

    # Sanity: skip if fair value is unreasonably low vs price
    upside = ((fair_value / price) - 1) * 100
    if upside < -60:
        return None

    # Confidence based on how reliable the growth estimate is
    actual_peg = forward_pe / growth_pct if forward_pe and growth_pct > 0 else None
    if 10 <= growth_pct <= 20:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "method": "PEG model",
        "description": f"P/E = růst zisku {growth_pct:.0f}% → férové P/E = {fair_pe:.1f}×",
        "tooltip": "Model Petera Lynche — akcie je férově oceněná, když P/E odpovídá tempu růstu zisku (PEG = 1). Praktický rychlý test pro růstové firmy. PEG pod 1 = levná, nad 2 = drahá.",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "eps": round(eps, 2),
            "growthPct": round(growth_pct, 1),
            "fairPE": round(fair_pe, 1),
            "actualPEG": round(actual_peg, 2) if actual_peg else None,
        },
        "confidence": confidence,
    }


def calculate_valuation(data: dict) -> dict:
    """
    Run all applicable valuation models and return composite result.
    """
    price = data.get("price")
    if not price:
        return {"models": [], "composite": None}
    
    models = []
    
    # Run each model, collect non-None results
    for model_fn in [
        _graham_valuation,
        _dcf_valuation,
        _pe_based_valuation,
        _peg_valuation,
        _ddm_valuation,
        _ev_ebitda_valuation,
        _epv_valuation,
        _analyst_target_valuation,
        _book_value_valuation,
    ]:
        try:
            result = model_fn(data)
            if result:
                models.append(result)
        except Exception as e:
            logger.warning(f"Valuation model error: {e}")
            continue
    
    if not models:
        return {"models": [], "composite": None}
    
    # Calculate composite fair value (weighted average)
    # Weights: high confidence = 3, medium = 2, low = 1
    confidence_weights = {"high": 3, "medium": 2, "low": 1}
    total_weight = 0
    weighted_sum = 0
    
    for m in models:
        w = confidence_weights.get(m["confidence"], 1)
        weighted_sum += m["fairValue"] * w
        total_weight += w
    
    composite_value = weighted_sum / total_weight if total_weight > 0 else None
    composite_upside = ((composite_value / price) - 1) * 100 if composite_value else None
    
    # Determine overall signal
    signal = "hold"
    if composite_upside is not None:
        if composite_upside > 20:
            signal = "undervalued"
        elif composite_upside > 5:
            signal = "slightly_undervalued"
        elif composite_upside < -20:
            signal = "overvalued"
        elif composite_upside < -5:
            signal = "slightly_overvalued"
        else:
            signal = "fair"
    
    composite = {
        "fairValue": round(composite_value, 2) if composite_value else None,
        "upside": round(composite_upside, 1) if composite_upside is not None else None,
        "signal": signal,
        "modelsUsed": len(models),
    }
    
    return {
        "models": models,
        "composite": composite,
        "currentPrice": price,
        "currency": data.get("currency", "USD"),
    }


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
            "bookValue": info.get("bookValue"),
            "sharesOutstanding": info.get("sharesOutstanding"),
            "earningsGrowth": info.get("earningsGrowth"),
            
            # Dividends
            "dividendYield": info.get("dividendYield"),
            "dividendRate": info.get("dividendRate"),
            "payoutRatio": info.get("payoutRatio"),
            "beta": info.get("beta"),
            
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
        
        # Calculate fair value estimates
        result["valuation"] = calculate_valuation(result)
        
        # Cache for 5 minutes (fundamentals don't change often)
        await redis.set(cache_key, json.dumps(result), ex=300)
        return result
        
    except Exception as e:
        logger.error(f"Error fetching stock info for {ticker}: {e}")
        return None
