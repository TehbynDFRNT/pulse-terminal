import { create } from 'zustand';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
  applyTheme,
  normalizeTheme,
  type AppTheme,
} from '@/lib/theme';

interface ThemeState {
  theme: AppTheme;
  hydrated: boolean;
  hydrate: () => void;
  setTheme: (theme: AppTheme) => void;
  toggleTheme: () => void;
}

function persistTheme(theme: AppTheme) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(THEME_STORAGE_KEY, theme);
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: DEFAULT_THEME,
  hydrated: false,
  hydrate: () => {
    if (typeof window === 'undefined') return;
    const theme = normalizeTheme(window.localStorage.getItem(THEME_STORAGE_KEY));
    applyTheme(theme);
    set({ theme, hydrated: true });
  },
  setTheme: (theme) => {
    applyTheme(theme);
    persistTheme(theme);
    set({ theme, hydrated: true });
  },
  toggleTheme: () => {
    const nextTheme: AppTheme = get().theme === 'dark' ? 'light' : 'dark';
    applyTheme(nextTheme);
    persistTheme(nextTheme);
    set({ theme: nextTheme, hydrated: true });
  },
}));
