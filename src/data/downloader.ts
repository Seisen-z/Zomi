import ReactNativeBlobUtil from 'react-native-blob-util';
import { NativeModules } from 'react-native';
import { getJSON, setJSON } from './storage';
import { getChaptersByMangaId, getMangaById } from './repository';
import { getSourceById } from './sources/registry';
import { Chapter } from './models';
import { getAppPreferences } from './appPreferences';

async function isWifiConnected(): Promise<boolean> {
  try {
    return await NativeModules.AppManager.isWifiConnected();
  } catch {
    return true; // fail open — don't block downloads if the check itself errors
  }
}

export type ChapterDownloadStatus = 'queued' | 'downloading' | 'downloaded' | 'error';

export interface ChapterDownloadState {
  mangaId: string;
  chapterId: string;
  status: ChapterDownloadStatus;
  totalPages: number;
  downloadedPages: number;
  error?: string;
}

const DOWNLOAD_STATE_KEY = 'downloads:state';

function stateKey(mangaId: string, chapterId: string): string {
  return `${mangaId}:${chapterId}`;
}

function getAllStates(): Record<string, ChapterDownloadState> {
  return getJSON<Record<string, ChapterDownloadState>>(DOWNLOAD_STATE_KEY, {});
}

function setAllStates(states: Record<string, ChapterDownloadState>): void {
  setJSON(DOWNLOAD_STATE_KEY, states);
}

export function getChapterDownloadState(mangaId: string, chapterId: string): ChapterDownloadState | undefined {
  return getAllStates()[stateKey(mangaId, chapterId)];
}

export function getAllDownloadStates(): ChapterDownloadState[] {
  return Object.values(getAllStates());
}

export function isChapterDownloaded(mangaId: string, chapterId: string): boolean {
  return getChapterDownloadState(mangaId, chapterId)?.status === 'downloaded';
}

// Lightweight pub-sub so DownloadsScreen / MangaDetailScreen can live-update as pages land,
// without polling MMKV on a timer.
type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeToDownloads(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  listeners.forEach((l) => l());
}

function updateState(mangaId: string, chapterId: string, patch: Partial<ChapterDownloadState>): void {
  const all = getAllStates();
  const key = stateKey(mangaId, chapterId);
  const base: ChapterDownloadState = all[key] ?? { mangaId, chapterId, status: 'queued', totalPages: 0, downloadedPages: 0 };
  all[key] = { ...base, ...patch };
  setAllStates(all);
  notify();
}

function removeState(mangaId: string, chapterId: string): void {
  const all = getAllStates();
  delete all[stateKey(mangaId, chapterId)];
  setAllStates(all);
  notify();
}

// Mirrors real Tachiyomi's on-disk layout: downloads/{sourceId}/{mangaId}/{chapterId}/{page}.jpg
function chapterDir(sourceId: string, mangaId: string, chapterId: string): string {
  const { fs } = ReactNativeBlobUtil;
  return `${fs.dirs.DocumentDir}/downloads/${sourceId}/${mangaId}/${chapterId}`;
}

export function getDownloadedPageUri(sourceId: string, mangaId: string, chapterId: string, pageIndex: number): string {
  return `file://${chapterDir(sourceId, mangaId, chapterId)}/${pageIndex}.jpg`;
}

export async function getDownloadedPageCount(sourceId: string, mangaId: string, chapterId: string): Promise<number> {
  const { fs } = ReactNativeBlobUtil;
  const dir = chapterDir(sourceId, mangaId, chapterId);
  try {
    if (!(await fs.exists(dir))) return 0;
    const files = await fs.ls(dir);
    return files.filter((f) => f.endsWith('.jpg')).length;
  } catch {
    return 0;
  }
}

// --- Queue: one chapter downloads at a time so a "Download All" doesn't blast dozens of
// concurrent requests at a source (and so progress reporting stays simple/sequential). ---

const queue: { mangaId: string; chapterId: string }[] = [];
let processing = false;

export function queueChapterDownload(mangaId: string, chapterId: string): void {
  const existing = getChapterDownloadState(mangaId, chapterId);
  if (existing && existing.status !== 'error') return;
  updateState(mangaId, chapterId, { status: 'queued', totalPages: 0, downloadedPages: 0, error: undefined });
  queue.push({ mangaId, chapterId });
  processQueue();
}

export function queueChapters(mangaId: string, chapterIds: string[]): void {
  for (const chapterId of chapterIds) queueChapterDownload(mangaId, chapterId);
}

// getChaptersByMangaId returns chapters newest-first (as scraped from the source); downloads
// should instead proceed oldest-to-newest, same order the reader progresses through them.
function ascendingByChapterNumber(chapters: Chapter[]): Chapter[] {
  return [...chapters].sort((a, b) => a.chapterNumber - b.chapterNumber);
}

export function downloadAllChapters(mangaId: string): void {
  queueChapters(mangaId, ascendingByChapterNumber(getChaptersByMangaId(mangaId)).map((c) => c.id));
}

export function downloadUnreadChapters(mangaId: string): void {
  queueChapters(
    mangaId,
    ascendingByChapterNumber(getChaptersByMangaId(mangaId).filter((c) => !c.read)).map((c) => c.id),
  );
}

