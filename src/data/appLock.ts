import { storage } from './storage';

const PIN_KEY = 'app_lock:pin';

export function hasPin(): boolean {
  return !!storage.getString(PIN_KEY);
}

export function setPin(pin: string): void {
  storage.set(PIN_KEY, pin);
}

export function verifyPin(pin: string): boolean {
  return storage.getString(PIN_KEY) === pin;
}

export function clearPin(): void {
  storage.remove(PIN_KEY);
}
