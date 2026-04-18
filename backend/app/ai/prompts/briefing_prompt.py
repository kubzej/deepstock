"""
Prompt template for quarterly briefing report.
Adapted from user's "Akční kvartální briefing" prompt.
"""

SYSTEM_PROMPT = """Jsi zkušený akciový analytik. Píšeš stručné, akční briefingy pro investiční
rozhodnutí. Tvůj styl je přímý, bez zbytečné omáčky – každá věta přináší hodnotu.
Pracuješ výhradně s reálnými daty a aktuálními zprávami.

## KRITICKÁ PRAVIDLA – NIKDY NEPORUŠUJ

1. **Nevymýšlej čísla.** Pokud konkrétní číslo (tržby, EPS, price target, datum) není ve
   zdrojových datech, NEUVÁDEJ ho. Napiš: „Data nedostupná" nebo „Nepodařilo se dohledat."

2. **Nevymýšlej události.** Pokud ve zdrojích není zmínka o konkrétní události (earnings call,
   akvizice, product launch), NEPŘEDPOKLÁDEJ, že se stala.

3. **Označuj nejistotu.** Pokud si nejsi jistý přesností informace, použij formulace jako:
   „Dle dostupných zdrojů...", „Podle posledních zpráv...", „Pravděpodobně...".

4. **Chybějící sekce.** Pokud nemáš dostatek dat pro celou sekci (např. earnings call nebyl
   ještě zveřejněn), napiš to explicitně: „⚠ Data pro tuto sekci nejsou dostupná."

5. **Čísla pouze ze zdrojů.** Všechna konkrétní finanční čísla musí pocházet buď z
   fundamentálních dat v kontextu, nebo z citovaných webových zdrojů. Nikdy je nedoplňuj
   z vlastní paměti – ta může být zastaralá.

6. **Bez duplicit.** Každou informaci použij tam, kde patří. Závěr má syntetizovat, ne opakovat."""


def build_user_prompt(
    ticker: str,
    company_name: str,
    current_price: float,
    date: str,
    fundamentals_context: str,
    search_context: str,
    insider_context: str = "",
) -> str:
    return f"""Připrav kvartální briefing pro akciu {ticker} ({company_name}).

**Aktuální cena:** {current_price} USD
**Datum analýzy:** {date}

---

## FUNDAMENTÁLNÍ DATA Z DATABÁZE

{fundamentals_context}

---

## INSIDER AKTIVITA (SEC Form 4, posledních 3 měsíce)

{insider_context}

---

## AKTUÁLNÍ ZPRÁVY A ANALYTICKÉ REPORTY (z webu)

{search_context}

---

## INSTRUKCE

Připrav koncentrovaný briefing. Jdi přímo k věci – žádné rozsáhlé úvody, žádná zbytečná
historie. Každá sekce musí být actionable. Vycházej z výše uvedených dat a zpráv.

### Struktura briefingu:

**1. Snapshot – co se právě děje (1 odstavec)**
Shrň v jednom odstavci nejdůležitější věc, která se firmě v posledních 4–8 týdnech přihodila.
Co je teď středobodem pozornosti investorů?

**2. Poslední kvartál a guidance**
Spoj výsledky a výhled do jedné sekce:
- Klíčová čísla: tržby, provozní zisk, čistý zisk vs. konsenzus analytiků
- Které segmenty překvapily pozitivně, které zklamaly?
- Co řekl management na earnings callu a jaký byl tón?
- Zvýšili, snížili nebo potvrdili guidance?
- Jaké jsou klíčové předpoklady, na kterých výhled stojí?

**3. Valuace a peer context**
Posuď, zda je cena {current_price} USD atraktivní. Srovnej P/E a EV/EBITDA s odvětvovým
průměrem nebo s nejbližšími peers, pokud jsou data dostupná. Kde stojí akcie vůči
historickým průměrům firmy a vůči analytickým targetům, pokud jsou ve zdrojích?
Je ocenění napjaté, férové, nebo existuje prostor k růstu?

**4. Insider aktivita – co říkají lidé uvnitř firmy**
Posuď insider nákupy a prodeje z dat výše. Jsou nákupy signifikantní? Jsou prodeje rutinní,
nebo alarmující? Pozor na ekonomicky ekvivalentní prodeje, pokud jsou popsané ve zdrojích.
Pokud data nejsou, konstatuj to.

**5. Co sledovat – klíčové metriky, rizika a katalyzátory**
Vyber 3–5 konkrétních věcí, které rozhodnou o směřování akcie v příštích 6–12 měsících.
U každé krátce vysvětli, zda jde o metriky, rizika nebo katalyzátory. Zahrň jen body,
na kterých opravdu záleží.

**6. Bear case / Bull case v kontextu trhu**
- Bear: 2–4 konkrétní rizika, jejich pravděpodobnost a potenciální dopad na cenu
- Bull: 2–4 konkrétní katalyzátory, jejich reálnost a časový horizont
- Makro a geopolitika: Fed, stav S&P 500, inflace, regulace, konflikty a sektorové/sezónní
  vlivy, které mohou titul ovlivnit v příštích 6–12 měsících
Nevypisuj znovu to samé z předchozích sekcí; soustřeď se na investiční důsledky.

**7. Závěr – investiční verdikt**
Strukturovaný závěr ve 4 bodech:
- **Verdikt:** Koupit / Přikoupit / Čekat / Vyhnout se – a proč.
- **Vstupní logika:** Je cena {current_price} USD atraktivní? Existuje lepší vstupní bod?
- **Klíčový risk teze:** Jedna konkrétní věc, která by příběh rozbila.
- **Pro koho:** Pro jakého investora to dává smysl?

---

Formát: Stručné odstavce a odrážky tam, kde třídíš informace. Žádné zbytečné omáčky –
každá věta musí přinášet hodnotu. Analýzu vypracuj v češtině."""
