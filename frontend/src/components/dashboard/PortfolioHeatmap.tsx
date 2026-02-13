/**
 * Portfolio Heatmap — modern treemap visualization
 *
 * Size = position value in CZK (bigger rectangle = more money)
 * Color = daily change % (green = up, red = down)
 */
import { useMemo, useCallback } from 'react';
import { Treemap, ResponsiveContainer } from 'recharts';
import type { Quote, ExchangeRates } from '@/lib/api';
import type { Holding } from './HoldingsTable';
import { formatPrice, toCZK } from '@/lib/format';

interface PortfolioHeatmapProps {
  holdings: Holding[];
  quotes: Record<string, Quote>;
  rates: ExchangeRates;
  onCellClick?: (ticker: string) => void;
}

interface HeatmapItem {
  ticker: string;
  name: string;
  value: number;
  valueCzk: number;
  price: number;
  currency: string;
  changePercent: number;
  changeCzk: number;
  weight: number;
  [key: string]: string | number;
}

// Cell gap in px — thin, clean separator
const GAP = 2;

/**
 * Color palette matching TradingView heatmap.
 * Range: -5.5% to +5.5%
 *
 *   -5.5%  →  dark red
 *    0%    →  light gray (neutral)
 *   +5.5%  →  dark green
 */
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

function getChangeColor(pct: number): string {
  const c = Math.max(-5.5, Math.min(5.5, pct));
  const t = (c + 5.5) / 11; // 0..1

  // TradingView-style colour stops (r, g, b)
  const stops: [number, [number, number, number]][] = [
    [0.0, [127, 42, 42]], // dark red (-5.5%)
    [0.18, [153, 51, 51]], // red (-3.5%)
    [0.36, [180, 90, 90]], // light red (-1.5%)
    [0.5, [200, 200, 200]], // neutral gray (0%)
    [0.64, [100, 160, 100]], // light green (+1.5%)
    [0.82, [60, 130, 60]], // green (+3.5%)
    [1.0, [35, 100, 35]], // dark green (+5.5%)
  ];

  // Find the two surrounding stops
  let lo = stops[0];
  let hi = stops[stops.length - 1];
  for (let i = 0; i < stops.length - 1; i++) {
    if (t >= stops[i][0] && t <= stops[i + 1][0]) {
      lo = stops[i];
      hi = stops[i + 1];
      break;
    }
  }

  const range = hi[0] - lo[0] || 1;
  const ratio = (t - lo[0]) / range;
  const r = Math.round(lerp(lo[1][0], hi[1][0], ratio));
  const g = Math.round(lerp(lo[1][1], hi[1][1], ratio));
  const b = Math.round(lerp(lo[1][2], hi[1][2], ratio));
  return `rgb(${r},${g},${b})`;
}

/**
 * Custom Treemap cell — clean, modern look
 */
function HeatmapCell(
  props: Record<string, unknown> & { onCellClick?: (ticker: string) => void },
) {
  const {
    x = 0,
    y = 0,
    width = 0,
    height = 0,
    ticker,
    changePercent,
    weight,
    price,
    currency,
    onCellClick,
  } = props;

  // Skip internal parent/root nodes — only render leaf data nodes
  if (!ticker || typeof ticker !== 'string') return null;

  const w = Number(width);
  const h = Number(height);
  const xPos = Number(x);
  const yPos = Number(y);
  const change = Number(changePercent ?? 0);
  const wt = Number(weight ?? 0);

  // Inner rect after gap
  const ix = xPos + GAP;
  const iy = yPos + GAP;
  const iw = Math.max(0, w - GAP * 2);
  const ih = Math.max(0, h - GAP * 2);

  if (iw < 3 || ih < 3) return null;

  const bgColor = getChangeColor(change);
  const sign = change >= 0 ? '+' : '';

  // Always show all values - adjust font size to fit
  const area = iw * ih;

  // More aggressive font scaling for small cells
  const tickerSize =
    area > 40000
      ? 14
      : area > 20000
        ? 13
        : area > 8000
          ? 11
          : area > 4000
            ? 9
            : area > 2000
              ? 7.5
              : 6;
  const subSize =
    area > 25000
      ? 11
      : area > 12000
        ? 10
        : area > 6000
          ? 9
          : area > 3000
            ? 7.5
            : area > 1500
              ? 6
              : 5;

  // Always show all 4 rows
  const rows = 4;
  const lineH = tickerSize * 1.4;
  const blockH = rows * lineH;
  const startY = iy + (ih - blockH) / 2 + lineH * 0.55;
  let row = 0;

  return (
    <g
      onClick={() => onCellClick?.(String(ticker))}
      style={{ cursor: onCellClick ? 'pointer' : 'default' }}
      className="heatmap-cell"
    >
      {/* Background with subtle highlight gradient */}
      <rect
        x={ix}
        y={iy}
        width={iw}
        height={ih}
        rx={6}
        fill={bgColor}
        opacity={0.92}
      />
      {/* Subtle top-edge highlight for depth */}
      <rect
        x={ix}
        y={iy}
        width={iw}
        height={Math.min(ih, ih * 0.45)}
        rx={6}
        fill="url(#cellHighlight)"
        opacity={0.12}
      />

      {/* Ticker */}
      <text
        x={ix + iw / 2}
        y={startY + lineH * row++}
        textAnchor="middle"
        dominantBaseline="central"
        fill="white"
        fontWeight="600"
        fontSize={tickerSize}
        letterSpacing="0.03em"
        fontFamily="var(--font-mono-price, ui-monospace, monospace)"
      >
        {String(ticker)}
      </text>

      {/* Change % */}
      <text
        x={ix + iw / 2}
        y={startY + lineH * row++}
        textAnchor="middle"
        dominantBaseline="central"
        fill="rgba(255,255,255,0.88)"
        fontSize={subSize}
        fontWeight="500"
        fontFamily="var(--font-mono-price, ui-monospace, monospace)"
      >
        {sign}
        {change.toFixed(2)}%
      </text>

      {/* Price */}
      <text
        x={ix + iw / 2}
        y={startY + lineH * row++}
        textAnchor="middle"
        dominantBaseline="central"
        fill="rgba(255,255,255,0.55)"
        fontSize={subSize - 1}
        fontFamily="var(--font-mono-price, ui-monospace, monospace)"
      >
        {formatPrice(Number(price), String(currency))}
      </text>

      {/* Weight */}
      <text
        x={ix + iw / 2}
        y={startY + lineH * row++}
        textAnchor="middle"
        dominantBaseline="central"
        fill="rgba(255,255,255,0.38)"
        fontSize={subSize - 1}
      >
        {wt.toFixed(1)}%
      </text>
    </g>
  );
}

