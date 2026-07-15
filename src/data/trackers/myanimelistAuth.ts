import { createSessionStore } from './sessionStore';

export interface MyAnimeListSession {
  accessToken: string;
  refreshToken: string;
  userId: number;
  username: string;
  savedAt: number;
}

const store = createSessionStore<MyAnimeListSession>('tracker:myanimelist');

export const getMyAnimeListSession = store.get;
export const saveMyAnimeListSession = store.save;
export const clearMyAnimeListSession = store.clear;
export const subscribeMyAnimeListSession = store.subscribe;
