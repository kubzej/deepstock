import { useState } from 'react';
import { Info, ChevronDown } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { fetchHistoricalFinancials } from '@/lib/api/market';
import { formatLargeNumber, formatRatioAsPercent, formatPrice } from '@/lib/format';

// ── Formatters ────────────────────────────────────────────────────────────────

const fmtX = (v: number | null) => (v == null ? '—' : `${v.toFixed(1)}x`);
const fmtPct = (v: number | null) => formatRatioAsPercent(v, 1);
const fmtLarge = (v: number | null) => (v == null ? '—' : formatLargeNumber(v));

// ── Color helpers ─────────────────────────────────────────────────────────────

const clrGrowth = (v: number | null) =>
  v == null ? '' : v > 0 ? 'text-emerald-500' : v < 0 ? 'text-rose-500' : '';

const clrMul = (v: number | null, lo: number, hi: number) =>
  v == null ? '' : v < lo ? 'text-emerald-500' : v > hi ? 'text-rose-500' : '';

const clrMgn = (v: number | null, good: number, bad: number) =>
  v == null
    ? ''
    : v > good
      ? 'text-emerald-500'
      : v < bad
        ? 'text-rose-500'
        : '';

// ── Tooltips ──────────────────────────────────────────────────────────────────

type TooltipDef = { description: string; good: string; bad: string };

