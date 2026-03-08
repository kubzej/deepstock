import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Trash2, RotateCcw, ArrowUp, ArrowDown, ArrowUpDown, Percent, Check, Pencil } from 'lucide-react';
import type { PriceAlert } from '@/hooks/useAlerts';
import type { AlertConditionType } from '@/lib/api';
import type { SingleAlertItem, RangeAlertItem, AlertDisplayItem } from './types';
import { formatConditionValue } from './types';

const CONDITION_ICONS: Record<AlertConditionType, React.ReactNode> = {
  price_above: <ArrowUp className="h-4 w-4 text-emerald-500" />,
  price_below: <ArrowDown className="h-4 w-4 text-rose-500" />,
  percent_change_day: <Percent className="h-4 w-4 text-blue-500" />,
};

interface CardActionsProps {
  isTriggered: boolean;
  isEnabled: boolean;
  onReset: () => void;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  resetPending: boolean;
  togglePending: boolean;
}

function CardActions({ isTriggered, isEnabled, onReset, onToggle, onEdit, onDelete, resetPending, togglePending }: CardActionsProps) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      {isTriggered ? (
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onReset} disabled={resetPending} title="Reset">
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Switch checked={isEnabled} onCheckedChange={onToggle} disabled={togglePending} />
      )}
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
        <Pencil className="h-3.5 w-3.5" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDelete}>
        <Trash2 className="h-3.5 w-3.5 text-destructive" />
      </Button>
    </div>
  );
}

interface SingleAlertCardProps {
  item: SingleAlertItem;
  onEdit: (alert: PriceAlert) => void;
  onDelete: (item: AlertDisplayItem) => void;
  onToggle: (item: AlertDisplayItem) => void;
  onReset: (item: AlertDisplayItem) => void;
  resetPending: boolean;
  togglePending: boolean;
}

export function SingleAlertCard({ item, onEdit, onDelete, onToggle, onReset, resetPending, togglePending }: SingleAlertCardProps) {
  const { alert } = item;
  return (
    <div
      className={`rounded-lg px-3 py-2 ${
        alert.is_triggered ? 'bg-amber-500/10' : alert.is_enabled ? 'bg-muted/30' : 'bg-muted/20 opacity-60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {CONDITION_ICONS[alert.condition_type]}
            <span className="font-mono-price text-sm">
              {formatConditionValue(alert.condition_type, alert.condition_value)}
            </span>
          </div>
          {alert.repeat_after_trigger && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <RotateCcw className="h-3 w-3" />
              opakující
            </span>
          )}
          {alert.is_triggered && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[18px] text-amber-500 border-amber-500/30">
              <Check className="h-3 w-3 mr-0.5" />
              Dokončeno
            </Badge>
          )}
          {!alert.is_enabled && !alert.is_triggered && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[18px] text-muted-foreground">
              Vypnuto
            </Badge>
          )}
        </div>
        <CardActions
          isTriggered={alert.is_triggered}
          isEnabled={alert.is_enabled}
          onReset={() => onReset(item)}
          onToggle={() => onToggle(item)}
          onEdit={() => onEdit(alert)}
          onDelete={() => onDelete(item)}
          resetPending={resetPending}
          togglePending={togglePending}
        />
      </div>
      {alert.notes && (
        <p className="text-xs text-muted-foreground mt-1 truncate">{alert.notes}</p>
      )}
    </div>
  );
}

interface RangeAlertCardProps {
  item: RangeAlertItem;
  onEditRange: (range: RangeAlertItem) => void;
  onDelete: (item: AlertDisplayItem) => void;
  onToggle: (item: AlertDisplayItem) => void;
  onReset: (item: AlertDisplayItem) => void;
  resetPending: boolean;
  togglePending: boolean;
}

export function RangeAlertCard({ item, onEditRange, onDelete, onToggle, onReset, resetPending, togglePending }: RangeAlertCardProps) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${
        item.is_triggered ? 'bg-amber-500/10' : item.is_enabled ? 'bg-muted/30' : 'bg-muted/20 opacity-60'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <ArrowUpDown className="h-4 w-4 text-violet-500" />
            <span className="font-mono-price text-sm">
              ${item.belowAlert.condition_value.toFixed(2)} – ${item.aboveAlert.condition_value.toFixed(2)}
            </span>
          </div>
          {item.repeat_after_trigger && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
              <RotateCcw className="h-3 w-3" />
              opakující
            </span>
          )}
          {item.is_triggered && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[18px] text-amber-500 border-amber-500/30">
              <Check className="h-3 w-3 mr-0.5" />
              Dokončeno
            </Badge>
          )}
          {!item.is_enabled && !item.is_triggered && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-[18px] text-muted-foreground">
              Vypnuto
            </Badge>
          )}
        </div>
        <CardActions
          isTriggered={item.is_triggered}
          isEnabled={item.is_enabled}
          onReset={() => onReset(item)}
          onToggle={() => onToggle(item)}
          onEdit={() => onEditRange(item)}
          onDelete={() => onDelete(item)}
          resetPending={resetPending}
          togglePending={togglePending}
        />
      </div>
      {item.notes && (
        <p className="text-xs text-muted-foreground mt-1 truncate">{item.notes}</p>
      )}
    </div>
  );
}
