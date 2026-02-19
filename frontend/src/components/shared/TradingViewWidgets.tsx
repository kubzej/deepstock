/**
 * TradingView Widget Components
 * Shared components for embedding TradingView widgets
 */
import { useEffect, useRef, memo } from 'react';

// ============================================================
// Generic Widget Container
// ============================================================

interface TradingViewWidgetProps {
  scriptUrl: string;
  config: Record<string, unknown>;
  height?: string | number;
  className?: string;
}

/**
 * Generic TradingView widget wrapper.
 * Handles script loading and cleanup.
 */
export const TradingViewWidget = memo(function TradingViewWidget({
  scriptUrl,
  config,
  height = '100%',
  className = '',
}: TradingViewWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.innerHTML = '';

    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.height = '100%';
    widgetContainer.style.width = '100%';

    const widgetInner = document.createElement('div');
    widgetInner.className = 'tradingview-widget-container__widget';
    widgetInner.style.height = 'calc(100% - 32px)';
    widgetInner.style.width = '100%';
    widgetContainer.appendChild(widgetInner);

    container.appendChild(widgetContainer);

    const script = document.createElement('script');
    script.src = scriptUrl;
    script.async = true;
    script.type = 'text/javascript';
    script.innerHTML = JSON.stringify(config);

    widgetContainer.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [scriptUrl, JSON.stringify(config)]);

  return (
    <div
      ref={containerRef}
      className={`w-full rounded-lg overflow-hidden ${className}`}
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    />
  );
});

// ============================================================
// Exchange Code Mapping (Yahoo Finance -> TradingView)
// ============================================================

/**
 * Exchanges supported by TradingView free embed widgets.
 * Only US and major EU exchanges work reliably.
 */
const SUPPORTED_EXCHANGES = new Set([
  // US
  'NASDAQ',
  'NYSE',
  'AMEX',
  // German
  'XETRA',
  'FRA',
  // UK
  'LSE',
  'LON',
  // Other EU
  'PAR',
  'AMS',
  'SIX',
]);

/**
 * Yahoo suffixes that map to supported TradingView exchanges.
 */
const SUPPORTED_SUFFIXES = new Set(['DE', 'L', 'PA', 'AS', 'SW']);

/**
 * Check if a symbol is supported by TradingView free widgets.
 * Returns true for US stocks (no suffix) and supported EU exchanges.
 */
export function isTradingViewSupported(
  symbol: string,
  exchange?: string,
): boolean {
  // Check explicit exchange parameter
  if (exchange) {
    return SUPPORTED_EXCHANGES.has(exchange.toUpperCase());
  }

  // Check Yahoo-style suffix
  const parts = symbol.split('.');
  if (parts.length === 2 && parts[1].length <= 3) {
    return SUPPORTED_SUFFIXES.has(parts[1].toUpperCase());
  }

  // No suffix = US stock = supported
  return true;
}

/**
 * Maps Yahoo Finance exchange suffixes to TradingView exchange prefixes.
 * Yahoo uses suffixes like .DE, .HK while TradingView uses prefixes like XETR:, HKEX:
 */
const EXCHANGE_MAP: Record<string, string> = {
  // German
  XETRA: 'XETR',
  FRA: 'FWB',
  // Hong Kong
  HKSE: 'HKEX',
  HKG: 'HKEX',
  // UK
  LSE: 'LSE',
  LON: 'LSE',
  // Other European
  PAR: 'EURONEXT',
  AMS: 'EURONEXT',
  // US (usually no prefix needed, but mapping for consistency)
  NASDAQ: 'NASDAQ',
  NYSE: 'NYSE',
  AMEX: 'AMEX',
  // Japan
  TSE: 'TSE',
  // Australia
  ASX: 'ASX',
};

/**
 * Converts a symbol with optional exchange to TradingView format.
 * Handles both explicit exchange param and Yahoo-style suffixes (.DE, .HK).
 */
