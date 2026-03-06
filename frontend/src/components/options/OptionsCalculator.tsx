/**
 * Options Calculator Component
 *
 * Interactive calculator with multi-scenario comparison for 4 basic strategies.
 * Data is kept only in current session (local component state).
 */
import { useEffect, useState, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PillButton } from '@/components/shared/PillButton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Info,
  DollarSign,
  Calendar,
  TrendingUp,
  Shield,
  Plus,
  Copy,
  Trash2,
  RotateCcw,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';
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

type SortKey =
  | 'name'
  | 'dte'
  | 'annualizedReturn'
  | 'yieldPercent'
  | 'bufferPercent'
  | 'breakeven'
  | 'requiredMove'
  | 'maxLoss'
  | 'maxProfit'
  | 'timeValuePerDay'
  | 'blockedCapital';

type SortDirection = 'asc' | 'desc';

interface ScenarioInput {
  id: string;
  name: string;
  isNameCustom: boolean;
  strategy: StrategyType;
  stockPrice: string;
  strike: string;
  premium: string;
  contracts: string;
  expirationDate: string;
}

interface ParsedScenarioInput {
  stockPrice: number;
  strike: number;
  premium: number;
  contracts: number;
}

interface ValidationErrors {
  stockPrice?: string;
  strike?: string;
  premium?: string;
  contracts?: string;
  expirationDate?: string;
}

type AnyCalculation =
  | SellPutCalculation
  | SellCallCalculation
  | BuyCallCalculation
  | BuyPutCalculation;

interface ComparisonRow {
  id: string;
  name: string;
  status: 'valid' | 'invalid' | 'incomplete';
  calculation: AnyCalculation | null;
  dte?: number;
  annualizedReturn?: number;
  yieldPercent?: number;
  bufferPercent?: number;
  breakeven?: number;
  requiredMove?: number;
  maxLoss?: number;
  maxProfit?: number;
  timeValuePerDay?: number;
  blockedCapital?: number;
}

interface OptionsCalculatorRuntimeState {
  scenarios: ScenarioInput[];
  selectedScenarioId: string;
  sortKey: SortKey;
  sortDirection: SortDirection;
}

let optionsCalculatorRuntimeState: OptionsCalculatorRuntimeState | null = null;

const STRATEGY_OPTIONS: { value: StrategyType; label: string }[] = [
  { value: 'sell-put', label: 'Sell PUT' },
  { value: 'sell-call', label: 'Sell CALL' },
  { value: 'buy-call', label: 'Buy CALL' },
  { value: 'buy-put', label: 'Buy PUT' },
];

function formatScenarioDate(date: string): string {
  if (!date) return '';

  const [year, month, day] = date.split('-');
  if (!year || !month || !day) return '';

  return `${day}.${month}.${year.slice(2)}`;
}

function buildAutoScenarioName(scenario: {
  strategy: StrategyType;
  strike: string;
  premium: string;
  expirationDate: string;
}): string {
  const strategyLabel = getStrategyLabel(scenario.strategy);
  const parts: string[] = [strategyLabel];

  if (scenario.strike) {
    parts.push(scenario.strike);
  }

  if (scenario.premium) {
    parts.push(scenario.premium);
  }

  const formattedDate = formatScenarioDate(scenario.expirationDate);
  if (formattedDate) {
    parts.push(formattedDate);
  }

  return parts.join(' ');
}

function createScenario(index: number): ScenarioInput {
  const baseScenario = {
    strategy: 'sell-put' as StrategyType,
    strike: '',
    premium: '',
    expirationDate: '',
  };

  return {
    id: `scenario-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name: `${buildAutoScenarioName(baseScenario)} #${index}`,
    isNameCustom: false,
    strategy: baseScenario.strategy,
    stockPrice: '',
    strike: '',
    premium: '',
    contracts: '1',
    expirationDate: '',
  };
}

