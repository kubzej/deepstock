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
    <div className="space-y-8">
      {/* Open Positions */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Otevřené pozice</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
          <Metric
            label="Vybrané prémie"
            value={data.open.premiumReceived}
            colored={false}
          />
          <Metric
            label="Zaplacené prémie"
            value={data.open.premiumPaid}
            colored={false}
          />
          <Metric label="Čisté prémie" value={data.open.netPremium} />
        </div>
      </div>

      {/* Closed Positions */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium">Zavřené pozice</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4">
          <Metric
            label="Přijaté prémie"
            value={data.closed.premiumReceived}
            colored={false}
          />
          <Metric
            label="Zaplacené prémie"
            value={data.closed.premiumPaid}
            colored={false}
          />
          <Metric label="Realizovaný P/L" value={data.closed.realizedPL} />
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Celkem {data.totalTrades} opčních transakcí v období
      </p>
    </div>
  );
}