function toTradingViewSymbol(symbol: string, exchange?: string): string {
  // Strip Yahoo-style suffix if present (e.g., VOW3.DE -> VOW3)
  const parts = symbol.split('.');
  const hasSuffix = parts.length === 2 && parts[1].length <= 3;
  const cleanTicker = hasSuffix ? parts[0] : symbol;
  const suffix = hasSuffix ? parts[1].toUpperCase() : null;

  // Suffix to TradingView exchange mapping
  const suffixMap: Record<string, string> = {
    DE: 'XETR',
    HK: 'HKEX',
    L: 'LSE',
    PA: 'EURONEXT',
    AS: 'EURONEXT',
    TO: 'TSX',
    AX: 'ASX',
    T: 'TSE',
    SW: 'SIX',
  };

  // If exchange is provided, use mapping
  if (exchange) {
    const tvExchange = EXCHANGE_MAP[exchange.toUpperCase()] || exchange;
    return `${tvExchange}:${cleanTicker}`;
  }

  // Use suffix mapping if available
  if (suffix && suffixMap[suffix]) {
    return `${suffixMap[suffix]}:${cleanTicker}`;
  }

  // Default: return clean ticker (works for US stocks)
  return cleanTicker;
}

// ============================================================
// Symbol Overview Widget
// ============================================================

interface SymbolOverviewProps {
  symbol: string;
  exchange?: string;
  height?: number;
  chartType?: 'area' | 'candlesticks';
}

/**
 * TradingView Symbol Overview
 * Compact chart with key stats - ideal for stock detail pages.
 */
export function SymbolOverview({
  symbol,
  exchange,
  height = 300,
  chartType = 'area',
}: SymbolOverviewProps) {
  const tvSymbol = toTradingViewSymbol(symbol, exchange);

  return (
    <TradingViewWidget
      scriptUrl="https://s3.tradingview.com/external-embedding/embed-widget-symbol-overview.js"
      config={{
        symbols: [[tvSymbol, tvSymbol]],
        chartOnly: true,
        width: '100%',
        height,
        locale: 'en',
        colorTheme: 'light',
        autosize: false,
        showVolume: true,
        showMA: false,
        hideDateRanges: false,
        hideMarketStatus: false,
        hideSymbolLogo: false,
        scalePosition: 'right',
        scaleMode: 'Normal',
        fontFamily:
          '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, sans-serif',
        fontSize: '10',
        noTimeScale: false,
        valuesTracking: '1',
        changeMode: 'price-and-percent',
        chartType: chartType,
        lineWidth: 2,
        lineType: 0,
        dateRanges: ['1d|1', '1m|30', '3m|60', '12m|1D', '60m|1W', 'all|1M'],
        dateFormat: 'dd/MM/yyyy',
        isTransparent: false,
      }}
      height={height}
    />
  );
}

// ============================================================
// Advanced Chart Widget
// ============================================================

interface AdvancedChartProps {
  symbol: string;
  exchange?: string;
  height?: number;
  interval?: string;
  hideTopToolbar?: boolean;
  hideLegend?: boolean;
  studies?: string[];
}

/**
 * TradingView Advanced Real-Time Chart
 * Full-featured chart with indicators and drawing tools.
 */
export const TradingViewAdvancedChart = memo(function TradingViewAdvancedChart({
  symbol,
  exchange,
  height = 400,
  interval = 'D',
  hideTopToolbar = false,
  hideLegend = false,
  studies = [],
}: AdvancedChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const containerId = useRef(
    `tradingview_${Math.random().toString(36).substring(7)}`,
  );

  // Build TradingView symbol format
  const tvSymbol = toTradingViewSymbol(symbol, exchange);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = '';

    // Create widget container
    const widgetDiv = document.createElement('div');
    widgetDiv.id = containerId.current;
    widgetDiv.style.height = '100%';
    widgetDiv.style.width = '100%';
    container.appendChild(widgetDiv);

    // Load TradingView library
    const script = document.createElement('script');
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = () => {
      if (typeof window.TradingView !== 'undefined') {
        new window.TradingView.widget({
          autosize: true,
          symbol: tvSymbol,
          interval: interval,
          timezone: 'Europe/Prague',
          theme: 'light',
          style: '1', // Candles
          locale: 'en',
          enable_publishing: false,
          hide_top_toolbar: hideTopToolbar,
          hide_legend: hideLegend,
          save_image: false,
          container_id: containerId.current,
          studies: studies.length > 0 ? studies : undefined,
          withdateranges: true,
          hide_side_toolbar: false,
          allow_symbol_change: false,
          details: true,
          hotlist: false,
          calendar: false,
          show_popup_button: true,
          popup_width: '1200',
          popup_height: '800',
          support_host: 'https://www.tradingview.com',
        });
      }
    };
    document.head.appendChild(script);

    return () => {
      container.innerHTML = '';
      // Note: Script remains in head (cached by browser)
    };
  }, [tvSymbol, interval, hideTopToolbar, hideLegend, JSON.stringify(studies)]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden bg-zinc-900"
      style={{ height: `${height}px` }}
    />
  );
});

