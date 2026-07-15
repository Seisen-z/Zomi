import { getJSON, setJSON } from '../storage';
import type { TrackerId } from './registry';

export type { TrackerId };

export interface TrackLink {
  tracker: TrackerId;
  remoteId: string;
  title: string;
}

const key = (mangaId: string) => `tracklinks:${mangaId}`;

export function getTrackLinks(mangaId: string): TrackLink[] {
  return getJSON<TrackLink[]>(key(mangaId), []);
}

export function getTrackLink(mangaId: string, tracker: TrackerId): TrackLink | undefined {
  return getTrackLinks(mangaId).find((l) => l.tracker === tracker);
}

export function setTrackLink(mangaId: string, link: TrackLink): void {
  const links = getTrackLinks(mangaId).filter((l) => l.tracker !== link.tracker);
  setJSON(key(mangaId), [...links, link]);
}

export function removeTrackLink(mangaId: string, tracker: TrackerId): void {
  setJSON(key(mangaId), getTrackLinks(mangaId).filter((l) => l.tracker !== tracker));
}
