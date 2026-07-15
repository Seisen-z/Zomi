import { anilistAuthUrl, fetchAnilistViewer, searchAnilistManga, updateAnilistProgress } from './anilist';
import { getAnilistSession, saveAnilistSession, clearAnilistSession, subscribeAnilistSession } from './anilistAuth';
import { kitsuLogin, fetchKitsuSelf, searchKitsuManga, updateKitsuProgress } from './kitsu';
import { getKitsuSession, saveKitsuSession, clearKitsuSession, subscribeKitsuSession } from './kitsuAuth';
import { mangaUpdatesLogin, searchMangaUpdates, updateMangaUpdatesProgress } from './mangaupdates';
import {
  getMangaUpdatesSession,
  saveMangaUpdatesSession,
  clearMangaUpdatesSession,
  subscribeMangaUpdatesSession,
} from './mangaupdatesAuth';
import { shikimoriAuthUrl, shikimoriExchangeCode, fetchShikimoriWhoami, searchShikimoriManga, updateShikimoriProgress } from './shikimori';
import { getShikimoriSession, saveShikimoriSession, clearShikimoriSession, subscribeShikimoriSession } from './shikimoriAuth';
import { bangumiAuthUrl, bangumiExchangeCode, fetchBangumiMe, searchBangumiSubject, updateBangumiProgress } from './bangumi';
import { getBangumiSession, saveBangumiSession, clearBangumiSession, subscribeBangumiSession } from './bangumiAuth';
import { myanimelistAuthUrl, myanimelistExchangeCode, fetchMyAnimeListSelf, searchMyAnimeListManga, updateMyAnimeListProgress } from './myanimelist';
import {
  getMyAnimeListSession,
  saveMyAnimeListSession,
  clearMyAnimeListSession,
  subscribeMyAnimeListSession,
} from './myanimelistAuth';

export type TrackerId = 'anilist' | 'kitsu' | 'mangaupdates' | 'shikimori' | 'bangumi' | 'myanimelist';

export interface TrackerSearchResult {
  id: string;
  title: string;
}

export interface TrackerDef {
  id: TrackerId;
  name: string;
  color: string;
  authMode: 'oauth' | 'password';
  usernameLabel?: string;
  /** OAuth trackers only: opens the browser to this URL to start login. */
  authUrl?: () => string;
  /** OAuth trackers only: substring of the zomi:// redirect URL that identifies this tracker. */
  redirectMarker?: string;
  /** OAuth trackers only: completes login from the redirect URL. Throws on failure. */
  handleRedirect?: (url: string) => Promise<void>;
  /** Password trackers only: completes login directly. Throws on failure. */
  login?: (username: string, password: string) => Promise<void>;
  isLoggedIn: () => boolean;
  username: () => string | undefined;
  subscribe: (fn: () => void) => () => void;
  logout: () => void;
  search: (query: string) => Promise<TrackerSearchResult[]>;
  updateProgress: (remoteId: string, progress: number) => Promise<void>;
}

// Matches real Tachiyomi's TrackerManager order and brand colors (data/track/TrackerManager.kt).
// One entry per tracker drives login/logout, the per-manga tracking-link search, chapter-progress
// sync, and OAuth deep-link handling — adding a 7th tracker means adding one entry here, not
// touching six different files.
export const TRACKERS: TrackerDef[] = [];
