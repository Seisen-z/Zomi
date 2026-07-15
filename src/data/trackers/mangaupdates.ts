const API_URL = 'https://api.mangaupdates.com/v1';

export interface MangaUpdatesSessionInfo {
  uid: number;
  sessionToken: string;
}

export async function mangaUpdatesLogin(username: string, password: string): Promise<MangaUpdatesSessionInfo> {
  const res = await fetch(`${API_URL}/account/login`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  const json = await res.json();
  if (!res.ok || json.status !== 'success') {
    throw new Error(json.reason ?? 'MangaUpdates login failed');
  }
  return { uid: json.context.uid, sessionToken: json.context.session_token };
}

export interface MangaUpdatesSearchResult {
  id: number;
  title: string;
}

export async function searchMangaUpdates(sessionToken: string, search: string): Promise<MangaUpdatesSearchResult[]> {
  const res = await fetch(`${API_URL}/series/search`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({ search, page: 1, perpage: 10 }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error('MangaUpdates search failed');
  return (json.results ?? []).map((r: { record: { series_id: number; title: string } }) => ({
    id: r.record.series_id,
    title: r.record.title,
  }));
}

export async function updateMangaUpdatesProgress(sessionToken: string, seriesId: number, chapter: number): Promise<void> {
  const headers = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Authorization: `Bearer ${sessionToken}`,
  };
  // Adding an already-listed series is harmless to retry, so we don't need to check first —
  // matches real Tachiyomi's MangaUpdates tracker, which always adds before updating.
  await fetch(`${API_URL}/lists/series`, {
    method: 'POST',
    headers,
    body: JSON.stringify([{ series: { id: seriesId }, list_id: 0 }]),
  }).catch(() => {});
  const res = await fetch(`${API_URL}/lists/series/update`, {
    method: 'POST',
    headers,
    body: JSON.stringify([{ series: { id: seriesId }, list_id: 0, status: { chapter } }]),
  });
  if (!res.ok) throw new Error('MangaUpdates progress update failed');
}
