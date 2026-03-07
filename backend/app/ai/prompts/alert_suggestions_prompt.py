"""
Prompt template for AI-powered price alert suggestions.
Uses locally-computed technical indicators — no web search.
Returns structured JSON only.
"""

SYSTEM_PROMPT = """Jsi technický analytik specializující se na identifikaci klíčových cenových hladin pro cenové alerty.

Dostaneš technická data pro jednu nebo více akcií. Pro každou akcii navrhni 2–3 cenové hladiny pro alerty.

## KRITICKÁ PRAVIDLA — NIKDY NEPORUŠUJ

1. **Pouze z dat.** Navrhuj VÝHRADNĚ hladiny, které jsou přímo v poskytnutých datech: SMA50, SMA200, Bollinger bands, Fibonacci levely, period high/low. Nikdy nevymýšlej čísla.

2. **Smysluplné hladiny.** Navrhuj tam, kde je confluance (shoda více ukazatelů) nebo klíčová technická úroveň. Vyhni se náhodným hodnotám.

3. **Výstup VÝHRADNĚ jako JSON.** Žádný text před ani za JSON. Žádný markdown. Žádné code bloky. Pouze čistý JSON.

4. **Reason = 1 krátká věta česky.** Maximálně 100 znaků. Technický důvod proč je tato hladina důležitá.

5. **Condition type:**
   - "price_below" pro support/entry hladiny (akcie klesne na tuto hladinu)
   - "price_above" pro resistance/breakout hladiny (akcie vzroste na tuto hladinu)

6. **Ceny zaokrouhluj** na 2 desetinná místa. Příliš přesné číslo ($183.4723) vypadá špatně."""


def build_user_prompt(stocks_context: str) -> str:
    return f"""Navrhni cenové alerty pro následující akcie na základě technických dat.

{stocks_context}

---

Vrať VÝHRADNĚ tento JSON formát (žádný jiný text, žádný markdown):
{{
  "suggestions": [
    {{
      "ticker": "AAPL",
      "condition_type": "price_below",
      "price": 180.00,
      "reason": "Podpora na 200DMA — klíčová long-term hladina."
    }},
    {{
      "ticker": "AAPL",
      "condition_type": "price_above",
      "price": 195.00,
      "reason": "Breakout nad Fibonacci 78.6% potvrdí pokračování trendu."
    }}
  ]
}}"""


def format_stock_context(ticker: str, tech_data: dict) -> str:
    """Format technical data for a single stock into a compact context string."""

    def f(v, d=2):
        return f"{v:.{d}f}" if v is not None else "N/A"

    def pct(v):
        if v is None:
            return "N/A"
        return f"+{v:.1f}%" if v > 0 else f"{v:.1f}%"

    current_price = tech_data.get("currentPrice", 0)
    sma50 = tech_data.get("sma50")
    sma200 = tech_data.get("sma200")
    price_vs_sma50 = tech_data.get("priceVsSma50")
    price_vs_sma200 = tech_data.get("priceVsSma200")
    rsi = tech_data.get("rsi14")
    bb_upper = tech_data.get("bollingerUpper")
    bb_lower = tech_data.get("bollingerLower")
    bb_middle = tech_data.get("bollingerMiddle")
    period_high = tech_data.get("periodHigh")
    period_low = tech_data.get("periodLow")
    trend = tech_data.get("trendSignal", "mixed")
    fib = tech_data.get("fibonacciLevels") or {}

    lines = [f"## {ticker}"]
    lines.append(f"Aktuální cena: ${f(current_price)}")

    if sma50:
        lines.append(f"SMA50: ${f(sma50)} ({pct(price_vs_sma50)})")
    if sma200:
        lines.append(f"SMA200: ${f(sma200)} ({pct(price_vs_sma200)})")
    if rsi is not None:
        lines.append(f"RSI14: {f(rsi, 1)}")
    if bb_lower and bb_middle and bb_upper:
        lines.append(f"Bollinger: ${f(bb_lower)} / ${f(bb_middle)} / ${f(bb_upper)}")
    if period_high and period_low:
        lines.append(f"Period High/Low (3M): ${f(period_high)} / ${f(period_low)}")

    fib_lines = []
    for key in ["236", "382", "500", "618", "786"]:
        val = fib.get(key)
        if val is not None:
            fib_lines.append(f"  Fib {key}: ${f(val)}")
    if fib_lines:
        lines.append("Fibonacci:")
        lines.extend(fib_lines)

    lines.append(f"Trend: {trend}")

    return "\n".join(lines)
