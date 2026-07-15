import { getJSON, setJSON, removeKey } from '../storage';

type Listener = () => void;

// Shared get/save/clear/subscribe implementation for every tracker's persisted session — each
// tracker auth file just calls this once with its own storage key and session shape.
export function createSessionStore<T>(key: string) {
  let listeners: Listener[] = [];

  return {
    get(): T | null {
      return getJSON<T | null>(key, null);
    },
    save(session: T): void {
      setJSON(key, session);
      listeners.forEach((l) => l());
    },
    clear(): void {
      removeKey(key);
      listeners.forEach((l) => l());
    },
    subscribe(fn: Listener): () => void {
      listeners.push(fn);
      return () => {
        listeners = listeners.filter((l) => l !== fn);
      };
    },
  };
}
