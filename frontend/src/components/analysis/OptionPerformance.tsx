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
      {/* Open Positions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
        <Metric
          label="Vybrané prémie (otevřené)"
          value={data.open.premiumReceived}
          colored={false}
        />
        <Metric
          label="Zaplacené prémie (otevřené)"
          value={data.open.premiumPaid}
          colored={false}
        />
        <Metric label="Čisté prémie (otevřené)" value={data.open.netPremium} />
        <Metric label="Realizovaný P/L" value={data.closed.realizedPL} />
      </div>

      {/* Closed Positions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
        <Metric
          label="Přijaté prémie (zavřené)"
          value={data.closed.premiumReceived}
          colored={false}
        />
        <Metric
          label="Zaplacené prémie (zavřené)"
          value={data.closed.premiumPaid}
          colored={false}
        />
      </div>

      <p className="text-sm text-muted-foreground">
        Celkem {data.totalTrades} opčních transakcí v období
      </p>
    </div>
  );
}
