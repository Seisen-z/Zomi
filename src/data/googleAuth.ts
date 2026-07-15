import { getJSON, setJSON, removeKey } from './storage';
import { createSessionStore } from './trackers/sessionStore';
import { GOOGLE_CLIENT_ID, getGoogleRedirectUri } from './googleConfig';
import { Alert } from 'react-native';

export interface GoogleSession {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  name: string;
  email: string;
  picture?: string;
}

const VERIFIER_KEY = 'google:pending_verifier';
const store = createSessionStore<GoogleSession>('google:session');

export const getGoogleSession = store.get;
export const saveGoogleSession = store.save;
export const clearGoogleSession = store.clear;
export const subscribeGoogleSession = store.subscribe;

function generateCodeVerifier(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let out = '';
  for (let i = 0; i < 96; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export function googleAuthUrl(): string {
  const verifier = generateCodeVerifier();
  setJSON(VERIFIER_KEY, verifier);

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: getGoogleRedirectUri(),
    response_type: 'code',
    scope: 'https://www.googleapis.com/auth/drive.file email profile openid',
    code_challenge: verifier,
    code_challenge_method: 'plain',
    prompt: 'consent',
    access_type: 'offline',
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function googleExchangeCode(code: string): Promise<GoogleSession> {
  const verifier = getJSON<string>(VERIFIER_KEY, '');
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: getGoogleRedirectUri(),
    }).toString(),
  });

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error_description ?? json.message ?? 'Google login failed');
  }

  removeKey(VERIFIER_KEY);

  const accessToken = json.access_token;
  const refreshToken = json.refresh_token;
  const expiresAt = Date.now() + (json.expires_in || 3600) * 1000;

  const user = await fetchGoogleProfile(accessToken);

  const existing = getGoogleSession();
  const session: GoogleSession = {
    accessToken,
    refreshToken: refreshToken || (existing ? existing.refreshToken : ''),
    expiresAt,
    name: user.name || 'Google User',
    email: user.email || '',
    picture: user.picture,
  };

  return session;
}

export async function fetchGoogleProfile(accessToken: string) {
  const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    throw new Error('Failed to fetch Google profile');
  }
  return await res.json();
}

export async function refreshGoogleTokenIfNeeded(): Promise<string> {
  const session = getGoogleSession();
  if (!session) throw new Error('No Google session found');

  if (session.expiresAt > Date.now() + 5 * 60 * 1000) {
    return session.accessToken;
  }

  if (!session.refreshToken) {
    throw new Error('No refresh token available');
  }

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      refresh_token: session.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
  });

  const json = await res.json();
  if (!res.ok) {
    clearGoogleSession();
    throw new Error(json.error_description ?? json.message ?? 'Failed to refresh Google token');
  }

  const newSession: GoogleSession = {
    ...session,
    accessToken: json.access_token,
    expiresAt: Date.now() + (json.expires_in || 3600) * 1000,
  };
  saveGoogleSession(newSession);
  return json.access_token;
}

export async function handleGoogleRedirect(url: string): Promise<void> {
  console.log('[GoogleAuth] handleGoogleRedirect url:', url);
  const match = url.match(/[?&]code=([^&]+)/);
  if (!match) {
    console.log('[GoogleAuth] No code found in URL');
    return;
  }

  const code = decodeURIComponent(match[1]);
  console.log('[GoogleAuth] Code matched, exchanging code...');
  try {
    const session = await googleExchangeCode(code);
    saveGoogleSession(session);
    console.log('[GoogleAuth] Session saved successfully:', session.email);
    Alert.alert('Signed in', `Welcome, ${session.name}!`);
  } catch (err: any) {
    console.error('[GoogleAuth] Exchange code error:', err);
    throw err;
  }
}
