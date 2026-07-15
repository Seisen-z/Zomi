import { addChapters, getCategoriesByMangaId, getChaptersByMangaId, getFavorites } from './repository';
import { getSourceById } from './sources/registry';
import { jsSourceChaptersToDomain } from './jsSourceAdapter';
import { getAppPreferences, setAppPreferences } from './appPreferences';
import { getJSON, setJSON } from './storage';
import { queueChapters } from './downloader';
import { isAutoDownloadCategory } from './models';

// Which chapters (per manga) were found by the last library update check and haven't been seen
// yet — drives the Library tab badge and the per-manga "new" dot instead of a one-shot alert.
const UNSEEN_NEW_CHAPTERS_KEY = 'library:unseenNewChapters';

function getUnseenMap(): Record<string, string[]> {
  return getJSON<Record<string, string[]>>(UNSEEN_NEW_CHAPTERS_KEY, {});
}

function setUnseenMap(map: Record<string, string[]>): void {
  setJSON(UNSEEN_NEW_CHAPTERS_KEY, map);
  notify();
}

// Same lightweight pub-sub as downloader.ts's subscribeToDownloads — lets RootNavigator/
// LibraryScreen live-update their badges without polling MMKV on a timer.
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToLibraryUpdates(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  listeners.forEach((l) => l());
}

export function getUnseenChapterIds(mangaId: string): string[] {
  return getUnseenMap()[mangaId] ?? [];
}

export function hasUnseenNewChapters(mangaId: string): boolean {
  return getUnseenChapterIds(mangaId).length > 0;
}

export function getUnseenLibraryMangaCount(): number {
  return Object.values(getUnseenMap()).filter((ids) => ids.length > 0).length;
}

export function clearUnseenNewChapters(mangaId: string): void {
  const map = getUnseenMap();
  if (!map[mangaId]?.length) return;
  delete map[mangaId];
  setUnseenMap(map);
}

// Mirrors MangaDetailScreen's own per-manga "Refresh" (source.getChapterList + diff against what's
// already stored), just run across every library manga on an interval instead of one at a time.
async function fetchNewChaptersFor(mangaId: string, mangaUrl: string, sourceId: string): Promise<number> {
  const source = getSourceById(sourceId);
  if (!source) return 0;
  const sourceChapters = await source.getChapterList(mangaUrl);
  const domainChapters = jsSourceChaptersToDomain(mangaId, sourceChapters);
  const existingIds = new Set(getChaptersByMangaId(mangaId).map((c) => c.id));
  const newChapters = domainChapters.filter((c) => !existingIds.has(c.id));
  if (newChapters.length > 0) {
    addChapters(mangaId, newChapters);
    const map = getUnseenMap();
    map[mangaId] = [...(map[mangaId] ?? []), ...newChapters.map((c) => c.id)];
    setUnseenMap(map);

    if (getCategoriesByMangaId(mangaId).some(isAutoDownloadCategory)) {
      queueChapters(mangaId, newChapters.map((c) => c.id));
    }
  }
  return newChapters.length;
}

// Called from the Library screen's app-foreground listener. No-ops unless Auto-update Library is
// on and the configured interval has actually elapsed, so it doesn't hammer sources on every tab
// switch. Runs silently; failures for individual manga (offline, source removed, etc.) are ignored
// so one broken source doesn't block the rest. Results surface as a persistent badge (see
// subscribeToLibraryUpdates above) instead of a one-shot alert.
export async function checkForLibraryUpdatesIfDue(): Promise<void> {
  const prefs = getAppPreferences();
  if (!prefs.autoUpdateLibrary) return;
  const dueAt = prefs.lastLibraryUpdateCheck + prefs.updateIntervalHours * 60 * 60 * 1000;
  if (Date.now() < dueAt) return;

  setAppPreferences({ lastLibraryUpdateCheck: Date.now() });

  for (const manga of getFavorites()) {
    try {
      await fetchNewChaptersFor(manga.id, manga.url, manga.source);
    } catch {
      // best-effort — one source failing shouldn't stop the rest
    }
  }
}

export async function forceCheckForLibraryUpdates(): Promise<void> {
  setAppPreferences({ lastLibraryUpdateCheck: Date.now() });
  for (const manga of getFavorites()) {
    try {
      await fetchNewChaptersFor(manga.id, manga.url, manga.source);
    } catch (e) {
      console.error(`Library force update failed for ${manga.title}:`, e);
    }
  }
}
