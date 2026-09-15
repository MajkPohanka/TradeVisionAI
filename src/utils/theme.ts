import { AppTheme } from '../types';

export const THEME_STORAGE_KEY = 'tradeoy_theme';

/**
 * Returns initial theme preference.
 * Defaults to 'light' (jemný světlý design) as requested by user.
 */
export function getInitialTheme(): AppTheme {
  try {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark' || saved === 'black') {
      return saved;
    }
    // Also check inside tradeoy_settings
    const settingsRaw = localStorage.getItem('tradeoy_settings');
    if (settingsRaw) {
      const parsed = JSON.parse(settingsRaw);
      if (parsed?.theme === 'light' || parsed?.theme === 'dark' || parsed?.theme === 'black') {
        return parsed.theme;
      }
    }
  } catch (err) {
    console.warn('Failed to read theme from localStorage:', err);
  }

  // Primary default is light (jemný světlý design)
  return 'light';
}

/**
 * Applies the selected theme to the root HTML element and saves to localStorage.
 */
export function applyThemeToDocument(theme: AppTheme): void {
  if (typeof document === 'undefined') return;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {}

  const root = document.documentElement;
  root.setAttribute('data-theme', theme);
  
  // Remove existing theme classes
  root.classList.remove('theme-light', 'theme-dark', 'theme-black', 'light', 'dark');

  root.classList.add(`theme-${theme}`);

  if (theme === 'light') {
    root.classList.add('light');
    root.style.colorScheme = 'light';
  } else {
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  }

  // Synchronize mobile status bar & browser toolbar color
  try {
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    const targetColor = theme === 'light' ? '#eaedf1' : theme === 'black' ? '#000000' : '#0c0c0e';
    if (metaThemeColor) {
      metaThemeColor.setAttribute('content', targetColor);
    } else {
      const meta = document.createElement('meta');
      meta.name = 'theme-color';
      meta.content = targetColor;
      document.head.appendChild(meta);
    }

    const metaStatusBarStyle = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
    if (metaStatusBarStyle) {
      metaStatusBarStyle.setAttribute('content', theme === 'light' ? 'default' : 'black-translucent');
    }
  } catch {}
}