const TOOLTIPS: Record<string, TooltipDef> = {
  'P/E': {
    description:
      'Price-to-Earnings. Tržní kapitalizace dělená čistým ziskem. Kolik investoři platí za 1 jednotku zisku.',
    good: '10–20× je běžné. Pod 15× může být podhodnocené.',
    bad: 'Nad 30× značí vysoká očekávání nebo předražení.',
  },
  PEG: {
    description:
      'Price/Earnings to Growth. P/E děleno očekávaným tempem růstu EPS (v %). Zohledňuje růst při hodnocení valuace.',
    good: 'Pod 1.0 je považováno za podhodnocené vzhledem k růstu.',
    bad: 'Nad 2.0 může být předražené vzhledem k tempu růstu.',
  },
  'Current Ratio': {
    description:
      'Oběžná aktiva dělená krátkodobými závazky. Měří schopnost firmy hradit krátkodobé závazky.',
    good: 'Nad 1.5 je zdravé. Nad 2.0 je velmi konzervativní.',
    bad: 'Pod 1.0 = firma nemá dost likvidních aktiv na pokrytí krátkodobých závazků.',
  },
  'P/B': {
    description:
      'Price-to-Book. Cena akcie dělená účetní hodnotou na akcii (vlastní kapitál / akcie).',
    good: 'Pod 1× může značit podhodnocení. 1–3× je běžné.',
    bad: 'Nad 5× je drahé — závisí hodně na odvětví (tech, fintech běžně výše).',
  },
  'P/S': {
    description:
      'Price-to-Sales. Tržní kapitalizace dělená ročními tržbami. Používá se hlavně u ztrátových firem.',
    good: 'Pod 2× je levné. 2–5× je přijatelné pro rostoucí firmy.',
    bad: 'Nad 10× vyžaduje extrémní růst tržeb pro ospravedlnění.',
  },
  'P/FCF': {
    description:
      'Price-to-Free Cash Flow. Tržní kapitalizace dělená volným peněžním tokem. Odráží skutečnou hotovostní ziskovost.',
    good: '10–20× je zdravé. Pod 15× může být zajímavé.',
    bad: 'Nad 30× je drahé. Záporný FCF → ukazatel není relevantní.',
  },
  'EV/EBITDA': {
    description:
      'Enterprise Value dělená ziskem před úroky, daněmi a odpisy. Používá se pro srovnání bez vlivu různé kapitálové struktury.',
    good: 'Pod 10× je levné. 8–15× je běžné.',
    bad: 'Nad 20× značí předražení nebo vysoký růst.',
  },
  'EV/Revenue': {
    description:
      'Enterprise Value dělená tržbami. Podobné jako P/S, ale zahrnuje i dluh.',
    good: 'Pod 2× je konzervativní. 2–5× přijatelné.',
    bad: 'Nad 10× vyžaduje silný růst a marže.',
  },
  'EV/FCF': {
    description:
      'Enterprise Value dělená volným peněžním tokem. Zahrnuje efekt dluhu — vhodné pro firmy s pákou.',
    good: '10–20× je zdravé.',
    bad: 'Nad 30× je drahé.',
  },
  'Gross Margin': {
    description:
      'Hrubá marže = (Tržby − Náklady na prodej) / Tržby. Základní ziskovost před provozními náklady.',
    good: 'Nad 40% je výborné. Nad 60% je špičkové (software, fintech).',
    bad: 'Pod 20% značí nízkou přidanou hodnotu nebo cenové tlaky.',
  },
  'Operating Margin': {
    description:
      'Provozní marže = Provozní zisk / Tržby. Ziskovost hlavní činnosti před úroky a daněmi.',
    good: 'Nad 20% je velmi dobré. Nad 30% je excelentní.',
    bad: 'Pod 10% značí nízkou efektivitu nebo vysoké náklady.',
  },
  'EBITDA Margin': {
    description:
      'EBITDA / Tržby. Provozní cash ziskovost před odpisy a amortizací. Vhodné pro srovnání mezi odvětvími.',
    good: 'Nad 20% je solidní. Závisí silně na odvětví.',
    bad: 'Pod 10% je slabé pro většinu odvětví.',
  },
  'Net Margin': {
    description:
      'Čistá marže = Čistý zisk / Tržby. Kolik procent tržeb zůstane jako zisk po všech nákladech.',
    good: 'Nad 15% je výborné. Nad 25% je špičkové.',
    bad: 'Pod 5% značí slabou ziskovost nebo vysoké náklady.',
  },
  'FCF Margin': {
    description:
      'Marže volného peněžního toku = FCF / Tržby. Ukazuje, kolik hotovosti firma skutečně generuje z tržeb.',
    good: 'Nad 10% je zdravé. Nad 20% je excelentní.',
    bad: 'Záporná FCF marže = firma spotřebovává hotovost.',
  },
  ROE: {
    description:
      'Return on Equity. Čistý zisk / Vlastní kapitál. Jak efektivně firma zhodnocuje kapitál akcionářů.',
    good: 'Nad 15% je dobré. Nad 20% je výborné.',
    bad: 'Pod 10% značí neefektivní využití kapitálu.',
  },
  ROA: {
    description:
      'Return on Assets. Čistý zisk / Celková aktiva. Efektivita využití celého majetku firmy.',
    good: 'Nad 5% je dobré. Nad 10% je výborné.',
    bad: 'Pod 2% je slabé (závisí na odvětví — banky mají přirozeně nižší).',
  },
  ROIC: {
    description:
      'Return on Invested Capital. Čistý zisk / (Vlastní kapitál + Dluh). Měří efektivitu veškerého investovaného kapitálu.',
    good: 'Nad 10% je dobré. Nad WACC = firma vytváří hodnotu.',
    bad: 'Pod WACC = firma ničí hodnotu.',
  },
  'Earnings Yield': {
    description:
      'Výnosnost zisku = Čistý zisk / Tržní kapitalizace (inverze P/E). Přímé srovnání s dluhopisy.',
    good: 'Nad 5% je zajímavé, zejména pokud převyšuje výnos 10Y dluhopisu.',
    bad: 'Pod 3% = nízká výnosnost relativně k bezrizikovým aktivům.',
  },
  'FCF Yield': {
    description:
      'Výnosnost FCF = FCF / Tržní kapitalizace (inverze P/FCF). Kolik hotovosti získáš za každý investovaný dolar.',
    good: 'Nad 5% je atraktivní.',
    bad: 'Pod 3% je drahé.',
  },
  'Dividend Yield': {
    description: 'Dividendový výnos = Roční dividenda / Cena akcie.',
    good: '2–4% je solidní, stabilní výnos.',
    bad: 'Nad 8% může značit riziko snížení dividendy.',
  },
  Revenue: {
    description:
      'Meziroční růst tržeb (YoY). Klíčový ukazatel dynamiky a expanze firmy.',
    good: 'Nad 10% je solidní. Nad 20% je vysoký růst.',
    bad: 'Záporný růst značí problémy nebo zralý trh.',
  },
  EPS: {
    description:
      'Meziroční růst zisku na akcii (EPS YoY). Odráží jak růst zisku, tak zpětné odkupy akcií.',
    good: 'Nad 10% je zdravé. Konzistentní růst EPS je klíčový.',
    bad: 'Záporný nebo nestabilní EPS growth = varovný signál.',
  },
  'Net Income': {
    description:
      'Meziroční růst čistého zisku (YoY). Absolutní ziskovost bez efektu počtu akcií.',
    good: 'Nad 10% je solidní.',
    bad: 'Záporný růst = problémy s náklady nebo tržbami.',
  },
  EBITDA: {
    description:
      'Meziroční růst EBITDA (YoY). Provozní cash ziskovost bez vlivu odpisů a finanční struktury.',
    good: 'Nad 10% je zdravé.',
    bad: 'Záporný růst může značit provozní problémy.',
  },
  FCF: {
    description:
      'Meziroční růst volného peněžního toku (YoY). FCF growth je lepší ukazatel kvality zisku než čistý zisk.',
    good: 'Pozitivní a rostoucí FCF je klíčové.',
    bad: 'Záporný FCF growth = firma spotřebovává víc hotovosti.',
  },
  'Book Value': {
    description:
      'Meziroční růst účetní hodnoty na akcii (YoY). Odráží akumulaci vlastního kapitálu.',
    good: 'Konzistentní růst účetní hodnoty = firma buduje hodnotu.',
    bad: 'Klesající BV může značit ztráty nebo agresivní odkupy.',
  },
  'Market Cap': {
    description:
      'Tržní kapitalizace ke konci fiskálního roku = cena × počet akcií.',
    good: 'Large cap (>$10B) = stabilní. Mid cap ($2–10B) = růstový potenciál.',
    bad: 'Micro cap (<$300M) = vyšší riziko a volatilita.',
  },
  'Enterprise Value': {
    description:
      'Podniková hodnota = Tržní kapitalizace + Dluh − Hotovost. Celková cena akvizice firmy.',
    good: 'Nižší EV při stejném EBITDA = levnější firma.',
    bad: 'Vysoký dluh zvyšuje EV a risk.',
  },
  'Price at FY End': {
    description:
      'Cena akcie ke konci fiskálního roku. Používá se jako základ pro výpočet historických násobků.',
    good: 'Rostoucí cena v čase odráží tvorbu hodnoty.',
    bad: 'Pokles ceny nemusí = pokles fundamentů (záleží na kontextu).',
  },
};

