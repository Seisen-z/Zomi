import { getJSON, setJSON } from './storage';

// Ported from Trash/app/src/main/java/eu/kanade/tachiyomi/ui/reader/setting/ReadingMode.kt
export type ReadingMode = 'default' | 'ltr' | 'rtl' | 'vertical' | 'webtoon' | 'continuous-vertical';
// Ported from Trash/app/src/main/java/eu/kanade/tachiyomi/ui/reader/viewer/navigation/*.kt
export type TapZoneMode = 'default' | 'l-shaped' | 'kindlish' | 'edge' | 'right-left' | 'disabled';
// Ported from ReaderPreferences.TappingInvertMode
export type InvertMode = 'none' | 'horizontal' | 'vertical' | 'both';
// Ported from Trash/app/src/main/java/eu/kanade/tachiyomi/ui/reader/setting/ReaderPreferences.kt
// ImageScaleType — "original"/"stretch" aren't approximated well without gesture-based
// zoom/pan (not a Zomi dependency yet), so only the layout-driven scale types are offered.
export type ScaleType = 'fit-screen' | 'fit-width' | 'fit-height';
export type BackgroundMode = 'white' | 'sepia' | 'dark';

export interface ReaderPreferences {
  readingMode: ReadingMode;
  tapZoneMode: TapZoneMode;
  invertMode: InvertMode;
  scaleType: ScaleType;
  bgMode: BackgroundMode;
  showPageNumber: boolean;
  keepScreenOn: boolean;
  confirmExit: boolean;
}

const READER_PREFERENCES_KEY = 'reader_preferences';

// Matches real Tachiyomi's own defaults (paged, right-to-left, fit screen, dark background).
const DEFAULT_READER_PREFERENCES: ReaderPreferences = {
  readingMode: 'rtl',
  tapZoneMode: 'default',
  invertMode: 'none',
  scaleType: 'fit-screen',
  bgMode: 'dark',
  showPageNumber: true,
  keepScreenOn: true,
  confirmExit: false,
};

// Global, not per-manga — same as real Tachiyomi's reader settings: change it once while reading
// anything and it applies everywhere, and persists across app restarts (MMKV, not React state).
export function getReaderPreferences(): ReaderPreferences {
  return { ...DEFAULT_READER_PREFERENCES, ...getJSON<Partial<ReaderPreferences>>(READER_PREFERENCES_KEY, {}) };
}

export function setReaderPreferences(patch: Partial<ReaderPreferences>): void {
  setJSON(READER_PREFERENCES_KEY, { ...getReaderPreferences(), ...patch });
}
