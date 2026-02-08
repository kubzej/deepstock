/**
 * PerformanceChart - Portfolio value over time
 * Simple chart showing portfolio value development (no % return calculation)
 */
import { useMemo } from 'react';
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import type { PerformancePoint } from '@/lib/api';

interface PerformanceChartProps {
  data: PerformancePoint[];
  isLoading?: boolean;
  height?: number;
  /** Show invested line */
  showInvested?: boolean;
}

// Format date for X-axis
function formatXAxisDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('cs-CZ', { day: 'numeric', month: 'short' });
}

// Format tooltip date
function formatTooltipDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString('cs-CZ', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

// Custom tooltip
interface TooltipPayload {
  dataKey: string;
  value: number;
  color: string;
  name: string;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: TooltipPayload[];
  label?: string;
}

function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0 || !label) return null;

  return (
    <div className="bg-popover border border-border rounded-lg p-3 shadow-lg">
      <p className="text-muted-foreground text-xs mb-2">
        {formatTooltipDate(label)}
      </p>
      {payload.map((entry, idx) => (
        <p
          key={idx}
          className="text-sm font-mono-price"
          style={{ color: entry.color }}
        >
          {entry.name}: {formatCurrency(entry.value, 'CZK')}
        </p>
      ))}
    </div>
  );
}

export function PerformanceChart({
  data,
  isLoading,
  height = 280,
  showInvested = true,
}: PerformanceChartProps) {
  // Calculate Y domain
  const yDomain = useMemo(() => {
    if (data.length === 0) return [0, 100000];

    const allValues = data.flatMap((d) => {
      const vals = [d.value];
      if (showInvested && d.invested != null) vals.push(d.invested);
      return vals;
    });

    const min = Math.min(...allValues);
    const max = Math.max(...allValues);
    const padding = (max - min) * 0.1;
    return [Math.max(0, min - padding), max + padding];
  }, [data, showInvested]);

  // Calculate chart ticks for X-axis - show ~5 dates
  const xTicks = useMemo(() => {
    if (data.length < 2) return [];
    const step = Math.max(1, Math.floor(data.length / 5));
    return data.filter((_, i) => i % step === 0).map((d) => d.date);
  }, [data]);

  // Get current values for display
  const currentValue = data.length > 0 ? data[data.length - 1].value : 0;
  const investedValue = data.length > 0 ? data[data.length - 1].invested : 0;

  return (
    <div className="space-y-4">
      {/* Value metrics */}
      {currentValue > 0 && (
        <div className="flex items-end gap-8">
          <div>
            <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
              Aktuální hodnota
            </p>
            <p className="text-lg font-mono-price font-medium text-emerald-500">
              {formatCurrency(currentValue, 'CZK')}
            </p>
          </div>
          {showInvested && investedValue > 0 && (
            <div>
              <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                Investováno
              </p>
              <p className="text-lg font-mono-price font-medium text-foreground">
                {formatCurrency(investedValue, 'CZK')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Chart */}
      {isLoading ? (
        <Skeleton className="w-full" style={{ height }} />
      ) : data.length === 0 ? (
        <div
          className="flex items-center justify-center text-zinc-500 text-sm"
          style={{ height }}
        >
          Žádná data pro zvolené období
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <ComposedChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
            <XAxis
              dataKey="date"
              tickFormatter={formatXAxisDate}
              ticks={xTicks}
              stroke="#52525b"
              fontSize={11}
              tickLine={false}
            />
            <YAxis
              domain={yDomain}
              tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
              stroke="#52525b"
              fontSize={11}
              width={50}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ paddingTop: 12 }}
              formatter={(value) => (
                <span className="text-zinc-400 text-xs">{value}</span>
              )}
            />

            {/* Invested amount - dashed gray line */}
            {showInvested && (
              <Line
                type="monotone"
                dataKey="invested"
                name="Investováno"
                stroke="#71717a"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            )}

            {/* Portfolio value - gradient area */}
            <defs>
              <linearGradient id="valueGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area
              type="monotone"
              dataKey="value"
              name="Hodnota portfolia"
              stroke="#10b981"
              strokeWidth={2}
              fill="url(#valueGradient)"
              dot={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
