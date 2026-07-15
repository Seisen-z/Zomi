import { createMMKV } from 'react-native-mmkv';

export const storage = createMMKV();

export function getJSON<T>(key: string, fallback: T): T {
  const raw = storage.getString(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function setJSON<T>(key: string, value: T): void {
  storage.set(key, JSON.stringify(value));
}

export function removeKey(key: string): void {
  storage.remove(key);
}
