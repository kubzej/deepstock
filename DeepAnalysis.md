# DeepStock — Deep Analysis

> Datum: 2026-04-03  
> Verze: na základě aktuálního stavu repozitáře  
> Role: Senior developer + UX/UI designer + uživatel + akciový analytik/investor

---

## Obsah

1. [Bugs — potvrzené problémy](#1-bugs--potvrzené-problémy)
2. [Performance — výkonnostní problémy](#2-performance--výkonnostní-problémy)
3. [Architektura — mezery a tech debt](#3-architektura--mezery-a-tech-debt)
4. [Bezpečnost](#4-bezpečnost)
5. [UX/UI — uživatelský zážitek](#5-uxui--uživatelský-zážitek)
6. [Investorský pohled — missing features a vylepšení](#6-investorský-pohled--missing-features-a-vylepšení)
7. [Návrhy na nové featury](#7-návrhy-na-nové-featury)

---

## 1. Bugs — potvrzené problémy

### 1.1 `datetime.utcnow()` — deprecated v Python 3.12

**Kde:** `backend/app/services/portfolio.py`, `backend/app/services/price_alerts.py`, `backend/app/services/options.py` a další

**Problém:** `datetime.utcnow()` je deprecated od Pythonu 3.12. Vrací naive datetime bez timezone info, což může způsobit problémy při porovnávání s timezone-aware hodnotami z Supabase (TIMESTAMPTZ).

**Konkrétně:**
```python
# portfolio.py:709
"updated_at": datetime.utcnow().isoformat()
# price_alerts.py:208
"last_buy_alert_at": datetime.utcnow().isoformat()
```

**Proč je to problém:** Supabase ukládá TIMESTAMPTZ (UTC), ale naive datetime může způsobit nekonzistentní chování nebo deprecation warnings v logu, které maskují skutečné problémy.

**Jak opravit:** Nahradit `datetime.utcnow()` za `datetime.now(timezone.utc)` (nutný import `from datetime import timezone`).

---

### 1.2 Alert anti-spam — fragile string comparison

**Kde:** `backend/app/services/price_alerts.py:141-143`

**Problém:**
```python
last_alert_price = item.get("last_buy_alert_price")
if str(last_alert_price) != str(target_buy):
```

Logika předpokládá, že pokud cena alertu je jiná než poslední odeslaná, pošle nový alert. Ale porovnání přes `str()` na Decimal/float hodnotách je fragile — `str(Decimal("150.00"))` vs `str(150.0)` vrátí různé stringy i pro stejnou hodnotu. Navíc pokud `last_alert_price` je `None`, string bude `"None"` a nikdy nebude roven žádné číselné hodnotě — alert se tedy pošle pokaždé, dokud není cíl splněn, ne jen jednou.

**Jak opravit:** Porovnávat jako floaty s malou tolerancí (`abs(float(a) - float(b)) < 0.0001`) nebo resetovat flag jinak (např. dedup klíčem v Redis jako u custom alerts).

---

### 1.3 Hardcoded USD symbol v alert notifikacích

**Kde:** `backend/app/services/price_alerts.py:170, 188`

**Problém:**
```python
body = f"{stock_name} je na ${current_price:.2f} (cíl: ${target:.2f})"
```

Znak `$` je hardcoded. Akcie na LSE mají cenu v GBp (pence), akcie na frankfurtské burze v EUR atd. Pro TSCO.L uvidíš notifikaci "je na $362.40" místo "£3.62" (LSE ceny jsou v pencích, scale = 0.01).

**Kde podobný problém není:** Custom alert notifikace (`_send_custom_alert_notification`) má stejný problém.

**Jak opravit:** Přidat currency lookup ze stock dat a formátovat symbol správně. Případně odebrat symbol a psát jen číslo + ticker.

---

### 1.4 `setTimeout` hack při edit stock

**Kde:** `frontend/src/App.tsx:92-94`

**Problém:**
```typescript
const handleEditSuccess = () => {
  const ticker = editStock?.ticker;
  setEditStock(null);
  if (ticker) {
    setSelectedTicker(null);
    setTimeout(() => setSelectedTicker(ticker), 100); // hack!
  }
};
```

`setTimeout(fn, 100)` je race condition čekající na výpadek. Unmount + remount StockDetail se dělá přes arbitrární 100ms delay. Pokud je počítač pomalý nebo React pomalejší, komponenta se nemusí stihnout unmountovat.

**Jak opravit:** Použít `queryClient.invalidateQueries` pro konkrétní query keys (`stockInfo`, `quotes`) místo unmount/remount celé komponenty. Stock detail by se sám aktualizoval.

---

### 1.5 `deleteStock` bez query invalidation

**Kde:** `frontend/src/App.tsx:101-113`

**Problém:**
```typescript
const handleDeleteConfirm = async () => {
  await deleteStock(deleteStockData.id);
  setDeleteStockData(null);
  setSelectedTicker(null);
  setActiveTab('stocks');
  // chybí: queryClient.invalidateQueries(...)
};
```

Po smazání akcie se neprovedou žádné cache invalidations. Holdings, open lots, quotes cache — vše zůstane stale. Na stránce stocks může ještě chvíli stát smazaná akcie.

**Jak opravit:** Přidat `invalidateQueries` pro `['holdings']`, `['stocks']`, `['openLots']`, `['quotes']`.

---

### 1.6 Chybějící migrace 007

**Kde:** `supabase/migrations/`

**Problém:** Migrace jdou: `006_watchlist_enhancements.sql` → `008_watchlist_position.sql`. Číslo 007 chybí. Buď bylo přeskočeno nebo existovalo a bylo smazáno. Pokud někdy bude třeba replikovat databázi nebo spustit migrace nanovo, pořadí nebude konzistentní.

**Jak opravit:** Zdokumentovat (prázdný soubor `007_placeholder.sql` s komentářem) nebo ověřit, že mezera je záměrná.

---

### 1.7 Dual `PortfolioProvider` v App.tsx

**Kde:** `frontend/src/App.tsx:117-172` a `225-247`

**Problém:** App.tsx má dvě větve renderování — jedna pro `selectedTicker` (stock detail view) a jedna pro normální navigaci. Obě mají vlastní `<PortfolioProvider>`. Pokud uživatel přejde na stock detail, vznikne nový PortfolioProvider s novým state (selectedPortfolioId = undefined), což může způsobit flash nebo resetování výběru portfolia.

**Jak opravit:** PortfolioProvider by měl být jednou na úrovni celé app (nejlépe v `main.tsx`), ne podmíněně uvnitř App.

---

### 1.8 OBV kalkulace — Python loop místo vektorizace

**Kde:** `backend/app/services/market/technical.py:91-99`

**Problém:**
```python
obv = [0]
for i in range(1, len(df)):
    if df['close'].iloc[i] > df['close'].iloc[i-1]:
        obv.append(obv[-1] + df['volume'].iloc[i])
    ...
```

Pro 2-leté denní data (~500 řádků) to není velký problém, ale `.iloc` v loop je pomalé. Navíc Python loop není vektorizovaný — pandas `numpy` backend se nepoužije.

**Jak opravit:**
```python
direction = np.sign(df['close'].diff()).fillna(0)
df['obv'] = (direction * df['volume']).cumsum()
```

---

## 2. Performance — výkonnostní problémy

### 2.1 N+1 query v `_get_sold_amount_for_buy_lot`

**Kde:** `backend/app/services/portfolio.py:46-110`

**Problém:** Metoda `_get_sold_amount_for_buy_lot` se volá v `update_transaction` a `delete_transaction`. Dělá **3 separátní databázové dotazy** pro každý BUY lot:
1. Explicit linked sells
2. FIFO sells (bez source_transaction_id)
3. Všechny BUY transakce pro FIFO alokaci

Pokud uživatel bude mít portfolio s desítkami transakci a bude editovat, každá editace = 3+ DB roundtrips.

**Jak opravit:** Načíst všechny transakce pro daný stock/portfolio jedním dotazem a zpracovat v paměti (stejně jako `_recalculate_holding`).

---

### 2.2 Duplicitní FIFO logika

**Kde:** `backend/app/services/portfolio.py`

**Problém:** FIFO lot-tracking logika je implementována **třikrát**:
- `get_all_open_lots()` (řádky ~458-546)
- `get_all_open_lots_for_user()` (řádky ~292-390)
- `get_available_lots()` (řádky ~548-610)

Navíc v `_recalculate_holding()` je čtvrtá varianta. Všechny mají mírně odlišné API a různé edge case handling. Jakákoli oprava chyby v FIFO logice musí být provedena na 4 místech.

**Jak opravit:** Extrahovat FIFO kalkulaci do jedné pure funkce `calculate_remaining_lots(buy_transactions, sell_transactions) -> dict[str, float]`.

---

### 2.3 `ExchangeRateService` — nová instance při každém performance výpočtu

**Kde:** `backend/app/services/performance.py:202`

**Problém:**
```python
exchange_service = ExchangeRateService()
rates = await exchange_service.get_rates()
```

Vytváří novou instanci při každém volání `get_stock_performance`. Sice existuje modul-level singleton `exchange_service` v `exchange.py`, ale performance.py ho nepoužívá.

**Jak opravit:** Importovat `from app.services.exchange import exchange_service` a používat singleton.

---

### 2.4 Exchange rates fetching — 2 batche yfinance downloads

**Kde:** `backend/app/services/exchange.py:53-76`

**Problém:** Pro kurzy se volá `yf.download()` dvakrát — jednou pro přímé páry (USD, EUR, GBP, CHF) a jednou pro cross-rate páry. Každý download je HTTP request.

**Jak opravit:** Sloučit do jednoho `yf.download()` volání se všemi tickery najednou.

---

### 2.5 Performance kalkulace — načítá VŠECHNY transakce bez portfolio filtru

**Kde:** `backend/app/services/performance.py:84-86`

**Problém:**
```python
query = supabase.table("transactions") \
    .select("*, stocks(ticker, currency, price_scale)") \
    .order("executed_at", desc=False)
```

Query nejdříve načte transakce bez limitu, pak přidá portfolio filter. U uživatele s tisíci transakcemi to může být pomalé.

**Jak opravit:** Minor — FastAPI/Supabase lazy query chain to řeší, `.in_()` se přidá před `.execute()`. Ale pattern je zmatující.

---

## 3. Architektura — mezery a tech debt

### 3.1 Hardcoded owner UUID v `journal.py`

**Kde:** `backend/app/services/journal.py:14`

**Problém:**
```python
_OWNER_USER_ID = "c5e00af6-13b1-42e4-b6e1-f3bf43fc2028"
```

UUID je hardcoded přímo v kódu. Komentář říká "single-user app", ale je to code smell — UUID v kódu nepatří. Pokud se změní user (re-signup, jiné prostředí), kód přestane fungovat.

**Jak opravit:** Přesunout do `.env` jako `OWNER_USER_ID` nebo lépe — předávat user_id vždy explicitně přes call chain.

---

### 3.2 Stav-based routing — žádná URL, žádný back button

**Kde:** `frontend/src/App.tsx:39` (`activeTab` state)

**Problém:** Routing je implementován přes `useState('home')`. To znamená:
- Žádná URL — uživatel nemůže bookmarkovat stránku
- Back button prohlížeče nefunguje
- Refresh stránky vždy vrátí na dashboard
- Deep linking není možný (sdílení odkazu na konkrétní stock)

**Jak opravit:** Přidat react-router-dom nebo použít URL hash pro state (`#/stocks`, `#/research/AAPL`). Minimalisticky stačí `window.location.hash` + `hashchange` event listener.

---

### 3.3 AI research cache — nekonzistentní invalidation strategy

**Kde:** `backend/app/api/endpoints/ai_research.py`

**Problém:** Cache klíč je `ai_research:{ticker}:{report_type}:{today}`. To znamená:
- Report se generuje jednou denně (24h TTL + date v klíči)
- Ale TTL v cache je také 24h — klíč tedy nikdy nevyprší v rámci dne
- Pokud uživatel vygeneruje report v 23:59 a znovu v 00:01 druhého dne, dostane nový report (jiný klíč) i když cena a data jsou stejné

Technical analysis má navíc parametr `period` v klíči — ale briefing a full_analysis ne. Logika je asymetrická.

---

### 3.4 Cron endpoints — žádná rate limitace ani IP whitelist

**Kde:** `backend/app/api/endpoints/cron.py`

**Problém:** Cron endpointy jsou zabezpečeny pouze `X-Cron-Secret` header. Kdokoli kdo zná secret ho může volat libovolně rychle. Aktuálně chybí:
- Rate limiting na cron endpointy
- IP whitelist (Railway cron runner má fixní IP)

Útočník se secretem mohl by spamovat notifikace nebo způsobit masivní yfinance load.

---

### 3.5 `recalculate_all_portfolios` — bez autentizace, bez endpointu

**Kde:** `backend/app/services/portfolio.py:210-222`

**Problém:** Metoda existuje ale není vystavena jako API endpoint. To je ok. Ale metoda nemá žádnou verifikaci ownership — přepočítá VŠECHNY portfolia všech uživatelů. Pokud by byla někdy přidána jako admin endpoint, musí být explicitně chráněna.

---

### 3.6 `TransactionUpdate` model definovaný za `PortfolioService`

**Kde:** `backend/app/services/portfolio.py:827`

**Problém:** `TransactionUpdate` Pydantic model je definován na řádku 827, ale je používán v metodách třídy `PortfolioService` (řádky ~713, 753) jako forward reference string `'TransactionUpdate'`. Python to sice zvládne, ale je to anti-pattern — model by měl být definován před třídou nebo v separátním schemas souboru.

---

### 3.7 Supabase service role key — backend může obejít RLS

**Kde:** `backend/app/core/supabase.py`

**Problém:** Backend pravděpodobně používá `service_role_key` pro Supabase client, který bypasuje RLS. To je záměrné (backend dělá vlastní auth přes JWT). Ale znamená to, že **každá chyba v backend auth logice = přístup ke všem datům**. Tento design je ok pro single-user app, ale je třeba si to uvědomovat.

---

## 4. Bezpečnost

### 4.1 JWT JWKS fallback na HS256 s loggingem

**Kde:** `backend/app/core/auth.py:55-62`

**Stav:** Spíše poznámka než bug. Pokud JWKS selže, backend fallbackne na HS256 s `SUPABASE_JWT_SECRET`. To je záměrné a správné. Ale fallback loguje warning — v produkci by to mohlo spamovat logy pokud Supabase JWKS endpoint bude nestabilní.

---

### 4.2 CORS whitelist — `localhost:3000` zbytečný

**Kde:** `backend/app/main.py:36-43`

**Problém:** `http://localhost:3000` je v CORS listu ale app běží na `localhost:5173` (Vite). Port 3000 není nikde použit. Zbytečný CORS origin — nevadí v dev, ale v produkci je to malý leak.

---

### 4.3 `.env` soubory v repozitáři

**Kde:** `backend/.env`, `frontend/.env`

**Problém:** Soubory `.env` jsou přítomny v repozitáři (viděl jsem je v file listu). Doufám, že jsou v `.gitignore`. Pokud ne, API klíče jsou exposed.

---

## 5. UX/UI — uživatelský zážitek

### 5.1 Loading state v App.tsx — minimalistický

**Kde:** `frontend/src/App.tsx:50-56`

**Problém:**
```tsx
return (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <p className="text-muted-foreground">Načítání...</p>
  </div>
);
```

Holý text "Načítání..." při auth check. Trvá jen chvíli, ale prázdná obrazovka + text je vizuálně slabé.

**Jak opravit:** Přidat logo nebo loading skeleton odpovídající designu aplikace.

---

### 5.2 Žádný browser history support

*viz 3.2* — uživatel nemůže použít back button, bookmarky, přímé URL.

---

### 5.3 Zobrazení non-USD cen v notifikacích

*viz bug 1.3* — notifikace říká `$362.40` pro TSCO.L (Tesco UK), správně by mělo být `£3.62`.

---

### 5.4 Delete Stock — žádný feedback o transakčním dopadu

**Kde:** `frontend/src/App.tsx:141-169`

**Problém:** Dialog říká "Smazáním akcie smažete i všechny transakce a holdings s ní spojené." Ale neukazuje konkrétní čísla — kolik transakcí, jaké holdings, jaká realizovaná P/L se ztratí. Jako investor chci vědět co přijdu o data.

**Jak opravit:** Zobrazit počet transakcí a holdings před potvrzením (rychlý GET query na transactions count).

---

### 5.5 Edit transakce — chybí validace při editaci SELL s vazbou na lot

**Kde:** Backend tuto validaci dělá, ale UX na frontendu na chybu špatně reaguje

**Problém:** Pokud uživatel zkusí editovat BUY transakci ze které jsou prodeje, backend vrátí 400 s textem. Frontend by měl toto zobrazit prominentně, ideálně s výpisem SELL transakcí, které blokují úpravu.

---

### 5.6 Watchlist — žádné zobrazení, v jakém portfoliu je akcie

**Kde:** Watchlist stránka

**Problém:** Watchlist item ukazuje cenu, target, atd., ale neukazuje, zda danou akcii uživatel vlastní a v jakém portfoliu. Jako investor chci vidět "tohle už vlastním (150 ks v Hlavním portfoliu)" přímo u watchlist itemu.

---

### 5.7 Research page — AI report cache neviditelná pro uživatele

**Kde:** `frontend/src/components/research/`

**Problém:** Uživatel neví, jestli vidí dnes vygenerovaný report nebo 23 hodin starý. `DataFreshnessIndicator` komponenta existuje, ale není jisté, zda se používá na research page.

---

## 6. Investorský pohled — missing features a vylepšení

### 6.1 Performance chart — TWR kalkulace je aproximace

**Kde:** `backend/app/services/performance.py:270-285`

**Problém:**
```python
total_return = end_value - start_value - net_investment
total_return_pct = (total_return / start_value * 100) if start_value > 0 else 0
```

Toto **není** Time-Weighted Return (TWR). Je to Simple Return upravený o přidaný kapitál. Problém: pokud uživatel přidal velkou hotovost uprostřed období, číslo bude zkreslené. Skutečný TWR počítá výkonnost po sub-periódách (mezi cash flows) a skládá je geometricky.

**Konkrétní dopad:** Pokud portfolio v Lednu mělo 100k, vyrostlo na 110k (+10%), pak v prosinci přidám 1M a portfolio zakončí rok na 1.12M, algoritmus spočítá `(1.12M - 100k - 1M) / 100k = 20%` — nesmysl.

**Jak opravit:** Implementovat Modified Dietz nebo skutečný TWR s sub-period geometrickým skládáním.

---

### 6.2 Realized P/L nepočítá poplatky

**Kde:** `backend/app/services/portfolio.py:693`

**Problém:**
```python
realized_pnl += (sell_shares * sell_price) - cost_of_sold
```

Poplatky (`fees`) se nezapočítávají do realized P/L. Pokud zaplatím $20 fees na nákup a $20 na prodej, real P/L je o $40 horší. Holdings ukazují `realized_pnl` bez fees.

**Jak opravit:** Přičíst fees BUY transakce k cost_of_sold, odečíst fees SELL transakce od výnosu.

---

### 6.3 Chybí cost basis v CZK pro non-USD akcie při historickém kurzu

**Kde:** `backend/app/services/portfolio.py:641`

**Problém:**
```python
tx_amount_czk = float(tx.get("total_amount_czk") or tx_amount)
```

Pokud `total_amount_czk` není v transakci (starší data nebo zapomnělo se zadat), použije se `total_amount` v původní měně jako CZK. Pro USD akcie at cca 23 CZK/USD je toto dramaticky špatné.

**Jak opravit:** Pokud chybí `total_amount_czk`, použít alespoň `exchange_rate_to_czk * total_amount` pokud je rate dostupný.

---

### 6.4 Žádné portfolio srovnání s benchmarkem (S&P 500, MSCI World)

**Kde:** `backend/app/services/performance.py` — `benchmark_return_pct: Optional[float] = None`

**Problém:** Pole `benchmark_return_pct` existuje v datovém modelu, ale je vždy `None`. Chart proto nikdy neukazuje, jak si portfolio vede oproti indexu. Jako investor chci vědět: "překonal jsem S&P 500?"

**Jak implementovat:** Přidat yfinance fetch pro `^GSPC` (S&P 500) za stejné období a normalizovat na stejnou startovní hodnotu.

---

### 6.5 Options — žádný Greeks dashboard

**Kde:** `frontend/src/components/options/`

**Problém:** Greeks (delta, gamma, theta, vega) jsou součástí datového modelu a `OptionPriceUpdate` schématu, ale není žádný ucelený dashboard zobrazující agregované portfolio greeks. Jako options trader chci vidět celkové portfolio delta (net exposure) a portfolio theta (denní time decay).

---

### 6.6 Žádný dividend tracking

**Kde:** Celá aplikace

**Problém:** Dividendy nejsou součástí žádného modelu ani logiky. Pro dividend investors (nebo DCA strategie) je to kritická mezera. Total return akcie zahrnuje dividendy — bez nich je performance kalkulace nepřesná.

**Jak implementovat:** Přidat `DIVIDEND` typ transakce, zahrnout do P/L kalkulace.

---

### 6.7 Insider trades alert — notifikace chybí

**Kde:** `backend/app/api/endpoints/insider.py`, cron

**Problém:** Insider trades se zobrazují v UI, ale neexistuje alerting na nové insider aktivity. Jako investor chci dostat push notifikaci, když CEO koupí akcii z mého watchlistu.

---

### 6.8 Watchlist — chybí "set alert při target" z watchlist view

**Kde:** `frontend/src/components/watchlists/`

**Problém:** Uživatel může nastavit target buy/sell cenu v watchlistu, ale nemůže přímo z watchlistu vytvořit custom price alert. Dvě oddělené funkce (watchlist targets + custom alerts) se překrývají a matou.

---

## 7. Návrhy na nové featury

Řazeno od nejhodnotnějšího po detail. Každá featůra má: **co to je, proč to přidat, jak implementovat**.

---

### 7.1 ★★★★★ Portfolio snapshot / denní briefing (AI)

**Co:** Ranní souhrn portfolia — AI vygeneruje 3-5 větý briefing každé ráno: co se děje v portfoliu, klíčové events (earnings dnešního dne, velké pohyby), jeden tip na pozornost.

**Proč:** Největší gap pro aktivního investora. Místo toho aby uživatel musel otevřít app a projít všechny sekce, dostane proaktivní shrnutí.

**Jak:** Cron job ráno (8:00 CET), existující `briefing_prompt.py` + push notifikace. Stačí rozšířit existující cron systém.

---

### 7.2 ★★★★★ Benchmark srovnání v performance chartu

**Co:** Zobrazit S&P 500 (nebo vlastní benchmark) jako overlay v performance chartu.

**Proč:** Bez benchmarku nemá výkonnost portfolia kontext. +15% YTD zní skvěle, ale pokud index udělal +25%, je to prohra.

**Jak:** Přidat yfinance fetch pro `^GSPC`, `^IXIC`, nebo custom ticker do performance endpointu. Frontend přidá toggle.

---

### 7.3 ★★★★☆ URL-based routing

**Co:** React Router nebo hash-based routing místo `activeTab` state.

**Proč:** Back button, bookmarky, přímé URL, sharing. Základní web expectation.

**Jak:** `react-router-dom` + `createHashRouter` (hashRouter nevyžaduje server config pro SPA). Minimální migrace — každý `case` v switchi se stane `<Route>`.

---

### 7.4 ★★★★☆ True TWR performance kalkulace

**Co:** Nahradit aproximaci skutečným Time-Weighted Return (Modified Dietz nebo geometrické skládání).

**Proč:** Správné měření výkonnosti je základ portfolio analytics. Aktuální číslo může být dramaticky zavádějící při velkých cash flows.

**Jak:** Rozdělit historii na sub-periody (mezi každým BUY/SELL), spočítat return každé sub-periody, složit geometricky.

---

### 7.5 ★★★★☆ Dividend tracking

**Co:** Nový typ transakce `DIVIDEND`, zobrazení v historii, zahrnutí do P/L.

**Proč:** Dividendy jsou reálný příjem. Bez nich je P/L neúplné. Pro DRIPy (dividend reinvestment) je to dvojnásob důležité.

**Jak:** Migrace přidá `DIVIDEND` do transaction_type enum. P/L kalkulace přidá dividendy k realized gains. UI přidá forma pro zápis.

---

### 7.6 ★★★★☆ Portfolio Greeks dashboard (options)

**Co:** Sumář portfolia řeckých písmen: net delta, portfolio theta (daily decay), net vega.

**Proč:** Klíčový pohled pro options trader. Momentálně musí uživatel ručně agregovat greeks v hlavě.

**Jak:** Backend agreguje Greeks ze všech open option holdings (již jsou v DB). Frontend zobrazí v Options stránce.

---

### 7.7 ★★★☆☆ Watchlist + portfolio integrace

**Co:** U watchlist itemu zobrazit, zda a kolik uživatel drží v portfoliu.

**Proč:** "Sleduju akcii, ale nevím jestli ji už vlastním" — časté. Propojení watchlist ↔ holdings zlepší orientaci.

**Jak:** Watchlist items endpoint vrátí enriched data z holdings. Frontend přidá badge "Vlastním X ks".

---

### 7.8 ★★★☆☆ Insider alert notifikace

**Co:** Push notifikace při nové insider aktivitě pro akcie z watchlistu nebo portfolia.

**Proč:** Insider buying je jeden z nejsilnějších fundamentálních signálů. Automatický alert má velkou hodnotu.

**Jak:** Cron job denně fetchuje insider data (SEC Form 4), porovná s watchlist tickers, pošle notifikaci pro nové transakce od posledního checku.

---

### 7.9 ★★★☆☆ Export dat (CSV/Excel)

**Co:** Export transakcí, holdings, P/L do CSV nebo Excel.

**Proč:** Daňové přiznání, import do jiného nástroje, záloha dat. Každý investor to dříve nebo později potřebuje.

**Jak:** Backend endpoint `GET /api/portfolio/export?format=csv` — pandas `to_csv()`. Frontend tlačítko v transaction history.

---

### 7.10 ★★★☆☆ Pořizovací cena vs. aktuální cena na watchlistu

**Co:** Pokud uživatel vlastní akcii z watchlistu, zobrazit cost basis přímo ve watchlist view.

**Proč:** Rychlý přehled — "AAPL na $195, mám nákup za $150" viditelný přímo bez přepínání na portfolio.

**Jak:** Join holdings dat do watchlist items query (backend).

---

### 7.11 ★★☆☆☆ Posílení anti-spam logiky pro alerty

**Co:** Přidat Redis dedup klíč pro watchlist target alerty (jako u custom alerts).

**Proč:** Aktuální string comparison je fragile (viz bug 1.2). Redis dedup klíč s 24h TTL je robustnější.

**Jak:** Před odesláním alertu zkontrolovat `await redis.get(f"alert_sent:wl:{item_id}:{alert_type}")`.

---

### 7.12 ★★☆☆☆ Performance chart — přidat MTD/QTD do výchozích period

**Co:** Přidat Quarter-to-Date (QTD) period do performance chartu.

**Proč:** Jako investor sleduji výkonnost po kvartálech. MTD a YTD jsou tam, QTD chybí.

**Jak:** Backend přidá `"3M"` = current quarter start. Nebo přidat custom range.

---

### 7.13 ★★☆☆☆ Research page — viditelnost stáří reportu

**Co:** Zobrazit timestamp vygenerování AI reportu prominentně.

**Proč:** Uživatel neví, jestli čte čerstvá data nebo 20 hodin starý report.

**Jak:** Backend vrací `generated_at` timestamp v response. Frontend zobrazí "vygenerováno dnes v 8:32" nebo badge "23h starý".

---

### 7.14 ★★☆☆☆ Poplatky v P/L kalkulaci

**Co:** Zahrnout `fees` do realized P/L výpočtu.

**Proč:** Real returns zahrnují poplatky. Při aktivním obchodování mohou poplatky smazat velkou část zisků. Viz bug 6.2.

**Jak:** Upravit `_recalculate_holding` — zahrnout fees BUY do cost basis, fees SELL odečíst od výnosu.

---

## Shrnutí priorit

| Priorita | Oblast | Popis |
|---|---|---|
| 🔴 Kritické | Bug | `datetime.utcnow()` deprecated — opravit všude |
| 🔴 Kritické | Bug | `deleteStock` bez query invalidation |
| 🔴 Kritické | Bug | Hardcoded USD `$` v push notifikacích |
| 🟡 Střední | Bug | Alert anti-spam string comparison |
| 🟡 Střední | Bug | `setTimeout` hack při edit stock |
| 🟡 Střední | Bug | Dual PortfolioProvider v App.tsx |
| 🟡 Střední | Finance | Realized P/L bez fees |
| 🟡 Střední | Finance | Cost basis CZK fallback pro non-CZK transakce |
| 🟡 Střední | Finance | TWR kalkulace nepřesná při velkých cash flows |
| 🟢 Feature | Feature | Benchmark srovnání v performance chartu |
| 🟢 Feature | Feature | URL-based routing |
| 🟢 Feature | Feature | Dividend tracking |
| 🟢 Feature | Feature | Portfolio Greeks dashboard |
| 🔵 Detail | Perf | FIFO logika deduplikace |
| 🔵 Detail | Perf | OBV vectorizace |
| 🔵 Detail | Arch | Hardcoded owner UUID |
| 🔵 Detail | Arch | Migrace 007 gap |