// ============================================================
// Stock Heatmap Widget
// ============================================================

// TradingView heatmap supported dataSource values
// US: SPX500, NASDAQ100
// Europe: SX5E (Euro Stoxx 50), SXXP (Stoxx 600), UK100
// Asia: HSI (Hang Seng)
type HeatmapDataSource =
  | 'SPX500'
  | 'NASDAQ100'
  | 'SX5E'
  | 'SXXP'
  | 'UK100'
  | 'HSI';

interface StockHeatmapProps {
  dataSource?: HeatmapDataSource;
  height?: string | number;
  blockColor?:
    | 'change'
    | 'Perf.W'
    | 'Perf.1M'
    | 'Perf.3M'
    | 'Perf.6M'
    | 'Perf.Y'
    | 'Perf.YTD';
}

/**
 * TradingView Stock Heatmap
 * Shows stocks grouped by sector with color = daily change.
 * Note: This component directly manages the widget to ensure proper re-rendering
 * when dataSource changes (the memo'd TradingViewWidget doesn't work well for this).
 */
export function StockHeatmap({
  dataSource = 'SPX500',
  height = 'calc(100vh - 200px)',
  blockColor = 'change',
}: StockHeatmapProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear previous widget
    container.innerHTML = '';

    const widgetContainer = document.createElement('div');
    widgetContainer.className = 'tradingview-widget-container';
    widgetContainer.style.height = '100%';
    widgetContainer.style.width = '100%';

    const widgetInner = document.createElement('div');
    widgetInner.className = 'tradingview-widget-container__widget';
    widgetInner.style.height = 'calc(100% - 32px)';
    widgetInner.style.width = '100%';
    widgetContainer.appendChild(widgetInner);

    container.appendChild(widgetContainer);

    const config = {
      dataSource,
      grouping: 'sector',
      blockSize: 'market_cap_basic',
      blockColor,
      locale: 'en',
      colorTheme: 'light',
      hasTopBar: true,
      isZoomEnabled: true,
      hasSymbolTooltip: true,
      width: '100%',
      height: '100%',
    };

    const script = document.createElement('script');
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-stock-heatmap.js';
    script.async = true;
    script.type = 'text/javascript';
    script.innerHTML = JSON.stringify(config);

    widgetContainer.appendChild(script);

    return () => {
      container.innerHTML = '';
    };
  }, [dataSource, blockColor]);

  return (
    <div
      ref={containerRef}
      className="w-full rounded-lg overflow-hidden"
      style={{ height: typeof height === 'number' ? `${height}px` : height }}
    />
  );
}

// ============================================================
// Technical Analysis Widget
// ============================================================

interface TechnicalAnalysisProps {
  symbol: string;
  exchange?: string;
  height?: number;
  showIntervalTabs?: boolean;
}

/**
 * TradingView Technical Analysis Widget
 * Shows buy/sell/neutral gauges for different indicators.
 */
export function TechnicalAnalysis({
  symbol,
  exchange,
  height = 450,
  showIntervalTabs = true,
}: TechnicalAnalysisProps) {
  const tvSymbol = toTradingViewSymbol(symbol, exchange);

  return (
    <TradingViewWidget
      scriptUrl="https://s3.tradingview.com/external-embedding/embed-widget-technical-analysis.js"
      config={{
        interval: '1D',
        width: '100%',
        isTransparent: true,
        height,
        symbol: tvSymbol,
        showIntervalTabs,
        displayMode: 'multiple',
        locale: 'en',
        colorTheme: 'dark',
      }}
      height={height}
    />
  );
}

// ============================================================
// Economic Calendar Widget
// ============================================================

interface EconomicCalendarProps {
  height?: string | number;
  countries?: string[];
}

/**
 * TradingView Economic Calendar
 * Shows earnings, Fed meetings, macro data.
 */
export function EconomicCalendar({
  height = 'calc(100vh - 200px)',
  countries = ['us'],
}: EconomicCalendarProps) {
  return (
    <TradingViewWidget
      scriptUrl="https://s3.tradingview.com/external-embedding/embed-widget-events.js"
      config={{
        width: '100%',
        height: '100%',
        colorTheme: 'light',
        isTransparent: false,
        locale: 'en',
        importanceFilter: '1',
        countryFilter: countries.join(','),
      }}
      height={height}
    />
  );
}

