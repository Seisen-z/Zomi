import { createSessionStore } from './sessionStore';

export interface MangaUpdatesSession {
  sessionToken: string;
  uid: number;
  username: string;
  savedAt: number;
}

const store = createSessionStore<MangaUpdatesSession>('tracker:mangaupdates');

export const getMangaUpdatesSession = store.get;
export const saveMangaUpdatesSession = store.save;
export const clearMangaUpdatesSession = store.clear;
export const subscribeMangaUpdatesSession = store.subscribe;
