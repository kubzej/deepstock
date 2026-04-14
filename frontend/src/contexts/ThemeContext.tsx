import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  applyTheme,
  persistTheme,
  resolveInitialTheme,
  type ThemeMode,
} from '@/lib/theme';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<ThemeMode>(() => resolveInitialTheme());

  useEffect(() => {
    applyTheme(theme);
    persistTheme(theme);
  }, [theme]);

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme: () =>
          setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);

  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }

  return context;
}
