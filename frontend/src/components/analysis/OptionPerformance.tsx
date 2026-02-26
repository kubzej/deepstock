/**
 * Option Performance Section
 */
import { Metric } from './Metric';
import type { OptionPerformanceData } from './utils';

interface OptionPerformanceProps {
  data: OptionPerformanceData;
}

export function OptionPerformance({ data }: OptionPerformanceProps) {
  return (
    <div className="space-y-6">
      {/* Main Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4">
        <Metric
          label="Vybrané prémie (Short)"
          value={data.open.premiumReceived}
          colored={false}
        />
        <Metric
          label="Náklady na opce (Long)"
          value={data.open.premiumPaid}
          colored={false}
        />
        <Metric label="Realizovaný P/L" value={data.closed.realizedPL} />
      </div>

      {/* Secondary Metrics (Closing transactions) */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-4 pt-4">
        <Metric
          label="Zpětný odkup (BTC)"
          value={data.closed.premiumPaid}
          colored={false}
        />
        <Metric
          label="Prodej opcí (STC)"
          value={data.closed.premiumReceived}
          colored={false}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Celkem {data.totalTrades} opčních transakcí v období
      </p>
    </div>
  );
}
