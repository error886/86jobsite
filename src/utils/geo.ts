/**
 * Distance & Geolocation helpers for 86Job
 */

/**
 * Calculates straight-line distance in kilometers between two GPS coordinates using the Haversine formula.
 */
export function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 0;
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const dist = R * c;
  return Math.round(dist * 10) / 10;
}

/**
 * Formats distance into human readable string
 */
export function formatDistance(distanceKm: number): string {
  if (!distanceKm || distanceKm <= 0) return 'Gần bạn';
  if (distanceKm < 1) {
    return `${Math.round(distanceKm * 1000)} m`;
  }
  return `${distanceKm.toLocaleString('vi-VN', { maximumFractionDigits: 1 })} km`;
}

export interface RouteInfo {
  /** 'tmap': a real walking route. 'straight': the straight line with a time estimated at 4.5 km/h. */
  source: 'tmap' | 'straight';
  coordinates: [number, number][]; // [lat, lng] array
  durationSeconds: number;
  distanceMeters: number;
  midpoint: [number, number]; // [lat, lng]
}

function withMidpoint(route: Omit<RouteInfo, 'midpoint'>): RouteInfo {
  const coords = route.coordinates;
  const mid = coords[Math.floor(coords.length / 2)];
  const midpoint: [number, number] = coords.length > 2
    ? mid
    : [(coords[0][0] + coords[coords.length - 1][0]) / 2, (coords[0][1] + coords[coords.length - 1][1]) / 2];
  return { ...route, midpoint };
}

/**
 * Walking route from the server (TMAP pedestrian routes). When the server cannot reach TMAP it
 * answers with the straight line; when the server itself is unreachable we draw that line here.
 * A route is never invented.
 */
export async function fetchWalkingRoute(
  startLat: number,
  startLng: number,
  endLat: number,
  endLng: number
): Promise<RouteInfo> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 7000);
    const res = await fetch(`/api/route/walk?from=${startLat},${startLng}&to=${endLat},${endLng}`, { signal: controller.signal });
    clearTimeout(timeoutId);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.coordinates) && data.coordinates.length >= 2) {
        return withMidpoint(data);
      }
    }
  } catch (err) {
    console.warn('Walking route unavailable, drawing the straight line:', err);
  }

  const distanceMeters = calculateDistanceKm(startLat, startLng, endLat, endLng) * 1000;
  return withMidpoint({
    source: 'straight',
    coordinates: [[startLat, startLng], [endLat, endLng]],
    distanceMeters,
    durationSeconds: Math.round((distanceMeters / 1000 / 4.5) * 3600)
  });
}

/**
 * Directions links into the map apps (Naver, Kakao, Google)
 */
/**
 * A place name safe to put in a map app's link path. Kakao answers 502 when the name holds a "/"
 * (even encoded as %2F) and splits fields on ","; job titles often contain both
 * ("Phục vụ quán nướng / 홀서빙").
 */
function linkName(name: string): string {
  const clean = name.replace(/[\/,|#?%]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  return encodeURIComponent(clean || '86Job');
}

export function getNaverMapDirectionUrl(
  jobLat: number,
  jobLng: number,
  jobTitle: string,
  userLat?: number,
  userLng?: number
): string {
  if (userLat && userLng) {
    return `https://map.naver.com/v5/directions/${userLng},${userLat},${linkName('Vị trí của tôi')}/${jobLng},${jobLat},${linkName(jobTitle)}/-/walk`;
  }
  return `https://map.naver.com/v5/search/${linkName(jobTitle)}?c=${jobLng},${jobLat},17,0,0,0,dh`;
}

/**
 * Kakao Map: the walking route from the user's position, or the place alone without one
 */
export function getKakaoMapDirectionUrl(
  jobLat: number,
  jobLng: number,
  jobTitle: string,
  userLat?: number,
  userLng?: number
): string {
  if (userLat && userLng) {
    return `https://map.kakao.com/link/by/walk/${linkName('Vị trí của tôi')},${userLat},${userLng}/${linkName(jobTitle)},${jobLat},${jobLng}`;
  }
  return `https://map.kakao.com/link/to/${linkName(jobTitle)},${jobLat},${jobLng}`;
}

/**
 * Google Maps Directions URL
 */
export function getGoogleMapDirectionUrl(
  jobLat: number,
  jobLng: number,
  jobTitle: string,
  userLat?: number,
  userLng?: number
): string {
  if (userLat && userLng) {
    return `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${jobLat},${jobLng}&travelmode=walking`;
  }
  return `https://www.google.com/maps/search/?api=1&query=${jobLat},${jobLng}`;
}
