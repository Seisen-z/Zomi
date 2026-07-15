import { createSessionStore } from './sessionStore';

export interface KitsuSession {
  accessToken: string;
  refreshToken: string;
  userId: string;
  username: string;
  savedAt: number;
}

const store = createSessionStore<KitsuSession>('tracker:kitsu');

export const getKitsuSession = store.get;
export const saveKitsuSession = store.save;
export const clearKitsuSession = store.clear;
export const subscribeKitsuSession = store.subscribe;
