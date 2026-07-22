/**
 * Shared Industry Select Component
 * Reusable industry dropdown using shadcn Select, options narrowed by the selected sector
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { getIndustryOptions } from '@/lib/taxonomy';

interface IndustrySelectProps {
  value: string;
  sector: string | undefined | null;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** If true, only renders the Select without Label wrapper */
  inline?: boolean;
}

export function IndustrySelect({
  value,
  sector,
  onValueChange,
  label = 'Odvětví',
  placeholder,
  disabled,
  className,
  inline = false,
}: IndustrySelectProps) {
  const options = getIndustryOptions(sector);
  const hasSector = Boolean(sector);

  const select = (
    <Select
      // Force a full remount whenever the sector changes: this Select's options
      // list is derived from `sector`, and mutating a native <select>'s <option>
      // children in place (Radix keeps a hidden native select for form/autofill
      // compatibility) while its value also changes can make the browser reset
      // the native element and fire a real 'change' event with '' — which then
      // wipes a value that was just set programmatically (e.g. AI auto-fill
      // setting sector+industry together). A remount sidesteps that entirely.
      key={sector || '_none_'}
      value={value || '_none_'}
      onValueChange={(v) => onValueChange(v === '_none_' ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue
          placeholder={hasSector ? placeholder || 'Vyberte odvětví...' : 'Nejdřív vyberte sektor'}
        />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_none_">Bez odvětví</SelectItem>
        {options.map((opt) => (
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
