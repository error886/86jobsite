/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from './firebase';
import { User } from '../types';

// Local test accounts (development server with DEV_AUTH=1 only; the server rejects them otherwise)
const DEV_TOKEN_KEY = '86job_dev_token';
const IS_DEV: boolean = Boolean((import.meta as any).env?.DEV);
export type DevTestAccount = 'dev-test-admin' | 'dev-test-user';

export const DEV_TEST_PROFILES: Record<DevTestAccount, Omit<User, 'role'>> = {
  'dev-test-admin': { id: 'dev-test-admin', name: 'Admin test', email: 'admin@86job.test', avatar: '', createdAt: '2026-01-01T00:00:00.000Z' },
  'dev-test-user': { id: 'dev-test-user', name: 'Du học sinh test', email: 'user@86job.test', avatar: '', createdAt: '2026-01-01T00:00:00.000Z' }
};

export function getDevToken(): DevTestAccount | null {
  if (!IS_DEV) return null;
  try {
    const t = localStorage.getItem(DEV_TOKEN_KEY);
    return t === 'dev-test-admin' || t === 'dev-test-user' ? t : null;
  } catch {
    return null;
  }
}

export function setDevToken(token: DevTestAccount | null) {
  try {
    if (token) localStorage.setItem(DEV_TOKEN_KEY, token);
    else localStorage.removeItem(DEV_TOKEN_KEY);
  } catch {
    // storage unavailable: the test session simply does not persist
  }
}

/** Whether this dev server accepts the local test accounts. Always false in a production build. */
export async function fetchDevAuthEnabled(): Promise<boolean> {
  if (!IS_DEV) return false;
  try {
    const res = await fetch('/api/auth/dev-status');
    return res.ok && (await res.json()).enabled === true;
  } catch {
    return false;
  }
}

/** fetch() that attaches the signed-in user's Firebase ID token (or the local test token) for the server to verify. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  const fbUser = auth.currentUser;
  const devToken = getDevToken();
  if (fbUser) {
    headers.set('Authorization', `Bearer ${await fbUser.getIdToken()}`);
  } else if (devToken) {
    headers.set('Authorization', `Bearer ${devToken}`);
  }
  return fetch(input, { ...init, headers });
}

/** Asks the server which role the signed-in user has. */
export async function fetchServerRole(): Promise<'user' | 'admin'> {
  try {
    const res = await apiFetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      return data.role === 'admin' ? 'admin' : 'user';
    }
  } catch (err) {
    console.warn('Could not fetch server role:', err);
  }
  return 'user';
}
