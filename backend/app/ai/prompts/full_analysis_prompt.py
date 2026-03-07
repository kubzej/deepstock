"""
Prompt template for full company analysis report.
Adapted from user's "Prompt pro analýzu akcie #2".
"""

SYSTEM_PROMPT = """Jsi zkušený akciový analytik. Připravuješ komplexní investiční analýzy jako
podklad pro investiční rozhodnutí. Tvůj styl psaní je jako Walter Isaacson – narativní,
poutavý způsob, který spojuje fakta s příběhem, odhaluje charaktery (management, firma)
a vytváří komplexní obraz. Analýzy jsou v češtině, hluboce výzkumné, jdou nad rámec
povrchních informací.

## KRITICKÁ PRAVIDLA – NIKDY NEPORUŠUJ

1. **Nevymýšlej čísla.** Pokud konkrétní číslo (tržby, EPS, price target, tržní podíl,
   datum) není ve zdrojových datech, NEUVÁDEJ ho. Napiš: „Data nedostupná."

2. **Nevymýšlej události ani citace.** Pokud ve zdrojích není přesný citát CEO nebo popis
   konkrétní události, NEVYMÝŠLEJ ho. Parafrázuj jen to, co je ve zdrojích.

3. **Označuj nejistotu.** Používej formulace: „Dle dostupných zdrojů...", „Podle posledních
   zpráv...", „Pravděpodobně..." kdykoli si nejsi 100% jistý přesností.

4. **Chybějící sekce.** Pokud nemáš dostatek dat pro celou sekci, napiš explicitně:
   „⚠ Pro tuto sekci nejsou k dispozici dostatečná data."

5. **Čísla pouze ze zdrojů.** Všechna finanční čísla musí pocházet z fundamentálních dat
   v kontextu nebo z citovaných webových zdrojů. Nikdy je nedoplňuj z vlastní paměti –
   ta může být zastaralá o měsíce nebo roky.

6. **Kvalita nad rozsahem.** Raději kratší, přesný report než dlouhý plný spekulací."""


def build_user_prompt(
    ticker: str,
    company_name: str,
    current_price: float,
    date: str,
    fundamentals_context: str,
    search_context: str,
) -> str:
    return f"""Vypracuj komplexní investiční analýzu společnosti {company_name} ({ticker}).

**Aktuální cena:** {current_price} USD
**Datum analýzy:** {date}

---

## FUNDAMENTÁLNÍ DATA Z DATABÁZE

{fundamentals_context}

---

## ZDROJE: ZPRÁVY, ANALYTICKÉ REPORTY, DISKUSE (z webu)

{search_context}

---

## INSTRUKCE

Vypracuj komplexní akciovou analýzu, která integruje výše uvedená data a zprávy.
Analýza musí jít nad rámec povrchních informací – racionalizuj data, hledej neočividné
souvislosti a identifikuj faktory, které trh může přehlížet nebo nesprávně oceňovat.

Piš ve stylu Waltera Isaacsona – narativně, poutavě, s nadpisy a podnadpisy.
Odrážky používej výhradně při dělení, třídění nebo kategorizaci informací.

### Struktura analýzy:

**1. Obchodní model a zdroje příjmů**
Detailně popiš, čím se společnost zabývá a jak generuje peníze. Co jsou hlavní revenue streams?
Jaké jsou strukturální výhody tohoto modelu?

**2. Konkurenční výhoda (moat)**
V čem se společnost odlišuje od konkurence? Co ji chrání před konkurencí? Proč by si zákazníci
měli vybrat právě její produkty nebo služby? Je tento moat trvalý nebo dočasný?

**3. Hodnocení managementu (1–10)**
Proveď průzkum o vedení společnosti a ohodnoť je. Zohledni jejich track record, strategická
rozhodnutí, komunikaci s investory a schopnost realizovat plány. Uveď konkrétní příklady
úspěchů i selhání.

**4. Analýza trhu**
Popiš trh, na kterém společnost působí – velikost TAM, dynamiku, tempo růstu a klíčové trendy.
Jaká je pozice firmy v tomto trhu? Roste trh nebo stagnuje?

**5. Riziková analýza**
Identifikuj hlavní bear case (největší existenční nebo strukturální riziko) a 2–3 menší rizika.
Buď konkrétní – ne generické "tržní riziko".

**6. Investiční teze – oba pohledy**
*Bull case:* Proč investice při ceně {current_price} USD bude fungovat? Jaké jsou konkrétní
katalyzátory a na jakém časovém horizontu?
*Bear case:* Proč nebude fungovat? Jaké scénáře by investici zničily?

**7. Momentum a katalyzátory**
Jaké momentum má firma v krátkodobém až střednědobém horizontu? Jaké katalyzátory ji
pohánějí? Jak firma těží ze současných tržních a makroekonomických trendů?

**8. Tržní neefektivity (co trh přehlíží)**
Identifikuj, co trh může nesprávně oceňovat nebo podceňovat. Kde se skrývá skrytá hodnota?
Co analytici systematicky přehlížejí?

**9. Souhrn analytických reportů**
Shrň názory, argumenty a projekce analytiků z nejnovějších reportů (po posledním kvartálu).
Jaký je konsenzus? Kde jsou největší neshody? Průměrný price target a konsenzus Buy/Hold/Sell.

**10. Závěrečné hodnocení – investiční verdikt**
Strukturovaný závěr ve 4 bodech:

- **Verdikt:** Koupit / Přikoupit / Čekat / Vyhnout se – a proč. Zahrň valuační kontext:
  je akcie při {current_price} USD podhodnocená, férová, nebo drahá? Buď konkrétní.
- **Vstupní logika:** Při jaké ceně teze dává smysl? Existuje lepší vstupní bod, a pokud
  ano, co by ho spustilo (výsledky, makro, sentiment)?
- **Klíčový risk teze:** Jedna věc, která by celý dlouhodobý investiční příběh rozbila.
  Může to být strukturální riziko byznysu, regulace, nebo chyba v tezi samotné.
- **Pro koho:** Pro jakého investora to dává smysl? (časový horizont 1/3/5+ let, tolerance
  volatility, koncentrace vs. diverzifikovaný přístup)

---

Celou analýzu vypracuj v češtině."""
