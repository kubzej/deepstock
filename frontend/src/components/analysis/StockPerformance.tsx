/**
 * Stock Performance Section
 */
import { Metric } from './Metric';
import type { StockPerformanceData } from './utils';

interface StockPerformanceProps {
  data: StockPerformanceData;
}

export function StockPerformance({ data }: StockPerformanceProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
        <Metric label="Nakoupeno" value={data.totalBought} colored={false} />
        <Metric label="Prodáno" value={data.totalSold} colored={false} />
        <Metric label="Čistý cashflow" value={data.netCashflow} />
        <Metric label="Realizovaný P/L" value={data.realizedPL} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-4">
        <Metric label="Průměr na obchod" value={data.avgPerTrade} />
        <Metric label="Největší zisk" value={data.biggestWin} />
        <Metric label="Největší ztráta" value={data.biggestLoss} />
        <Metric label="Win rate" value={data.winRate} format="percent" />
      </div>

      <p className="text-sm text-muted-foreground">
        Celkem {data.totalTrades} uzavřených obchodů ({data.winningTrades}{' '}
        ziskových, {data.losingTrades} ztrátových)
      </p>
    </div>
  );
}
