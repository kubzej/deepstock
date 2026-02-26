import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';

export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
      <div className="bg-zinc-800 border border-zinc-700 rounded-xl shadow-xl px-4 py-3 flex items-center gap-3">
        <RefreshCw className="h-4 w-4 text-emerald-400 shrink-0" />
        <p className="flex-1 text-sm text-zinc-100">Nová verze je dostupná</p>
        <Button
          size="sm"
          variant="default"
          className="bg-emerald-600 hover:bg-emerald-500 text-white shrink-0 h-7 px-3 text-xs"
          onClick={() => updateServiceWorker(true)}
        >
          Aktualizovat
        </Button>
        <button
          className="text-zinc-400 hover:text-zinc-200 transition-colors"
          onClick={() => setNeedRefresh(false)}
          aria-label="Zavřít"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