export function PortfolioHeatmap({
  holdings,
  quotes,
  rates,
  onCellClick,
}: PortfolioHeatmapProps) {
  const heatmapData = useMemo(() => {
    const totalValueCzk = holdings.reduce((sum, h) => {
      const price = quotes[h.ticker]?.price ?? 0;
      const scale = h.priceScale ?? 1;
      return sum + toCZK(price * scale * h.shares, h.currency, rates);
    }, 0);

    const items: HeatmapItem[] = holdings
      .map((h) => {
        const quote = quotes[h.ticker];
        const price = quote?.price ?? 0;
        const scale = h.priceScale ?? 1;
        const valueCzk = toCZK(price * scale * h.shares, h.currency, rates);
        const changePercent = quote?.changePercent ?? 0;
        const changeCzk = toCZK(
          (quote?.change ?? 0) * scale * h.shares,
          h.currency,
          rates,
        );

        return {
          ticker: h.ticker,
          name: h.name,
          value: Math.max(valueCzk, 1),
          valueCzk,
          price,
          currency: h.currency,
          changePercent,
          changeCzk,
          weight: totalValueCzk > 0 ? (valueCzk / totalValueCzk) * 100 : 0,
        };
      })
      .filter((item) => item.valueCzk > 0)
      .sort((a, b) => b.valueCzk - a.valueCzk);

    return items;
  }, [holdings, quotes, rates]);

  const renderCell = useCallback(
    (props: Record<string, unknown>) => (
      <HeatmapCell {...props} onCellClick={onCellClick} />
    ),
    [onCellClick],
  );

  if (heatmapData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        Žádné pozice k zobrazení
      </div>
    );
  }

  // Build smooth CSS gradient for the legend bar
  const legendSteps = 12; // -5.5 to +5.5
  const gradientColors = Array.from({ length: legendSteps }, (_, i) => {
    const pct = -5.5 + i;
    return getChangeColor(pct);
  });
  const gradientCSS = `linear-gradient(to right, ${gradientColors.join(', ')})`;

  return (
    <div className="w-full space-y-4">
      {/* SVG defs for cell highlight */}
      <svg width={0} height={0} className="absolute">
        <defs>
          <linearGradient id="cellHighlight" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="white" stopOpacity={1} />
            <stop offset="100%" stopColor="white" stopOpacity={0} />
          </linearGradient>
        </defs>
      </svg>

      <style>{`
        .heatmap-cell rect { transition: opacity 0.15s ease; }
        .heatmap-cell:hover rect:first-child { opacity: 1 !important; }
      `}</style>

      <ResponsiveContainer
        width="100%"
        height={Math.max(320, Math.min(480, heatmapData.length * 38))}
      >
        <Treemap
          data={heatmapData}
          dataKey="value"
          aspectRatio={16 / 9}
          content={renderCell}
          isAnimationActive={false}
        />
      </ResponsiveContainer>

      {/* Gradient legend bar */}
      <div className="flex items-center justify-center gap-3 px-4">
        <span className="text-[11px] text-muted-foreground/70 tabular-nums">
          −5.5 %
        </span>
        <div
          className="h-2 flex-1 max-w-52 rounded-full"
          style={{ background: gradientCSS }}
        />
        <span className="text-[11px] text-muted-foreground/70 tabular-nums">
          +5.5 %
        </span>
      </div>
    </div>
  );
}
