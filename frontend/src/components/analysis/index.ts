/**
 * Analysis Components - Barrel Export
 */

// Main page
export { AnalysisPage } from './AnalysisPage';

// Components
export { DateRangeFilter } from './DateRangeFilter';
export { DistributionList } from './DistributionList';
export { Metric } from './Metric';
export { PerformanceChart } from './PerformanceChart';
export { StockPerformance } from './StockPerformance';
export { OptionPerformance } from './OptionPerformance';

// Utils, constants, and types from utils.ts
export {
  getDateRange,
  calculateStockPerformance,
  calculateOptionPerformance,
  DATE_PRESETS,
  SECTOR_COLORS,
  COUNTRY_COLORS,
  EXCHANGE_COLORS,
} from './utils';

export type {
  DateRangePreset,
  DistributionItem,
  StockPerformanceData,
  OptionPerformanceData,
} from './utils';
