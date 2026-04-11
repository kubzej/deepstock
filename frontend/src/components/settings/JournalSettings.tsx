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
import { Layers, Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { type JournalSection } from '@/lib/api/journal';
import {
  useJournalSections,
  useCreateJournalSection,
  useUpdateJournalSection,
  useDeleteJournalSection,
  useReorderJournalSections,
} from '@/hooks/useJournal';
import {
  UtilityActionButton,
  UtilityEmptyState,
  UtilityList,
  UtilityListItem,
  UtilityListSkeleton,
  UtilitySection,
} from './UtilityScreen';

interface SortableRowProps {
  section: JournalSection;
  onEdit: (s: JournalSection) => void;
  onDelete: (s: JournalSection) => void;
}

function SortableRow({ section, onEdit, onDelete }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id });

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
      <UtilityListItem className="flex items-center gap-3 py-2.5">
        <button
          className="cursor-grab active:cursor-grabbing p-1 text-muted-foreground hover:text-foreground touch-none"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4" />
        </button>
        <div className="flex-1 text-sm font-medium">
          {section.name}
          {section.is_system && (
            <span className="ml-2 text-xs text-muted-foreground font-normal">
              pevná
            </span>
          )}
        </div>
        {!section.is_system && (
          <div className="flex gap-1">
            <UtilityActionButton onClick={() => onEdit(section)}>
              <Pencil className="h-4 w-4" />
            </UtilityActionButton>
            <UtilityActionButton destructive onClick={() => onDelete(section)}>
              <Trash2 className="h-4 w-4" />
            </UtilityActionButton>
          </div>
        )}
      </UtilityListItem>
    </div>
  );
}

export function JournalSettings() {
  const navigate = useNavigate();
  const onBack = () => navigate({ to: '/settings' });
  const { data: sections = [], isLoading } = useJournalSections();
  const createMutation = useCreateJournalSection();
  const updateMutation = useUpdateJournalSection();
  const deleteMutation = useDeleteJournalSection();
  const reorderMutation = useReorderJournalSections();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<JournalSection | null>(null);
  const [deleteData, setDeleteData] = useState<JournalSection | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const openCreate = () => {
    setEditing(null);
    setName('');
    setDialogOpen(true);
  };

  const openEdit = (section: JournalSection) => {
    setEditing(section);
    setName(section.name);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          data: { name: name.trim() },
        });
      } else {
        await createMutation.mutateAsync({ name: name.trim() });
      }
      setDialogOpen(false);
    } catch (err) {
      console.error('Failed to save section:', err);
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
      console.error('Failed to delete section:', err);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = sections.findIndex((s) => s.id === active.id);
      const newIndex = sections.findIndex((s) => s.id === over.id);
      const newOrder = arrayMove(sections, oldIndex, newIndex).map((s) => s.id);
      reorderMutation.mutate(newOrder);
    }
  };

  return (
    <PageShell width="full">
      <PageIntro
        title="Sekce deníku"
        leading={<PageBackButton onClick={onBack} />}
        actions={
          <Button onClick={openCreate} size="sm">
            <Plus className="h-4 w-4 mr-2" />
            Nová sekce
          </Button>
        }
      />

      <UtilitySection title="Sekce">
        {isLoading ? (
          <UtilityListSkeleton height="h-12" />
        ) : (
          <UtilityList>
            {sections.length === 0 ? (
              <UtilityEmptyState
                icon={Layers}
                title="Žádné sekce"
                description="Vytvoř první vlastní sekci pro organizaci kanálů v deníku."
                action={{
                  label: 'Vytvořit první sekci',
                  onClick: openCreate,
                }}
              />
            ) : (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={sections.map((s) => s.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {sections.map((section) => (
                    <SortableRow
                      key={section.id}
                      section={section}
                      onEdit={openEdit}
                      onDelete={setDeleteData}
                    />
                  ))}
                </SortableContext>
              </DndContext>
            )}
          </UtilityList>
        )}
      </UtilitySection>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing ? 'Upravit sekci' : 'Nová sekce'}
            </DialogTitle>
            <DialogDescription>
              {editing
                ? 'Upravte název sekce.'
                : 'Vytvořte novou sekci pro organizaci kanálů v deníku.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label htmlFor="section-name">Název</Label>
              <Input
                id="section-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="např. Market Thoughts"
                className="mt-1.5"
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

      <ConfirmDialog
        open={!!deleteData}
        onOpenChange={(open) => !open && setDeleteData(null)}
        title="Smazat sekci?"
        description={`Opravdu chcete smazat sekci "${deleteData?.name}"? Kanály v této sekci se přesunou do "Ostatní".`}
        confirmLabel="Smazat"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </PageShell>
  );
}