// ============================================================
// Mini Chart Widget
// ============================================================

interface MiniChartProps {
  symbol: string;
  exchange?: string;
  height?: number;
  dateRange?: '1D' | '5D' | '1M' | '3M' | '6M' | '12M' | 'ALL';
}

/**
 * TradingView Mini Chart
 * Small compact chart for lists and cards.
 */
export function MiniChart({
  symbol,
  exchange,
  height = 220,
  dateRange = '3M',
}: MiniChartProps) {
  const tvSymbol = toTradingViewSymbol(symbol, exchange);

  return (
    <TradingViewWidget
      scriptUrl="https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js"
      config={{
        symbol: tvSymbol,
        width: '100%',
        height,
        locale: 'en',
        dateRange,
        colorTheme: 'dark',
        isTransparent: true,
        autosize: false,
        largeChartUrl: '',
      }}
      height={height}
    />
  );
}

// ============================================================
// Market Overview Widget
// ============================================================

interface MarketOverviewWidgetProps {
  height?: string | number;
  showSymbolLogo?: boolean;
}

/**
 * TradingView Market Overview
 * Shows multiple markets grouped by tabs (Indices, Forex, Futures, etc.)
 */
export function MarketOverviewWidget({
  height = 'calc(100vh - 250px)',
  showSymbolLogo = true,
}: MarketOverviewWidgetProps) {
  return (
    <TradingViewWidget
      scriptUrl="https://s3.tradingview.com/external-embedding/embed-widget-market-overview.js"
      config={{
        colorTheme: 'light',
        dateRange: '1D',
        showChart: true,
        locale: 'en',
        width: '100%',
        height: '100%',
        largeChartUrl: '',
        isTransparent: true,
        showSymbolLogo: showSymbolLogo,
        showFloatingTooltip: true,
        plotLineColorGrowing: 'rgba(16, 185, 129, 1)',
        plotLineColorFalling: 'rgba(239, 68, 68, 1)',
        gridLineColor: 'rgba(240, 243, 250, 0)',
        scaleFontColor: 'rgba(120, 123, 134, 1)',
        belowLineFillColorGrowing: 'rgba(16, 185, 129, 0.12)',
        belowLineFillColorFalling: 'rgba(239, 68, 68, 0.12)',
        belowLineFillColorGrowingBottom: 'rgba(16, 185, 129, 0)',
        belowLineFillColorFallingBottom: 'rgba(239, 68, 68, 0)',
        symbolActiveColor: 'rgba(16, 185, 129, 0.12)',
        tabs: [
          {
            title: 'Indices',
            symbols: [
              { s: 'FOREXCOM:SPXUSD', d: 'S&P 500' },
              { s: 'FOREXCOM:NSXUSD', d: 'Nasdaq 100' },
              { s: 'FOREXCOM:DJI', d: 'Dow 30' },
              { s: 'INDEX:NKY', d: 'Nikkei 225' },
              { s: 'INDEX:DEU40', d: 'DAX' },
              { s: 'FOREXCOM:UKXGBP', d: 'FTSE 100' },
            ],
            originalTitle: 'Indices',
          },
          {
            title: 'Futures',
            symbols: [
              { s: 'CME_MINI:ES1!', d: 'S&P 500 Futures' },
              { s: 'CME:NQ1!', d: 'Nasdaq Futures' },
              { s: 'COMEX:GC1!', d: 'Gold' },
              { s: 'NYMEX:CL1!', d: 'Crude Oil' },
              { s: 'NYMEX:NG1!', d: 'Natural Gas' },
              { s: 'CBOT:ZC1!', d: 'Corn' },
            ],
            originalTitle: 'Futures',
          },
          {
            title: 'Forex',
            symbols: [
              { s: 'FX:EURUSD', d: 'EUR/USD' },
              { s: 'FX:GBPUSD', d: 'GBP/USD' },
              { s: 'FX:USDJPY', d: 'USD/JPY' },
              { s: 'FX:USDCHF', d: 'USD/CHF' },
              { s: 'FX:AUDUSD', d: 'AUD/USD' },
              { s: 'FX:USDCAD', d: 'USD/CAD' },
            ],
            originalTitle: 'Forex',
          },
        ],
      }}
      height={height}
    />
  );
}

// ============================================================
// TypeScript declarations for TradingView global
// ============================================================

declare global {
  interface Window {
    TradingView: {
      widget: new (config: Record<string, unknown>) => unknown;
    };
  }
}
