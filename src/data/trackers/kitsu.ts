// Kitsu publishes this client id/secret pair in its own API docs for community apps that don't
// register their own OAuth client — real Tachiyomi hardcodes the same values in its public repo.
const CLIENT_ID = 'dd031b32d2f56c990b1425efe6c42ad847e7fe3ab46bf1299f05ecd856bdb7dd';
const CLIENT_SECRET = '54d7307928f63414defd96399fc31ba847961ceaecef3a5fd93144e960c0e151';

const TOKEN_URL = 'https://kitsu.io/api/oauth/token';
const API_URL = 'https://kitsu.io/api/edge';

export interface KitsuToken {
  accessToken: string;
  refreshToken: string;
}

export async function kitsuLogin(username: string, password: string): Promise<KitsuToken> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      username,
      password,
      grant_type: 'password',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
    }).toString(),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error_description ?? 'Kitsu login failed');
  }
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

export interface KitsuUser {
  id: string;
  name: string;
}

export async function fetchKitsuSelf(accessToken: string): Promise<KitsuUser> {
  const res = await fetch(`${API_URL}/users?filter[self]=true`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.api+json',
    },
  });
  const json = await res.json();
  const user = json.data?.[0];
  if (!res.ok || !user) throw new Error('Could not load Kitsu profile');
  return { id: user.id, name: user.attributes.name };
}

export interface KitsuSearchResult {
  id: string;
  title: string;
}

export async function searchKitsuManga(accessToken: string, query: string): Promise<KitsuSearchResult[]> {
  const res = await fetch(`${API_URL}/manga?filter[text]=${encodeURIComponent(query)}&page[limit]=10`, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.api+json' },
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Kitsu search failed');
  return (json.data ?? []).map((m: { id: string; attributes: { canonicalTitle: string } }) => ({
    id: m.id,
    title: m.attributes.canonicalTitle,
  }));
}

async function findKitsuLibraryEntry(accessToken: string, userId: string, mangaId: string): Promise<string | null> {
  const res = await fetch(
    `${API_URL}/library-entries?filter[user_id]=${userId}&filter[manga_id]=${mangaId}&filter[kind]=manga`,
    { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/vnd.api+json' } },
  );
  const json = await res.json();
  if (!res.ok) throw new Error('Kitsu library lookup failed');
  return json.data?.[0]?.id ?? null;
}

export async function updateKitsuProgress(accessToken: string, userId: string, mangaId: string, progress: number): Promise<void> {
  const existingId = await findKitsuLibraryEntry(accessToken, userId, mangaId);
  const headers = {
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
    Authorization: `Bearer ${accessToken}`,
  };
  const res = existingId
    ? await fetch(`${API_URL}/library-entries/${existingId}`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ data: { id: existingId, type: 'libraryEntries', attributes: { progress, status: 'current' } } }),
      })
    : await fetch(`${API_URL}/library-entries`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: {
            type: 'libraryEntries',
            attributes: { progress, status: 'current' },
            relationships: {
              user: { data: { id: userId, type: 'users' } },
              manga: { data: { id: mangaId, type: 'manga' } },
            },
          },
        }),
      });
  if (!res.ok) throw new Error('Kitsu progress update failed');
}