// Mirrors real Tachiyomi's "Download next N chapters" menu: the next N unread chapters after
// wherever the reader has left off, in reading order — not just the first N in storage order.
export function downloadNextChapters(mangaId: string, count: number): void {
  const nextUnread = getChaptersByMangaId(mangaId)
    .filter((c) => !c.read)
    .sort((a, b) => a.chapterNumber - b.chapterNumber)
    .slice(0, count);
  queueChapters(mangaId, nextUnread.map((c) => c.id));
}

export function cancelChapterDownload(mangaId: string, chapterId: string): void {
  const idx = queue.findIndex((q) => q.mangaId === mangaId && q.chapterId === chapterId);
  if (idx >= 0) queue.splice(idx, 1);
  removeState(mangaId, chapterId);
}

export function cancelMangaDownloads(mangaId: string): void {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (queue[i].mangaId === mangaId) queue.splice(i, 1);
  }
  const all = getAllStates();
  for (const state of Object.values(all)) {
    if (state.mangaId === mangaId && state.status !== 'downloaded') delete all[stateKey(state.mangaId, state.chapterId)];
  }
  setAllStates(all);
  notify();
}

export async function deleteChapterDownload(mangaId: string, chapterId: string): Promise<void> {
  const manga = getMangaById(mangaId);
  if (manga) {
    const dir = chapterDir(manga.source, mangaId, chapterId);
    const { fs } = ReactNativeBlobUtil;
    try {
      if (await fs.exists(dir)) await fs.unlink(dir);
    } catch {
      // best-effort cleanup
    }
  }
  removeState(mangaId, chapterId);
}

const WIFI_RECHECK_DELAY = 15000;

let paused = false;

export function isDownloadsPaused(): boolean {
  return paused;
}

// User-initiated pause (distinct from the automatic Wi-Fi-only pause below): stops the queue
// after the in-flight chapter finishes, leaving the rest queued until resumeDownloads() is called.
export function pauseDownloads(): void {
  if (paused) return;
  paused = true;
  notify();
}

export function resumeDownloads(): void {
  if (!paused) return;
  paused = false;
  notify();
  processQueue();
}

async function processQueue(): Promise<void> {
  if (processing || paused) return;
  processing = true;
  while (queue.length > 0) {
    if (paused) break;
    if (getAppPreferences().wifiOnly && !(await isWifiConnected())) {
      // Leave the remaining queue intact and just stop for now — re-checked on a timer rather
      // than erroring the chapters out, same as real Tachiyomi pausing downloads off Wi-Fi.
      processing = false;
      setTimeout(processQueue, WIFI_RECHECK_DELAY);
      return;
    }
    const next = queue.shift()!;
    await downloadChapterNow(next.mangaId, next.chapterId);
  }
  processing = false;
}

const PAGE_FETCH_ATTEMPTS = 3;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// `ReactNativeBlobUtil.config({ path }).fetch()` (stream straight to disk) truncates every
// download at exactly 8192 bytes on this setup — Okio's internal buffer segment size — even
// though the same URL fetches correctly via curl and in-emulator Chrome, so it's a bug in that
// code path specifically, not the network or CDN. Its plain in-memory `.fetch()` (no `path`)
// uses a different response path that doesn't hit this, so we buffer to base64 and write
// ourselves instead of letting the library stream-to-file.
async function fetchPageWithRetry(dest: string, imageUrl: string, headers?: Record<string, string>): Promise<void> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= PAGE_FETCH_ATTEMPTS; attempt++) {
    try {
      const response = await ReactNativeBlobUtil.fetch('GET', imageUrl, headers);
      if (response.respInfo.status < 200 || response.respInfo.status >= 300) {
        throw new Error(`HTTP ${response.respInfo.status}`);
      }
      await ReactNativeBlobUtil.fs.writeFile(dest, response.base64(), 'base64');
      return;
    } catch (e) {
      lastError = e;
      if (attempt < PAGE_FETCH_ATTEMPTS) await delay(2000 * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

async function downloadChapterNow(mangaId: string, chapterId: string): Promise<boolean> {
  const manga = getMangaById(mangaId);
  const chapter = getChaptersByMangaId(mangaId).find((c) => c.id === chapterId);
  if (!manga || !chapter) {
    removeState(mangaId, chapterId);
    return false;
  }
  const source = getSourceById(manga.source);
  if (!source) {
    updateState(mangaId, chapterId, { status: 'error', error: 'No source available for this manga' });
    return false;
  }

  updateState(mangaId, chapterId, { status: 'downloading', downloadedPages: 0, error: undefined });
  try {
    const pages = await source.getPageList(chapter.url);
    updateState(mangaId, chapterId, { totalPages: pages.length });

    const dir = chapterDir(manga.source, mangaId, chapterId);
    const { fs } = ReactNativeBlobUtil;
    if (!(await fs.exists(dir))) await fs.mkdir(dir);

    const headers = source.getImageHeaders?.(chapter.url);
    for (let i = 0; i < pages.length; i++) {
      const dest = `${dir}/${i}.jpg`;
      await fetchPageWithRetry(dest, pages[i].imageUrl, headers);
      updateState(mangaId, chapterId, { downloadedPages: i + 1 });
      // A small gap between sequential page requests avoids tripping the CDN's rate limiting in
      // the first place, rather than only reacting to it after a truncated response.
      if (i < pages.length - 1) await delay(250);
    }
    updateState(mangaId, chapterId, { status: 'downloaded', downloadedPages: pages.length });
    return true;
  } catch (e) {
    updateState(mangaId, chapterId, { status: 'error', error: e instanceof Error ? e.message : String(e) });
    return false;
  }
}
