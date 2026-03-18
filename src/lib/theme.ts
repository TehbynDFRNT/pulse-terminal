export type AppTheme = 'light' | 'dark';

export const DEFAULT_THEME: AppTheme = 'dark';
export const THEME_STORAGE_KEY = 'pulse-theme';

export function normalizeTheme(value: string | null | undefined): AppTheme {
  return value === 'light' ? 'light' : 'dark';
}

export function applyTheme(theme: AppTheme, root: HTMLElement = document.documentElement) {
  root.classList.toggle('dark', theme === 'dark');
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function getThemeInitScript() {
  return `(() => {
    try {
      const stored = localStorage.getItem('${THEME_STORAGE_KEY}');
      const theme = stored === 'light' ? 'light' : '${DEFAULT_THEME}';
      const root = document.documentElement;
      root.classList.toggle('dark', theme === 'dark');
      root.dataset.theme = theme;
      root.style.colorScheme = theme;
    } catch {
      const root = document.documentElement;
      root.classList.add('dark');
      root.dataset.theme = '${DEFAULT_THEME}';
      root.style.colorScheme = '${DEFAULT_THEME}';
    }
  })();`;
}
