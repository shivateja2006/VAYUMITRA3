import { useEffect, useState } from 'react';
import type { AqiThemeMode, ThemePreference } from '../types/aqi';

function getInitialThemePreference(): ThemePreference {
  if (typeof window === 'undefined') return 'auto';
  const saved = window.localStorage.getItem('vayumitra-theme-preference');
  if (saved === 'auto' || saved === 'light' || saved === 'dark') return saved;
  return 'auto';
}

/**
 * Synchronizes the AQI-adaptive theme engine (`good`, `moderate`, `high`)
 * with persisted user overrides (`auto`, `light`, `dark`).
 */
export function useAqiTheme(activeTheme: AqiThemeMode) {
  const [themePreference, setThemePreference] = useState<ThemePreference>(
    getInitialThemePreference,
  );

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-aqi-theme', activeTheme);
    window.localStorage.setItem('vayumitra-theme-preference', themePreference);

    const isDarkActive =
      themePreference === 'dark' || (themePreference === 'auto' && activeTheme === 'high');
    const isForceLight = themePreference === 'light' && activeTheme === 'high';

    root.classList.toggle('dark', isDarkActive);
    root.classList.toggle('force-light', isForceLight);
  }, [activeTheme, themePreference]);

  return { themePreference, setThemePreference };
}