function parseScenarioInput(scenario: ScenarioInput): ParsedScenarioInput {
  return {
    stockPrice: parseFloat(scenario.stockPrice) || 0,
    strike: parseFloat(scenario.strike) || 0,
    premium: parseFloat(scenario.premium) || 0,
    contracts: parseInt(scenario.contracts) || 0,
  };
}

function getStrategyLabel(strategy: StrategyType): string {
  return STRATEGY_OPTIONS.find((s) => s.value === strategy)?.label ?? strategy;
}

function getValidationErrors(
  scenario: ScenarioInput,
  parsed: ParsedScenarioInput,
): ValidationErrors {
  const errs: ValidationErrors = {};

  if (scenario.stockPrice && parsed.stockPrice <= 0) {
    errs.stockPrice = 'Cena musí být kladná';
  }

  if (scenario.strike && parsed.strike <= 0) {
    errs.strike = 'Strike musí být kladný';
  }

  if (scenario.premium && parsed.premium <= 0) {
    errs.premium = 'Prémium musí být kladné';
  }

  if (scenario.contracts && parsed.contracts <= 0) {
    errs.contracts = 'Počet kontraktů musí být alespoň 1';
  }

  if (scenario.expirationDate) {
    const dte = calculateDTE(scenario.expirationDate);
    if (dte < 0) {
      errs.expirationDate = 'Datum expirace musí být v budoucnosti';
    }
  }

  return errs;
}

function isSellCalculation(
  calc: AnyCalculation,
): calc is SellPutCalculation | SellCallCalculation {
  return 'annualizedReturn' in calc;
}

function isBuyCalculation(
  calc: AnyCalculation,
): calc is BuyCallCalculation | BuyPutCalculation {
  return 'requiredMove' in calc;
}

function isSellPutCalculation(
  calc: AnyCalculation,
): calc is SellPutCalculation {
  return 'blockedCapital' in calc;
}

