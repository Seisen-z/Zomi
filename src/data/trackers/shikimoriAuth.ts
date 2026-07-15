import { createSessionStore } from './sessionStore';

export interface ShikimoriSession {
  accessToken: string;
  refreshToken: string;
  userId: number;
  username: string;
  savedAt: number;
}

const store = createSessionStore<ShikimoriSession>('tracker:shikimori');

export const getShikimoriSession = store.get;
export const saveShikimoriSession = store.save;
export const clearShikimoriSession = store.clear;
export const subscribeShikimoriSession = store.subscribe;
