/**
 * Shared Sector Select Component
 * Reusable sector dropdown using shadcn Select, sourced from the canonical taxonomy
 */

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { SECTOR_OPTIONS } from '@/lib/taxonomy';

interface SectorSelectProps {
  value: string;
  onValueChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** If true, only renders the Select without Label wrapper */
  inline?: boolean;
}

export function SectorSelect({
  value,
  onValueChange,
  label = 'Sektor',
  placeholder = 'Vyberte sektor...',
  disabled,
  className,
  inline = false,
}: SectorSelectProps) {
  const select = (
    <Select
      value={value || '_none_'}
      onValueChange={(v) => onValueChange(v === '_none_' ? '' : v)}
      disabled={disabled}
    >
      <SelectTrigger className={className}>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="_none_">Bez sektoru</SelectItem>
        {SECTOR_OPTIONS.map((opt) => (
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
