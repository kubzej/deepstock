import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  formatCurrency,
  formatPercent,
  formatPrice,
  formatDate,
  toCZK,
} from '@/lib/format';

// Types
export interface StockPosition {
  ticker: string;
  name: string;
  shares: number;
  avgCost: number;
  currency: string;
  sector?: string;
  targetPrice?: number;
}

export interface OpenLot {
  id: string;
  ticker: string;
  date: string;
  shares: number;
  buyPrice: number;
  currency: string;
}

interface StockDetailProps {
  ticker: string;
  onBack: () => void;
}

export function StockDetail({ ticker, onBack }: StockDetailProps) {
  const { getHoldingByTicker, quotes, rates, loading } = usePortfolio();

  const holding = getHoldingByTicker(ticker);
  const quote = quotes[ticker];

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground">Načítání...</p>
      </div>
    );
  }

  // Not found state
  if (!holding) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Zpět
        </Button>
        <p className="text-destructive">Pozice nenalezena</p>
      </div>
    );
  }

  // Transform to position format
  const position: StockPosition = {
    ticker: holding.ticker,
    name: holding.name,
    shares: holding.shares,
    avgCost: holding.avg_cost,
    currency: holding.currency,
  };

  // Calculate position metrics
  const currentPrice = quote?.price ?? position.avgCost;
  const dailyChange = quote?.change ?? 0;
  const dailyChangePercent = quote?.changePercent ?? 0;

  const totalValueLocal = currentPrice * position.shares;
  const totalCostLocal = position.avgCost * position.shares;
  const unrealizedPnLLocal = totalValueLocal - totalCostLocal;
  const unrealizedPnLPercent =
    totalCostLocal > 0 ? (unrealizedPnLLocal / totalCostLocal) * 100 : 0;

  const totalValueCzk = toCZK(totalValueLocal, position.currency, rates);
  const totalCostCzk = toCZK(totalCostLocal, position.currency, rates);
  const unrealizedPnLCzk = totalValueCzk - totalCostCzk;

  // TODO: Fetch real lots from API
  const tickerLots: Array<
    OpenLot & {
      currentPrice: number;
      pnlLocal: number;
      pnlPercent: number;
      pnlCzk: number;
    }
  > = [];

  return (
    <div className="min-h-screen bg-background p-4 md:p-6 pb-24 md:pb-6">
      {/* Back Button */}
      <Button
        variant="ghost"
        size="sm"
        onClick={onBack}
        className="mb-4 -ml-2 text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="w-4 h-4 mr-1" />
        Zpět
      </Button>

      {/* Stock Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">{position.ticker}</h1>
            <p className="text-muted-foreground">{position.name}</p>
          </div>
          {position.sector && (
            <Badge variant="outline" className="text-xs">
              {position.sector}
            </Badge>
          )}
        </div>

        {/* Price Header */}
        <div className="mt-4">
          <div className="flex items-baseline gap-3">
            <span className="text-3xl font-bold font-mono-price">
              {formatPrice(currentPrice, position.currency)}
            </span>
            <div
              className={`flex items-center gap-1 ${
                dailyChange >= 0 ? 'text-positive' : 'text-negative'
              }`}
            >
              {dailyChange >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
              <span className="font-mono-price">
                {formatPrice(Math.abs(dailyChange), position.currency)} (
                {formatPercent(dailyChangePercent, 2, true)})
              </span>
            </div>
          </div>
          {loading && (
            <p className="text-sm text-muted-foreground mt-1">
              Načítání ceny...
            </p>
          )}
        </div>
      </div>

      {/* Chart Placeholder */}
      <Card className="mb-6 border-dashed">
        <CardContent className="flex items-center justify-center h-48 text-muted-foreground">
          Graf bude přidán později (Recharts)
        </CardContent>
      </Card>

      {/* Position Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Vaše pozice</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">Počet akcií</p>
              <p className="text-lg font-mono-price font-semibold">
                {position.shares}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Průměrná cena</p>
              <p className="text-lg font-mono-price font-semibold">
                {formatPrice(position.avgCost, position.currency)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Investováno</p>
              <p className="text-lg font-mono-price font-semibold">
                {formatCurrency(totalCostCzk)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Aktuální hodnota</p>
              <p className="text-lg font-mono-price font-semibold">
                {formatCurrency(totalValueCzk)}
              </p>
            </div>
          </div>

          {/* P/L Row */}
          <div className="mt-4 pt-4 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">
                  Nerealizovaný zisk/ztráta
                </p>
                <p
                  className={`text-xl font-mono-price font-bold ${
                    unrealizedPnLCzk >= 0 ? 'text-positive' : 'text-negative'
                  }`}
                >
                  {formatCurrency(unrealizedPnLCzk)}
                </p>
              </div>
              <Badge
                variant="outline"
                className={
                  unrealizedPnLPercent >= 0
                    ? 'text-positive border-positive/20'
                    : 'text-negative border-negative/20'
                }
              >
                {formatPercent(unrealizedPnLPercent, 2, true)}
              </Badge>
            </div>
          </div>

          {/* Target Price */}
          {position.targetPrice && (
            <div className="mt-4 pt-4 border-t border-border">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Cílová cena</p>
                  <p className="text-lg font-mono-price font-semibold">
                    {formatPrice(position.targetPrice, position.currency)}
                  </p>
                </div>
                <Badge
                  variant="outline"
                  className={
                    position.targetPrice > currentPrice
                      ? 'text-positive border-positive/20'
                      : 'text-negative border-negative/20'
                  }
                >
                  {formatPercent(
                    ((position.targetPrice - currentPrice) / currentPrice) *
                      100,
                    1,
                    true,
                  )}{' '}
                  k cíli
                </Badge>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Open Lots */}
      {tickerLots.length > 0 && (
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-medium">
              Otevřené loty ({tickerLots.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="text-xs uppercase text-muted-foreground">
                      Datum
                    </TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground text-right">
                      Počet
                    </TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground text-right">
                      Nákup
                    </TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground text-right">
                      Aktuální
                    </TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground text-right">
                      P/L (CZK)
                    </TableHead>
                    <TableHead className="text-xs uppercase text-muted-foreground text-right">
                      P/L %
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickerLots.map((lot) => (
                    <TableRow key={lot.id} className="hover:bg-muted/50">
                      <TableCell className="font-mono-price text-sm">
                        {formatDate(lot.date)}
                      </TableCell>
                      <TableCell className="font-mono-price text-sm text-right">
                        {lot.shares}
                      </TableCell>
                      <TableCell className="font-mono-price text-sm text-right">
                        {formatPrice(lot.buyPrice, lot.currency)}
                      </TableCell>
                      <TableCell className="font-mono-price text-sm text-right">
                        {formatPrice(lot.currentPrice, lot.currency)}
                      </TableCell>
                      <TableCell
                        className={`font-mono-price text-sm text-right font-medium ${
                          lot.pnlCzk >= 0 ? 'text-positive' : 'text-negative'
                        }`}
                      >
                        {formatCurrency(lot.pnlCzk)}
                      </TableCell>
                      <TableCell
                        className={`font-mono-price text-sm text-right font-medium ${
                          lot.pnlPercent >= 0
                            ? 'text-positive'
                            : 'text-negative'
                        }`}
                      >
                        {formatPercent(lot.pnlPercent, 1, true)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Stats */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-medium">Statistiky</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Denní objem</p>
              <p className="font-mono-price font-medium">
                {quote?.volume ? quote.volume.toLocaleString('cs-CZ') : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Prům. objem</p>
              <p className="font-mono-price font-medium">
                {quote?.avgVolume
                  ? quote.avgVolume.toLocaleString('cs-CZ')
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">Měna</p>
              <p className="font-mono-price font-medium">{position.currency}</p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mt-4">
            Více statistik bude přidáno později (Market Cap, P/E, Yield...)
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
