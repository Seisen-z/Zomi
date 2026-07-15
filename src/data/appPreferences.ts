import { getJSON, setJSON } from './storage';

export type PageTurnSpeed = 'slow' | 'normal' | 'fast';

export interface AppPreferences {
  autoUpdateLibrary: boolean;
  updateIntervalHours: number;
  libraryLanguage: string;
  wifiOnly: boolean;
  dataSaver: boolean;
  hapticFeedback: boolean;
  pageTurnSpeed: PageTurnSpeed;
  incognitoMode: boolean;
  appLockEnabled: boolean;
  lastLibraryUpdateCheck: number;
}

// Fade-in duration (ms) applied to each paged-mode page change — see ReaderScreen's goToPage.
export const PAGE_TURN_DURATIONS: Record<PageTurnSpeed, number> = {
  slow: 450,
  normal: 220,
  fast: 100,
};

const APP_PREFERENCES_KEY = 'app_preferences';

const DEFAULT_APP_PREFERENCES: AppPreferences = {
  autoUpdateLibrary: true,
  updateIntervalHours: 12,
  libraryLanguage: 'English',
  wifiOnly: false,
  dataSaver: false,
  hapticFeedback: true,
  pageTurnSpeed: 'normal',
  incognitoMode: false,
  appLockEnabled: false,
  lastLibraryUpdateCheck: 0,
};

// App-wide settings shown on the More screen — MMKV-backed like readerPreferences.ts, so every
// toggle actually persists across restarts instead of resetting to a hardcoded default.
export function getAppPreferences(): AppPreferences {
  return { ...DEFAULT_APP_PREFERENCES, ...getJSON<Partial<AppPreferences>>(APP_PREFERENCES_KEY, {}) };
}

export function setAppPreferences(patch: Partial<AppPreferences>): void {
  setJSON(APP_PREFERENCES_KEY, { ...getAppPreferences(), ...patch });
}
