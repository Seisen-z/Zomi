import { getChaptersByMangaId } from '../repository';
import { getTrackLinks } from './trackLinks';
import { TRACKERS } from './registry';

// Fire-and-forget: pushes the highest read chapter number to every tracker linked to this
// manga. Called after any chapter gets marked read (reader auto-mark or manual toggle) —
// mirrors real Tachiyomi's "update tracker on chapter read" behavior. Failures are silent so a
// flaky tracker API never blocks local reading progress.
export function syncTrackersForManga(mangaId: string): void {
  const links = getTrackLinks(mangaId);
  if (links.length === 0) return;

  // Track "any chapter read" separately from the numeric max so chapter 0 (a prologue/oneshot)
  // still counts as real progress instead of looking like "nothing read yet".
  const readChapters = getChaptersByMangaId(mangaId).filter((c) => c.read && c.chapterNumber >= 0);
  if (readChapters.length === 0) return;
  const maxRead = Math.max(...readChapters.map((c) => c.chapterNumber));

  for (const link of links) {
    const tracker = TRACKERS.find((t) => t.id === link.tracker);
    tracker?.updateProgress(link.remoteId, Math.floor(maxRead)).catch(() => {});
  }
}
