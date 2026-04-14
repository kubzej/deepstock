import type { LucideIcon } from 'lucide-react';
import {
  Palette,
  Bell,
  BookOpen,
  Briefcase,
  Layers,
  List,
  Rss,
  Tag,
} from 'lucide-react';

export interface SettingsCatalogItem {
  title: string;
  description: string;
  to:
    | '/settings/portfolios'
    | '/settings/watchlists'
    | '/settings/watchlist-tags'
    | '/settings/appearance'
    | '/settings/notifications'
    | '/settings/feed-lists'
    | '/settings/journal-sections'
    | '/settings/journal-channels';
  icon: LucideIcon;
}

export interface SettingsCatalogSection {
  title: string;
  description: string;
  items: SettingsCatalogItem[];
}

export const SETTINGS_CATALOG: SettingsCatalogSection[] = [
  {
    title: 'Sledování a pozice',
    description:
      'Nástroje pro správu portfolií, watchlistů a jejich struktury.',
    items: [
      {
        title: 'Portfolia',
        description: 'Vytvářejte a spravujte investiční portfolia.',
        to: '/settings/portfolios',
        icon: Briefcase,
      },
      {
        title: 'Watchlisty',
        description: 'Správa watchlistů a jejich pořadí.',
        to: '/settings/watchlists',
        icon: List,
      },
      {
        title: 'Watchlist tagy',
        description:
          'Tagy pro označování a filtrování položek ve watchlistech.',
        to: '/settings/watchlist-tags',
        icon: Tag,
      },
    ],
  },
  {
    title: 'Vzhled a prostředí',
    description: 'Vizuální režim a preference rozhraní aplikace.',
    items: [
      {
        title: 'Vzhled',
        description: 'Přepnutí mezi světlým a tmavým režimem aplikace.',
        to: '/settings/appearance',
        icon: Palette,
      },
    ],
  },
  {
    title: 'Monitoring a signály',
    description: 'Nastavení upozornění a zdrojů pro průběžné sledování trhu.',
    items: [
      {
        title: 'Notifikace',
        description: 'Push notifikace a cenové alerty pro sledované akcie.',
        to: '/settings/notifications',
        icon: Bell,
      },
      {
        title: 'X.com Feed listy',
        description:
          'Seznamy účtů pro AI přehled příspěvků a monitoring témat.',
        to: '/settings/feed-lists',
        icon: Rss,
      },
    ],
  },
  {
    title: 'Deník a poznámky',
    description: 'Pomocné struktury pro vlastní zápisky a osobní workflow.',
    items: [
      {
        title: 'Sekce deníku',
        description: 'Sekce pro organizaci vlastních kanálů a jejich pořadí.',
        to: '/settings/journal-sections',
        icon: Layers,
      },
      {
        title: 'Vlastní kanály',
        description: 'Kanály pro osobní poznámky, témata a průběžné zápisky.',
        to: '/settings/journal-channels',
        icon: BookOpen,
      },
    ],
  },
];
