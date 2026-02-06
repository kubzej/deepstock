/**
 * TechnicalAnalysis - Technical indicators
 */
import {
  MovingAveragesChart,
  RSIChart,
  MACDChart,
  BollingerBandsChart,
  StochasticChart,
  VolumeChart,
  ATRChart,
  OBVChart,
  ADXChart,
  FibonacciChart,
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

      {/* Stochastic */}
      <StochasticChart ticker={ticker} />

      {/* Volume */}
      <VolumeChart ticker={ticker} />

      {/* ATR */}
      <ATRChart ticker={ticker} />

      {/* OBV */}
      <OBVChart ticker={ticker} />

      {/* ADX */}
      <ADXChart ticker={ticker} />

      {/* Fibonacci Retracement */}
      <FibonacciChart ticker={ticker} />
    </div>
  );
}
