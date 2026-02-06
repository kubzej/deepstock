/**
 * Shared Exchange Select Component
 * Reusable stock exchange dropdown using shadcn Select
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { EXCHANGE_OPTIONS } from '@/lib/constants';

interface ExchangeSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** If true, only renders the Select without Label wrapper */
  inline?: boolean;
}

export function ExchangeSelect({
  value,
  onValueChange,
  label = 'Burza',
  placeholder,
  disabled,
  className,
  inline = false,
}: ExchangeSelectProps) {
  const select = (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {EXCHANGE_OPTIONS.map((opt) => (
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
