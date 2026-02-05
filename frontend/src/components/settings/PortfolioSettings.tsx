import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Pencil, Trash2, ArrowLeft } from 'lucide-react';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  type Portfolio,
} from '@/lib/api';

interface PortfolioSettingsProps {
  onBack: () => void;
}

export function PortfolioSettings({ onBack }: PortfolioSettingsProps) {
  const { portfolios, loading, refresh } = usePortfolio();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Portfolio | null>(null);
  const [deleteData, setDeleteData] = useState<Portfolio | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openCreate = () => {
    setEditing(null);
    setName('');
    setError(null);
    setDialogOpen(true);
  };

  const openEdit = (portfolio: Portfolio) => {
    setEditing(portfolio);
    setName(portfolio.name);
    setError(null);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Název je povinný');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      if (editing) {
        await updatePortfolio(editing.id, { name: name.trim() });
      } else {
        await createPortfolio(name.trim());
      }
      await refresh();
      setDialogOpen(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : `Nepodařilo se ${editing ? 'upravit' : 'vytvořit'} portfolio`,
      );
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteData) return;

    setSaving(true);
    setError(null);

    try {
      await deletePortfolio(deleteData.id);
      await refresh();
      setDeleteData(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nepodařilo se smazat portfolio',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header with back button */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
          <ArrowLeft className="w-4 h-4 mr-1" />
          Zpět
        </Button>
        <Button onClick={openCreate} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Nové portfolio
        </Button>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Portfolia</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Správa vašich investičních portfolií
        </p>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : portfolios.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-muted-foreground">Zatím nemáte žádné portfolio.</p>
          <Button onClick={openCreate} className="mt-4">
            <Plus className="h-4 w-4 mr-2" />
            Vytvořit první portfolio
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {portfolios.map((portfolio) => (
            <div
              key={portfolio.id}
              className="flex items-center gap-3 px-4 py-3 bg-muted/30 rounded-lg"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium">{portfolio.name}</div>
                <div className="text-xs text-muted-foreground">
                  Vytvořeno{' '}
                  {new Date(portfolio.created_at).toLocaleDateString('cs-CZ')}
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => openEdit(portfolio)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setDeleteData(portfolio)}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Upravit portfolio' : 'Nové portfolio'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Změňte název portfolia.'
                : 'Vytvořte nové portfolio pro sledování vašich investic.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="portfolio-name">Název</Label>
              <Input
                id="portfolio-name"
                placeholder="Např. Hlavní portfolio"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Zrušit
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving
                ? editing
                  ? 'Ukládám...'
                  : 'Vytvářím...'
                : editing
                  ? 'Uložit'
                  : 'Vytvořit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={!!deleteData} onOpenChange={() => setDeleteData(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat portfolio</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat portfolio "{deleteData?.name}"? Tato akce je
              nevratná a smaže všechny transakce a pozice v tomto portfoliu.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteData(null)}>
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={saving}
            >
              {saving ? 'Mažu...' : 'Smazat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
