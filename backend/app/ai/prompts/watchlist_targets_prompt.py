"""
Prompt template for AI-powered watchlist buy/sell target suggestions.
Uses technical indicators + fundamentals — no web search.
Returns structured JSON only.
"""

SYSTEM_PROMPT = """Jsi technický a fundamentální analytik specializující se na nastavování nákupních a prodejních cílů pro investory.

Dostaneš technická data, fundamentální ukazatele a případně informaci o tom, za jakou průměrnou cenu investor akcii drží.

## KRITICKÁ PRAVIDLA — NIKDY NEPORUŠUJ

1. **Pouze z dat.** Navrhuj VÝHRADNĚ ceny, které vycházejí z poskytnutých dat: SMA50, SMA200, Bollinger bands, Fibonacci levely, P/E, period high/low. Nikdy nevymýšlej čísla.

2. **DCA strategie při existujícím holdingi.** Pokud investor již akcii drží (avg_cost je uvedena), používá kaskádové DCA: každý další nákup je přibližně −20 % od předchozí nákupní ceny. avg_cost je průměr všech dosavadních nákupů — je tedy nižší než první nákup. Navrhni buy_target jako technickou podporu v pásmu přibližně avg_cost × 0.82 až avg_cost × 0.85 (tj. −15 až −20 % od posledního odhadovaného nákupu) nebo níže. Preferuj confluence technických hladin v tomto pásmu — pokud tam žádná není, zvol nejbližší support pod tímto pásmem.

3. **Mírně nad/pod technickou hladinou — early warning.** Investor nenastavuje cíle přesně na technické hladině, ale mírně výše (buy) nebo níže (sell), aby ho UI upozornilo dřív a mohl sledovat, jak se akcie u hladiny chová. Konkrétně:
   - buy_target: nastav mírně NAD klíčovou supportní hladinou (typicky +1–3 %), ne přesně na ní
   - sell_target: nastav mírně POD klíčovou resistenční hladinou (typicky −1–3 %), ne přesně na ní

4. **Smysluplné hladiny.** Preferuj confluenci (shoda více indikátorů). Vyhni se náhodným hodnotám.

5. **Výstup VÝHRADNĚ jako JSON.** Žádný text před ani za JSON. Žádný markdown. Pouze čistý JSON.

6. **Comment = 2–3 věty česky.** Max 400 znaků. Vysvětli proč jsou navržené hladiny důležité — zmínit technické i fundamentální důvody.

7. **Ceny zaokrouhluj** na 2 desetinná místa.

8. **Pokud nelze najít smysluplný buy_target** (např. pravidlo -20% vede pod period low a žádná podpora tam neexistuje), nastav buy_target na null a v komentáři vysvětli proč."""


def build_user_prompt(stock_context: str) -> str:
    return f"""Navrhni nákupní a prodejní cíl pro následující akcii.

{stock_context}

---

Vrať VÝHRADNĚ tento JSON formát (žádný jiný text, žádný markdown):
{{
  "buy_target": 150.00,
  "sell_target": 185.00,
  "comment": "Nákupní cíl je na SMA200 ($150), klíčové dlouhodobé podpoře. Prodejní cíl odpovídá Fibonacci 78.6% resistenci ($185). P/E 22x je pro sektor přiměřené."
}}

Pokud buy_target nelze smysluplně určit, použij null:
{{
  "buy_target": null,
  "sell_target": 185.00,
  "comment": "..."
}}"""


def format_stock_context(
    ticker: str,
    tech_data: dict,
    stock_info: dict | None = None,
    avg_cost: float | None = None,
    shares: float | None = None,
) -> str:
    """Format technical + fundamental data for a single stock."""

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
    trend_desc = tech_data.get("trendDescription", "")
    fib = tech_data.get("fibonacciLevels") or {}

    lines = [f"## {ticker}"]
    lines.append(f"Aktuální cena: ${f(current_price)}")

    # Holdings context
    if avg_cost is not None:
        buy_ceiling = avg_cost * 0.80
        lines.append(f"Investor drží akcii s průměrnou nákupní cenou: ${f(avg_cost)}")
        if shares is not None:
            lines.append(f"Počet akcií: {shares}")
        lines.append(f"→ PRAVIDLO: buy_target musí být ≤ ${f(buy_ceiling)} (avg_cost × 0.80)")
    else:
        lines.append("Investor akcii zatím nedrží.")

    lines.append("")
    lines.append("### Technická analýza")
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
    if trend_desc:
        lines.append(f"Popis trendu: {trend_desc}")

    # Fundamentals
    if stock_info:
        lines.append("")
        lines.append("### Fundamenty")
        pe = stock_info.get("trailingPE") or stock_info.get("forwardPE")
        pb = stock_info.get("priceToBook")
        sector = stock_info.get("sector")
        div_yield = stock_info.get("dividendYield")

        if sector:
            lines.append(f"Sektor: {sector}")
        if pe is not None:
            lines.append(f"P/E: {f(pe, 1)}x")
        if pb is not None:
            lines.append(f"P/B: {f(pb, 2)}x")
        if div_yield is not None:
            lines.append(f"Dividendový výnos: {div_yield * 100:.2f}%")

    return "\n".join(lines)
