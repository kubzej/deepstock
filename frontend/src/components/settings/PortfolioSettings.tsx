import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Briefcase, Plus, Pencil, Trash2, RefreshCw } from 'lucide-react';
import {
  PageBackButton,
  PageIntro,
  PageShell,
} from '@/components/shared/PageShell';
import { usePortfolio } from '@/contexts/PortfolioContext';
import {
  createPortfolio,
  recalculateAllPortfolioHoldings,
  updatePortfolio,
  deletePortfolio,
  type Portfolio,
} from '@/lib/api';
import {
  UtilityActionButton,
  UtilityEmptyState,
  UtilityList,
  UtilityListItem,
  UtilityListSkeleton,
  UtilityPanel,
  UtilitySection,
} from './UtilityScreen';

export function PortfolioSettings() {
  const navigate = useNavigate();
  const onBack = () => navigate({ to: '/settings' });
  const { portfolios, loading, refresh } = usePortfolio();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Portfolio | null>(null);
  const [deleteData, setDeleteData] = useState<Portfolio | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [recalculateOpen, setRecalculateOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string | null>(
    null,
  );

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

  const handleRecalculate = async () => {
    setRecalculating(true);
    setError(null);

    try {
      const result = await recalculateAllPortfolioHoldings();
      await refresh();
      setRecalculateOpen(false);
      setMaintenanceMessage(
        `Přepočítáno ${result.recalculated} pozic napříč ${result.portfolios} portfolii.`,
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Nepodařilo se přepočítat historické účetnictví',
      );
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <PageShell width="full">
      <PageIntro
        title="Portfolia"
        leading={<PageBackButton onClick={onBack} />}
        actions={
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Nové portfolio
          </Button>
        }
      />

      {(maintenanceMessage || error) && (
        <Alert variant={error ? 'destructive' : 'default'}>
          <AlertDescription>{error ?? maintenanceMessage}</AlertDescription>
        </Alert>
      )}

      <UtilitySection title="Servisní akce">
        <UtilityPanel className="space-y-3">
          <div>
            <div className="text-sm font-medium">Obnova dopočtů portfolia</div>
            <p className="mt-1 text-sm text-muted-foreground">
              Znovu sestaví agregované pozice a odvozené hodnoty ze zdrojových
              transakcí napříč portfolii. Hodí se po větších změnách logiky nebo
              když chceš srovnat uložené souhrny s historií transakcí.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setMaintenanceMessage(null);
              setError(null);
              setRecalculateOpen(true);
            }}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Obnovit dopočty
          </Button>
        </UtilityPanel>
      </UtilitySection>

      <UtilitySection title="Portfolia">
        {loading ? (
          <UtilityListSkeleton />
        ) : portfolios.length === 0 ? (
          <UtilityEmptyState
            icon={Briefcase}
            title="Zatím nemáte žádné portfolio"
            description="Vytvoř první portfolio pro sledování investic a souvisejících transakcí."
            action={{
              label: 'Vytvořit první portfolio',
              onClick: openCreate,
            }}
          />
        ) : (
          <UtilityList>
            {portfolios.map((portfolio) => (
              <UtilityListItem
                key={portfolio.id}
                className="flex items-center gap-3 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium">{portfolio.name}</div>
                  <div className="text-xs text-muted-foreground">
                    Vytvořeno{' '}
                    {new Date(portfolio.created_at).toLocaleDateString('cs-CZ')}
                  </div>
                </div>
                <div className="flex gap-1">
                  <UtilityActionButton onClick={() => openEdit(portfolio)}>
                    <Pencil className="h-4 w-4" />
                  </UtilityActionButton>
                  <UtilityActionButton
                    destructive
                    onClick={() => setDeleteData(portfolio)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </UtilityActionButton>
                </div>
              </UtilityListItem>
            ))}
          </UtilityList>
        )}
      </UtilitySection>

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

      <Dialog open={recalculateOpen} onOpenChange={setRecalculateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Obnovit dopočty portfolia</DialogTitle>
            <DialogDescription>
              Akce projde všechna vaše portfolia a znovu dopočítá agregované
              pozice a související metriky ze zdrojových transakcí. Uložené
              souhrnné hodnoty se mohou upravit, pokud byly dříve neaktuální.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRecalculateOpen(false)}
              disabled={recalculating}
            >
              Zrušit
            </Button>
            <Button onClick={handleRecalculate} disabled={recalculating}>
              {recalculating ? 'Obnovuji...' : 'Spustit obnovu'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageShell>
  );
}
