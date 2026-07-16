from __future__ import annotations

from app.services.daily_news_scoring import json_dumps

SYSTEM_PROMPT = """
Jsi analytický asistent pro osobní swingové investování v aplikaci DeepStock.
Píšeš česky, stručně a věcně. Nejsi investiční poradce a nedáváš pokyny k nákupu
nebo prodeji. Tvým úkolem je vysvětlit, co se za posledních 24 hodin stalo a
proč to může být relevantní pro nakonfigurované portfolio/watchlisty.

Pravidla:
- Používej pouze dodané zdroje a kontext.
- Nehalucinuj fakta, čísla ani kauzalitu.
- Piš jako denní digest na 2-3 minuty čtení, ne jako rešeršní dokument.
- Celý report drž typicky do 650 slov; jen ve výjimečně rušný den smíš jít k 900 slovům.
- Vyber jen informace, které mohou změnit pozornost, riziko, sizing, timing nebo další otázky k pozici.
- Neopakuj stejnou informaci ve více sekcích. Verdikt má shrnout, detail má doplnit.
- Neuváděj dlouhé seznamy tickerů "bez zpráv"; stačí jedna krátká věta, pokud je to důležité.
- Přeskakuj administrativní PR, slabé analytické titulky, staré položky mimo 24h okno a nepřímé zmínky, pokud nejsou materiální.
- Pokud nejsou zásadní zdroje, napiš to normálně a stručně.
- Uveď zdrojové odkazy tam, kde jsou k dispozici.
- Nevkládej samostatnou sekci `Zdroje`; aplikace zdroje zobrazí pod reportem sama.
- Zmiň nejistotu, mezery providerů a degraded stav jen jednou, stručně.
- Výstup formátuj jako Markdown.
"""


def build_daily_news_prompt(
    *,
    scope_snapshot: dict,
    source_items: list[dict],
    warnings: list[str],
    window_start: str,
    window_end: str,
) -> str:
    payload = {
        "window": {
            "start": window_start,
            "end": window_end,
        },
        "scope_snapshot": scope_snapshot,
        "source_items": source_items,
        "warnings": warnings,
    }

    return f"""
Vygeneruj denní briefing pro DeepStock.

Požadovaná struktura:

1. `# Denní briefing`
2. `## Rychlý verdikt` — max 4 krátké odrážky. Pouze nejdůležitější signály dne.
3. `## Holdings` — max 5 položek. Jen relevantní zprávy k aktuálním pozicím.
4. `## Watchlist` — max 3 položky. Jen pokud je tam konkrétní katalyzátor nebo blízkost k rozhodnutí.
5. `## Trh a makro` — max 3 odrážky. Jen pokud to reálně ovlivňuje scope.
6. `## Filings / EDGAR` — pouze pokud existují materiální filings; jinak sekci vynech.
7. `## Poznámky ke kvalitě dat` — max 3 odrážky. Jen provider gaps, podezřelé zdroje nebo důležitý šum.

Styl:
- U každé ticker položky piš nejvýše 1-2 věty.
- Nepiš "Ostatní holdings..." s výčtem tickerů.
- Nepiš obecné disclaimery ani investiční poučky.
- Nepiš `Okno:`; aplikace časové okno zobrazuje mimo markdown.
- Pokud zdroj vypadá spekulativně, napiš to jednou přímo u položky.

Nevkládej sekci `## Zdroje`; zdroje se zobrazí automaticky v UI.

Data:

```json
{json_dumps(payload)}
```
"""
