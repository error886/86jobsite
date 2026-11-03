/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import 'dotenv/config';

// Walking routes from TMAP (SK open API, pedestrian route guide). The app key stays on the server.
// TMAP's terms forbid using its results for more than 24 hours, so the cache expires well before that.
const TMAP_APP_KEY = process.env.TMAP_APP_KEY || '';
const TMAP_URL = 'https://apis.openapi.sk.com/tmap/routes/pedestrian?version=1&format=json';
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const CACHE_MAX = 2000;
const WALK_SPEED_KMH = 4.5;

export interface WalkRoute {
  /** 'tmap' is a real walking route; 'straight' is the straight line with an estimated time. */
  source: 'tmap' | 'straight';
  coordinates: [number, number][]; // [lat, lng]
  distanceMeters: number;
  durationSeconds: number;
}

const cache = new Map<string, { at: number; route: WalkRoute }>();

export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function straightRoute(lat1: number, lng1: number, lat2: number, lng2: number): WalkRoute {
  const distanceMeters = haversineMeters(lat1, lng1, lat2, lng2);
  return {
    source: 'straight',
    coordinates: [[lat1, lng1], [lat2, lng2]],
    distanceMeters,
    durationSeconds: Math.round((distanceMeters / 1000 / WALK_SPEED_KMH) * 3600)
  };
}

export function isTmapConfigured(): boolean {
  return TMAP_APP_KEY !== '';
}

/** A real walking route when TMAP answers, otherwise the straight line. Never throws. */
export async function getWalkRoute(lat1: number, lng1: number, lat2: number, lng2: number): Promise<WalkRoute> {
  // ~11 m grid: nearby requests share a cache entry
  const key = [lat1, lng1, lat2, lng2].map(n => n.toFixed(4)).join(',');
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.route;

  // Over ~30 km nobody walks; TMAP also rejects very long pedestrian routes
  if (!TMAP_APP_KEY || haversineMeters(lat1, lng1, lat2, lng2) > 30000) {
    return straightRoute(lat1, lng1, lat2, lng2);
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(TMAP_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { appKey: TMAP_APP_KEY, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        startX: String(lng1), startY: String(lat1),
        endX: String(lng2), endY: String(lat2),
        reqCoordType: 'WGS84GEO', resCoordType: 'WGS84GEO',
        startName: 'start', endName: 'end'
      })
    });
    clearTimeout(timeout);

    if (!res.ok) {
      console.warn(`[Route] TMAP pedestrian route failed: HTTP ${res.status}`);
      return straightRoute(lat1, lng1, lat2, lng2);
    }

    const data: any = await res.json();
    const features: any[] = data?.features || [];
    const summary = features.find(f => f?.properties?.totalDistance !== undefined)?.properties;
    const coordinates: [number, number][] = [];
    for (const f of features) {
      if (f?.geometry?.type !== 'LineString') continue;
      for (const [lng, lat] of f.geometry.coordinates as [number, number][]) {
        const last = coordinates[coordinates.length - 1];
        if (!last || last[0] !== lat || last[1] !== lng) coordinates.push([lat, lng]);
      }
    }

    if (!summary || coordinates.length < 2) {
      return straightRoute(lat1, lng1, lat2, lng2);
    }

    const route: WalkRoute = {
      source: 'tmap',
      coordinates,
      distanceMeters: Number(summary.totalDistance),
      durationSeconds: Number(summary.totalTime)
    };

    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
    cache.set(key, { at: Date.now(), route });
    return route;
  } catch (err: any) {
    console.warn('[Route] TMAP pedestrian route error:', err?.message || err);
    return straightRoute(lat1, lng1, lat2, lng2);
  }
}
