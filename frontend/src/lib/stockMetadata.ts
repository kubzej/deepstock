import type { StockMetadataSuggestion } from '@/lib/api';

export interface StockMetadataFormFields {
  name: string;
  sector: string;
  exchange: string;
  currency: string;
  country: string;
  price_scale: number;
  notes: string;
}

export interface ApplyStockMetadataResult<T extends StockMetadataFormFields> {
  nextData: T;
  appliedFields: string[];
}

const FIELD_LABELS = {
  name: 'název',
  sector: 'sektor',
  exchange: 'burza',
  currency: 'měna',
  country: 'země',
  price_scale: 'cenový poměr',
  notes: 'popis',
} as const;

function isBlank(value: string | null | undefined): boolean {
  return !value?.trim();
}

export function applyStockMetadataSuggestion<T extends StockMetadataFormFields>(
  current: T,
  suggestion: StockMetadataSuggestion,
): ApplyStockMetadataResult<T> {
  const nextData = { ...current };
  const appliedFields: string[] = [];

  const applyTextField = (
    field: keyof Pick<
      T,
      'name' | 'sector' | 'exchange' | 'currency' | 'country' | 'notes'
    >,
    suggestedValue: string | null,
  ) => {
    if (isBlank(nextData[field]) && suggestedValue?.trim()) {
      nextData[field] = suggestedValue.trim() as T[typeof field];
      appliedFields.push(FIELD_LABELS[field]);
    }
  };

  applyTextField('name', suggestion.name);
  applyTextField('sector', suggestion.sector);
  applyTextField('exchange', suggestion.exchange);
  applyTextField('currency', suggestion.currency);
  applyTextField('country', suggestion.country);
  applyTextField('notes', suggestion.notes);

  if (
    nextData.price_scale === 1 &&
    suggestion.price_scale !== null &&
    suggestion.price_scale !== 1
  ) {
    nextData.price_scale = suggestion.price_scale as T['price_scale'];
    appliedFields.push(FIELD_LABELS.price_scale);
  }

  return { nextData, appliedFields };
}
