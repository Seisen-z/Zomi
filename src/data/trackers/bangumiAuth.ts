import { createSessionStore } from './sessionStore';

export interface BangumiSession {
  accessToken: string;
  refreshToken: string;
  userId: number;
  username: string;
  savedAt: number;
}

const store = createSessionStore<BangumiSession>('tracker:bangumi');

export const getBangumiSession = store.get;
export const saveBangumiSession = store.save;
export const clearBangumiSession = store.clear;
export const subscribeBangumiSession = store.subscribe;
