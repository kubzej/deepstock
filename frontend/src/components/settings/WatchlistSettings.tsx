import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import {
  PageBackButton,
  PageIntro,
  PageShell,
} from '@/components/shared/PageShell';
import { List, Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { type Watchlist } from '@/lib/api';
import {
  useWatchlists,
  useCreateWatchlist,
  useUpdateWatchlist,
  useDeleteWatchlist,
  useReorderWatchlists,
} from '@/hooks/useWatchlists';
import {
  UtilityActionButton,
  UtilityEmptyState,
  UtilityList,
  UtilityListItem,
  UtilityListSkeleton,
  UtilitySection,
} from './UtilityScreen';

// Sortable row component
interface SortableRowProps {
  watchlist: Watchlist;
  onEdit: (w: Watchlist) => void;
  onDelete: (w: Watchlist) => void;
}

function SortableRow({ watchlist, onEdit, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: watchlist.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? 'opacity-50' : ''}
    >
      <UtilityListItem className="flex items-center gap-3 py-3">
        <button
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="font-medium">{watchlist.name}</div>
          {watchlist.description && (
            <div className="text-sm text-muted-foreground truncate">
              {watchlist.description}
            </div>
          )}
        </div>
        <div className="text-sm text-muted-foreground whitespace-nowrap">
          {watchlist.item_count || 0} položek
        </div>
        <div className="flex gap-1">
          <UtilityActionButton onClick={() => onEdit(watchlist)}>
            <Pencil className="h-4 w-4" />
          </UtilityActionButton>
          <UtilityActionButton destructive onClick={() => onDelete(watchlist)}>
            <Trash2 className="h-4 w-4" />
          </UtilityActionButton>
        </div>
      </UtilityListItem>
    </div>
  );
}

export function WatchlistSettings() {
  const navigate = useNavigate();
  const onBack = () => navigate({ to: '/settings' });
  const { data: watchlists = [], isLoading } = useWatchlists();
  const createMutation = useCreateWatchlist();
  const updateMutation = useUpdateWatchlist();
  const deleteMutation = useDeleteWatchlist();
  const reorderMutation = useReorderWatchlists();

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Watchlist | null>(null);
  const [deleteData, setDeleteData] = useState<Watchlist | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setDialogOpen(true);
  };

  const openEdit = (w: Watchlist) => {
    setEditing(w);
    setName(w.name);
    setDescription(w.description || '');
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;

    setSaving(true);
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          name: name.trim(),
          description: description.trim() || undefined,
        });
      } else {
        await createMutation.mutateAsync({
          name: name.trim(),
          description: description.trim() || undefined,
        });
      }
      setDialogOpen(false);
    } catch (err) {
      console.error('Failed to save watchlist:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteData) return;
    try {
      await deleteMutation.mutateAsync(deleteData.id);
      setDeleteData(null);
    } catch (err) {
      console.error('Failed to delete watchlist:', err);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const oldIndex = watchlists.findIndex((w) => w.id === active.id);
      const newIndex = watchlists.findIndex((w) => w.id === over.id);
      const newOrder = arrayMove(watchlists, oldIndex, newIndex).map(
        (w) => w.id,
      );
      reorderMutation.mutate(newOrder);
    }
  };

  return (
    <PageShell width="full">
      <PageIntro
        title="Watchlisty"
        leading={<PageBackButton onClick={onBack} />}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nový watchlist
          </Button>
        }
      />

      <UtilitySection title="Seznamy ke sledování">
        {isLoading ? (
          <UtilityListSkeleton items={3} height="h-16" />
        ) : watchlists.length === 0 ? (
          <UtilityEmptyState
            icon={List}
            title="Žádné watchlisty"
            description="Vytvoř první watchlist pro sledování akcií a kandidátů."
            action={{
              label: 'Vytvořit první watchlist',
              onClick: openCreate,
            }}
          />
        ) : (
          <UtilityList>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={watchlists.map((w) => w.id)}
                strategy={verticalListSortingStrategy}
              >
                {watchlists.map((w) => (
                  <SortableRow
                    key={w.id}
                    watchlist={w}
                    onEdit={openEdit}
                    onDelete={setDeleteData}
                  />
                ))}
              </SortableContext>
            </DndContext>
          </UtilityList>
        )}
      </UtilitySection>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Upravit watchlist' : 'Nový watchlist'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Upravte název nebo popis watchlistu.'
                : 'Vytvořte nový watchlist pro sledování akcií.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="watchlist-name">Název</Label>
              <Input
                id="watchlist-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Tech akcie"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="watchlist-description">Popis (volitelný)</Label>
              <Textarea
                id="watchlist-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Popis watchlistu..."
                className="mt-1.5"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Zrušit
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || saving}>
              {saving ? 'Ukládám...' : editing ? 'Uložit' : 'Vytvořit'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <ConfirmDialog
        open={!!deleteData}
        onOpenChange={(open) => !open && setDeleteData(null)}
        title="Smazat watchlist?"
        description={`Opravdu chcete smazat watchlist "${deleteData?.name}"? Tato akce je nevratná a smaže i všechny položky v něm.`}
        confirmLabel="Smazat"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </PageShell>
  );
}
