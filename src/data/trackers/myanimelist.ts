import { getJSON, setJSON, removeKey } from '../storage';

// MAL uses PKCE (RFC 7636) "plain" method — the code_challenge sent is literally the
// code_verifier, so no client_secret is needed for the token exchange (matches real
// Tachiyomi's MyAnimeListApi.kt).
const CLIENT_ID = '0a64b44af416b7f6e51710e00f724e7e';

const BASE_URL = 'https://myanimelist.net';
const API_URL = 'https://api.myanimelist.net/v2';
const VERIFIER_KEY = 'tracker:mal:pending_verifier';

function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let out = '';
  for (let i = 0; i < 96; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function myanimelistAuthUrl(): string {
  const verifier = generateCodeVerifier();
  setJSON(VERIFIER_KEY, verifier);
  const params = new URLSearchParams({ client_id: CLIENT_ID, code_challenge: verifier, response_type: 'code' });
  return `${BASE_URL}/v1/oauth2/authorize?${params.toString()}`;
}

export interface MyAnimeListToken {
  accessToken: string;
  refreshToken: string;
}

export async function myanimelistExchangeCode(code: string): Promise<MyAnimeListToken> {
  const verifier = getJSON<string>(VERIFIER_KEY, '');
  const res = await fetch(`${BASE_URL}/v1/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
    }).toString(),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error_description ?? json.message ?? 'MyAnimeList login failed');
  removeKey(VERIFIER_KEY);
  return { accessToken: json.access_token, refreshToken: json.refresh_token };
}

export interface MyAnimeListUser {
  id: number;
  name: string;
}

export async function fetchMyAnimeListSelf(accessToken: string): Promise<MyAnimeListUser> {
  const res = await fetch(`${API_URL}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Could not load MyAnimeList profile');
  return { id: json.id, name: json.name };
}

export interface MyAnimeListSearchResult {
  id: number;
  title: string;
}

export async function searchMyAnimeListManga(accessToken: string, query: string): Promise<MyAnimeListSearchResult[]> {
  const res = await fetch(`${API_URL}/manga?q=${encodeURIComponent(query)}&limit=10&fields=id,title`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error('MyAnimeList search failed');
  return (json.data ?? []).map((d: { node: { id: number; title: string } }) => ({ id: d.node.id, title: d.node.title }));
}

export async function updateMyAnimeListProgress(accessToken: string, mangaId: number, numChaptersRead: number): Promise<void> {
  const res = await fetch(`${API_URL}/manga/${mangaId}/my_list_status`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: new URLSearchParams({ status: 'reading', num_chapters_read: String(numChaptersRead) }).toString(),
  });
  if (!res.ok) throw new Error('MyAnimeList progress update failed');
}
