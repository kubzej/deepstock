"""
Prompt template for full company analysis report.
Adapted from user's "Prompt pro analýzu akcie #2".
"""

SYSTEM_PROMPT = """Jsi zkušený akciový analytik. Připravuješ komplexní investiční analýzy jako
podklad pro investiční rozhodnutí. Tvůj styl psaní je jako Walter Isaacson – narativní,
poutavý způsob, který spojuje fakta s příběhem, odhaluje charaktery (management, firma)
a vytváří komplexní obraz. Analýzy jsou v češtině, hluboce výzkumné, jdou nad rámec
povrchních informací.

Přistupuješ k analýze jako nezávislá třetí strana — ne jako broker hledající příležitost,
ani jako short seller hledající problém. Tvým úkolem je dát investorovi úplný obraz: kde
je firma skutečně silná a kde jsou konkrétní slabiny, které management může zakrývat nebo
trh přehlížet. Optimismus musí být podložen stejně přísně jako kritika.

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

6. **Kvalita nad rozsahem.** Raději kratší, přesný report než dlouhý plný spekulací.

7. **Bez duplicit.** Každé téma pokryj právě jednou. Neopakuj stejné argumenty napříč
   sekcemi; v závěru z nich pouze vyvozuj investiční důsledky."""


def build_user_prompt(
    ticker: str,
    company_name: str,
    current_price: float,
    date: str,
    fundamentals_context: str,
    search_context: str,
    insider_context: str = "",
) -> str:
    return f"""Vypracuj komplexní investiční analýzu společnosti {company_name} ({ticker}).

**Aktuální cena:** {current_price} USD
**Datum analýzy:** {date}

---

## FUNDAMENTÁLNÍ DATA Z DATABÁZE

{fundamentals_context}

---

## INSIDER AKTIVITA (SEC Form 4, posledních 6 měsíců)

{insider_context}

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

**1. Byznys, trh a zdroje příjmů**
Detailně popiš, čím se společnost zabývá, jak generuje peníze a na jakém trhu působí.
Vysvětli hlavní revenue streams, strukturu poptávky, klíčové segmenty, tempo a povahu růstu trhu.
Pojmenuj, zda jde o rostoucí, stagnující nebo cyklický trh, a jaká je aktuální pozice firmy.

**2. Konkurenční výhoda, peers a ocenění**
V čem se společnost odlišuje od konkurence a co ji chrání? Porovnej ji s klíčovými konkurenty
byznysově i valuačně (P/E, EV/EBITDA, marže), pokud jsou data dostupná. Je prémiové nebo
diskontní ocenění oprávněné? Kde má firma navrch a kde zaostává?

**3. Management a kapitálová alokace**
Zhodnoť vedení společnosti a ohodnoť management na škále 1–10. Zohledni track record,
strategická rozhodnutí, komunikaci s investory a schopnost realizovat plány. Současně
zhodnoť, jak management nakládá s kapitálem:
- Buybacky: Jsou disciplinované, nebo firma přeplácí vlastní akcie?
- Dividendy: Politika, udržitelnost payout ratio, historie růstu
- Akvizice: Disciplína při M&A a historická úspěšnost integrací
- Organické investice vs. návratnost kapitálu (ROIC vs. WACC)
Celkově odpověz: je management dobrým správcem kapitálu akcionářů?

**4. Insider aktivita – signál zevnitř**
Na základě SEC Form 4 dat výše posuď, zda jsou insider nákupy signifikantní a zda jsou
prodeje rutinní nebo alarmující. Zohledni i ekonomicky ekvivalentní prodeje, pokud jsou
ve zdrojích popsány. Pokud data chybí, konstatuj to.

**5. Rizika a skeptický pohled**
Identifikuj a roztřiď konkrétní rizika do kategorií: byznysová, regulační/právní, finanční
a makro/geopolitická. Pro každé uveď, co konkrétně hrozí a co by muselo nastat, aby se
riziko materializovalo. Poté přidej skeptický pohled: co by na firmě napadl short seller
nebo forenzní analytik. Hledej konkrétně účetní volby, insider chování neodpovídající
narativu, regulatorní korespondenci, litigation nebo témata, kterým se management vyhýbá.
Pokud nic takového neexistuje, napiš to explicitně.

**6. Makro, geopolitika a sektorové katalyzátory**
Z výsledků vyhledávání zhodnoť, zda jsou pro titul nebo sektor tailwind či headwind:
- Makro: Fed sazby, inflace, stav S&P 500
- Geopolitika a regulace: konflikty, sankce, cla, regulační změny
- Sektorové a sezónní vlivy: komoditní cykly, poptávkové špičky, kapacitní omezení,
  energetická politika nebo jiné specifické katalyzátory v příštích 6–12 měsících
Nakonec vysvětli, jak toto prostředí dopadá konkrétně na tuto firmu.

**7. Co trh může přehlížet**
Identifikuj, co může být v aktuální ceně špatně naceněné nebo podceněné. Zaměř se jen na
body, které ještě nezazněly výše jako prostý popis firmy nebo seznam rizik. Hledej skutečné
tržní neefektivity: skrytou hodnotu, podceněný katalyzátor, strukturální změnu v odvětví,
nebo naopak riziko, které trh bagatelizuje.

**8. Investiční teze a verdikt**
Převeď předchozí zjištění do investičních scénářů bez opakování celé analýzy:
- *Bear case:* Které konkrétní riziko by investiční tezi zničilo, co by ho spustilo,
  na jakém horizontu a jak by pravděpodobně reagovala cena akcie?
- *Bull case:* Proč investice při ceně {current_price} USD může fungovat? Jaké jsou
  konkrétní katalyzátory a co přesně musí nastat, aby se teze naplnila?

Poté dej závěrečný verdikt z pohledu tří strategií:
- **Dlouhodobá pozice (3–5+ let):** Koupit / Přikoupit / Čekat / Vyhnout se — a proč.
- **Střednědobý katalyzátorový trade (3–18 měsíců):** Existuje konkrétní katalyzátor,
  který může akcii přecenit? Pokud ne, řekni to jasně.
- **Krátkodobý / sezónní trade (1–3 měsíce):** Existuje smysluplný setup? Pokud ne,
  explicitně napiš, že krátkodobý setup neexistuje nebo je rizikový.
- **Klíčový risk teze:** Jedna věc, která by zničila investiční příběh bez ohledu na horizont.
- **Vstupní body:** Pro které z výše uvedených strategií dává aktuální nebo jiná cena smysl?

---

Celou analýzu vypracuj v češtině."""
