/**
 * Shared Stock Picker Component
 * Searchable ticker picker — full-screen Sheet on mobile, Popover+Command combobox on desktop.
 * Drop-in replacement for a <Select> over a long stock list (mobile-unfriendly to scroll).
 */
import { useState } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';

export interface StockPickerOption {
  value: string;
  label: string;
}

interface StockPickerProps {
  value: string;
  onValueChange: (value: string) => void;
  options: StockPickerOption[];
  label?: string;
  placeholder?: string;
  disabled?: boolean;
}

function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('cs-CZ');
}

export function StockPicker({
  value,
  onValueChange,
  options,
  label = 'Akcie',
  placeholder = 'Vyberte akcii...',
  disabled,
}: StockPickerProps) {
  // Sheet and Popover both portal their content to document.body, outside the
  // md:hidden/hidden md:block wrapper that switches which trigger is visible —
  // CSS alone can't stop the other one from opening too, so each needs its own
  // independent open state (sharing one `open` boolean opened both at once).
  const [mobileOpen, setMobileOpen] = useState(false);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileSearch, setMobileSearch] = useState('');

  const selected = options.find((opt) => opt.value === value);
  const triggerLabel = selected?.label || placeholder;

  const filteredMobileOptions = mobileSearch.trim()
    ? options.filter((opt) =>
        normalizeSearchText(opt.label).includes(normalizeSearchText(mobileSearch)),
      )
    : options;

  const handleSelect = (nextValue: string) => {
    onValueChange(nextValue);
    setMobileOpen(false);
    setDesktopOpen(false);
    setMobileSearch('');
  };

  const renderTrigger = (isOpen: boolean) => (
    <Button
      type="button"
      variant="outline"
      role="combobox"
      aria-expanded={isOpen}
      disabled={disabled}
      className="w-full justify-between font-normal"
    >
      <span className={cn('truncate', !selected && 'text-muted-foreground')}>
        {triggerLabel}
      </span>
      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
    </Button>
  );

  return (
    <div className="space-y-2">
      {label && <Label>{label}</Label>}

      {/* Mobile: full-screen bottom sheet with search */}
      <div className="md:hidden">
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetTrigger asChild>{renderTrigger(mobileOpen)}</SheetTrigger>
          <SheetContent
            side="bottom"
            className="flex h-[85vh] flex-col rounded-t-2xl p-0"
          >
            <SheetHeader className="pb-2">
              <SheetTitle>Vyberte akcii</SheetTitle>
            </SheetHeader>
            <div className="relative px-4">
              <Search className="absolute left-7 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={mobileSearch}
                onChange={(e) => setMobileSearch(e.target.value)}
                placeholder="Hledat ticker nebo název..."
                className="pl-9"
              />
            </div>
            <div className="flex-1 overflow-y-auto px-2 pb-4">
              {filteredMobileOptions.length === 0 ? (
                <p className="px-2 py-6 text-center text-sm text-muted-foreground">
                  Žádná akcie neodpovídá hledání.
                </p>
              ) : (
                filteredMobileOptions.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleSelect(opt.value)}
                    className={cn(
                      'flex w-full items-center justify-between gap-2 rounded-md px-3 py-3 text-left text-sm hover:bg-muted/60',
                      opt.value === value && 'bg-muted',
                    )}
                  >
                    <span className="truncate">{opt.label}</span>
                    {opt.value === value && (
                      <Check className="h-4 w-4 shrink-0 text-foreground" />
                    )}
                  </button>
                ))
              )}
            </div>
          </SheetContent>
        </Sheet>
      </div>

      {/* Desktop: compact popover combobox */}
      <div className="hidden md:block">
        <Popover open={desktopOpen} onOpenChange={setDesktopOpen}>
          <PopoverTrigger asChild>{renderTrigger(desktopOpen)}</PopoverTrigger>
          <PopoverContent
            className="w-[--radix-popover-trigger-width] p-0"
            align="start"
          >
            <Command>
              <CommandInput placeholder="Hledat ticker nebo název..." />
              <CommandList>
                <CommandEmpty>Žádná akcie neodpovídá hledání.</CommandEmpty>
                <CommandGroup>
                  {options.map((opt) => (
                    <CommandItem
                      key={opt.value}
                      value={opt.label}
                      onSelect={() => handleSelect(opt.value)}
                    >
                      <Check
                        className={cn(
                          'mr-2 h-4 w-4',
                          opt.value === value ? 'opacity-100' : 'opacity-0',
                        )}
                      />
                      <span className="truncate">{opt.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>
    </div>
  );
}
