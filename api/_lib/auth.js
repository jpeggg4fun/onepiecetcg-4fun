import crypto from 'node:crypto';
import { getSupabaseAdmin } from './supabase.js';

const SESSION_COOKIE = 'op_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

export function validateUsername(username) {
  return /^[a-z0-9_]{3,24}$/.test(username);
}

export function validatePassword(password) {
  return typeof password === 'string' && password.length >= 6;
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

export function verifyPassword(password, storedHash) {
  const [salt, expected] = String(storedHash || '').split(':');
  if (!salt || !expected) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(derived, 'hex'), Buffer.from(expected, 'hex'));
}

export function createSessionToken() {
  return crypto.randomBytes(32).toString('hex');
}

export function hashSessionToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function parseCookies(cookieHeader) {
  return String(cookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const separatorIndex = part.indexOf('=');
      if (separatorIndex === -1) return acc;
      const key = part.slice(0, separatorIndex);
      const value = decodeURIComponent(part.slice(separatorIndex + 1));
      acc[key] = value;
      return acc;
    }, {});
}

export function setSessionCookie(res, token, expiresAt) {
  const cookie = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Secure',
    `Expires=${new Date(expiresAt).toUTCString()}`
  ].join('; ');

  res.setHeader('Set-Cookie', cookie);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Secure; Expires=Thu, 01 Jan 1970 00:00:00 GMT`);
}

export async function createSession(userId, res) {
  const supabase = getSupabaseAdmin();
  const token = createSessionToken();
  const tokenHash = hashSessionToken(token);
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();

  const { error } = await supabase.from('sessions').insert({
    user_id: userId,
    token_hash: tokenHash,
    expires_at: expiresAt
  });

  if (error) throw error;

  setSessionCookie(res, token, expiresAt);
}

export async function getSessionUser(req) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;

  const supabase = getSupabaseAdmin();
  const tokenHash = hashSessionToken(token);

  const { data, error } = await supabase
    .from('sessions')
    .select('id, user_id, expires_at, users(id, username)')
    .eq('token_hash', tokenHash)
    .maybeSingle();

  if (error || !data) return null;

  if (new Date(data.expires_at).getTime() <= Date.now()) {
    await supabase.from('sessions').delete().eq('id', data.id);
    return null;
  }

  return {
    sessionId: data.id,
    user: Array.isArray(data.users) ? data.users[0] : data.users
  };
}

export async function destroySession(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    const supabase = getSupabaseAdmin();
    await supabase.from('sessions').delete().eq('token_hash', hashSessionToken(token));
  }

  clearSessionCookie(res);
}
