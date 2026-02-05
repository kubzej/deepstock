/**
 * Options Calculator Component
 *
 * Interactive calculator for 4 basic options strategies:
 * - Sell Put (Cash-Secured Put)
 * - Sell Call (Covered Call)
 * - Buy Call
 * - Buy Put
 */
import { useState, useMemo } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Info, DollarSign, Calendar, TrendingUp, Shield } from 'lucide-react';
import { formatPrice, formatPercent } from '@/lib/format';
import {
  calculateSellPut,
  calculateSellCall,
  calculateBuyCall,
  calculateBuyPut,
  calculateDTE,
  type SellPutCalculation,
  type SellCallCalculation,
  type BuyCallCalculation,
  type BuyPutCalculation,
} from '@/lib/optionCalc';

type StrategyType = 'sell-put' | 'sell-call' | 'buy-call' | 'buy-put';

interface ValidationErrors {
  stockPrice?: string;
  strike?: string;
  premium?: string;
  contracts?: string;
  expirationDate?: string;
}

// Metric Card Component
interface MetricCardProps {
  label: string;
  value: string;
  subtext?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  tooltip?: string;
}

function MetricCard({
  label,
  value,
  subtext,
  sentiment,
  tooltip,
}: MetricCardProps) {
  const sentimentClass =
    sentiment === 'positive'
      ? 'text-emerald-500'
      : sentiment === 'negative'
        ? 'text-rose-500'
        : 'text-foreground';

  return (
    <div className="p-4 rounded-lg bg-muted/30">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">
          {label}
        </span>
        {tooltip && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-[250px]">
              {tooltip}
            </TooltipContent>
          </Tooltip>
        )}
      </div>
      <div className={`text-xl font-bold font-mono-price ${sentimentClass}`}>
        {value}
      </div>
      {subtext && (
        <div className="text-xs text-muted-foreground mt-0.5">{subtext}</div>
      )}
    </div>
  );
}

