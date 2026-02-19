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
        "payout_ratio_ok": 1.9,         # REITs can have >100% payout (aligned with DDM model)
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
            # For REITs, only warn if extremely high (>190% - same as DDM model)
            if payout_ratio > 1.9:
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
    
    # PEG analysis (universal)
    peg = get_num("pegRatio")
    if peg is not None:
        if 0 < peg < 1.0:
            insights.append({
                "type": "positive",
                "title": "Podhodnocené vzhledem k růstu",
                "description": f"PEG Ratio je {peg:.2f}. Akcie je levná vzhledem k očekávanému růstu (PEG < 1).",
            })
        elif peg > 2.0:
            insights.append({
                "type": "warning",
                "title": "Vysoký PEG Ratio",
                "description": f"PEG Ratio je {peg:.2f}. Drahá valuace vzhledem k růstu (PEG > 2 = přeplaceno).",
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
    
    # P/B analysis for asset-heavy sectors (Financial Services, Utilities, Energy, Materials, Industrials)
    pb = get_num("priceToBook")
    if pb is not None and sector in ["Financial Services", "Utilities", "Energy", "Basic Materials", "Industrials", "Real Estate"]:
        if sector == "Financial Services" and rules.get("pb_matters"):
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
        else:
            # Other asset-heavy sectors
            if pb < 1.0:
                insights.append({
                    "type": "positive",
                    "title": "Obchodování pod účetní hodnotou",
                    "description": f"P/B je {pb:.2f}. Akcie stojí méně než hodnota čistých aktiv (P/B < 1).",
                })
            elif sector == "Utilities" and pb > 2.5:
                insights.append({
                    "type": "info",
                    "title": "Vysoké P/B pro utility",
                    "description": f"P/B je {pb:.2f}. Premium valuace pro utility sektor.",
                })
            elif sector in ["Energy", "Basic Materials"] and pb > 2.5:
                insights.append({
                    "type": "warning",
                    "title": "Vysoké P/B pro cyklický sektor",
                    "description": f"P/B je {pb:.2f}. Může signalizovat vrchol cyklu.",
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
    Benjamin Graham's Revised Formula (1974):
    V = (EPS * (8.5 + 2g) * 4.4) / Y
    
    Where:
    - EPS: Trailing 12-month earnings per share
    - 8.5: P/E base for a no-growth company
    - g: Reasonably expected 7 to 10 year growth rate (%)
    - 4.4: The average yield of AAA corporate bonds in 1962
    - Y: The current yield of AAA corporate bonds (approx. 5.0%)
    
    Ref: https://www.grahamvalue.com/article/understanding-benjamin-graham-formula-correctly
    """
    eps = data.get("eps")
    forward_eps = data.get("forwardEps")
    price = data.get("price")
    earnings_growth = data.get("earningsGrowth") # YoY growth (volatile)
    
    # 1. Negative or zero earnings - formula invalid
    if not eps or eps <= 0 or not price:
        return None
        
    # 2. Determine Growth Rate (g)
    # Ideally we want long-term expected growth.
    # yfinance 'earningsGrowth' is usually quarterly YoY, which is too volatile for this formula.
    # We prefer implied growth from Forward EPS vs Trailing EPS as a smoother proxy.
    growth = None
    
    if forward_eps and forward_eps > eps:
        # Implied growth for next year
        growth_decimal = (forward_eps / eps) - 1
        growth = growth_decimal * 100
    elif earnings_growth is not None and earnings_growth > 0:
        # Fallback to YoY growth if forward not available
        growth = earnings_growth * 100
    else:
        # Conservative fallback for profitable companies with missing growth data
        growth = 3.0 
    
    # Cap growth at 15% - Graham warned against projecting high growth rates
    # for value investing. 15% is already very optimistic for 7-10y period.
    growth = min(growth, 15)
    
    # Floor growth at 0% - negative growth breaks the logic (though mathematically works)
    growth = max(growth, 0)
    
    # 3. Bond Yield (Y)
    # TODO: Fetch live AAA yield (e.g. Moody's Seasoned Aaa Corporate Bond Yield)
    bond_yield = 5.0
    
    # 4. Calculation
    # Formula: V = (EPS * (8.5 + 2g) * 4.4) / Y
    fair_value = (eps * (8.5 + 2 * growth) * 4.4) / bond_yield
    
    if fair_value <= 0:
        return None
    
    upside = ((fair_value / price) - 1) * 100
    
    # 5. Sanity Checks & Confidence
    
    # If upside is >200% (3x price), it's likely a data artifact (e.g. cyclical peak EPS)
    # unless it's a deep value play.
    if upside > 300: 
        return None
        
    # Graham formula is meant for defensive/stable companies.
    # If Beta is very high (>2.0), the company is likely too risky/volatile for this model.
    beta = data.get("beta")
    if beta and beta > 2.0:
        return None
        
    # Confidence scoring
    confidence = "medium"
    
    # Lower confidence if using aggressive growth assumptions
    if growth > 10:
        confidence = "low"
    
    # Lower confidence if Price is mismatched with "Value" sector traits
    # (e.g. P/E > 50 implies expectations way beyond Graham's model)
    pe = data.get("trailingPE")
    if pe and pe > 50:
        confidence = "low"

    return {
        "method": "Grahamovy formule",
        "description": f"Revidovaný vzorec (1974): V = (EPS * (8.5 + 2g) * 4.4) / {bond_yield}",
        "tooltip": "Klasická formule Benjamina Grahama pro 'vnitřní hodnotu'. Předpokládá, že férové P/E je 8.5 plus dvojnásobek růstu. Model je citlivý na úrokové sazby (Y). Vhodné pro ziskové, stabilní firmy.",
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
    Discounted Cash Flow (DCF).
    Projects Free Cash Flow (FCF) for 5 years and discounts to Present Value.
    
    Logic:
    1. Calculate FCF per Share.
    2. Estimate growth (g) from earnings/revenue estimates.
    3. Project 5 years with fading growth (linear decay to terminal rate).
    4. Calculate Terminal Value (Perpetuity Growth).
    5. Discount all to PV at Discount Rate (WACC proxy).
    
    Ref: https://www.investopedia.com/terms/d/dcf.asp
    """
    sector = data.get("sector")
    
    # 1. Applicability Check
    # DCF based on FCF is NOT valid for Financial Services (Banks/Insurance)
    # because their "operating cash flow" includes deposits/loans changes.
    # also tricky for Real Estate (REITs use FFO).
    if sector in ["Financial Services", "Real Estate"]:
        return None

    fcf = data.get("freeCashflow")
    shares = data.get("sharesOutstanding")
    price = data.get("price")
    revenue_growth = data.get("revenueGrowth")
    earnings_growth = data.get("earningsGrowth")
    beta = data.get("beta")
    
    # 2. Basic Data Validity
    if not fcf or fcf <= 0 or not shares or shares <= 0 or not price:
        return None
    
    fcf_per_share = fcf / shares
    
    # 3. Growth Assumptions
    # Growth estimate logic - needs to reflect the business reality
    # 
    # Problem: Companies like Amazon have low "earnings growth" (5%) but high "revenue growth" (13%)
    # because they reinvest profits into expansion. Using earnings growth would undervalue them.
    #
    # Solution: For growth-oriented sectors, prefer the HIGHER of the two growth rates.
    # For mature/value sectors, prefer earnings growth as it's more sustainable.
    
    growth_sectors = ["Technology", "Consumer Cyclical", "Communication Services", "Healthcare"]
    
    earnings_g = earnings_growth if earnings_growth and earnings_growth > 0 else None
    revenue_g = revenue_growth if revenue_growth and revenue_growth > 0 else None
    
    growth = None
    
    if sector in growth_sectors:
        # For growth sectors: use the higher of the two (reinvestment story)
        if earnings_g and revenue_g:
            growth = max(earnings_g, revenue_g)
        else:
            growth = earnings_g or revenue_g
    else:
        # For value/mature sectors: prefer earnings (more sustainable)
        if earnings_g:
            growth = earnings_g
        elif revenue_g:
            growth = revenue_g
    
    if growth is None:
        growth = 0.05  # Default fallback assumption
        
    # Cap overly optimistic growth rates
    # Even best companies rarely sustain >20% FCF growth for 5y + terminal
    growth = min(growth, 0.20)
    
    # Floor at 0 (simplified DCF doesn't handle shrinking firms well for this UI)
    growth = max(growth, 0)
    
    # 4. Discount Rate (r) needs to reflect risk
    # Standard: 10% (historical market return)
    # Adjusted: If beta is high, increase discount rate
    discount_rate = 0.10
    if beta and beta > 1.2:
        discount_rate = 0.12 # Higher risk = higher discount
    if beta and beta < 0.8:
        discount_rate = 0.08 # Defensive = lower discount
        
    terminal_growth = 0.03  # Long term GDP growth proxy
    projection_years = 5
    
    # 5. Calculation Loop
    total_pv = 0
    projected_fcf = fcf_per_share
    
    # "H-Model" style: Growth fades linearly from current 'growth' to 'terminal_growth' over the period
    # This prevents overvaluation of companies with temporarily high growth.
    for year in range(1, projection_years + 1):
        year_growth = growth - ((growth - terminal_growth) * (year / projection_years))
        projected_fcf = projected_fcf * (1 + year_growth)
        
        pv = projected_fcf / ((1 + discount_rate) ** year)
        total_pv += pv
    
    # Terminal Value (Gordon Growth Method) at end of year 5
    # Value_term = FCF_5 * (1+g_term) / (r - g_term)
    terminal_value = (projected_fcf * (1 + terminal_growth)) / (discount_rate - terminal_growth)
    
    # Discount Terminal Value back to today
    terminal_pv = terminal_value / ((1 + discount_rate) ** projection_years)
    
    fair_value = total_pv + terminal_pv
    
    if fair_value <= 0:
        return None
    
    upside = ((fair_value / price) - 1) * 100
    
    # 6. Sanity Checks
    if upside > 300: # Upside > 300% usually means bad data (e.g. one-off massive FCF)
        return None

    # Confidence scoring
    confidence = "medium"
    
    # High growth projections are risky
    if growth > 0.15:
        confidence = "low"
        
    return {
        "method": "DCF (Diskontované CF)",
        "description": f"Projekce FCF na {projection_years} let + terminální hodnota. Diskont {int(discount_rate*100)}%.",
        "tooltip": "Zlatý standard valuace. Počítá současnou hodnotu všech budoucích volných peněz, které firma vydělá. Nevhodné pro banky a pojišťovny.",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "fcfPerShare": round(fcf_per_share, 2),
            "growthRate": round(growth * 100, 1),
            "discountRate": round(discount_rate * 100, 1),
            "terminalGrowth": round(terminal_growth * 100, 1),
        },
        "confidence": confidence,
    }


def _pe_based_valuation(data: dict) -> Optional[dict]:
    """
    Fair value based on sector P/E range applied to forward EPS.
    
    Logic:
    1. Identify Sector (Tech, Finance, Energy...).
    2. Get target P/E range for that sector (Low, Mid, High).
    3. Calculate 'Quality Score' (0.0 to 1.0) for the company based on:
       - ROE, Margins, Growth, Debt.
    4. Interpolate Fair P/E: Low + Score * (High - Low).
    5. Fair Value = Fair P/E * Forward EPS.
    
    Ref: https://corporatefinanceinstitute.com/resources/valuation/price-earnings-ratio/
    """
    forward_eps = data.get("forwardEps")
    eps = data.get("eps")
    price = data.get("price")
    sector = data.get("sector")
    
    # 1. Applicability
    # Real Estate (REITs) usage FFO, not EPS. Net Income is distorted by depreciation.
    # P/E is misleading for them.
    if sector == "Real Estate":
        return None
        
    # Use forward EPS if available (markets look forward), otherwise trailing
    used_eps = forward_eps if forward_eps and forward_eps > 0 else eps
    
    if not used_eps or used_eps <= 0 or not price:
        return None
    
    benchmark = SECTOR_PE_BENCHMARKS.get(sector, {"low": 15, "mid": 20, "high": 25})
    
    # 2. Calculate Quality Score (0–1)
    # Higher score = company deserves to trade at top of sector P/E range
    scores = []
    
    roe = data.get("roe")
    if roe is not None:
        # ROE > 15% is healthy, > 30% is elite
        scores.append(min(max(roe / 0.30, 0), 1.0))
    
    profit_margin = data.get("profitMargin")
    if profit_margin is not None:
        # Net Margin > 10% is solid, > 20% is strong moat
        scores.append(min(max(profit_margin / 0.20, 0), 1.0))
    
    revenue_growth = data.get("revenueGrowth")
    if revenue_growth is not None:
        # Growth drives P/E expansion
        scores.append(min(max(revenue_growth / 0.20, 0), 1.0))
    
    debt_to_equity = data.get("debtToEquity")
    if debt_to_equity is not None:
        # For non-financials, lower debt is better.
        # Score 1.0 if debt is 0, Score 0.0 if debt is > 150%
        if sector != "Financial Services":
            scores.append(min(max(1.5 - (debt_to_equity / 100), 0), 1.0))
    
    # Quality = average of available scores, default 0.5 (Mid-range) if no data
    quality = sum(scores) / len(scores) if scores else 0.5
    
    # 3. Interpolate Fair P/E
    # fair_pe = low + quality * (range width)
    fair_pe = benchmark["low"] + quality * (benchmark["high"] - benchmark["low"])
    fair_pe = round(fair_pe, 1)
    
    fair_value = used_eps * fair_pe
    
    if fair_value <= 0:
        return None
    
    upside = ((fair_value / price) - 1) * 100
    eps_type = "Forward" if forward_eps and forward_eps > 0 else "Trailing"
    
    # Confidence
    confidence = "medium"
    if len(scores) < 3: 
        confidence = "low" # Not enough data to judge quality
    
    return {
        "method": "P/E sektorový",
        "description": f"Férové P/E {fair_pe}× (sektor {benchmark['low']}–{benchmark['high']}, kvalita {int(quality*100)}%) × {eps_type} EPS",
        "tooltip": "Srovnává firmu s typickými násobky v jejím sektoru. 'Lepší' firmy (vyšší ROE, marže, růst) si zaslouží ocenění na horní hraně sektoru, průměrné uprostřed. Nevhodné pro REITs (používají FFO).",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "eps": round(used_eps, 2),
            "fairPE": fair_pe,
            "qualityScore": round(quality, 2),
            "sector": sector or "Unknown"
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
    Price-to-Book (P/B) Valuation.
    Fair Value = Book Value per Share × Sector Fair P/B Multiple.
    
    Logic:
    Book Value = Total Assets - Total Liabilities (= Shareholder Equity).
    Book Value per Share = Equity / Shares Outstanding.
    
    P/B Ratio = Market Price / Book Value per Share.
    - P/B < 1.0 → Trading below net asset value (potential value opportunity).
    - P/B = 1.0 → Trading at book value.
    - P/B > 1.0 → Market expects growth or values intangibles.
    
    Applicability:
    - ✅ Banks, Insurance (P/B 0.8-1.5) - Assets are tangible, accurately valued.
    - ✅ Real Estate / REITs (P/B 0.9-1.5) - Book value = property holdings.
    - ✅ Utilities (P/B 1.3-2.0) - Infrastructure assets.
    - ✅ Manufacturing / Industrial (P/B 1.5-3.0) - Physical plants, equipment.
    - ❌ Technology / Software (P/B often >5) - Value is in IP, not balance sheet.
    - ❌ Services / Consulting - Value is in people and relationships.
    
    Ref: https://www.investopedia.com/terms/b/bookvalue.asp
    """
    book_value = data.get("bookValue")  # Book Value per Share from yfinance
    price_to_book = data.get("priceToBook")  # Current P/B ratio
    price = data.get("price")
    sector = data.get("sector", "")
    industry = data.get("industry", "")
    
    if not book_value or book_value <= 0 or not price:
        return None
    
    # 1. Sector P/B Benchmarks (Typical Range)
    # Source: Industry averages from CFI and Investopedia (2024-2025).
    sector_pb_benchmarks = {
        "Financial Services": {"low": 0.8, "mid": 1.2, "high": 1.5},
        "Real Estate": {"low": 0.9, "mid": 1.2, "high": 1.5},
        "Utilities": {"low": 1.3, "mid": 1.6, "high": 2.0},
        "Energy": {"low": 1.0, "mid": 1.4, "high": 2.0},
        "Basic Materials": {"low": 1.2, "mid": 1.5, "high": 2.0},
        "Industrials": {"low": 1.5, "mid": 2.2, "high": 3.0},
    }
    
    benchmark = sector_pb_benchmarks.get(sector)
    if not benchmark:
        # Book Value is not a reliable metric for this sector
        return None
    
    # 2. Exclude Asset-Light Industries within asset-heavy sectors
    # (e.g., Fintech within Financial Services should be excluded)
    excluded_keywords = [
        "software", "internet", "fintech", "data & stock exchanges",
        "capital markets", "insurance brokers", "consulting",
    ]
    if any(keyword in industry.lower() for keyword in excluded_keywords):
        return None
    
    # 3. Calculate Current P/B
    current_pb = price_to_book if price_to_book else (price / book_value)
    
    # 4. Exclude "growth" companies masquerading as traditional asset-heavy firms
    # Example: NU Holdings is classified as "Banks - Regional" but has P/B of 8×
    # That's a fintech/neobank, not a traditional bank where P/B valuation makes sense.
    # Rule: If P/B > 3× the sector's typical "high" range, model is not applicable.
    if current_pb > benchmark["high"] * 2.5:
        return None
    
    # 5. Fair P/B Multiple
    # Use sector median as fair value benchmark.
    fair_pb = benchmark["mid"]
    
    # 6. Calculate Fair Value
    fair_value = book_value * fair_pb
    
    if fair_value <= 0:
        return None
    
    upside = ((fair_value / price) - 1) * 100
    
    # 7. Confidence
    # Book Value is MOST reliable for Banks and Utilities (balance sheet = real value).
    # Less reliable for cyclical materials/energy (asset write-downs).
    confidence = "medium"
    
    if sector in ["Financial Services", "Utilities"]:
        confidence = "high"
    elif sector in ["Energy", "Basic Materials"]:
        # Cyclical sectors can have volatile asset values
        confidence = "low"
    
    # If P/B is somewhat outside typical range, reduce confidence
    if current_pb < benchmark["low"] * 0.5 or current_pb > benchmark["high"] * 2:
        confidence = "low"
    
    return {
        "method": "Účetní hodnota (P/B)",
        "description": f"BV ${book_value:.2f} × {fair_pb:.1f}× P/B. Aktuální P/B {current_pb:.1f}×.",
        "tooltip": (
            "Ocenění dle účetní hodnoty (čistá aktiva = Aktiva - Závazky). "
            "P/B < 1.0 znamená, že akcie stojí MÉNĚ než hodnota aktiv na akcii (potenciální příležitost). "
            "Smysluplné jen pro banky, pojišťovny, utility a průmysl. "
            "Pro technologie a služby je irelevantní (jejich hodnota je v IP a lidech, ne v rozvaze)."
        ),
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "bookValuePerShare": round(book_value, 2),
            "currentPB": round(current_pb, 2),
            "sectorFairPB": round(fair_pb, 1),
            "sectorPBRange": f"{benchmark['low']:.1f} - {benchmark['high']:.1f}"
        },
        "confidence": confidence,
    }


def _ddm_valuation(data: dict) -> Optional[dict]:
    """
    Dividend Discount Model (Gordon Growth Model).
    V = D1 / (r - g)
    
    Logic:
    Valuation based strictly on future dividend stream.
    Requires:
    - Stable dividend history.
    - Sustainable Payout Ratio (Net Income > Dividend).
    
    Ref: https://corporatefinanceinstitute.com/resources/valuation/gordon-growth-model/
    """
    dividend = data.get("dividendRate")  # annual dividend per share
    payout_ratio = data.get("payoutRatio")
    earnings_growth = data.get("earningsGrowth")
    beta = data.get("beta")
    sector = data.get("sector")
    price = data.get("price")

    if not dividend or dividend <= 0 or not price:
        return None

    # 1. Payout Ratio Sustainability Check
    # General Rule: Payout > 1.0 (100%) is unsustainable (paying more than earning).
    # Exception: REITs (Real Estate) often have Payout > 100% of Net Income due to depreciation,
    # but strictly speaking DDM works best on companies with EPS coverage.
    is_reit = sector == "Real Estate"
    safe_payout_limit = 1.9 if is_reit else 0.95
    
    if payout_ratio and payout_ratio > safe_payout_limit:
        # Dividend probably at risk of being cut
        return None

    # 2. Dividend Growth Estimate (g)
    # Conservative cap. Companies rarely grow dividend > 6% perpetuity.
    if earnings_growth and earnings_growth > 0:
        div_growth = min(earnings_growth, 0.06)
    else:
        # If no growth info, assume inflation-matching growth for payers
        div_growth = 0.025 

    # 3. Cost of Equity (r) via CAPM
    # r = RiskFree + Beta * EquityRiskPremium
    # Risk Free ~ 4.2% (10Y Treasury), Premium ~ 5.0%
    beta_val = beta if beta else 1.0
    risk_free = 0.042
    equity_premium = 0.05
    
    discount_rate = risk_free + (beta_val * equity_premium)
    
    # Floor discount rate at 7% (no equity is practically risk-free)
    discount_rate = max(discount_rate, 0.07)
    
    # Gordon Model Requirement: r > g
    # If expected return is lower than growth, math breaks (infinity value).
    # Usually means strict overvaluation or extremely low beta.
    if discount_rate <= div_growth + 0.01:
        # Force bigger gap or invalidate
        # Adjusting discount rate up is safer than discarding a good stock
        discount_rate = div_growth + 0.02

    # 4. Calculation
    # D1 = Next Year Dividend
    d1 = dividend * (1 + div_growth)
    
    fair_value = d1 / (discount_rate - div_growth)
    
    if fair_value <= 0:
        return None

    upside = ((fair_value / price) - 1) * 100
    
    # 5. Sanity Checks
    if upside > 200: 
        return None # Unrealistic

    # Confidence Scoring
    confidence = "medium"
    
    # Dividend Yield Check
    current_yield = (dividend / price)
    
    # If yield is suspicious (>10%), market pricing in a cut -> Low confidence
    if current_yield > 0.10:
        confidence = "low"
        
    # High Payout is risky
    if payout_ratio and payout_ratio > 0.85 and not is_reit:
        confidence = "low"

    return {
        "method": "Dividendový model",
        "description": f"Gordon Growth: D₁ ${d1:.2f} / (r {discount_rate:.1%} − g {div_growth:.1%})",
        "tooltip": "Gordonův model oceňuje akcii jako nekonečnou řadu budoucích dividend. Vyžaduje, aby firma dividendu nejen vyplácela, ale aby na ni 'měla' (Payout Ratio < 100%). Ideální pro Utility, Coca-Colu apod.",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "annualDividend": round(dividend, 2),
            "expectedGrowth": round(div_growth * 100, 1),
            "discountRate": round(discount_rate * 100, 1),
            "payoutRatio": f"{payout_ratio:.1%}" if payout_ratio else "N/A",
        },
        "confidence": confidence,
    }


def _ev_ebitda_valuation(data: dict) -> Optional[dict]:
    """
    EV/EBITDA Valuation.
    Multiples Valuation method that compares Enterprise Value to EBITDA.
    
    Logic:
    1. Calculate Implied EBITDA = EV / (EV/EBITDA).
    2. Calculate Net Debt = EV - Market Cap.
    3. Determine Sector Fair Multiple (avg).
    4. Fair EV = Implied EBITDA * Fair Multiple.
    5. Fair Equity = Fair EV - Net Debt.
    6. Fair Price = Fair Equity / Shares.

    Applicability:
    - Excellent for capital-intensive industries (Energy, Utilities, Industrials).
    - Good for M&A targets (neutral to capital structure).
    - INVALID for Financial Services (Banks do not have "EBITDA" in the industrial sense).
    - INVALID for Real Estate (uses FFO).
    
    Ref: https://corporatefinanceinstitute.com/resources/valuation/ev-ebitda/
    """
    ev_ebitda = data.get("enterpriseToEbitda")
    enterprise_value = data.get("enterpriseValue")
    shares = data.get("sharesOutstanding")
    price = data.get("price")
    sector = data.get("sector")

    if not ev_ebitda or ev_ebitda <= 0 or not enterprise_value or not shares or not price:
        return None

    # 1. Applicability Check
    # Financials: Interest is core business, not excluded from EBITDA -> model invalid.
    # Real Estate: Depreciation is huge but not real cash expense -> use FFO/AFFO -> model invalid.
    if sector in ["Financial Services", "Real Estate"]:
        return None

    # Sector typical EV/EBITDA ranges (Historical Averages)
    # Source: Damodaran / CFI benchmarks
    sector_ev_ebitda = {
        "Technology": {"low": 15, "mid": 20, "high": 25}, # Tech trades higher
        "Healthcare": {"low": 12, "mid": 16, "high": 20},
        "Consumer Cyclical": {"low": 10, "mid": 14, "high": 18},
        "Consumer Defensive": {"low": 12, "mid": 15, "high": 18},
        "Industrials": {"low": 9, "mid": 13, "high": 17},
        "Energy": {"low": 5, "mid": 8, "high": 10}, # Capital intensive, low multiples
        "Utilities": {"low": 10, "mid": 12, "high": 15},
        "Basic Materials": {"low": 6, "mid": 9, "high": 12},
        "Communication Services": {"low": 10, "mid": 15, "high": 20},
    }

    benchmarks = sector_ev_ebitda.get(sector)
    # If sector unknown, default to broad market avg ~14x
    if not benchmarks:
        benchmarks = {"low": 10, "mid": 14, "high": 18}

    # 2. Derive implied Metrics
    # We back-calculate EBITDA to be consistent with the provided EV and Ratio
    ebitda = enterprise_value / ev_ebitda

    market_cap = price * shares
    net_debt = enterprise_value - market_cap
    
    # 3. Calculate Fair Value
    # Using 'mid' benchmark as baseline fair value
    fair_multiple = benchmarks["mid"]
    
    fair_ev = ebitda * fair_multiple
    fair_equity = fair_ev - net_debt
    
    # If debt is huge, fair_equity might be negative (company is distressed/bankrupt)
    if fair_equity <= 0:
        return None
        
    fair_value = fair_equity / shares

    if fair_value <= 0:
        return None

    upside = ((fair_value / price) - 1) * 100

    # 4. Sanity Checks
    if upside > 300: 
        return None

    # Confidence Scoring
    confidence = "medium"
    
    # If current multiple is widely outlier from sector, confidence drops
    # e.g. Sector 12x, Company 40x -> Model suggests huge downside, but maybe market knows something (high growth?)
    if ev_ebitda > benchmarks["high"] * 2:
        confidence = "low"
        
    if ev_ebitda < benchmarks["low"] / 2:
        confidence = "low"

    return {
        "method": "EV/EBITDA",
        "description": f"Target EV/EBITDA {fair_multiple:.0f}x (Sektor). Odvozené EBITDA ${ebitda/1e9:.1f}B.",
        "tooltip": "Oceňuje firmu jako celek (včetně dluhu) oproti jejímu provoznímu zisku (EBITDA). Ideální pro průmysl, energie a utility, protože očišťuje vliv zadlužení a daní. Nevhodné pro banky.",
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "currentMultiple": round(ev_ebitda, 1),
            "targetMultiple": fair_multiple,
            "impliedEbitdaB": round(ebitda / 1e9, 2),
            "netDebtB": round(net_debt / 1e9, 2),
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
    sector = data.get("sector", "")
    industry = data.get("industry", "")

    if not eps or eps <= 0 or not price:
        return None

    # 1. Cost of equity (Discount Rate)
    # EPV ignores growth, so we just want the cost to maintain current earnings.
    risk_free = 0.04
    equity_premium = 0.05
    r = max(risk_free + beta * equity_premium, 0.07)  # Floor at 7%

    # 2. Normalized Earnings Estimate
    # Ideally should adjust for cycle. We use current EPS but handle cyclicals conservatively.
    # If the sector is highly cyclical, we might want to dampen the EPS if it looks like a peak,
    # but we don't have historicals here easily. We'll stick to TTM EPS as proxy for current power.
    normalized_earnings = eps

    # EPV = Normalized Earnings / Cost of Capital (Zero Growth Perpetuity)
    # Value = Earnings / r
    fair_value = normalized_earnings / r

    if fair_value <= 0:
        return None

    upside = ((fair_value / price) - 1) * 100

    # 3. Applicability Logic & Filtering
    # EPV is often very low for high growth stocks (Tech, Biotech) because it assumes NO growth.
    # Showing a -70% valuations for Amazon/NVIDIA is confusing for users.
    is_growth_sector = sector in ["Technology", "Communication Services", "Consumer Cyclical"]
    
    # Filter 1: Hide if massively negative for growth sectors (it's not a useful floor if it's irrelevant)
    if is_growth_sector and upside < -50:
        return None
        
    # Filter 2: Hide if massively negative for anything (-75%)
    if upside < -75:
        return None

    # 4. Confidence Score
    # EPV is a "Floor". It shouldn't be high confidence unless the stock is actually TRADING at this floor.
    # If Price ~ EPV, it's a very strong buy signal (getting growth for free).
    confidence = "low"
    
    if upside > 0:
        # If stock is cheaper than its zero-growth value, that's a powerful signal.
        confidence = "high"
    elif upside > -20:
        # Close to floor
        confidence = "medium"

    return {
        "method": "Výnosová síla (EPV)",
        # CZ: "Conservative value without growth"
        "description": f"Normalizovaný zisk ${normalized_earnings:.2f} / {r:.1%} náklad kapitálu (bez růstu)",
        "tooltip": (
            "Model dle Bruce Greenwalda. Ukazuje hodnotu firmy za předpokladu, že už nikdy neporoste "
            "a bude jen udržovat současné zisky (Zero Growth). Je to 'tvrdá podlaha' hodnoty. "
            "Pokud je cena akcie pod touto hodnotou, trh oceňuje firmu iracionálně nízko (dostáváte růst zdarma)."
        ),
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "normalizedEps": round(normalized_earnings, 2),
            "costOfCapital": round(r * 100, 1),
            "beta": round(beta, 2),
            "assumption": "Zero Growth"
        },
        "confidence": confidence,
    }


def _peg_valuation(data: dict) -> Optional[dict]:
    """
    PEG Ratio Valuation (Peter Lynch's Rule of Thumb).
    Fair Value = Trailing EPS * (Growth Rate * 100).
    Basically assumes Fair PEG = 1.0.
    """
    eps = data.get("eps")
    forward_eps = data.get("forwardEps")
    price = data.get("price")
    
    # Growth inputs
    earnings_growth = data.get("earningsGrowth") # TTM growth
    
    if not eps or eps <= 0 or not price:
        return None

    # 1. Determine Growth Rate (g)
    # We prioritize forward-looking estimates implied by Forward EPS vs Current EPS
    growth_pct = None
    
    if forward_eps and forward_eps > eps:
        # Implied growth for next year
        growth_pct = ((forward_eps / eps) - 1) * 100
    elif earnings_growth:
         # Fallback to TTM growth if valid
        growth_pct = earnings_growth * 100
        
    if growth_pct is None:
        return None

    # 2. Applicability Filters (Lynch's Rules)
    # Rule A: Growth must be reasonable (10% - 25% is the sweet spot)
    # Slow growers (<5%) aren't valued by PEG.
    # Hyper growers (>40%) are too risky for linear PEG.
    if growth_pct < 8 or growth_pct > 40:
        return None

    # Rule B: Exclude Cyclicals and Financials
    # Banks often trade at PEG < 1 naturally without being undervalued.
    sector = data.get("sector", "")
    if sector in ["Financial Services", "Energy", "Utilities", "Real Estate", "Basic Materials"]:
        return None

    # 3. Valuation
    # Fair P/E = Growth Rate (PEG = 1.0)
    fair_pe = growth_pct
    fair_value = eps * fair_pe
    
    if fair_value <= 0:
        return None

    upside = ((fair_value / price) - 1) * 100
    
    # 4. Confidence
    confidence = "medium"
    
    # Best confidence in the sweet spot of GARP (Growth At Reasonable Price)
    if 15 <= growth_pct <= 25:
        confidence = "high"

    return {
        "method": "PEG Model",
        "description": f"Férové P/E {fair_pe:.1f}x = Oček. růst {growth_pct:.1f}%",
        "tooltip": (
            "Peter Lynch: 'Férově oceněná růstová firma má P/E rovné tempu růstu zisků.' "
            "(tzn. PEG = 1.0). Vhodné pro firmy rostoucí 10-25 % ročně. "
            "Nevhodné pro pomalé giganty nebo cyklické sektory."
        ),
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "eps": round(eps, 2),
            "expectedGrowth": round(growth_pct, 1),
            "targetPEG": 1.0
        },
        "confidence": confidence,
    }


def _forward_peg_valuation(data: dict) -> Optional[dict]:
    """
    Forward PEG Valuation for High-Growth Companies (incl. Fintech).
    
    Inspired by growth investor methodology:
    1. Uses Forward EPS (next year's estimate) as base.
    2. Normalizes growth rate - caps excessive early-stage growth.
    3. Calculates fair value using PEG = 1.0 formula: Price = EPS × Growth%
    4. Optionally discounts future target price back to present value.
    
    This model is specifically designed for:
    - High-growth fintechs (SoFi, NU Holdings, etc.)
    - Tech companies transitioning to profitability
    - Companies with forward EPS significantly higher than trailing
    
    Key difference from standard PEG:
    - Standard PEG excludes Financial Services (banks trade at low PEG naturally)
    - Forward PEG INCLUDES high-growth fintech because their growth story matters
    """
    eps = data.get("eps")
    forward_eps = data.get("forwardEps")
    price = data.get("price")
    sector = data.get("sector", "")
    earnings_growth = data.get("earningsGrowth")
    
    # 1. Must be profitable (or about to be with forward EPS)
    if not forward_eps or forward_eps <= 0:
        return None
    if not price:
        return None
    
    # 2. Calculate implied growth rate
    # Primary: Forward EPS vs Trailing EPS
    # Fallback: earningsGrowth from yfinance
    growth_pct = None
    
    if eps and eps > 0 and forward_eps > eps:
        # Implied YoY growth
        growth_pct = ((forward_eps / eps) - 1) * 100
    elif earnings_growth and earnings_growth > 0:
        growth_pct = earnings_growth * 100
    
    if growth_pct is None or growth_pct <= 0:
        return None
    
    # 3. Applicability: This model is for HIGH-GROWTH companies
    # Minimum threshold: 25% growth (otherwise standard PE models are fine)
    if growth_pct < 25:
        return None
    
    # 4. Normalize growth rate
    # Problem: Early-stage growth (e.g., 160% for SOFI 2024→2025) is unsustainable.
    # Solution: Cap growth to a "believable long-term" rate.
    #
    # Logic:
    # - If growth > 60%: This is transition/turnaround. Normalize to 40-45%.
    # - If growth 40-60%: Strong growth phase. Use as-is but cap at 50%.
    # - If growth 25-40%: GARP sweet spot. Use as-is.
    
    normalized_growth = growth_pct
    growth_phase = "stable"
    
    if growth_pct > 80:
        # Extreme growth (turnaround, first profitable year)
        # Normalize heavily - this won't sustain
        normalized_growth = 45
        growth_phase = "turnaround"
    elif growth_pct > 50:
        # High growth - moderate normalization
        normalized_growth = min(growth_pct * 0.8, 50)
        growth_phase = "high_growth"
    elif growth_pct > 40:
        # Strong growth - slight cap
        normalized_growth = min(growth_pct, 45)
        growth_phase = "strong"
    # else: 25-40% - use as-is
    
    # 5. Calculate Fair P/E using PEG = 1.0
    # Fair P/E = Normalized Growth Rate
    fair_pe = normalized_growth
    
    # 6. Calculate Fair Value
    # Use FORWARD EPS (not trailing) - markets look ahead
    fair_value = forward_eps * fair_pe
    
    if fair_value <= 0:
        return None
    
    upside = ((fair_value / price) - 1) * 100
    
    # 7. Calculate future target (2-3 year horizon)
    # If we project EPS growing at normalized rate for 2 years:
    # Target EPS (Y+2) = Forward EPS × (1 + norm_growth)²
    # Target Price = Target EPS × fair_pe
    # Present Value = Target Price / (1 + discount_rate)²
    
    discount_rate = 0.12  # 12% required return
    years_ahead = 2
    
    projected_eps_y2 = forward_eps * ((1 + normalized_growth / 100) ** years_ahead)
    target_price_y2 = projected_eps_y2 * fair_pe
    present_value_of_target = target_price_y2 / ((1 + discount_rate) ** years_ahead)
    
    # 8. Confidence scoring
    confidence = "medium"
    
    # Higher confidence in GARP sweet spot
    if 30 <= normalized_growth <= 45:
        confidence = "high" if growth_phase == "stable" else "medium"
    
    # Lower confidence for extreme normalization
    if growth_phase == "turnaround":
        confidence = "low"
    
    # Sector bonus: Fintech with proven growth gets medium minimum
    if sector == "Financial Services" and growth_pct > 40:
        confidence = max(confidence, "medium")
    
    return {
        "method": "Forward PEG (růstový)",
        "description": f"Forward EPS ${forward_eps:.2f} × norm. růst {normalized_growth:.0f}% (PEG 1.0)",
        "tooltip": (
            "Model pro rychle rostoucí firmy (fintech, tech v přechodu do zisku). "
            "Používá forward EPS a normalizuje extrémní růst na udržitelnou úroveň. "
            "PEG 1.0 = růst je férově oceněn. Zahrnuje i 2letý výhled s diskontem."
        ),
        "fairValue": round(fair_value, 2),
        "upside": round(upside, 1),
        "inputs": {
            "forwardEps": round(forward_eps, 2),
            "rawGrowth": round(growth_pct, 1),
            "normalizedGrowth": round(normalized_growth, 1),
            "fairPE": round(fair_pe, 1),
            "targetPEG": 1.0,
            "growthPhase": growth_phase,
            "target2Y": round(target_price_y2, 2),
            "presentValue2Y": round(present_value_of_target, 2),
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
        _forward_peg_valuation,
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
