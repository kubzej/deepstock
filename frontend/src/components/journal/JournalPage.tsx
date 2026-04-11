import { useState } from 'react';
import { BookOpen, ChevronDown, ChevronRight, Search, X } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { PageBackButton, PageIntro, PageShell } from '@/components/shared/PageShell';
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
      className={`w-full flex items-center gap-2 px-3 py-2.5 rounded-md text-sm transition-colors min-h-[44px] ${
        isActive
          ? 'bg-muted text-foreground font-medium'
          : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
      }`}
    >
      <span className="truncate flex-1 text-left">{channel.name}</span>
      {channel.entry_count > 0 && (
        <span className={`text-xs tabular-nums shrink-0 px-1.5 py-0.5 rounded-full ${
          isActive
            ? 'bg-background/60 text-foreground'
            : 'bg-muted text-muted-foreground'
        }`}>{channel.entry_count}</span>
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
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

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

  const renderSectionBlock = (section: JournalSection) => {
    const isCollapsed = collapsedSections.has(section.id);
    let sectionChannels = section.is_system
      ? stockChannels
      : customChannels.filter((c) => c.section_id === section.id);

    if (section.is_system && search.trim()) {
      sectionChannels = sectionChannels.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase())
      );
    }

    const emptyLabel = section.is_system && search.trim()
      ? 'Žádné výsledky'
      : section.is_system
        ? 'Žádné akcie'
        : 'Prázdná sekce';

    const totalEntries = sectionChannels.reduce((sum, c) => sum + c.entry_count, 0);

    return (
      <div key={section.id}>
        <button
          className="w-full flex items-center justify-between px-2 py-2 group transition-colors"
          onClick={() => toggleSection(section.id)}
        >
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-foreground/60 group-hover:text-foreground transition-colors">
              {section.name}
            </span>
            {totalEntries > 0 && (
              <span className="text-[10px] tabular-nums text-muted-foreground/40">{totalEntries}</span>
            )}
          </div>
          {isCollapsed
            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/30" />
            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/30" />
          }
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
              <p className="px-3 py-2 text-xs text-muted-foreground/40">{emptyLabel}</p>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-1 px-2">
      {stockChannels.length > 4 && (
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50 pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Hledat ticker..."
            className="h-9 pl-8 pr-8 text-sm bg-muted/40 border-muted focus-visible:ring-1"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground/50 hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
      {sections.map(renderSectionBlock)}
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
  const mobileSubtitle = activeChannel
    ? activeChannel.stock_name ?? activeChannel.name
    : 'Poznámky a záznamy k akciím i vlastním tématům';

  return (
    <PageShell width="full" className="pb-0" gap="md">

      {/* Mobile — dvě obrazovky */}
      <div className="md:hidden">
        {activeChannel ? (
          /* Obrazovka 2: feed */
          <div>
            <div className="sticky top-0 bg-background z-10 border-b border-border/60 px-4 pt-2 pb-3">
              <PageIntro
                title="Deník"
                subtitle={mobileSubtitle}
                leading={
                  <PageBackButton
                    onClick={() => setActiveChannel(null)}
                    className="mb-1"
                  />
                }
              />
            </div>
            <div className="px-4 pt-4">
              <JournalFeed channel={activeChannel} />
            </div>
          </div>
        ) : (
          /* Obrazovka 1: seznam kanálů */
          <div>
            <div className="sticky top-0 bg-background z-10 border-b border-border/60 px-4 pt-2 pb-3">
              <PageIntro
                title="Deník"
                subtitle={mobileSubtitle}
              />
            </div>
            {channelsLoading ? (
              <div className="space-y-1 px-4 pt-4">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 w-full rounded-md" />)}
              </div>
            ) : (
              <div className="px-4 pt-4">
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
      <div className="hidden md:flex flex-col overflow-hidden border-t border-border/60 pt-4" style={{ height: 'calc(100vh - 72px)' }}>
        {/* Shared header */}
        <div className="shrink-0">
          <PageIntro
            title="Deník"
            subtitle="Poznámky a záznamy k akciím i vlastním tématům"
          />
        </div>

        {/* Two-column body — takes remaining height */}
        <div className="mt-4 flex min-h-0 flex-1">
          {/* Sidebar — scrolls independently */}
          <aside className="w-56 shrink-0 overflow-y-auto border-r border-border/60 pr-4 pb-4">
            {channelsLoading ? (
              <div className="space-y-1">
                {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-11 w-full rounded-md" />)}
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
          <main className="flex-1 min-w-0 flex flex-col overflow-hidden pl-6 pb-4">
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

    </PageShell>
  );
}
