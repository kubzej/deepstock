import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, ArrowLeft, Hash } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/shared/PageHeader';
import { JournalFeed } from './JournalFeed';
import { useJournalChannels, useJournalSections } from '@/hooks/useJournal';
import type { JournalChannel, JournalSection } from '@/lib/api/journal';

// ============================================
// Channel item in sidebar
// ============================================

function ChannelItem({
  channel,
  isActive,
  onClick,
}: {
  channel: JournalChannel;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between px-2 py-1.5 rounded-md text-sm transition-colors ${
        isActive
          ? 'bg-primary/10 text-primary font-medium'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <span className="truncate">{channel.name}</span>
      {channel.entry_count > 0 && (
        <span className="text-xs text-muted-foreground ml-2 shrink-0">{channel.entry_count}</span>
      )}
    </button>
  );
}

// ============================================
// Sidebar content (shared between desktop + mobile sheet)
// ============================================

function SidebarContent({
  channels,
  sections,
  activeChannelId,
  onSelect,
}: {
  channels: JournalChannel[];
  sections: JournalSection[];
  activeChannelId: string | null;
  onSelect: (channel: JournalChannel) => void;
}) {
  const [stocksCollapsed, setStocksCollapsed] = useState(false);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const stockChannels = channels
    .filter((c) => c.type === 'stock')
    .sort((a, b) => a.name.localeCompare(b.name));

  const customChannels = channels.filter((c) => c.type === 'custom');

  const toggleSection = (id: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="space-y-1 px-2">
      {/* Akcie — fixed section */}
      <div>
        <button
          className="w-full flex items-center justify-between px-2 py-1.5 rounded-md hover:bg-muted transition-colors group"
          onClick={() => setStocksCollapsed((v) => !v)}
        >
          <div className="flex items-center gap-2">
            <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-sm font-semibold text-foreground">Akcie</span>
          </div>
          {stocksCollapsed ? (
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </button>
        {!stocksCollapsed && (
          <div className="space-y-0.5">
            {stockChannels.map((ch) => (
              <ChannelItem
                key={ch.id}
                channel={ch}
                isActive={ch.id === activeChannelId}
                onClick={() => onSelect(ch)}
              />
            ))}
            {stockChannels.length === 0 && (
              <p className="px-3 py-1.5 text-xs text-muted-foreground/60">Žádné akcie</p>
            )}
          </div>
        )}
      </div>

      {/* Custom sections */}
      {sections.map((section) => {
        const sectionChannels = customChannels.filter((c) => c.section_id === section.id);
        const isCollapsed = collapsedSections.has(section.id);
        return (
          <div key={section.id}>
            <button
              className="w-full flex items-center justify-between px-2 py-1.5 mt-2 rounded-md hover:bg-muted transition-colors"
              onClick={() => toggleSection(section.id)}
            >
              <div className="flex items-center gap-2">
                <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-sm font-semibold text-foreground">{section.name}</span>
              </div>
              {isCollapsed ? (
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
            {!isCollapsed && (
              <div className="space-y-0.5">
                {sectionChannels.map((ch) => (
                  <ChannelItem
                    key={ch.id}
                    channel={ch}
                    isActive={ch.id === activeChannelId}
                    onClick={() => onSelect(ch)}
                  />
                ))}
                {sectionChannels.length === 0 && (
                  <p className="px-3 py-1.5 text-xs text-muted-foreground/60">Prázdná sekce</p>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Unsectioned custom channels */}
      {(() => {
        const unsectioned = customChannels.filter((c) => !c.section_id);
        if (unsectioned.length === 0) return null;
        return (
          <div>
            <div className="flex items-center gap-2 px-2 py-1.5 mt-2">
              <Hash className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <span className="text-sm font-semibold text-foreground">Ostatní</span>
            </div>
            <div className="space-y-0.5">
              {unsectioned.map((ch) => (
                <ChannelItem
                  key={ch.id}
                  channel={ch}
                  isActive={ch.id === activeChannelId}
                  onClick={() => onSelect(ch)}
                />
              ))}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ============================================
// Main page
// ============================================

export function JournalPage() {
  const [activeChannel, setActiveChannel] = useState<JournalChannel | null>(null);

  const { data: channels = [], isLoading: channelsLoading } = useJournalChannels();
  const { data: sections = [] } = useJournalSections();

  return (
    <div className="pb-12 -mx-4 md:-mx-8 lg:-mx-12">

      {/* Mobile — dvě obrazovky */}
      <div className="md:hidden">
        {activeChannel ? (
          /* Obrazovka 2: feed */
          <div>
            <div className="sticky top-0 bg-background z-10 px-4 pt-2 pb-1">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 text-muted-foreground hover:text-foreground"
                onClick={() => setActiveChannel(null)}
              >
                <ArrowLeft className="w-4 h-4 mr-1" />
                Zpět
              </Button>
            </div>
            <div className="px-4">
              <JournalFeed channel={activeChannel} />
            </div>
          </div>
        ) : (
          /* Obrazovka 1: seznam kanálů */
          <div>
            <div className="sticky top-0 bg-background z-10 px-4 pt-2">
              <PageHeader title="Deník" />
            </div>
            {channelsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <div className="px-4">
                <SidebarContent
                  channels={channels}
                  sections={sections}
                  activeChannelId={null}
                  onSelect={setActiveChannel}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Desktop layout — fixed height, internal scroll only */}
      <div className="hidden md:flex flex-col overflow-hidden" style={{ height: 'calc(100vh - 48px)' }}>
        {/* Shared header */}
        <div className="px-6 pt-4 shrink-0">
          <PageHeader title="Deník" />
        </div>

        {/* Two-column body — takes remaining height */}
        <div className="flex min-h-0 flex-1">
          {/* Sidebar — scrolls independently */}
          <aside className="w-56 shrink-0 overflow-y-auto pt-2 pb-4">
            {channelsLoading ? (
              <div className="space-y-2 px-3">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <SidebarContent
                channels={channels}
                sections={sections}
                activeChannelId={activeChannel?.id ?? null}
                onSelect={setActiveChannel}
              />
            )}
          </aside>

          {/* Feed — scrolls independently */}
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden px-6 pt-2 pb-4">
            {activeChannel ? (
              <JournalFeed channel={activeChannel} />
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center text-muted-foreground">
                <BookOpen className="h-10 w-10 mb-3 opacity-30" />
                <p className="text-sm">Vyber kanál ze seznamu vlevo</p>
              </div>
            )}
          </main>
        </div>
      </div>

    </div>
  );
}
