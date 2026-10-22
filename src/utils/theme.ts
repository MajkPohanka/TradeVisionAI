import { AppTheme } from '../types';

export const THEME_STORAGE_KEY = 'tradeoy_theme';
export const USER_EXPLICIT_THEME_KEY = 'tradeoy_user_explicit_theme';

/**
 * Returns initial theme preference.
 * Defaults to 'black' (čistě černý OLED motiv) as primary default for anyone entering the portal.
 */
export function getInitialTheme(): AppTheme {
  try {
    // If the user has explicitly clicked and selected a theme preference
    const explicit = localStorage.getItem(USER_EXPLICIT_THEME_KEY);
    if (explicit === 'light' || explicit === 'dark' || explicit === 'black') {
      return explicit;
    }

    // Check if user previously saved dark or black
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'black') {
      return saved;
    }
  } catch (err) {
    console.warn('Failed to read theme from localStorage:', err);
  }

  // Primary default is black (čistě černý OLED motiv pro kohokoliv)
  return 'black';
}

/**
 * Applies the selected theme to the root HTML element and saves to localStorage.
 */
export function applyThemeToDocument(theme: AppTheme, isUserExplicit: boolean = false): void {
  if (typeof document === 'undefined') return;

  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    if (isUserExplicit) {
      localStorage.setItem(USER_EXPLICIT_THEME_KEY, theme);
    }
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
