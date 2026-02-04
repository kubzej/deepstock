import { useState } from 'react';
import { Plus, Pencil, Trash2, MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  createPortfolio,
  updatePortfolio,
  deletePortfolio,
  type Portfolio,
} from '@/lib/api';

const CURRENCIES = [
  { value: 'CZK', label: 'CZK - Česká koruna' },
  { value: 'USD', label: 'USD - Americký dolar' },
  { value: 'EUR', label: 'EUR - Euro' },
];

interface PortfolioFormData {
  name: string;
  currency: string;
}

export function PortfolioManager() {
  const { portfolios, portfolio, loading, refresh } = usePortfolio();
  
  // Dialog states
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingPortfolio, setEditingPortfolio] = useState<Portfolio | null>(null);
  const [deletingPortfolio, setDeletingPortfolio] = useState<Portfolio | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<PortfolioFormData>({ name: '', currency: 'CZK' });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleOpenCreate = () => {
    setFormData({ name: '', currency: 'CZK' });
    setError(null);
    setIsCreateOpen(true);
  };

  const handleOpenEdit = (p: Portfolio) => {
    setFormData({ name: p.name, currency: p.currency });
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
      await createPortfolio(formData.name.trim(), formData.currency);
      await refresh();
      setIsCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepodařilo se vytvořit portfolio');
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
        currency: formData.currency,
      });
      await refresh();
      setEditingPortfolio(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Nepodařilo se upravit portfolio');
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
      setError(err instanceof Error ? err.message : 'Nepodařilo se smazat portfolio');
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
          Nové portfolio
        </Button>
      </div>

      {/* Portfolio List */}
      {portfolios.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <p className="text-muted-foreground mb-4">
              Zatím nemáte žádné portfolio
            </p>
            <Button onClick={handleOpenCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Vytvořit první portfolio
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {portfolios.map((p) => (
            <Card 
              key={p.id} 
              className={p.id === portfolio?.id ? 'ring-2 ring-primary' : ''}
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-lg font-medium">
                  {p.name}
                </CardTitle>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleOpenEdit(p)}>
                      <Pencil className="h-4 w-4 mr-2" />
                      Upravit
                    </DropdownMenuItem>
                    <DropdownMenuItem 
                      onClick={() => setDeletingPortfolio(p)}
                      className="text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Smazat
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </CardHeader>
              <CardContent>
                <div className="text-sm text-muted-foreground">
                  Měna: {p.currency}
                </div>
                {p.id === portfolio?.id && (
                  <div className="mt-2">
                    <span className="text-xs bg-primary/10 text-primary px-2 py-1 rounded">
                      Aktivní
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
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
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="currency">Měna</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData({ ...formData, currency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
      <Dialog open={!!editingPortfolio} onOpenChange={() => setEditingPortfolio(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upravit portfolio</DialogTitle>
            <DialogDescription>
              Změňte název nebo měnu portfolia.
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
              <Label htmlFor="edit-name">Název</Label>
              <Input
                id="edit-name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="edit-currency">Měna</Label>
              <Select
                value={formData.currency}
                onValueChange={(value) => setFormData({ ...formData, currency: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
      <Dialog open={!!deletingPortfolio} onOpenChange={() => setDeletingPortfolio(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Smazat portfolio</DialogTitle>
            <DialogDescription>
              Opravdu chcete smazat portfolio "{deletingPortfolio?.name}"? 
              Tato akce je nevratná a smaže všechny transakce a pozice v tomto portfoliu.
            </DialogDescription>
          </DialogHeader>
          
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Chyba</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeletingPortfolio(null)}>
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
