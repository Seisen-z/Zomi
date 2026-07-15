import { getJSON, setJSON } from '../data/storage';

const ACCENT_KEY = 'theme:accentColor';
export const DEFAULT_ACCENT = '#e85d04';

const listeners = new Set<() => void>();

export function getAccentColor(): string {
  return getJSON<string>(ACCENT_KEY, DEFAULT_ACCENT);
}

// More screen > Appearance > Theme Color writes here. Every screen reads the accent through
// useThemeColors(), so this one call re-skins the whole app immediately — no restart needed.
export function setAccentColor(hex: string): void {
  setJSON(ACCENT_KEY, hex);
  listeners.forEach((l) => l());
}

export function subscribeToTheme(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
