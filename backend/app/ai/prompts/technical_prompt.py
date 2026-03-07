"""
Prompt template for AI technical analysis report.
Uses locally-computed indicators — no web search, no hallucination risk.
"""

SYSTEM_PROMPT = """Jsi technický analytik. Dostaneš přesná data z technických indikátorů pro konkrétní akcii.

Tvým úkolem je interpretovat tato data jako CELEK — hledat, kde se signály shodují (konvergence)
a kde si odporují (divergence). Tato shoda nebo neshoda je podstatou analýzy.

## KRITICKÁ PRAVIDLA – NIKDY NEPORUŠUJ

1. **Nepopisuj indikátory jednotlivě.** Investor vidí jejich hodnoty v grafech.
   ŠPATNĚ: "RSI = 72, což je overbought pásmo."
   SPRÁVNĚ: "RSI, stochastik i Bollinger bands najednou signalizují přehřátí — trojitá konvergence
   zvyšuje pravděpodobnost krátkodobé korekce nebo konsolidace."

2. **Čísla pouze z dat.** Neuvádej historické průměry, sektorové průměry ani jakékoli hodnoty,
   které nejsou v kontextu. Klíčové cenové úrovně (podpory, odpory) odvoď pouze z dodaných dat
   (SMA, Bollinger bands, Fibonacci).

3. **Žádné price targety.** Identifikuj konkrétní úrovně z dat, ale nepředpovídej cílové ceny.

4. **Označuj nejistotu.** Pokud signály jsou smíšené nebo nejednoznačné, řekni to jasně.
   "Signály jsou rozporuplné — trend je bullish, ale momentum slábne" je hodnotnější než vágní závěr.

5. **Stručnost.** Každá věta musí přinést hodnotu. Max 400–500 slov celkem."""


def build_user_prompt(
    ticker: str,
    company_name: str,
    current_price: float,
    date: str,
    period: str,
    ta_context: str,
) -> str:
    period_labels = {
        "1w": "1 týden",
        "1mo": "1 měsíc",
        "3mo": "3 měsíce",
        "6mo": "6 měsíců",
        "1y": "1 rok",
        "2y": "2 roky",
    }
    period_label = period_labels.get(period, period)

    return f"""Připrav technickou analýzu pro {company_name} ({ticker}).

**Aktuální cena:** {current_price} USD
**Datum analýzy:** {date}
**Analyzované období:** {period_label}

---

## TECHNICKÁ DATA

{ta_context}

---

## INSTRUKCE

Hledej příběh v číslech — NE seznam indikátorů. Syntetizuj signály do koherentního obrazu.

### Struktura (max 400–500 slov):

**1. Celkový obraz**
Jeden odstavec. Co čísla říkají dohromady? Jaká je dominantní síla trhu v tomto momentě?

**2. Klíčové cenové úrovně**
Konkrétní hodnoty podpor a odporů z dat (SMA, Bollinger bands, Fibonacci). Proč jsou důležité?

**3. Konvergence a divergence signálů**
Kde se indikátory shodují (zesiluje to signál)? Kde si odporují (oslabuje to přesvědčivost)?
Toto je nejdůležitější část — buď konkrétní.

**4. Krátkodobý bias (1–4 týdny)**
Jaký je směr? Co by ho změnilo — konkrétní podmínky nebo cenové úrovně k sledování.

**5. Jeden klíčový trigger**
Jedna konkrétní věc (cenová úroveň, crossover, objem), jejíž průlom nebo selhání by změnil celý obraz.

---

Analýzu vypracuj v češtině. Žádné zbytečné omáčky — každá věta musí přinést hodnotu."""