export function OptionsCalculator() {
  // Strategy selection
  const [strategy, setStrategy] = useState<StrategyType>('sell-put');

  // Input values - empty by default
  const [stockPrice, setStockPrice] = useState<string>('');
  const [strike, setStrike] = useState<string>('');
  const [premium, setPremium] = useState<string>('');
  const [contracts, setContracts] = useState<string>('1');
  const [expirationDate, setExpirationDate] = useState<string>('');

  // Parse inputs
  const parsedInputs = useMemo(() => {
    return {
      stockPrice: parseFloat(stockPrice) || 0,
      strike: parseFloat(strike) || 0,
      premium: parseFloat(premium) || 0,
      contracts: parseInt(contracts) || 0,
    };
  }, [stockPrice, strike, premium, contracts]);

  // Validation
  const errors = useMemo((): ValidationErrors => {
    const errs: ValidationErrors = {};

    if (stockPrice && parsedInputs.stockPrice <= 0) {
      errs.stockPrice = 'Cena musí být kladná';
    }

    if (strike && parsedInputs.strike <= 0) {
      errs.strike = 'Strike musí být kladný';
    }

    if (premium && parsedInputs.premium <= 0) {
      errs.premium = 'Prémium musí být kladné';
    }

    if (contracts && parsedInputs.contracts <= 0) {
      errs.contracts = 'Počet kontraktů musí být alespoň 1';
    }

    if (expirationDate) {
      const dte = calculateDTE(expirationDate);
      if (dte < 0) {
        errs.expirationDate = 'Datum expirace musí být v budoucnosti';
      }
    }

    return errs;
  }, [stockPrice, strike, premium, contracts, expirationDate, parsedInputs]);

  const hasErrors = Object.keys(errors).length > 0;
  const isComplete =
    stockPrice !== '' &&
    strike !== '' &&
    premium !== '' &&
    contracts !== '' &&
    expirationDate !== '';

  // Calculate results
  const calculation = useMemo(() => {
    const {
      stockPrice: sp,
      strike: st,
      premium: pr,
      contracts: ct,
    } = parsedInputs;

    if (!isComplete || hasErrors) {
      return null;
    }

    if (sp <= 0 || st <= 0 || pr <= 0 || ct <= 0) {
      return null;
    }

    if (strategy === 'sell-put') {
      return calculateSellPut(sp, st, pr, ct, expirationDate);
    } else if (strategy === 'sell-call') {
      return calculateSellCall(sp, st, pr, ct, expirationDate);
    } else if (strategy === 'buy-call') {
      return calculateBuyCall(sp, st, pr, ct, expirationDate);
    } else {
      return calculateBuyPut(sp, st, pr, ct, expirationDate);
    }
  }, [strategy, parsedInputs, expirationDate, isComplete, hasErrors]);

  const isSellPut = strategy === 'sell-put';
  const isSellCall = strategy === 'sell-call';
  const isBuyCall = strategy === 'buy-call';
  const isBuyPut = strategy === 'buy-put';
  const isSellStrategy = isSellPut || isSellCall;

  const putCalc = calculation as SellPutCalculation | null;
  const callCalc = calculation as SellCallCalculation | null;
  const buyCallCalc = calculation as BuyCallCalculation | null;
  const buyPutCalc = calculation as BuyPutCalculation | null;

  // Helper functions for sentiment colors
  const getAnnualizedSentiment = (
    value: number,
  ): 'positive' | 'neutral' | 'negative' => {
    if (value >= 30) return 'positive';
    if (value >= 15) return 'neutral';
    return 'negative';
  };

  const getYieldSentiment = (
    value: number,
  ): 'positive' | 'neutral' | 'negative' => {
    if (value >= 2) return 'positive';
    if (value >= 1) return 'neutral';
    return 'negative';
  };

  const getBufferSentiment = (
    value: number,
  ): 'positive' | 'neutral' | 'negative' => {
    if (value >= 5) return 'positive';
    if (value >= 2) return 'neutral';
    return 'negative';
  };

  const getDiscountSentiment = (
    value: number,
  ): 'positive' | 'neutral' | 'negative' => {
    if (value >= 5) return 'positive';
    if (value >= 2) return 'neutral';
    return 'negative';
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Left Panel - Inputs */}
      <div className="space-y-6">
        {/* Strategy Tabs */}
        <Tabs
          value={strategy}
          onValueChange={(v) => setStrategy(v as StrategyType)}
        >
          <TabsList className="w-full grid grid-cols-4">
            <TabsTrigger value="sell-put">Sell Put</TabsTrigger>
            <TabsTrigger value="sell-call">Sell Call</TabsTrigger>
            <TabsTrigger value="buy-call">Buy Call</TabsTrigger>
            <TabsTrigger value="buy-put">Buy Put</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Input Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="stock-price">Cena akcie ($)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="stock-price"
                type="number"
                step="0.01"
                min="0"
                value={stockPrice}
                onChange={(e) => setStockPrice(e.target.value)}
                placeholder="100.00"
                className={`pl-9 ${errors.stockPrice ? 'border-rose-500' : ''}`}
              />
            </div>
            {errors.stockPrice && (
              <p className="text-xs text-rose-500">{errors.stockPrice}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="strike">Strike cena ($)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="strike"
                type="number"
                step="0.5"
                min="0"
                value={strike}
                onChange={(e) => setStrike(e.target.value)}
                placeholder="95.00"
                className={`pl-9 ${errors.strike ? 'border-rose-500' : ''}`}
              />
            </div>
            {errors.strike && (
              <p className="text-xs text-rose-500">{errors.strike}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="premium">Prémium ($)</Label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="premium"
                type="number"
                step="0.05"
                min="0"
                value={premium}
                onChange={(e) => setPremium(e.target.value)}
                placeholder="2.50"
                className={`pl-9 ${errors.premium ? 'border-rose-500' : ''}`}
              />
            </div>
            {errors.premium && (
              <p className="text-xs text-rose-500">{errors.premium}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="contracts">Kontrakty</Label>
            <Input
              id="contracts"
              type="number"
              step="1"
              min="1"
              value={contracts}
              onChange={(e) => setContracts(e.target.value)}
              placeholder="1"
              className={errors.contracts ? 'border-rose-500' : ''}
            />
            {errors.contracts && (
              <p className="text-xs text-rose-500">{errors.contracts}</p>
            )}
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor="expiration">Datum expirace</Label>
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              id="expiration"
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              className={`pl-9 ${errors.expirationDate ? 'border-rose-500' : ''}`}
            />
          </div>
          {errors.expirationDate && (
            <p className="text-xs text-rose-500">{errors.expirationDate}</p>
          )}
        </div>
      </div>

      {/* Right Panel - Results */}
      <div className="space-y-4">
        {calculation ? (
          <>
            {/* Hero Metric */}
            {isSellStrategy ? (
              <div
                className={`p-6 rounded-xl ${
                  getAnnualizedSentiment(
                    (calculation as SellPutCalculation | SellCallCalculation)
                      .annualizedReturn,
                  ) === 'positive'
                    ? 'bg-emerald-500/10'
                    : getAnnualizedSentiment(
                          (
                            calculation as
                              | SellPutCalculation
                              | SellCallCalculation
                          ).annualizedReturn,
                        ) === 'neutral'
                      ? 'bg-amber-500/10'
                      : 'bg-rose-500/10'
                }`}
              >
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm uppercase tracking-wide text-muted-foreground">
                    Anualizovaný výnos (p.a.)
                  </span>
                </div>
                <div
                  className={`text-4xl font-bold font-mono-price ${
                    getAnnualizedSentiment(
                      (calculation as SellPutCalculation | SellCallCalculation)
                        .annualizedReturn,
                    ) === 'positive'
                      ? 'text-emerald-500'
                      : getAnnualizedSentiment(
                            (
                              calculation as
                                | SellPutCalculation
                                | SellCallCalculation
                            ).annualizedReturn,
                          ) === 'neutral'
                        ? 'text-amber-500'
                        : 'text-rose-500'
                  }`}
                >
                  {formatPercent(
                    (calculation as SellPutCalculation | SellCallCalculation)
                      .annualizedReturn,
                    1,
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {calculation.dte} dní do expirace
                </div>
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-rose-500/10">
                <div className="flex items-center gap-2 mb-2">
                  <Shield className="h-5 w-5 text-muted-foreground" />
                  <span className="text-sm uppercase tracking-wide text-muted-foreground">
                    Max. ztráta (riziko)
                  </span>
                </div>
                <div className="text-4xl font-bold font-mono-price text-rose-500">
                  {formatPrice(
                    (calculation as BuyCallCalculation | BuyPutCalculation)
                      .maxLoss,
                    'USD',
                    0,
                  )}
                </div>
                <div className="text-sm text-muted-foreground mt-1">
                  {calculation.dte} dní do expirace
                </div>
              </div>
            )}

            {/* Metrics Grid - Sell strategies */}
            {isSellStrategy && (
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Výnos opce"
                  value={formatPercent(
                    (calculation as SellPutCalculation | SellCallCalculation)
                      .yieldPercent,
                    2,
                  )}
                  subtext={`prémium ${formatPrice((calculation as SellPutCalculation | SellCallCalculation).totalPremium, 'USD', 0)}`}
                  sentiment={getYieldSentiment(
                    (calculation as SellPutCalculation | SellCallCalculation)
                      .yieldPercent,
                  )}
                  tooltip="Výnos = prémium / strike. Nad 2% = výborné, 1-2% = dobré, pod 1% = slabé."
                />

                <MetricCard
                  label="Rezerva"
                  value={formatPercent(
                    (calculation as SellPutCalculation | SellCallCalculation)
                      .bufferPercent,
                    1,
                  )}
                  subtext={
                    (calculation as SellPutCalculation | SellCallCalculation)
                      .bufferPercent >= 5
                      ? 'bezpečná vzdálenost'
                      : (
                            calculation as
                              | SellPutCalculation
                              | SellCallCalculation
                          ).bufferPercent >= 2
                        ? 'střední riziko'
                        : 'blízko strike'
                  }
                  sentiment={getBufferSentiment(
                    (calculation as SellPutCalculation | SellCallCalculation)
                      .bufferPercent,
                  )}
                  tooltip="O kolik % musí cena klesnout (PUT) nebo vzrůst (CALL), aby došlo k přiřazení."
                />

                {isSellPut && putCalc && (
                  <>
                    <MetricCard
                      label="Break-even"
                      value={formatPrice(putCalc.breakeven, 'USD')}
                      subtext="efektivní nákup při přiřazení"
                      tooltip="Cena, za kterou efektivně koupíš akcie při přiřazení."
                    />

                    <MetricCard
                      label="Sleva při přiřazení"
                      value={formatPercent(putCalc.discountPercent, 1)}
                      subtext="oproti aktuální ceně"
                      sentiment={getDiscountSentiment(putCalc.discountPercent)}
                      tooltip="O kolik procent levněji koupíš akcie oproti aktuální ceně."
                    />

                    <MetricCard
                      label="Blokovaný kapitál"
                      value={formatPrice(putCalc.blockedCapital, 'USD', 0)}
                      subtext="cash-secured"
                    />
                  </>
                )}

                {isSellCall && callCalc && (
                  <MetricCard
                    label="Max. profit"
                    value={formatPrice(callCalc.maxProfit, 'USD', 0)}
                    subtext="prémium + upside"
                    sentiment="positive"
                  />
                )}
              </div>
            )}

            {/* Metrics Grid - Buy Call */}
            {isBuyCall && buyCallCalc && (
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Break-even"
                  value={formatPrice(buyCallCalc.breakeven, 'USD')}
                  subtext="cena pro profit"
                  tooltip="Akcie musí vzrůst nad tuto cenu, abys byl v zisku."
                />

                <MetricCard
                  label="Potřebný růst"
                  value={formatPercent(buyCallCalc.requiredMove, 1)}
                  subtext="pro break-even"
                  sentiment={
                    buyCallCalc.requiredMove <= 5
                      ? 'positive'
                      : buyCallCalc.requiredMove <= 10
                        ? 'neutral'
                        : 'negative'
                  }
                />

                <MetricCard
                  label="Leverage"
                  value={`${buyCallCalc.leverage.toFixed(1)}×`}
                  subtext="páka oproti akciím"
                  tooltip="Kolikrát větší expozice máš oproti přímému nákupu akcií."
                />

                <MetricCard
                  label="Celková cena"
                  value={formatPrice(buyCallCalc.totalCost, 'USD', 0)}
                  subtext="zaplacené prémium"
                />
              </div>
            )}

            {/* Metrics Grid - Buy Put */}
            {isBuyPut && buyPutCalc && (
              <div className="grid grid-cols-2 gap-3">
                <MetricCard
                  label="Break-even"
                  value={formatPrice(buyPutCalc.breakeven, 'USD')}
                  subtext="cena pro profit"
                  tooltip="Akcie musí klesnout pod tuto cenu, abys byl v zisku."
                />

                <MetricCard
                  label="Potřebný pokles"
                  value={formatPercent(buyPutCalc.requiredMove, 1)}
                  subtext="pro break-even"
                  sentiment={
                    buyPutCalc.requiredMove <= 5
                      ? 'positive'
                      : buyPutCalc.requiredMove <= 10
                        ? 'neutral'
                        : 'negative'
                  }
                />

                <MetricCard
                  label="Max. profit"
                  value={formatPrice(buyPutCalc.maxProfit, 'USD', 0)}
                  subtext="pokud akcie → 0"
                  sentiment="positive"
                />

                <MetricCard
                  label="Celková cena"
                  value={formatPrice(buyPutCalc.totalCost, 'USD', 0)}
                  subtext="zaplacené prémium"
                />
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
              <TrendingUp className="h-8 w-8 text-muted-foreground" />
            </div>
            <h3 className="text-lg font-medium mb-2">
              {hasErrors
                ? 'Opravte chyby ve formuláři'
                : 'Vyplňte všechny parametry'}
            </h3>
            <p className="text-sm text-muted-foreground max-w-[300px]">
              {hasErrors
                ? 'Některé hodnoty nejsou platné'
                : 'Zadejte cenu akcie, strike, prémium a datum expirace pro výpočet'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
