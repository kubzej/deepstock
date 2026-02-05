import { useState } from 'react';
import { Check, ChevronDown, Layers, Settings, Briefcase } from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';
import { Separator } from '@/components/ui/separator';
import { usePortfolio } from '@/contexts/PortfolioContext';
import { cn } from '@/lib/utils';

interface PortfolioSelectorProps {
  onSettingsClick?: () => void;
  variant?: 'desktop' | 'mobile';
}

// Shared content for both desktop and mobile
function PortfolioSelectorContent({
  onSelect,
  onSettingsClick,
}: {
  onSelect: (id: string | null) => void;
  onSettingsClick?: () => void;
}) {
  const { portfolios, portfolio, isAllPortfolios } = usePortfolio();

  return (
    <div className="py-1">
      {/* Portfolio list */}
      <div className="px-1">
        {portfolios.map((p) => {
          const isActive = !isAllPortfolios && p.id === portfolio?.id;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={cn(
                'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted text-foreground',
              )}
            >
              <Briefcase className="h-4 w-4 flex-shrink-0 opacity-60" />
              <span className="flex-1 truncate text-sm font-medium">
                {p.name}
              </span>
              {isActive && <Check className="h-4 w-4 flex-shrink-0" />}
            </button>
          );
        })}
      </div>

      <Separator className="my-2" />

      {/* All portfolios option */}
      <div className="px-1">
        <button
          onClick={() => onSelect(null)}
          className={cn(
            'w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left transition-colors',
            isAllPortfolios
              ? 'bg-primary/10 text-primary'
              : 'hover:bg-muted text-foreground',
          )}
        >
          <Layers className="h-4 w-4 flex-shrink-0 opacity-60" />
          <span className="flex-1 text-sm font-medium">Všechna portfolia</span>
          {isAllPortfolios && <Check className="h-4 w-4 flex-shrink-0" />}
        </button>
      </div>

      {onSettingsClick && (
        <>
          <Separator className="my-2" />

          {/* Settings link */}
          <div className="px-1">
            <button
              onClick={onSettingsClick}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-left hover:bg-muted transition-colors"
            >
              <Settings className="h-4 w-4 flex-shrink-0 opacity-60" />
              <span className="text-sm">Spravovat portfolia</span>
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// Desktop version using Popover
function DesktopSelector({ onSettingsClick }: PortfolioSelectorProps) {
  const [open, setOpen] = useState(false);
  const { portfolio, isAllPortfolios, setActivePortfolio } = usePortfolio();

  const handleSelect = (id: string | null) => {
    setActivePortfolio(id);
    setOpen(false);
  };

  const handleSettings = () => {
    setOpen(false);
    onSettingsClick?.();
  };

  const displayName = isAllPortfolios
    ? 'Všechna portfolia'
    : portfolio?.name || 'Vyberte portfolio';

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-muted transition-colors text-left group">
          <div className="h-8 w-8 rounded-md bg-primary/10 flex items-center justify-center flex-shrink-0">
            {isAllPortfolios ? (
              <Layers className="h-4 w-4 text-primary" />
            ) : (
              <Briefcase className="h-4 w-4 text-primary" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{displayName}</div>
            <div className="text-xs text-muted-foreground">Portfolio</div>
          </div>
          <ChevronDown className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-1" align="start" sideOffset={8}>
        <PortfolioSelectorContent
          onSelect={handleSelect}
          onSettingsClick={handleSettings}
        />
      </PopoverContent>
    </Popover>
  );
}

// Mobile version using Sheet
function MobileSelector({ onSettingsClick }: PortfolioSelectorProps) {
  const [open, setOpen] = useState(false);
  const { portfolio, isAllPortfolios, setActivePortfolio } = usePortfolio();

  const handleSelect = (id: string | null) => {
    setActivePortfolio(id);
    setOpen(false);
  };

  const handleSettings = () => {
    setOpen(false);
    onSettingsClick?.();
  };

  const displayName = isAllPortfolios
    ? 'Všechna portfolia'
    : portfolio?.name || 'Portfolio';

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button className="flex items-center gap-1.5 text-left">
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {displayName}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="bottom"
        className="h-auto max-h-[60vh] rounded-t-2xl px-2 pb-8"
      >
        <SheetHeader className="pb-2">
          <SheetTitle className="text-base font-medium">
            Vyberte portfolio
          </SheetTitle>
        </SheetHeader>
        <PortfolioSelectorContent
          onSelect={handleSelect}
          onSettingsClick={handleSettings}
        />
      </SheetContent>
    </Sheet>
  );
}

// Main component that switches based on variant
export function PortfolioSelector({
  onSettingsClick,
  variant = 'desktop',
}: PortfolioSelectorProps) {
  if (variant === 'mobile') {
    return <MobileSelector onSettingsClick={onSettingsClick} />;
  }
  return <DesktopSelector onSettingsClick={onSettingsClick} />;
}
