export type ThemeMode = 'light' | 'dark';

export const DEFAULT_THEME: ThemeMode = 'light';
export const THEME_STORAGE_KEY = 'deepstock-theme';

export const THEME_META_COLORS: Record<ThemeMode, string> = {
  light: '#ffffff',
  dark: '#232323',
};

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === 'light' || value === 'dark';
}

export function readStoredTheme(): ThemeMode | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function resolveInitialTheme(): ThemeMode {
  return readStoredTheme() ?? DEFAULT_THEME;
}

export function persistTheme(theme: ThemeMode) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Ignore storage failures and keep the in-memory theme.
  }
}

export function applyTheme(theme: ThemeMode) {
  if (typeof document === 'undefined') {
    return;
  }

  const root = document.documentElement;
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;

  const themeMeta = document.querySelector('meta[name="theme-color"]');
  themeMeta?.setAttribute('content', THEME_META_COLORS[theme]);
}
