/**
 * ChartTooltip - Shared tooltip component for all Recharts-based charts.
 * Activated by hover on desktop and tap on mobile (via Recharts trigger="click").
 *
 * Usage:
 *   <Tooltip
 *     content={<ChartTooltip labelMap={{ price: 'Cena', sma50: 'SMA 50' }} />}
 *     trigger="click"
 *   />
 *
 * For custom value formatting, pass `formatValue`:
 *   <ChartTooltip
 *     labelMap={{ obv: 'OBV' }}
 *     formatValue={(value, dataKey) => formatOBV(value)}
 *   />
 */

export interface ChartTooltipPayload {
  value: number;
  dataKey: string;
  color: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  /** Whether the tooltip is active (provided by Recharts) */
  active?: boolean;
  /** Tooltip data entries (provided by Recharts) */
  payload?: ChartTooltipPayload[];
  /** X-axis label, typically a formatted date (provided by Recharts) */
  label?: string;
  /** Map dataKey -> display label. Keys not in map are shown as-is. */
  labelMap?: Record<string, string>;
  /**
   * Custom value formatter. Receives (value, dataKey, payload).
   * Default: value.toFixed(2)
   */
  formatValue?: (
    value: number,
    dataKey: string,
    payload?: Record<string, unknown>,
  ) => string;
  /** Number of decimals when using default formatter. Default: 2 */
  decimals?: number;
}

function defaultFormat(value: number, decimals: number): string {
  return value?.toFixed(decimals) ?? '—';
}

export function ChartTooltip({
  active,
  payload,
  label,
  labelMap = {},
  formatValue,
  decimals = 2,
}: ChartTooltipProps) {
  if (!active || !payload?.length) return null;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-3 shadow-lg pointer-events-auto">
      {label && <p className="text-xs text-zinc-500 mb-2">{label}</p>}
      {payload.map((entry) => {
        const displayLabel = labelMap[entry.dataKey] ?? entry.dataKey;
        const displayValue = formatValue
          ? formatValue(entry.value, entry.dataKey, entry.payload)
          : defaultFormat(entry.value, decimals);

        return (
          <div key={entry.dataKey} className="flex items-center gap-2 text-sm">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-zinc-600">{displayLabel}:</span>
            <span className="font-mono-price text-zinc-800">
              {displayValue}
            </span>
          </div>
        );
      })}
    </div>
  );
}
