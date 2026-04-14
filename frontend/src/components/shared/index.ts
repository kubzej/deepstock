/**
 * Shared Components - Barrel Export
 */

// Auth components
export { Login } from './Login';

// Layout components
export { BrandLogo } from './BrandLogo';
export {
  PageShell,
  PageIntro,
  PageHero,
  PageSection,
  PageTopRail,
  PageBackButton,
} from './PageShell';
export { PillButton, PillGroup } from './PillButton';
export { PortfolioSelector } from './PortfolioSelector';
export { EmptyState } from './EmptyState';
export {
  FeedbackStateFrame,
  FilteredEmptyState,
  ErrorState,
  LoadingState,
  GenerationState,
} from './FeedbackState';

// Form components
export { CurrencySelect } from './CurrencySelect';
export { ExchangeSelect } from './ExchangeSelect';
export { TickerInput } from './TickerInput';

// Dialog components
export { ConfirmDialog } from './ConfirmDialog';

// TradingView components
export {
  TradingViewWidget,
  TradingViewAdvancedChart,
  SymbolOverview,
  StockHeatmap,
  TechnicalAnalysis,
  EconomicCalendar,
  MiniChart,
  MarketOverviewWidget,
  isTradingViewSupported,
} from './TradingViewWidgets';
