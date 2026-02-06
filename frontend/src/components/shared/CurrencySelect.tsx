/**
 * Shared Currency Select Component
 * Reusable currency dropdown using shadcn Select
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { CURRENCY_OPTIONS } from '@/lib/constants';

interface CurrencySelectProps {
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** If true, only renders the Select without Label wrapper */
  inline?: boolean;
}

export function CurrencySelect({
  value,
  onValueChange,
  label = 'Měna',
  placeholder,
  disabled,
  className,
  inline = false,
}: CurrencySelectProps) {
  const select = (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {CURRENCY_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  if (inline) {
    return select;
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {select}
    </div>
  );
}
