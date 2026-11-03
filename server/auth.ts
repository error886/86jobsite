/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';
import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import firebaseConfig from '../firebase-applet-config.json';

// Firebase ID tokens are RS256 JWTs signed by Google. We verify them with
// Node's crypto against Google's published certificates, so the server does
// not need a service account or the firebase-admin SDK.
const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId;
const CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

if (ADMIN_EMAILS.length === 0) {
  console.warn('[Auth] ADMIN_EMAILS is empty. No account will have admin access.');
}

export interface AuthUser {
  uid: string;
  email: string;
  isAdmin: boolean;
}

let certCache: { keys: Record<string, crypto.KeyObject>; expiresAt: number } | null = null;

async function getGoogleKeys(): Promise<Record<string, crypto.KeyObject>> {
  if (certCache && certCache.expiresAt > Date.now()) {
    return certCache.keys;
  }

  const res = await fetch(CERTS_URL);
  if (!res.ok) {
    throw new Error(`Không tải được chứng chỉ Google (${res.status})`);
  }
  const pems = (await res.json()) as Record<string, string>;
  const keys: Record<string, crypto.KeyObject> = {};
  for (const [kid, pem] of Object.entries(pems)) {
    keys[kid] = new crypto.X509Certificate(pem).publicKey;
  }

  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get('cache-control') || '')?.[1] || 3600);
  certCache = { keys, expiresAt: Date.now() + maxAge * 1000 };
  return keys;
}

function decodePart(part: string): any {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

export function isAdminEmail(email: string): boolean {
  return ADMIN_EMAILS.includes(email.toLowerCase());
}

export async function verifyIdToken(token: string): Promise<AuthUser> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token không hợp lệ');

  const [headerB64, payloadB64, signatureB64] = parts;
  const header = decodePart(headerB64);
  const payload = decodePart(payloadB64);

  if (header.alg !== 'RS256' || !header.kid) throw new Error('Thuật toán token không hợp lệ');

  let keys = await getGoogleKeys();
  if (!keys[header.kid]) {
    // Google rotates keys; refresh once before rejecting.
    certCache = null;
    keys = await getGoogleKeys();
  }
  const key = keys[header.kid];
  if (!key) throw new Error('Không tìm thấy khóa ký token');

  const validSignature = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    key,
    Buffer.from(signatureB64, 'base64url')
  );
  if (!validSignature) throw new Error('Chữ ký token không hợp lệ');

  const now = Math.floor(Date.now() / 1000);
  if (payload.aud !== PROJECT_ID) throw new Error('Token không thuộc dự án này');
  if (payload.iss !== `https://securetoken.google.com/${PROJECT_ID}`) throw new Error('Nguồn phát hành token không hợp lệ');
  if (typeof payload.exp !== 'number' || payload.exp <= now) throw new Error('Phiên đăng nhập đã hết hạn');
  if (typeof payload.iat !== 'number' || payload.iat > now + 60) throw new Error('Thời điểm phát hành token không hợp lệ');
  if (!payload.sub || typeof payload.sub !== 'string') throw new Error('Token thiếu thông tin người dùng');

  const email = String(payload.email || '').toLowerCase();
  return {
    uid: payload.sub,
    email,
    // Only verified emails (e.g. Google sign-in) can carry admin rights.
    isAdmin: payload.email_verified === true && email !== '' && isAdminEmail(email)
  };
}

// Local test accounts, accepted only on a development server with DEV_AUTH=1 in .env.
// A production server (NODE_ENV=production) never accepts them, whatever DEV_AUTH says.
export const DEV_AUTH_ENABLED = process.env.NODE_ENV !== 'production' && process.env.DEV_AUTH === '1';
const DEV_TEST_USERS: Record<string, AuthUser> = {
  'dev-test-admin': { uid: 'dev-test-admin', email: 'admin@86job.test', isAdmin: true },
  'dev-test-user': { uid: 'dev-test-user', email: 'user@86job.test', isAdmin: false }
};

if (DEV_AUTH_ENABLED) {
  console.warn('[Auth] DEV_AUTH=1: local test accounts admin@86job.test and user@86job.test are enabled.');
}

/** Reads the Bearer token if present and stores the user in res.locals.authUser. */
export async function attachUser(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return next();
  const token = header.slice('Bearer '.length).trim();

  if (DEV_AUTH_ENABLED && DEV_TEST_USERS[token]) {
    res.locals.authUser = DEV_TEST_USERS[token];
    return next();
  }

  try {
    res.locals.authUser = await verifyIdToken(token);
    next();
  } catch (err: any) {
    res.status(401).json({ error: err.message || 'Phiên đăng nhập không hợp lệ' });
  }
}

export function getAuthUser(res: Response): AuthUser | undefined {
  return res.locals.authUser;
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!getAuthUser(res)) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập để thực hiện thao tác này' });
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = getAuthUser(res);
  if (!user) {
    return res.status(401).json({ error: 'Vui lòng đăng nhập để thực hiện thao tác này' });
  }
  if (!user.isAdmin) {
    return res.status(403).json({ error: 'Bạn không có quyền quản trị' });
  }
  next();
}

/** Simple in-memory limiter, keyed by user id (or IP for guests). */
export function rateLimit(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = getAuthUser(res)?.uid || req.ip || 'unknown';
    const now = Date.now();
    const recent = (hits.get(key) || []).filter(t => now - t < windowMs);
    if (recent.length >= max) {
      return res.status(429).json({ error: 'Bạn thao tác quá nhiều lần. Vui lòng thử lại sau ít phút.' });
    }
    recent.push(now);
    hits.set(key, recent);
    next();
  };
}