// ── Table ─────────────────────────────────────────────────────────────────────

type Row =
  | { kind: 'divider' }
  | {
      kind: 'row';
      label: string;
      values: (number | null)[];
      fmt: (v: number | null) => string;
      clr?: (v: number | null) => string;
    };

function Table({
  years,
  rows,
  ltmIdx,
}: {
  years: string[];
  rows: Row[];
  ltmIdx: number;
}) {
  const avgIdx = years.length - 1;
  const isFwdCol = (i: number) => years[i]?.endsWith('E') ?? false;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <colgroup>
          <col className="w-44" />
          {years.map((_, i) => (
            <col key={i} className="min-w-[4rem]" />
          ))}
        </colgroup>

        <thead>
          <tr className="border-b border-border/40">
            <th className="sticky left-0 z-10 bg-background" />
            {years.map((y, i) => {
              const isLtm = i === ltmIdx;
              const isFwd = isFwdCol(i);
              const isAvg = i === avgIdx;
              return (
                <th
                  key={i}
                  className={[
                    'text-right py-2.5 px-3 whitespace-nowrap text-xs font-medium',
                    isLtm
                      ? 'text-foreground font-semibold'
                      : isFwd
                        ? 'text-violet-400'
                        : isAvg
                          ? 'text-muted-foreground/40'
                          : 'text-muted-foreground',
                  ].join(' ')}
                >
                  {y}
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {rows.map((row, ri) => {
            if (row.kind === 'divider') {
              return (
                <tr key={ri} aria-hidden>
                  <td colSpan={years.length + 1} className="py-1.5" />
                </tr>
              );
            }

            const tip = TOOLTIPS[row.label];

            return (
              <tr
                key={ri}
                className="border-t border-border/20 hover:bg-muted/30 transition-colors"
              >
                <td className="sticky left-0 z-10 bg-background py-2 pr-4 whitespace-nowrap">
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <span>{row.label}</span>
                    {tip && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Info className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground/30 hover:text-muted-foreground cursor-pointer transition-colors" />
                        </PopoverTrigger>
                        <PopoverContent side="right" className="max-w-xs p-3">
                          <div className="space-y-1.5 text-xs">
                            <p className="text-sm">{tip.description}</p>
                            <p className="text-emerald-400">✓ {tip.good}</p>
                            <p className="text-rose-400">✗ {tip.bad}</p>
                          </div>
                        </PopoverContent>
                      </Popover>
                    )}
                  </div>
                </td>

                {row.values.map((v, i) => {
                  const isLtm = i === ltmIdx;
                  const isFwd = isFwdCol(i);
                  const isAvg = i === avgIdx;
                  const color = isAvg || isFwd ? '' : row.clr ? row.clr(v) : '';

                  return (
                    <td
                      key={i}
                      className={[
                        'py-2 px-3 text-right text-sm font-mono-price tabular-nums',
                        isLtm
                          ? `font-semibold ${color}`
                          : isFwd
                            ? 'text-violet-400'
                            : isAvg
                              ? 'text-muted-foreground/40'
                              : color,
                      ].join(' ')}
                    >
                      {row.fmt(v)}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Collapsible Section ──────────────────────────────────────────────────────

function CollapsibleSection({
  label,
  tableProps,
  rows,
}: {
  label: string;
  tableProps: { years: string[]; ltmIdx: number };
  rows: Row[];
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="rounded-xl border overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 text-left hover:bg-muted/40 transition-colors"
      >
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          {label}
        </span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground flex-shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-4 pb-4">
          <Table {...tableProps} rows={rows} />
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export function HistoricalFinancialsSection({ ticker }: { ticker: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['historicalFinancials', ticker],
    queryFn: () => fetchHistoricalFinancials(ticker),
    staleTime: 1000 * 60 * 60,
    enabled: !!ticker,
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (!data?.yields) return null;

  const {
    years,
    multiples,
    yields,
    profitability,
    growth,
    health,
    context,
    currency,
  } = data;
  const ltmIdx = years.indexOf('LTM');

  const priceMulRows: Row[] = [
    {
      kind: 'row',
      label: 'P/E',
      values: multiples.pe,
      fmt: fmtX,
      clr: (v) => clrMul(v, 10, 30),
    },
    {
      kind: 'row',
      label: 'PEG',
      values: multiples.peg,
      fmt: fmtX,
      clr: (v) => clrMul(v, 0, 2),
    },
    {
      kind: 'row',
      label: 'P/B',
      values: multiples.pb,
      fmt: fmtX,
      clr: (v) => clrMul(v, 1, 5),
    },
    {
      kind: 'row',
      label: 'P/S',
      values: multiples.ps,
      fmt: fmtX,
      clr: (v) => clrMul(v, 1, 8),
    },
    {
      kind: 'row',
      label: 'P/FCF',
      values: multiples.pfcf,
      fmt: fmtX,
      clr: (v) => clrMul(v, 10, 30),
    },
  ];

  const evMulRows: Row[] = [
    {
      kind: 'row',
      label: 'EV/EBITDA',
      values: multiples.ev_ebitda,
      fmt: fmtX,
      clr: (v) => clrMul(v, 8, 20),
    },
    {
      kind: 'row',
      label: 'EV/Revenue',
      values: multiples.ev_revenue,
      fmt: fmtX,
      clr: (v) => clrMul(v, 2, 10),
    },
    {
      kind: 'row',
      label: 'EV/FCF',
      values: multiples.ev_fcf,
      fmt: fmtX,
      clr: (v) => clrMul(v, 10, 30),
    },
  ];

  const marginsRows: Row[] = [
    {
      kind: 'row',
      label: 'Gross Margin',
      values: profitability.gross_margin,
      fmt: fmtPct,
      clr: (v) => clrMgn(v, 0.4, 0.2),
    },
    {
      kind: 'row',
      label: 'Operating Margin',
      values: profitability.operating_margin,
      fmt: fmtPct,
      clr: (v) => clrMgn(v, 0.2, 0),
    },
    {
      kind: 'row',
      label: 'EBITDA Margin',
      values: profitability.ebitda_margin,
      fmt: fmtPct,
      clr: (v) => clrMgn(v, 0.2, 0),
    },
    {
      kind: 'row',
      label: 'Net Margin',
      values: profitability.net_margin,
      fmt: fmtPct,
      clr: (v) => clrMgn(v, 0.15, 0),
    },
    {
      kind: 'row',
      label: 'FCF Margin',
      values: profitability.fcf_margin,
      fmt: fmtPct,
      clr: (v) => clrMgn(v, 0.1, 0),
    },
  ];

  const returnsRows: Row[] = [
    {
      kind: 'row',
      label: 'ROE',
      values: profitability.roe,
      fmt: fmtPct,
      clr: (v) => clrMgn(v, 0.15, 0),
    },
    {
      kind: 'row',
      label: 'ROA',
      values: profitability.roa,
      fmt: fmtPct,
      clr: (v) => clrMgn(v, 0.05, 0),
    },
    {
      kind: 'row',
      label: 'ROIC',
      values: profitability.roic,
      fmt: fmtPct,
      clr: (v) => clrMgn(v, 0.1, 0),
    },
  ];

  const yieldsRows: Row[] = [
    {
      kind: 'row',
      label: 'Earnings Yield',
      values: yields.earnings_yield,
      fmt: fmtPct,
      clr: (v) => clrMgn(v, 0.05, 0),
    },
    {
      kind: 'row',
      label: 'FCF Yield',
      values: yields.fcf_yield,
      fmt: fmtPct,
      clr: (v) => clrMgn(v, 0.05, 0),
    },
    {
      kind: 'row',
      label: 'Dividend Yield',
      values: yields.dividend_yield,
      fmt: fmtPct,
    },
  ];

  const growthRows: Row[] = [
    {
      kind: 'row',
      label: 'Revenue',
      values: growth.revenue_growth,
      fmt: fmtPct,
      clr: clrGrowth,
    },
    {
      kind: 'row',
      label: 'EPS',
      values: growth.eps_growth,
      fmt: fmtPct,
      clr: clrGrowth,
    },
    {
      kind: 'row',
      label: 'Net Income',
      values: growth.net_income_growth,
      fmt: fmtPct,
      clr: clrGrowth,
    },
    {
      kind: 'row',
      label: 'EBITDA',
      values: growth.ebitda_growth,
      fmt: fmtPct,
      clr: clrGrowth,
    },
    {
      kind: 'row',
      label: 'FCF',
      values: growth.fcf_growth,
      fmt: fmtPct,
      clr: clrGrowth,
    },
    {
      kind: 'row',
      label: 'Book Value',
      values: growth.book_value_growth,
      fmt: fmtPct,
      clr: clrGrowth,
    },
  ];

  const contextRows: Row[] = [
    { kind: 'row', label: 'Revenue', values: context.revenue, fmt: fmtLarge },
    {
      kind: 'row',
      label: 'Net Income',
      values: context.net_income,
      fmt: fmtLarge,
    },
    {
      kind: 'row',
      label: 'Free Cash Flow',
      values: context.free_cashflow,
      fmt: fmtLarge,
    },
    { kind: 'divider' },
    {
      kind: 'row',
      label: 'Market Cap',
      values: context.market_cap,
      fmt: fmtLarge,
    },
    {
      kind: 'row',
      label: 'Enterprise Value',
      values: context.enterprise_value,
      fmt: fmtLarge,
    },
    {
      kind: 'row',
      label: 'Price at FY End',
      values: context.price_at_fy,
      fmt: (v) => formatPrice(v, currency),
    },
  ];

  const tableProps = { years, ltmIdx };

  const healthRows: Row[] = [
    {
      kind: 'row',
      label: 'Current Ratio',
      values: health.current_ratio,
      fmt: fmtX,
      clr: (v) => clrMgn(v, 1.5, 1.0),
    },
  ];

  const sections = [
    { label: 'Cenové násobky', rows: priceMulRows },
    { label: 'EV násobky', rows: evMulRows },
    { label: 'Marže', rows: marginsRows },
    { label: 'Výnosnost kapitálu', rows: returnsRows },
    { label: 'Výnosy', rows: yieldsRows },
    { label: 'Růst', rows: growthRows },
    { label: 'Finanční zdraví', rows: healthRows },
    { label: 'Kontext', rows: contextRows },
  ];

  return (
    <div className="space-y-3">
      {sections.map(({ label, rows }) => (
        <CollapsibleSection
          key={label}
          label={label}
          tableProps={tableProps}
          rows={rows}
        />
      ))}
    </div>
  );
}
