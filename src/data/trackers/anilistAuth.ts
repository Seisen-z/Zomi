import { createSessionStore } from './sessionStore';

export interface AnilistSession {
  token: string;
  userId: number;
  username: string;
  savedAt: number;
}

const store = createSessionStore<AnilistSession>('tracker:anilist');

export const getAnilistSession = store.get;
export const saveAnilistSession = store.save;
export const clearAnilistSession = store.clear;
export const subscribeAnilistSession = store.subscribe;
