/**
 * TechnicalAnalysis - Technical indicators
 */
import {
  MovingAveragesChart,
  RSIChart,
  MACDChart,
  BollingerBandsChart,
} from '@/components/charts';

// ============================================================
// TYPES
// ============================================================

interface TechnicalAnalysisProps {
  ticker: string;
}

// ============================================================
// MAIN COMPONENT
// ============================================================

export function TechnicalAnalysis({ ticker }: TechnicalAnalysisProps) {
  return (
    <div className="space-y-8">
      {/* Moving Averages */}
      <MovingAveragesChart ticker={ticker} />

      {/* RSI */}
      <RSIChart ticker={ticker} />

      {/* MACD */}
      <MACDChart ticker={ticker} />

      {/* Bollinger Bands */}
      <BollingerBandsChart ticker={ticker} />
    </div>
  );
}
