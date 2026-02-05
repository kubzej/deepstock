/**
 * Date Range Filter Component
 */
import { format } from 'date-fns';
import { cs } from 'date-fns/locale';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PillButton, PillGroup } from '@/components/shared/PillButton';
import { getDateRange, DATE_PRESETS, type DateRangePreset } from './utils';

interface DateRangeFilterProps {
  preset: DateRangePreset;
  onPresetChange: (preset: DateRangePreset) => void;
  customFrom: string;
  customTo: string;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
}

export function DateRangeFilter({
  preset,
  onPresetChange,
  customFrom,
  customTo,
  onCustomFromChange,
  onCustomToChange,
}: DateRangeFilterProps) {
  const dateRange = getDateRange(preset, customFrom, customTo);

  return (
    <div className="space-y-3">
      <PillGroup>
        {DATE_PRESETS.map((p) => (
          <PillButton
            key={p.value}
            active={preset === p.value}
            onClick={() => onPresetChange(p.value)}
          >
            {p.label}
          </PillButton>
        ))}
      </PillGroup>

      {preset === 'CUSTOM' && (
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Od</Label>
            <Input
              type="date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
              className="w-[150px] h-8"
            />
          </div>
          <div className="flex items-center gap-2">
            <Label className="text-sm text-muted-foreground">Do</Label>
            <Input
              type="date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
              className="w-[150px] h-8"
            />
          </div>
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {format(dateRange.from, 'd. M. yyyy', { locale: cs })} —{' '}
        {format(dateRange.to, 'd. M. yyyy', { locale: cs })}
      </p>
    </div>
  );
}
