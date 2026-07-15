// Bangumi's OAuth also has no PKCE, so the token exchange happens client-side like Shikimori's.
// Fill these in after registering an app at https://bgm.tv/dev/app with redirect URI
// zomi://bangumi-auth.
const CLIENT_ID = 'bgm66136a54c807c5222';
const CLIENT_SECRET = '734e3f7849539c999835c5326cb322ce';
const REDIRECT_URI = 'zomi://bangumi-auth';

const BASE_URL = 'https://bgm.tv';

export function bangumiAuthUrl(): string {
  const params = new URLSearchParams({ client_id: CLIENT_ID, response_type: 'code', redirect_uri: REDIRECT_URI });
  return `${BASE_URL}/oauth/authorize?${params.toString()}`;
}

export interface BangumiToken {
  accessToken: string;
  refreshToken: string;
  userId: number;
}

export async function bangumiExchangeCode(code: string): Promise<BangumiToken> {
  const res = await fetch(`${BASE_URL}/oauth/access_token`, {
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
  if (!res.ok) throw new Error(json.error_description ?? 'Bangumi login failed');
  return { accessToken: json.access_token, refreshToken: json.refresh_token, userId: json.user_id };
}

export interface BangumiUser {
  username: string;
}

export async function fetchBangumiMe(accessToken: string): Promise<BangumiUser> {
  const res = await fetch(`${BASE_URL}/v0/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Could not load Bangumi profile');
  return { username: json.nickname ?? json.username };
}

export interface BangumiSearchResult {
  id: number;
  title: string;
}

export async function searchBangumiSubject(accessToken: string, query: string): Promise<BangumiSearchResult[]> {
  const res = await fetch(`${BASE_URL}/search/subject/${encodeURIComponent(query)}?type=1&responseGroup=small`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const json = await res.json();
  if (!res.ok) throw new Error('Bangumi search failed');
  return (json.list ?? []).map((s: { id: number; name: string; name_cn?: string }) => ({
    id: s.id,
    title: s.name_cn || s.name,
  }));
}

export async function updateBangumiProgress(accessToken: string, subjectId: number, watchedEps: number): Promise<void> {
  const headers = { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Bearer ${accessToken}` };
  // Ensure the subject is on the user's collection before updating progress — harmless to retry.
  await fetch(`${BASE_URL}/collection/${subjectId}/update`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ status: 'do' }).toString(),
  }).catch(() => {});
  const res = await fetch(`${BASE_URL}/subject/${subjectId}/update/watched_eps`, {
    method: 'POST',
    headers,
    body: new URLSearchParams({ watched_eps: String(watchedEps) }).toString(),
  });
  if (!res.ok) throw new Error('Bangumi progress update failed');
}
