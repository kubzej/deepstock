/**
 * PriceChart - Interactive price chart with time range selection
 * Inspired by portfolio-tracker design
 */
import { useState, useMemo, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import { fetchPriceHistory, type ChartPeriod } from '@/lib/api';
import { formatCurrency, getSmartDecimals } from '@/lib/format';

interface PriceChartProps {
  ticker: string;
  currency?: string;
  height?: number;
}

const TIME_RANGES: { value: ChartPeriod; label: string }[] = [
  { value: '1d', label: '1D' },
  { value: '5d', label: '5D' },
  { value: '1mo', label: '1M' },
  { value: '3mo', label: '3M' },
  { value: '6mo', label: '6M' },
  { value: '1y', label: '1R' },
];

// Format date for X-axis based on range
function formatXAxisDate(date: string, range: ChartPeriod): string {
  const d = new Date(date);

  if (range === '1d') {
    return d.toLocaleTimeString('cs-CZ', {
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (range === '5d') {
    return d.toLocaleDateString('cs-CZ', {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }
  if (range === '1mo') {
    return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
  }
  // 3mo, 6mo, 1y
  return d.toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'short',
  });
}

// Format number
function formatNumber(value: number, decimals = 2): string {
  return value.toFixed(decimals);
}

// Format large numbers for volume
function formatVolume(value: number): string {
  if (value >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toString();
}

export function PriceChart({
  ticker,
  currency = 'USD',
  height = 300,
}: PriceChartProps) {
  const [selectedRange, setSelectedRange] = useState<ChartPeriod>('3mo');
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  const { data: chartData = [], isLoading } = useQuery({
    queryKey: ['priceHistory', ticker, selectedRange],
    queryFn: () => fetchPriceHistory(ticker, selectedRange),
    enabled: !!ticker,
    staleTime: 60 * 1000, // 1 minute
  });

  // Calculate price domain with padding
  const priceDomain = useMemo(() => {
    if (chartData.length === 0) return [0, 100];

    const prices = chartData.flatMap((d) => [d.high, d.low]);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const padding = (max - min) * 0.05;
    return [min - padding, max + padding];
  }, [chartData]);

  // Determine decimal places for Y-axis based on price range
  const yAxisDecimals = useMemo(() => {
    if (chartData.length === 0) return 2;
    const prices = chartData.flatMap((d) => [d.high, d.low]);
    return getSmartDecimals(prices);
  }, [chartData]);

  // Calculate if current price is up or down vs first price
  const priceChange = useMemo(() => {
    if (chartData.length < 2)
      return { isPositive: true, color: 'hsl(var(--chart-1))' };
    const first = chartData[0].close;
    const last = chartData[chartData.length - 1].close;
    const isPositive = last >= first;
    return {
      isPositive,
      color: isPositive ? 'rgb(16 185 129)' : 'rgb(244 63 94)',
    };
  }, [chartData]);

  // Data to display in header (hovered or latest)
  const displayData = useMemo(() => {
    if (chartData.length === 0) return null;

    const firstPrice = chartData[0].close;
    const lastData = chartData[chartData.length - 1];
    const lastPrice = lastData.close;

    // If hovering over a specific point
    if (activeIndex !== null && chartData[activeIndex]) {
      const hoveredData = chartData[activeIndex];
      const change = hoveredData.close - lastPrice;
      const changePercent = lastPrice !== 0 ? (change / lastPrice) * 100 : 0;

      return {
        ...hoveredData,
        change,
        changePercent,
        isPositive: change >= 0,
      };
    }

    // Default: show period change (current vs first price in period)
    const change = lastPrice - firstPrice;
    const changePercent = firstPrice !== 0 ? (change / firstPrice) * 100 : 0;

    return {
      ...lastData,
      change,
      changePercent,
      isPositive: change >= 0,
    };
  }, [activeIndex, chartData]);

  // Handle mouse move on chart
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const handleMouseMove = useCallback((state: any) => {
    if (state && state.activeTooltipIndex != null) {
      const index = Number(state.activeTooltipIndex);
      if (!isNaN(index)) {
        setActiveIndex(index);
      }
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    setActiveIndex(null);
  }, []);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-[300px] w-full" />
      </div>
    );
  }

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-[200px] text-muted-foreground">
        Žádná data k zobrazení
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Price Header */}
      {displayData && (
        <div className="space-y-1">
          <div className="flex items-baseline gap-3">
            <span className="text-2xl font-mono-price font-semibold">
              {formatCurrency(displayData.close, currency)}
            </span>
            <span
              className={`text-sm font-mono-price ${
                displayData.isPositive ? 'text-emerald-500' : 'text-rose-500'
              }`}
            >
              {displayData.isPositive ? '+' : ''}
              {formatCurrency(displayData.change, currency)} (
              {displayData.isPositive ? '+' : ''}
              {formatNumber(displayData.changePercent)}%)
            </span>
          </div>
          <div className="flex gap-4 text-xs text-muted-foreground font-mono-price">
            <span>O {formatNumber(displayData.open)}</span>
            <span>H {formatNumber(displayData.high)}</span>
            <span>L {formatNumber(displayData.low)}</span>
            <span>V {formatVolume(displayData.volume)}</span>
          </div>
        </div>
      )}

      {/* Time range selector */}
      <PillGroup>
        {TIME_RANGES.map(({ value, label }) => (
          <PillButton
            key={value}
            active={selectedRange === value}
            onClick={() => setSelectedRange(value)}
          >
            {label}
          </PillButton>
        ))}
      </PillGroup>

      {/* Main chart */}
      <div
        className="w-full border-0"
        style={{ height }}
        onMouseLeave={handleMouseLeave}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            onMouseMove={handleMouseMove}
            style={{ outline: 'none' }}
          >
            <defs>
              <linearGradient id="colorPrice" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={priceChange.color}
                  stopOpacity={0.15}
                />
                <stop
                  offset="100%"
                  stopColor={priceChange.color}
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>

            <CartesianGrid horizontal={false} vertical={false} />

            <XAxis
              dataKey="date"
              tickFormatter={(date) => formatXAxisDate(date, selectedRange)}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              minTickGap={50}
            />

            <YAxis
              domain={priceDomain}
              tickFormatter={(value) => formatNumber(value, yAxisDecimals)}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              axisLine={false}
              tickLine={false}
              orientation="right"
              width={50}
            />

            {/* Hidden tooltip for crosshair */}
            <Tooltip content={() => null} cursor={false} />

            {/* Area chart */}
            <Area
              type="monotone"
              dataKey="close"
              stroke={priceChange.color}
              strokeWidth={2}
              fill="url(#colorPrice)"
              isAnimationActive={false}
              baseValue="dataMin"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