function sortIcon(
  activeSortKey: SortKey,
  columnSortKey: SortKey,
  direction: SortDirection,
) {
  if (activeSortKey !== columnSortKey) {
    return <ArrowUpDown className="h-3.5 w-3.5 text-muted-foreground/60" />;
  }

  return direction === 'asc' ? (
    <ArrowUp className="h-3.5 w-3.5" />
  ) : (
    <ArrowDown className="h-3.5 w-3.5" />
  );
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
        : sentiment === 'neutral'
          ? 'text-amber-500'
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

function createDefaultRuntimeState(): OptionsCalculatorRuntimeState {
  const firstScenario = createScenario(1);
  return {
    scenarios: [firstScenario],
    selectedScenarioId: firstScenario.id,
    sortKey: 'annualizedReturn',
    sortDirection: 'desc',
  };
}

export function OptionsCalculator() {
  const initialRuntimeState = useMemo(() => {
    if (
      optionsCalculatorRuntimeState &&
      optionsCalculatorRuntimeState.scenarios.length > 0
    ) {
      return optionsCalculatorRuntimeState;
    }

    return createDefaultRuntimeState();
  }, []);

  const [scenarios, setScenarios] = useState<ScenarioInput[]>(
    initialRuntimeState.scenarios,
  );
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>(
    initialRuntimeState.selectedScenarioId,
  );
  const [sortKey, setSortKey] = useState<SortKey>(initialRuntimeState.sortKey);
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    initialRuntimeState.sortDirection,
  );

  useEffect(() => {
    if (!scenarios.length) return;

    optionsCalculatorRuntimeState = {
      scenarios,
      selectedScenarioId,
      sortKey,
      sortDirection,
    };
  }, [scenarios, selectedScenarioId, sortKey, sortDirection]);

  useEffect(() => {
    if (!scenarios.length) return;

    const selectedStillExists = scenarios.some(
      (s) => s.id === selectedScenarioId,
    );
    if (!selectedStillExists) {
      setSelectedScenarioId(scenarios[0].id);
    }
  }, [scenarios, selectedScenarioId]);

  const selectedScenario = useMemo(() => {
    return scenarios.find((scenario) => scenario.id === selectedScenarioId);
  }, [scenarios, selectedScenarioId]);

  if (!selectedScenario) {
    return null;
  }

  const selectedParsedInputs = useMemo(() => {
    return parseScenarioInput(selectedScenario);
  }, [selectedScenario]);

  const selectedErrors = useMemo(() => {
    return getValidationErrors(selectedScenario, selectedParsedInputs);
  }, [selectedScenario, selectedParsedInputs]);

  const selectedHasErrors = Object.keys(selectedErrors).length > 0;
  const selectedIsComplete =
    selectedScenario.stockPrice !== '' &&
    selectedScenario.strike !== '' &&
    selectedScenario.premium !== '' &&
    selectedScenario.contracts !== '' &&
    selectedScenario.expirationDate !== '';

  const selectedCalculation = useMemo(() => {
    const {
      stockPrice: sp,
      strike: st,
      premium: pr,
      contracts: ct,
    } = selectedParsedInputs;

    if (!selectedIsComplete || selectedHasErrors) {
      return null;
    }

    if (sp <= 0 || st <= 0 || pr <= 0 || ct <= 0) {
      return null;
    }

    if (selectedScenario.strategy === 'sell-put') {
      return calculateSellPut(sp, st, pr, ct, selectedScenario.expirationDate);
    }

    if (selectedScenario.strategy === 'sell-call') {
      return calculateSellCall(sp, st, pr, ct, selectedScenario.expirationDate);
    }

    if (selectedScenario.strategy === 'buy-call') {
      return calculateBuyCall(sp, st, pr, ct, selectedScenario.expirationDate);
    }

    return calculateBuyPut(sp, st, pr, ct, selectedScenario.expirationDate);
  }, [
    selectedScenario,
    selectedParsedInputs,
    selectedIsComplete,
    selectedHasErrors,
  ]);

  const comparisonRows = useMemo<ComparisonRow[]>(() => {
    return scenarios.map((scenario) => {
      const parsed = parseScenarioInput(scenario);
      const errors = getValidationErrors(scenario, parsed);
      const hasErrors = Object.keys(errors).length > 0;
      const isComplete =
        scenario.stockPrice !== '' &&
        scenario.strike !== '' &&
        scenario.premium !== '' &&
        scenario.contracts !== '' &&
        scenario.expirationDate !== '';

      if (!isComplete) {
        return {
          id: scenario.id,
          name: scenario.name,
          status: 'incomplete',
          calculation: null,
        };
      }

      if (hasErrors) {
        return {
          id: scenario.id,
          name: scenario.name,
          status: 'invalid',
          calculation: null,
        };
      }

      let calculation: AnyCalculation;
      if (scenario.strategy === 'sell-put') {
        calculation = calculateSellPut(
          parsed.stockPrice,
          parsed.strike,
          parsed.premium,
          parsed.contracts,
          scenario.expirationDate,
        );
      } else if (scenario.strategy === 'sell-call') {
        calculation = calculateSellCall(
          parsed.stockPrice,
          parsed.strike,
          parsed.premium,
          parsed.contracts,
          scenario.expirationDate,
        );
      } else if (scenario.strategy === 'buy-call') {
        calculation = calculateBuyCall(
          parsed.stockPrice,
          parsed.strike,
          parsed.premium,
          parsed.contracts,
          scenario.expirationDate,
        );
      } else {
        calculation = calculateBuyPut(
          parsed.stockPrice,
          parsed.strike,
          parsed.premium,
          parsed.contracts,
          scenario.expirationDate,
        );
      }

      return {
        id: scenario.id,
        name: scenario.name,
        status: 'valid',
        calculation,
        dte: calculation.dte,
        annualizedReturn: isSellCalculation(calculation)
          ? calculation.annualizedReturn
          : undefined,
        yieldPercent: isSellCalculation(calculation)
          ? calculation.yieldPercent
          : undefined,
        bufferPercent: isSellCalculation(calculation)
          ? calculation.bufferPercent
          : undefined,
        breakeven:
          'breakeven' in calculation ? calculation.breakeven : undefined,
        requiredMove: isBuyCalculation(calculation)
          ? calculation.requiredMove
          : undefined,
        maxLoss: isBuyCalculation(calculation)
          ? calculation.maxLoss
          : undefined,
        maxProfit:
          'maxProfit' in calculation ? calculation.maxProfit : undefined,
        timeValuePerDay:
          'timeValuePerDay' in calculation
            ? calculation.timeValuePerDay
            : undefined,
        blockedCapital: isSellPutCalculation(calculation)
          ? calculation.blockedCapital
          : undefined,
      };
    });
  }, [scenarios]);

  const sortedRows = useMemo(() => {
    return [...comparisonRows].sort((a, b) => {
      const directionMultiplier = sortDirection === 'asc' ? 1 : -1;

      if (sortKey === 'name') {
        const valueA = a[sortKey].toString().toLowerCase();
        const valueB = b[sortKey].toString().toLowerCase();
        return valueA.localeCompare(valueB) * directionMultiplier;
      }

      const valueA = a[sortKey] as number | undefined;
      const valueB = b[sortKey] as number | undefined;

      if (valueA === undefined && valueB === undefined) {
        return 0;
      }

      if (valueA === undefined) {
        return 1;
      }

      if (valueB === undefined) {
        return -1;
      }

      return (valueA - valueB) * directionMultiplier;
    });
  }, [comparisonRows, sortKey, sortDirection]);

  const handleSort = (newSortKey: SortKey) => {
    if (sortKey === newSortKey) {
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
      return;
    }

    setSortKey(newSortKey);
    setSortDirection('desc');
  };

  const renderSortableHeader = (
    label: string,
    columnKey: SortKey,
    className = '',
  ) => (
    <TableHead
      className={`text-xs uppercase tracking-wide text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none ${className}`}
      onClick={() => handleSort(columnKey)}
    >
      {label}
      <span className="inline-flex align-middle ml-1">
        {sortIcon(sortKey, columnKey, sortDirection)}
      </span>
    </TableHead>
  );

  const updateSelectedScenario = (patch: Partial<ScenarioInput>) => {
    setScenarios((prev) => {
      return prev.map((scenario) => {
        if (scenario.id !== selectedScenario.id) {
          return scenario;
        }

        const patchIncludesName = Object.prototype.hasOwnProperty.call(
          patch,
          'name',
        );
        const nameValue = patch.name;

        let nextScenario: ScenarioInput;
        if (patchIncludesName && nameValue !== undefined) {
          const trimmed = nameValue.trim();

          if (trimmed === '') {
            nextScenario = {
              ...scenario,
              ...patch,
              name: '',
              isNameCustom: false,
            };
          } else {
            nextScenario = {
              ...scenario,
              ...patch,
              name: nameValue,
              isNameCustom: true,
            };
          }
        } else {
          nextScenario = {
            ...scenario,
            ...patch,
          };
        }

        if (!nextScenario.isNameCustom) {
          nextScenario.name = buildAutoScenarioName(nextScenario);
        }

        return nextScenario;
      });
    });
  };

  const addScenario = () => {
    const nextScenario = createScenario(scenarios.length + 1);
    setScenarios((prev) => [...prev, nextScenario]);
    setSelectedScenarioId(nextScenario.id);
  };

  const duplicateScenario = () => {
    const duplicate: ScenarioInput = {
      ...selectedScenario,
      id: `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      isNameCustom: false,
      name: buildAutoScenarioName(selectedScenario),
    };

    setScenarios((prev) => [...prev, duplicate]);
    setSelectedScenarioId(duplicate.id);
  };

  const removeSelectedScenario = () => {
    if (scenarios.length <= 1) return;

    const selectedIndex = scenarios.findIndex(
      (s) => s.id === selectedScenario.id,
    );
    const nextScenarios = scenarios.filter((s) => s.id !== selectedScenario.id);
    const fallbackScenario =
      nextScenarios[Math.max(0, selectedIndex - 1)] ?? nextScenarios[0];

    setScenarios(nextScenarios);
    setSelectedScenarioId(fallbackScenario.id);
  };

  const resetSelectedScenarioInputs = () => {
    updateSelectedScenario({
      stockPrice: '',
      strike: '',
      premium: '',
      contracts: '1',
      expirationDate: '',
    });
  };

  const isSellPut = selectedScenario.strategy === 'sell-put';
  const isSellCall = selectedScenario.strategy === 'sell-call';
  const isBuyCall = selectedScenario.strategy === 'buy-call';
  const isBuyPut = selectedScenario.strategy === 'buy-put';
  const isSellStrategy = isSellPut || isSellCall;

  const putCalc = selectedCalculation as SellPutCalculation | null;
  const callCalc = selectedCalculation as SellCallCalculation | null;
  const buyCallCalc = selectedCalculation as BuyCallCalculation | null;
  const buyPutCalc = selectedCalculation as BuyPutCalculation | null;

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
    <div className="space-y-5 md:space-y-6">
      <div className="space-y-2 md:space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-lg font-semibold">Scénáře opčních obchodů</h3>
          </div>
          <div className="grid grid-cols-4 gap-2 md:flex md:flex-wrap md:items-center">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="w-full md:w-9"
              onClick={addScenario}
              aria-label="Přidat scénář"
            >
              <Plus className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="w-full md:w-9"
              onClick={duplicateScenario}
              aria-label="Duplikovat scénář"
            >
              <Copy className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="w-full md:w-9"
              onClick={removeSelectedScenario}
              disabled={scenarios.length <= 1}
              aria-label="Smazat scénář"
            >
              <Trash2 className="h-4 w-4" />
            </Button>

            <Button
              type="button"
              variant="outline"
              size="icon"
              className="w-full md:w-9"
              onClick={resetSelectedScenarioInputs}
              aria-label="Vyčistit vstupy"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="w-full">
          <div className="grid grid-cols-2 gap-1 md:inline-flex md:whitespace-nowrap md:overflow-x-auto md:scrollbar-hide">
            {scenarios.map((scenario) => (
              <PillButton
                key={scenario.id}
                active={selectedScenarioId === scenario.id}
                onClick={() => setSelectedScenarioId(scenario.id)}
                size="md"
                className="w-full min-w-0 truncate md:shrink-0 md:w-auto"
              >
                {scenario.name}
              </PillButton>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="scenario-name">Název scénáře</Label>
            <Input
              id="scenario-name"
              value={selectedScenario.name}
              onChange={(e) => updateSelectedScenario({ name: e.target.value })}
              placeholder="Automaticky se generuje"
            />
          </div>

          <div className="w-full">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-1">
              {STRATEGY_OPTIONS.map((option) => (
                <PillButton
                  key={option.value}
                  active={selectedScenario.strategy === option.value}
                  onClick={() =>
                    updateSelectedScenario({ strategy: option.value })
                  }
                  size="md"
                  className="w-full"
                >
                  {option.label}
                </PillButton>
              ))}
            </div>
          </div>

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
                  value={selectedScenario.stockPrice}
                  onChange={(e) =>
                    updateSelectedScenario({ stockPrice: e.target.value })
                  }
                  placeholder="100.00"
                  className={`pl-9 ${selectedErrors.stockPrice ? 'border-rose-500' : ''}`}
                />
              </div>
              {selectedErrors.stockPrice && (
                <p className="text-xs text-rose-500">
                  {selectedErrors.stockPrice}
                </p>
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
                  value={selectedScenario.strike}
                  onChange={(e) =>
                    updateSelectedScenario({ strike: e.target.value })
                  }
                  placeholder="95.00"
                  className={`pl-9 ${selectedErrors.strike ? 'border-rose-500' : ''}`}
                />
              </div>
              {selectedErrors.strike && (
                <p className="text-xs text-rose-500">{selectedErrors.strike}</p>
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
                  value={selectedScenario.premium}
                  onChange={(e) =>
                    updateSelectedScenario({ premium: e.target.value })
                  }
                  placeholder="2.50"
                  className={`pl-9 ${selectedErrors.premium ? 'border-rose-500' : ''}`}
                />
              </div>
              {selectedErrors.premium && (
                <p className="text-xs text-rose-500">
                  {selectedErrors.premium}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="contracts">Kontrakty</Label>
              <Input
                id="contracts"
                type="number"
                step="1"
                min="1"
                value={selectedScenario.contracts}
                onChange={(e) =>
                  updateSelectedScenario({ contracts: e.target.value })
                }
                placeholder="1"
                className={selectedErrors.contracts ? 'border-rose-500' : ''}
              />
              {selectedErrors.contracts && (
                <p className="text-xs text-rose-500">
                  {selectedErrors.contracts}
                </p>
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
                value={selectedScenario.expirationDate}
                onChange={(e) =>
                  updateSelectedScenario({ expirationDate: e.target.value })
                }
                className={`pl-9 ${selectedErrors.expirationDate ? 'border-rose-500' : ''}`}
              />
            </div>
            {selectedErrors.expirationDate && (
              <p className="text-xs text-rose-500">
                {selectedErrors.expirationDate}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-4">
          {selectedCalculation ? (
            <>
              {isSellStrategy ? (
                <div
                  className={`p-6 rounded-xl ${
                    getAnnualizedSentiment(
                      (
                        selectedCalculation as
                          | SellPutCalculation
                          | SellCallCalculation
                      ).annualizedReturn,
                    ) === 'positive'
                      ? 'bg-emerald-500/10'
                      : getAnnualizedSentiment(
                            (
                              selectedCalculation as
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
                        (
                          selectedCalculation as
                            | SellPutCalculation
                            | SellCallCalculation
                        ).annualizedReturn,
                      ) === 'positive'
                        ? 'text-emerald-500'
                        : getAnnualizedSentiment(
                              (
                                selectedCalculation as
                                  | SellPutCalculation
                                  | SellCallCalculation
                              ).annualizedReturn,
                            ) === 'neutral'
                          ? 'text-amber-500'
                          : 'text-rose-500'
                    }`}
                  >
                    {formatPercent(
                      (
                        selectedCalculation as
                          | SellPutCalculation
                          | SellCallCalculation
                      ).annualizedReturn,
                      1,
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedCalculation.dte} dní do expirace
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
                      (
                        selectedCalculation as
                          | BuyCallCalculation
                          | BuyPutCalculation
                      ).maxLoss,
                      'USD',
                      0,
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedCalculation.dte} dní do expirace
                  </div>
                </div>
              )}

              {isSellStrategy && (
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    label="Výnos opce"
                    value={formatPercent(
                      (
                        selectedCalculation as
                          | SellPutCalculation
                          | SellCallCalculation
                      ).yieldPercent,
                      2,
                    )}
                    subtext={`prémium ${formatPrice((selectedCalculation as SellPutCalculation | SellCallCalculation).totalPremium, 'USD', 0)}`}
                    sentiment={getYieldSentiment(
                      (
                        selectedCalculation as
                          | SellPutCalculation
                          | SellCallCalculation
                      ).yieldPercent,
                    )}
                  />

                  <MetricCard
                    label="Rezerva"
                    value={formatPercent(
                      (
                        selectedCalculation as
                          | SellPutCalculation
                          | SellCallCalculation
                      ).bufferPercent,
                      1,
                    )}
                    subtext="vzdálenost od strike"
                    sentiment={getBufferSentiment(
                      (
                        selectedCalculation as
                          | SellPutCalculation
                          | SellCallCalculation
                      ).bufferPercent,
                    )}
                  />

                  {isSellPut && putCalc && (
                    <>
                      <MetricCard
                        label="Break-even"
                        value={formatPrice(putCalc.breakeven, 'USD')}
                        subtext="efektivní cena"
                      />

                      <MetricCard
                        label="Sleva při přiřazení"
                        value={formatPercent(putCalc.discountPercent, 1)}
                        subtext="oproti aktuální ceně"
                        sentiment={getDiscountSentiment(
                          putCalc.discountPercent,
                        )}
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

              {isBuyCall && buyCallCalc && (
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    label="Break-even"
                    value={formatPrice(buyCallCalc.breakeven, 'USD')}
                    subtext="cena pro profit"
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
                  />
                  <MetricCard
                    label="Čas. hodnota/den"
                    value={formatPrice(buyCallCalc.timeValuePerDay, 'USD')}
                    subtext="theta decay"
                    sentiment={
                      buyCallCalc.timeValuePerDay <= 1
                        ? 'positive'
                        : buyCallCalc.timeValuePerDay <= 3
                          ? 'neutral'
                          : 'negative'
                    }
                  />
                </div>
              )}

              {isBuyPut && buyPutCalc && (
                <div className="grid grid-cols-2 gap-3">
                  <MetricCard
                    label="Break-even"
                    value={formatPrice(buyPutCalc.breakeven, 'USD')}
                    subtext="cena pro profit"
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
                    label="Čas. hodnota/den"
                    value={formatPrice(buyPutCalc.timeValuePerDay, 'USD')}
                    subtext="theta decay"
                    sentiment={
                      buyPutCalc.timeValuePerDay <= 1
                        ? 'positive'
                        : buyPutCalc.timeValuePerDay <= 3
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
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="h-16 w-16 rounded-full bg-muted/50 flex items-center justify-center mb-4">
                <TrendingUp className="h-8 w-8 text-muted-foreground" />
              </div>
              <h3 className="text-lg font-medium mb-2">
                {selectedHasErrors
                  ? 'Opravte chyby ve formuláři'
                  : 'Vyplňte všechny parametry'}
              </h3>
              <p className="text-sm text-muted-foreground max-w-[300px]">
                {selectedHasErrors
                  ? 'Některé hodnoty nejsou platné'
                  : 'Zadejte cenu akcie, strike, prémium a datum expirace pro výpočet'}
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="text-base font-semibold">Porovnání scénářů</h4>
        </div>

        <div className="md:hidden">
          <div className="flex gap-1.5 overflow-x-auto pb-3 mb-2 -mx-4 px-4 scrollbar-hide">
            {[
              { key: 'annualizedReturn' as SortKey, label: 'p.a.' },
              { key: 'yieldPercent' as SortKey, label: 'Výnos' },
              { key: 'dte' as SortKey, label: 'DTE' },
              { key: 'breakeven' as SortKey, label: 'BE' },
              { key: 'maxLoss' as SortKey, label: 'Max ztr.' },
              { key: 'name' as SortKey, label: 'A-Z' },
            ].map((option) => {
              const isActive = sortKey === option.key;
              return (
                <PillButton
                  key={option.key}
                  active={isActive}
                  onClick={() => handleSort(option.key)}
                  size="sm"
                >
                  {option.label}
                  {isActive && (
                    <span className="ml-0.5">
                      {sortDirection === 'desc' ? '↓' : '↑'}
                    </span>
                  )}
                </PillButton>
              );
            })}
          </div>

          <div className="space-y-1">
            {sortedRows.map((row) => {
              const highlightValue =
                row.annualizedReturn !== undefined
                  ? formatPercent(row.annualizedReturn, 1)
                  : row.maxLoss !== undefined
                    ? formatPrice(row.maxLoss, 'USD', 0)
                    : '—';

              const highlightLabel =
                row.annualizedReturn !== undefined ? 'p.a.' : 'Max. ztráta';

              return (
                <div
                  key={row.id}
                  className={`rounded-xl px-3 py-2.5 cursor-pointer active:scale-[0.99] transition-transform bg-muted/30 ${
                    row.status === 'invalid'
                      ? 'bg-rose-500/5'
                      : row.status === 'incomplete'
                        ? 'bg-amber-500/5'
                        : ''
                  } ${row.id === selectedScenarioId ? 'bg-muted/50' : ''}`}
                  onClick={() => setSelectedScenarioId(row.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div
                        className="font-bold text-sm truncate"
                        title={row.name}
                      >
                        {row.name}
                      </div>
                    </div>

                    <div className="ml-3 text-right">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wide">
                        {highlightLabel}
                      </p>
                      <p className="font-mono-price text-sm">
                        {highlightValue}
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                    <div>
                      <p className="text-muted-foreground/70">DTE</p>
                      <p className="font-mono-price">
                        {row.dte !== undefined ? `${row.dte} d` : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/70">Výnos</p>
                      <p className="font-mono-price">
                        {row.yieldPercent !== undefined
                          ? formatPercent(row.yieldPercent, 2)
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/70">BE</p>
                      <p className="font-mono-price">
                        {row.breakeven !== undefined
                          ? formatPrice(row.breakeven, 'USD')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground/70">Pohyb</p>
                      <p className="font-mono-price">
                        {row.requiredMove !== undefined
                          ? formatPercent(row.requiredMove, 1)
                          : '—'}
                      </p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="hidden md:block overflow-x-auto">
          <Table className="w-full table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent border-border">
                {renderSortableHeader('Scénář', 'name', 'w-[170px]')}
                {renderSortableHeader('DTE', 'dte', 'text-right w-[55px]')}
                {renderSortableHeader(
                  'p.a.',
                  'annualizedReturn',
                  'text-right w-[70px]',
                )}
                {renderSortableHeader(
                  'Výnos',
                  'yieldPercent',
                  'text-right w-[70px]',
                )}
                {renderSortableHeader(
                  'Rezerva',
                  'bufferPercent',
                  'text-right w-[75px]',
                )}
                {renderSortableHeader(
                  'Break-even',
                  'breakeven',
                  'text-right w-[85px]',
                )}
                {renderSortableHeader(
                  'Potř. pohyb',
                  'requiredMove',
                  'text-right w-[85px]',
                )}
                {renderSortableHeader(
                  'Max. ztráta',
                  'maxLoss',
                  'text-right w-[95px]',
                )}
                {renderSortableHeader(
                  'Max. profit',
                  'maxProfit',
                  'text-right w-[95px]',
                )}
                {renderSortableHeader(
                  'Čas/den',
                  'timeValuePerDay',
                  'text-right w-[75px]',
                )}
                {renderSortableHeader(
                  'Blok. kapitál',
                  'blockedCapital',
                  'text-right w-[95px]',
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedRows.map((row) => (
                <TableRow
                  key={row.id}
                  className={`cursor-pointer hover:bg-muted/50 border-border ${
                    row.status === 'invalid'
                      ? 'bg-rose-500/5'
                      : row.status === 'incomplete'
                        ? 'bg-amber-500/5'
                        : ''
                  } ${row.id === selectedScenarioId ? 'bg-muted/40' : ''}`}
                  onClick={() => setSelectedScenarioId(row.id)}
                >
                  <TableCell className="font-medium truncate" title={row.name}>
                    {row.name}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {row.dte !== undefined ? `${row.dte} d` : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {row.annualizedReturn !== undefined
                      ? formatPercent(row.annualizedReturn, 1)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {row.yieldPercent !== undefined
                      ? formatPercent(row.yieldPercent, 2)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {row.bufferPercent !== undefined
                      ? formatPercent(row.bufferPercent, 1)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {row.breakeven !== undefined
                      ? formatPrice(row.breakeven, 'USD')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {row.requiredMove !== undefined
                      ? formatPercent(row.requiredMove, 1)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {row.maxLoss !== undefined
                      ? formatPrice(row.maxLoss, 'USD', 0)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {row.maxProfit !== undefined
                      ? formatPrice(row.maxProfit, 'USD', 0)
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {row.timeValuePerDay !== undefined
                      ? formatPrice(row.timeValuePerDay, 'USD')
                      : '—'}
                  </TableCell>
                  <TableCell className="text-right font-mono-price">
                    {row.blockedCapital !== undefined
                      ? formatPrice(row.blockedCapital, 'USD', 0)
                      : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
