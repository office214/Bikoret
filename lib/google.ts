import { readFile } from 'fs/promises';
import path from 'path';
import { config } from './config';
import { getSetting, setSetting } from './secure';

const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets.readonly';

export function redirectUri(req: Request) {
  // לפי הכתובת שממנה נכנסו (vercel.app או הדומיין של הישיבה) — כדי שעוגיית ה-state תתאים
  return `${new URL(req.url).origin || config.appUrl}/api/auth/callback`;
}

export function googleConfigured() {
  return !!(config.google.clientId && config.google.clientSecret);
}

export function authorizeUrl(redirectUri: string, state: string, connect: boolean) {
  const p = new URLSearchParams({
    client_id: config.google.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: connect ? `openid email profile ${SHEETS_SCOPE}` : 'openid email profile',
    state,
    prompt: connect ? 'consent' : 'select_account',
    access_type: connect ? 'offline' : 'online',
    include_granted_scopes: 'true',
  });
  if (config.allowedDomain && !connect) p.set('hd', config.allowedDomain);
  return `${AUTH_URL}?${p}`;
}

type TokenResponse = { access_token: string; expires_in: number; refresh_token?: string; id_token?: string; scope?: string; error?: string; error_description?: string };

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: config.google.clientId, client_secret: config.google.clientSecret, ...params }),
    cache: 'no-store',
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || json.error) throw new Error(`Google: ${json.error_description || json.error || res.status}`);
  return json;
}

export function exchangeCode(code: string, redirectUri: string) {
  return tokenRequest({ code, redirect_uri: redirectUri, grant_type: 'authorization_code' });
}

/** ה-id_token מגיע ישירות משרת גוגל ב-TLS, לכן מספיק לפענח אותו (OIDC Core 3.1.3.7) */
export function idTokenClaims(idToken: string): { email: string; name: string; email_verified: boolean; aud: string; iss: string } {
  const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8'));
  return payload;
}

/* ---------- גישה לגיליונות דרך החשבון שחובר ע"י מנהל ---------- */

const REFRESH_KEY = 'google_refresh_token';
const CONNECTED_KEY = 'google_connected_email';
const g = globalThis as unknown as { __gTok?: { token: string; exp: number } };

export async function saveSheetsConnection(refreshToken: string, email: string) {
  await setSetting(REFRESH_KEY, refreshToken, email);
  await setSetting(CONNECTED_KEY, email, email);
  g.__gTok = undefined;
}

export async function sheetsConnectedEmail(): Promise<string> {
  if (config.sheetsFixtureDir) return 'fixture@local';
  return getSetting(CONNECTED_KEY);
}

async function accessToken(): Promise<string> {
  if (g.__gTok && g.__gTok.exp > Date.now() + 60_000) return g.__gTok.token;
  const refresh = await getSetting(REFRESH_KEY);
  if (!refresh) throw new Error('מסד התלמידים עדיין לא חובר. בלשונית ניהול: "חיבור למסד התלמידים".');
  const t = await tokenRequest({ refresh_token: refresh, grant_type: 'refresh_token' });
  g.__gTok = { token: t.access_token, exp: Date.now() + t.expires_in * 1000 };
  return t.access_token;
}

/** קריאת כל הערכים (כפי שהם מוצגים) מגליון */
export async function readSheet(spreadsheetId: string, sheetName: string): Promise<string[][]> {
  if (config.sheetsFixtureDir) {
    const file = path.join(config.sheetsFixtureDir, `${spreadsheetId}.json`);
    const all = JSON.parse(await readFile(file, 'utf8')) as Record<string, string[][]>;
    return all[sheetName] || [];
  }
  const range = encodeURIComponent(`'${sheetName.replace(/'/g, "''")}'`);
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}?valueRenderOption=FORMATTED_VALUE&majorDimension=ROWS`;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${await accessToken()}` }, cache: 'no-store' });
    if (res.ok) {
      const json = (await res.json()) as { values?: unknown[][] };
      return (json.values || []).map((r) => r.map((c) => (c == null ? '' : String(c))));
    }
    if (res.status === 401) { g.__gTok = undefined; continue; }
    if (res.status === 429 || res.status >= 500) { await new Promise((r) => setTimeout(r, 400 * (attempt + 1))); continue; }
    const text = await res.text();
    if (res.status === 403 || res.status === 404) {
      throw new Error(`אין גישה לגיליון (${res.status}). ודא שהחשבון שחובר רשאי לצפות בקובץ.`);
    }
    throw new Error(`Google Sheets ${res.status}: ${text.slice(0, 200)}`);
  }
  throw new Error('Google Sheets לא זמין כרגע, נסה שוב');
}
