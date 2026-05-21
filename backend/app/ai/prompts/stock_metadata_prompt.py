"""
Prompt template for AI-assisted stock metadata autofill.
Creates a short Czech company description for the notes field.
"""

MAX_NOTES_CHARS = 900

SYSTEM_PROMPT = """Jsi asistent pro investiční aplikaci, který pomáhá doplňovat metadata akcií.

Tvůj úkol je napsat stručný český popis firmy do interní poznámky.

Pravidla:
1. Používej pouze dodaná fakta.
2. Nevymýšlej investiční doporučení ani čísla.
3. Napiš 3 až 5 vět, maximálně 900 znaků.
4. Vysvětli hlavně co firma dělá, v jakém sektoru působí a případně kde podniká.
5. Bez markdownu, bez odrážek, bez uvozovek navíc.
6. Pokud jsou data nedostatečná, vrať prázdný řetězec.
"""


def build_user_prompt(
    ticker: str,
    name: str | None,
    sector: str | None,
    industry: str | None,
    country: str | None,
    description: str | None,
) -> str:
    return f"""Připrav krátký popis firmy pro ticker {ticker}.

Název: {name or "N/A"}
Sektor: {sector or "N/A"}
Odvětví: {industry or "N/A"}
Země: {country or "N/A"}
Popis firmy:
{description or "N/A"}

Vrať pouze výsledný text bez dalšího komentáře.
"""
