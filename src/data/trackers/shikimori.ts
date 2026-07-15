// Shikimori's OAuth has no PKCE support, so like real Tachiyomi, the token exchange happens
// client-side with the app's own client_secret. Fill these in after registering an app at
// https://shikimori.one/oauth/applications with redirect URI zomi://shikimori-auth.
const CLIENT_ID = 'REPLACE_WITH_SHIKIMORI_CLIENT_ID';
const CLIENT_SECRET = 'REPLACE_WITH_SHIKIMORI_CLIENT_SECRET';
const REDIRECT_URI = 'zomi://shikimori-auth';

const BASE_URL = 'https://shikimori.one';

export function shikimoriAuthUrl(): string {
  const params = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code' });
  return `${BASE_URL}/oauth/authorize?${params.toString()}`;
}

export interface ShikimoriToken {
  accessToken: string;
  refreshToken: string;
}

export async function shikimoriExchangeCode(code: string): Promise<ShikimoriToken> {
  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri: REDIRECT_URI,
    }).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? 'Shikimori login failed');
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

export interface ShikimoriUser {
  id: number;
  nickname: string;
}

export async function fetchShikimoriWhoami(accessToken: string): Promise<ShikimoriUser> {
  const res = await fetch(`${BASE_URL}/api/users/whoami`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Zomi' },
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Could not load Shikimori profile');
  return { id: json.id, nickname: json.nickname };
}

export interface ShikimoriSearchResult {
  id: number;
  title: string;
}

export async function searchShikimoriManga(accessToken: string, query: string): Promise<ShikimoriSearchResult[]> {
  const res = await fetch(`${BASE_URL}/api/mangas?search=${encodeURIComponent(query)}&limit=10`, {
    headers: { Authorization: `Bearer ${accessToken}`, 'User-Agent': 'Zomi' },
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Shikimori search failed');
  return (json as { id: number; name: string }[]).map((m) => ({ id: m.id, title: m.name }));
}

export async function updateShikimoriProgress(accessToken: string, userId: number, targetId: number, chapters: number): Promise<void> {
  const res = await fetch(`${BASE_URL}/api/v2/user_rates`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
      'User-Agent': 'Zomi',
    },
    body: JSON.stringify({ user_rate: { user_id: userId, target_id: targetId, target_type: 'Manga', chapters, status: 'watching' } }),
  });
  if (!res.ok) throw new Error('Shikimori progress update failed');
}
