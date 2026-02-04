import { useState } from 'react';
import { Plus, Pencil, Trash2, MoreHorizontal, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  type Portfolio,
} from '@/lib/api';

interface PortfolioFormData {
  name: string;
}

export function PortfolioManager() {
  const {
    portfolios,
    portfolio,
    loading,
    refresh,
    setActivePortfolio,
    isAllPortfolios,
  } = usePortfolio();

  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(
    null,
  );
  const [deletingPortfolio, setDeletingPortfolio] = useState<Portfolio | null>(
    null,
  );

  // Form state
  const [formData, setFormData] = useState<PortfolioFormData>({
    name: '',
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setFormData({ name: '' });
    setError(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (p: Portfolio) => {
    setFormData({ name: p.name });
    setError(null);
    setEditingPortfolio(p);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      setError('Název je povinný');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await createPortfolio(formData.name.trim());
      await refresh();
      setIsCreateOpen(false);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nepodařilo se vytvořit portfolio',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdate = async () => {
    if (!editingPortfolio || !formData.name.trim()) {
      setError('Název je povinný');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await updatePortfolio(editingPortfolio.id, {
        name: formData.name.trim(),
      });
      await refresh();
      setEditingPortfolio(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nepodařilo se upravit portfolio',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingPortfolio) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await deletePortfolio(deletingPortfolio.id);
      await refresh();
      setDeletingPortfolio(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Nepodařilo se smazat portfolio',
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Portfolia</h1>
        <Button onClick={handleOpenCreate}>
          <Plus className="h-4 w-4 mr-2" />
          Přidat portfolio
        </Button>
      </div>

      {/* Portfolio List */}
      {portfolios.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <p className="mb-4">Zatím nemáte žádné portfolio</p>
          <Button onClick={handleOpenCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Vytvořit první portfolio
          </Button>
        </div>
      ) : (
        <div className="divide-y divide-border rounded-lg border mb-8">
          {/* All portfolios option */}
          <div
            className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${isAllPortfolios ? 'bg-muted/30' : ''}`}
            onClick={() => setActivePortfolio(null)}
          >
            <div className="flex items-center gap-3">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">Všechna portfolia</span>
              {isAllPortfolios && (
                <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                  Aktivní
                </span>
              )}
            </div>
          </div>
          {/* Individual portfolios */}
          {portfolios.map((p) => (
            <div
              key={p.id}
              className={`flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors ${!isAllPortfolios && p.id === portfolio?.id ? 'bg-muted/30' : ''}`}
              onClick={() => setActivePortfolio(p.id)}
            >
              <div className="flex items-center gap-3">
                <span className="font-medium">{p.name}</span>
                {!isAllPortfolios && p.id === portfolio?.id && (
                  <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                    Aktivní
                  </span>
                )}
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  onClick={(e) => e.stopPropagation()}
                >
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      handleOpenEdit(p);
                    }}
                  >
                    <Pencil className="h-4 w-4 mr-2" />
                    Upravit
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeletingPortfolio(p);
                    }}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" />
                    Smazat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {/* Create Dialog */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nové portfolio</DialogTitle>
            <DialogDescription>
              Vytvořte nové portfolio pro sledování vašich investic.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Chyba</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="name">Název</Label>
              <Input
                id="name"
                placeholder="Např. Hlavní portfolio"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOpen(false)}>
              Zrušit
            </Button>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? 'Vytvářím...' : 'Vytvořit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog
        open={!!editingPortfolio}
        onOpenChange={() => setEditingPortfolio(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upravit portfolio</DialogTitle>
            <DialogDescription>Změňte název portfolia.</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Chyba</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="edit-name">Název</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingPortfolio(null)}>
              Zrušit
            </Button>
            <Button onClick={handleUpdate} disabled={isSubmitting}>
              {isSubmitting ? 'Ukládám...' : 'Uložit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={!!deletingPortfolio}
        onOpenChange={() => setDeletingPortfolio(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat portfolio</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat portfolio "{deletingPortfolio?.name}"? Tato
              akce je nevratná a smaže všechny transakce a pozice v tomto
              portfoliu.
            </DialogDescription>
          </DialogHeader>

          {error && (
            <Alert variant="destructive">
              <AlertTitle>Chyba</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeletingPortfolio(null)}
            >
              Zrušit
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Mažu...' : 'Smazat'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
