/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Job } from '../types';
import { ExternalLink, Copy, Check, X, RefreshCw } from 'lucide-react';
import { fetchWalkingRoute } from '../utils/geo';
import { formatKRWShort, isUnderMinimum } from '../utils/wage';

declare global {
  interface Window {
    kakao: any;
  }
}

interface MapContainerProps {
  jobs: Job[];
  selectedJob: Job | null;
  onSelectJob: (job: Job) => void;
  userLocation?: { lat: number; lng: number } | null;
  /** Increment to move the map to the user's location (once it is known). */
  locateTick?: number;
  /** Pixels at the bottom covered by a sheet; pins are fitted and centred above it. */
  bottomInset?: number;
  /** Pixels at the right covered by a side panel (the job detail on desktop). */
  rightInset?: number;
}

// Kakao JS key: baked in at build time when available, otherwise read from the server at runtime
const BUILD_KAKAO_MAP_KEY: string = (import.meta as any).env?.VITE_KAKAO_MAP_KEY || '';
let KAKAO_MAP_KEY = BUILD_KAKAO_MAP_KEY;

async function resolveKakaoKey(): Promise<string> {
  if (KAKAO_MAP_KEY) return KAKAO_MAP_KEY;
  try {
    const res = await fetch('/api/config');
    if (res.ok) KAKAO_MAP_KEY = (await res.json()).kakaoMapKey || '';
  } catch {
    // offline or no server: the Leaflet fallback takes over
  }
  return KAKAO_MAP_KEY;
}

// Kakao zoom levels run the other way from Leaflet: 1 is street level, 14 is the whole country
const KAKAO_LEVEL_NEIGHBORHOOD = 4;
// Space kept clear above the pins for the floating search and chip rows on a phone
const TOP_INSET_PHONE = 116;
const SIDE_INSET = 40;
// The map shows about this far in every direction (around the user, or the busiest job area)
const VIEW_RADIUS_M = 500;
const KAKAO_LEVEL_START = 5;
// Seoul City Hall: only used for the first frame, before the jobs or the position are known
const DEFAULT_CENTER: [number, number] = [37.5665, 126.978];

/** The job with the most other jobs within 2 km: where the first screen shows the most pins up close. */
function busiestSpot(jobs: Job[]): [number, number] {
  let best = jobs[0];
  let bestCount = -1;
  for (const a of jobs) {
    let count = 0;
    for (const b of jobs) {
      const dLat = (a.latitude - b.latitude) * 111.32;
      const dLng = (a.longitude - b.longitude) * 111.32 * Math.cos((a.latitude * Math.PI) / 180);
      if (dLat * dLat + dLng * dLng <= 4) count++;
    }
    if (count > bestCount) { best = a; bestCount = count; }
  }
  return [best.latitude, best.longitude];
}

// ----------------------------------------------------
// MARKER HTML (shared by Kakao and Leaflet). Styled in index.css (.job-pin).
// ----------------------------------------------------
function jobPinElement(job: Job, onClick: () => void): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'job-pin num';
  if (isUnderMinimum(job)) el.dataset.under = 'true';
  el.setAttribute('aria-label', `${job.title}, ${job.salary.toLocaleString('vi-VN')} won ${job.salaryType === 'Monthly' ? 'mỗi tháng' : 'mỗi giờ'}`);
  el.textContent = formatKRWShort(job.salary);
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

// Pins closer than this on screen merge into one "N việc" pin
const CLUSTER_RADIUS_PX = 52;

function clusterPinElement(count: number, onClick: () => void): HTMLElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'job-pin job-pin-cluster num';
  el.setAttribute('aria-label', `${count} việc ở khu vực này, phóng to để xem`);
  el.textContent = `${count} việc`;
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return el;
}

const USER_MARKER_HTML = `<span class="user-dot" aria-hidden="true"></span>`;

/** Loads the Kakao Maps JS SDK once. Resolves false if the key is missing, the domain is not registered or the network blocks it. */
let kakaoLoadPromise: Promise<boolean> | null = null;
function loadKakaoSdk(): Promise<boolean> {
  if (window.kakao?.maps?.Map) return Promise.resolve(true);
  if (kakaoLoadPromise) return kakaoLoadPromise;

  kakaoLoadPromise = resolveKakaoKey().then(key => !key ? false : new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => resolve(false), 6000);
    const script = document.createElement('script');
    script.id = 'kakao-map-sdk';
    script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(KAKAO_MAP_KEY)}&autoload=false`;
    script.async = true;
    script.onload = () => {
      if (!window.kakao?.maps?.load) {
        clearTimeout(timeout);
        resolve(false);
        return;
      }
      window.kakao.maps.load(() => {
        clearTimeout(timeout);
        resolve(Boolean(window.kakao.maps.Map));
      });
    };
    script.onerror = () => {
      clearTimeout(timeout);
      resolve(false);
    };
    document.head.appendChild(script);
  }));

  return kakaoLoadPromise;
}

export default function MapContainer({
  jobs,
  selectedJob,
  onSelectJob,
  userLocation = null,
  locateTick = 0,
  bottomInset = 0,
  rightInset = 0
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Map engine: Kakao Map is primary, Leaflet + OpenStreetMap is the fallback
  const [mapEngine, setMapEngine] = useState<'loading' | 'kakao' | 'leaflet'>('loading');
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [copiedDomain, setCopiedDomain] = useState(false);

  const leafletMapRef = useRef<L.Map | null>(null);
  const kakaoMapRef = useRef<any>(null);

  // One pin element per job, and the engine's overlay for it
  const pinElsRef = useRef<Record<string, HTMLElement>>({});
  const kakaoPinsRef = useRef<Record<string, any>>({});
  const leafletPinsRef = useRef<Record<string, L.Marker>>({});

  const kakaoUserRef = useRef<any>(null);
  const leafletUserRef = useRef<L.Marker | null>(null);
  const kakaoRouteRef = useRef<any[]>([]);
  const placedRef = useRef<Job[]>([]);
  const kakaoClustersRef = useRef<any[]>([]);
  const leafletClustersRef = useRef<L.Marker[]>([]);
  const selectedIdRef = useRef<string | null>(null);
  selectedIdRef.current = selectedJob?.id ?? null;
  const reclusterRef = useRef<() => void>(() => {});
  const leafletRouteRef = useRef<L.Layer[]>([]);

  // Latest values for handlers created once
  const onSelectRef = useRef(onSelectJob);
  onSelectRef.current = onSelectJob;
  const insetRef = useRef(bottomInset);
  insetRef.current = bottomInset;
  const rightInsetRef = useRef(rightInset);
  rightInsetRef.current = rightInset;

  const isPhone = () => typeof window !== 'undefined' && window.innerWidth < 1024;
  const topInset = () => (isPhone() ? TOP_INSET_PHONE : SIDE_INSET);

  /** Centre a point in the part of the map the sheet leaves visible. */
  const focusPoint = (lat: number, lng: number) => {
    const shift = Math.round((insetRef.current - (isPhone() ? TOP_INSET_PHONE : 0)) / 2);
    const shiftX = Math.round(rightInsetRef.current / 2);
    if (mapEngine === 'kakao' && kakaoMapRef.current) {
      const map = kakaoMapRef.current;
      if (map.getLevel() > KAKAO_LEVEL_NEIGHBORHOOD) map.setLevel(KAKAO_LEVEL_NEIGHBORHOOD);
      map.setCenter(new window.kakao.maps.LatLng(lat, lng));
      if (shift || shiftX) map.panBy(shiftX, shift);
    } else if (mapEngine === 'leaflet' && leafletMapRef.current) {
      const map = leafletMapRef.current;
      map.setView([lat, lng], Math.max(map.getZoom(), 14), { animate: false });
      if (shift || shiftX) map.panBy([shiftX, shift], { animate: false });
    }
  };

  /** Fit points into the part of the map the sheet and the search rows leave visible. */
  const fitPoints = (points: [number, number][], maxZoom = 14) => {
    if (points.length === 0) return;
    if (mapEngine === 'kakao' && kakaoMapRef.current) {
      const kakao = window.kakao;
      const bounds = new kakao.maps.LatLngBounds();
      points.forEach(([lat, lng]) => bounds.extend(new kakao.maps.LatLng(lat, lng)));
      kakaoMapRef.current.setBounds(bounds, topInset(), SIDE_INSET + rightInsetRef.current, insetRef.current + SIDE_INSET, SIDE_INSET);
    } else if (mapEngine === 'leaflet' && leafletMapRef.current) {
      leafletMapRef.current.fitBounds(L.latLngBounds(points), {
        paddingTopLeft: [SIDE_INSET, topInset()],
        paddingBottomRight: [SIDE_INSET + rightInsetRef.current, insetRef.current + SIDE_INSET],
        maxZoom
      });
    }
  };

  /** About VIEW_RADIUS_M in every direction around a point, the way map apps open on "near me". */
  const fitAround = (lat: number, lng: number) => {
    const dLat = VIEW_RADIUS_M / 111320;
    const dLng = VIEW_RADIUS_M / (111320 * Math.cos((lat * Math.PI) / 180));
    fitPoints([[lat - dLat, lng - dLng], [lat + dLat, lng + dLng]], 16);
  };

  // The map always shows about 500 m: around the user once their position is known, otherwise
  // around the busiest spot for jobs. It never zooms out to the whole country on its own, and
  // filters keep the area in view (like a map app), so only these two events move it.
  const viewRef = useRef<{ kind: 'none' | 'jobs' | 'user'; lat: number; lng: number }>({ kind: 'none', lat: 0, lng: 0 });
  const setView = (kind: 'jobs' | 'user', lat: number, lng: number) => {
    viewRef.current = { kind, lat, lng };
    fitAround(lat, lng);
  };
  const refitView = () => {
    const v = viewRef.current;
    if (v.kind !== 'none') fitAround(v.lat, v.lng);
  };

  // 1. Load Kakao Map, fall back to Leaflet if it is unavailable
  useEffect(() => {
    let active = true;
    loadKakaoSdk().then((loaded) => {
      if (!active) return;
      if (!loaded) {
        console.warn('Kakao Map unavailable (missing key, unregistered domain or blocked), falling back to OpenStreetMap Leaflet');
      }
      setMapEngine(loaded ? 'kakao' : 'leaflet');
    });
    return () => {
      active = false;
    };
  }, []);

  // 2. Create the map
  useEffect(() => {
    if (mapEngine === 'loading' || !containerRef.current) return;
    const container = containerRef.current;

    if (mapEngine === 'kakao') {
      const kakao = window.kakao;
      const map = new kakao.maps.Map(container, {
        center: new kakao.maps.LatLng(DEFAULT_CENTER[0], DEFAULT_CENTER[1]),
        level: KAKAO_LEVEL_START
      });
      // Phones zoom with two fingers; the control would sit under the chip row
      if (!isPhone()) map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.BOTTOMRIGHT);
      kakaoMapRef.current = map;
      const onIdle = () => reclusterRef.current();
      kakao.maps.event.addListener(map, 'idle', onIdle);
      return () => {
        kakao.maps.event.removeListener(map, 'idle', onIdle);
        kakaoMapRef.current = null;
        container.innerHTML = '';
      };
    }

    const map = L.map(container, { zoomControl: !isPhone(), attributionControl: true }).setView(DEFAULT_CENTER, 15);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
    map.zoomControl?.setPosition('bottomright');
    map.on('moveend', () => reclusterRef.current());
    leafletMapRef.current = map;
    return () => {
      map.remove();
      leafletMapRef.current = null;
    };
  }, [mapEngine]);

  // 3. Pins for the jobs on screen, fitted into the visible part of the map
  useEffect(() => {
    if (mapEngine === 'loading') return;

    Object.values(kakaoPinsRef.current).forEach((o: any) => o.setMap(null));
    Object.values(leafletPinsRef.current).forEach((m) => (m as L.Marker).remove());
    kakaoPinsRef.current = {};
    leafletPinsRef.current = {};
    pinElsRef.current = {};

    const placed = jobs.filter(j => j.latitude && j.longitude);
    placedRef.current = placed;
    placed.forEach(job => {
      pinElsRef.current[job.id] = jobPinElement(job, () => onSelectRef.current(job));
    });

    if (mapEngine === 'kakao' && kakaoMapRef.current) {
      const kakao = window.kakao;
      const map = kakaoMapRef.current;
      placed.forEach(job => {
        const position = new kakao.maps.LatLng(job.latitude, job.longitude);
        const overlay = new kakao.maps.CustomOverlay({
          position,
          content: pinElsRef.current[job.id],
          xAnchor: 0.5,
          yAnchor: 1,
          clickable: true,
          zIndex: 10
        });
        overlay.setMap(map);
        kakaoPinsRef.current[job.id] = overlay;
      });
    }

    if (mapEngine === 'leaflet' && leafletMapRef.current) {
      const map = leafletMapRef.current;
      placed.forEach(job => {
        const marker = L.marker([job.latitude, job.longitude], {
          icon: L.divIcon({ html: pinElsRef.current[job.id], className: 'job-pin-wrap', iconSize: null as any })
        }).addTo(map);
        leafletPinsRef.current[job.id] = marker;
      });
    }
    // No position yet: open on the area with the most jobs, so the first screen shows pins up close.
    // When the list changes (server data replacing the bundled sample, a filter) and that area no longer
    // holds any job, move to the new busiest area; a view around the user is never moved here.
    const v = viewRef.current;
    const areaHasJobs = placed.some(j => Math.abs(j.latitude - v.lat) < 0.014 && Math.abs(j.longitude - v.lng) < 0.018);
    if (placed.length > 0 && (v.kind === 'none' || (v.kind === 'jobs' && !areaHasJobs))) {
      const [lat, lng] = busiestSpot(placed);
      setView('jobs', lat, lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [jobs, mapEngine]);

  // Refit once the sheet's height settles (it is measured after the first fit), unless a job is open
  useEffect(() => {
    if (selectedIdRef.current) return;
    const t = setTimeout(refitView, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bottomInset]);

  // Merge pins that overlap on screen. The selected job always keeps its own pin.
  reclusterRef.current = () => {
    kakaoClustersRef.current.forEach(o => o.setMap(null));
    kakaoClustersRef.current = [];
    leafletClustersRef.current.forEach(m => m.remove());
    leafletClustersRef.current = [];

    const kakaoMap = mapEngine === 'kakao' ? kakaoMapRef.current : null;
    const leafletMap = mapEngine === 'leaflet' ? leafletMapRef.current : null;
    if (!kakaoMap && !leafletMap) return;

    const project = (job: Job): { x: number; y: number } => {
      if (kakaoMap) {
        const pt = kakaoMap.getProjection().containerPointFromCoords(new window.kakao.maps.LatLng(job.latitude, job.longitude));
        return { x: pt.x, y: pt.y };
      }
      const pt = leafletMap!.latLngToContainerPoint([job.latitude, job.longitude]);
      return { x: pt.x, y: pt.y };
    };

    const items = placedRef.current.map(job => ({ job, p: project(job), taken: false }));
    const groups: Job[][] = [];
    items.forEach((item, i) => {
      if (item.taken) return;
      item.taken = true;
      const group = [item.job];
      if (item.job.id !== selectedIdRef.current) {
        for (let k = i + 1; k < items.length; k++) {
          const other = items[k];
          if (other.taken || other.job.id === selectedIdRef.current) continue;
          if (Math.hypot(other.p.x - item.p.x, other.p.y - item.p.y) < CLUSTER_RADIUS_PX) {
            other.taken = true;
            group.push(other.job);
          }
        }
      }
      groups.push(group);
    });

    groups.forEach(group => {
      const single = group.length === 1;
      group.forEach(job => {
        if (kakaoMap) kakaoPinsRef.current[job.id]?.setMap(single ? kakaoMap : null);
        if (leafletMap) {
          const m = leafletPinsRef.current[job.id];
          if (m) {
            if (single && !leafletMap.hasLayer(m)) m.addTo(leafletMap);
            if (!single && leafletMap.hasLayer(m)) m.remove();
          }
        }
      });
      if (single) return;

      const lat = group.reduce((sum, j) => sum + j.latitude, 0) / group.length;
      const lng = group.reduce((sum, j) => sum + j.longitude, 0) / group.length;
      const zoomIn = () => {
        if (kakaoMap) {
          const target = new window.kakao.maps.LatLng(lat, lng);
          kakaoMap.setLevel(Math.max(1, kakaoMap.getLevel() - 2), { anchor: target });
        } else if (leafletMap) {
          leafletMap.setView([lat, lng], leafletMap.getZoom() + 2);
        }
      };
      const el = clusterPinElement(group.length, zoomIn);
      if (kakaoMap) {
        const overlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(lat, lng),
          content: el,
          xAnchor: 0.5,
          yAnchor: 1,
          clickable: true,
          zIndex: 15
        });
        overlay.setMap(kakaoMap);
        kakaoClustersRef.current.push(overlay);
      } else if (leafletMap) {
        leafletClustersRef.current.push(
          L.marker([lat, lng], { icon: L.divIcon({ html: el, className: 'job-pin-wrap', iconSize: null as any }) }).addTo(leafletMap)
        );
      }
    });
  };

  // 4. Mark the selected pin and bring it into view
  useEffect(() => {
    (Object.entries(pinElsRef.current) as [string, HTMLElement][]).forEach(([id, el]) => {
      const selected = id === selectedJob?.id;
      el.dataset.selected = selected ? 'true' : 'false';
      kakaoPinsRef.current[id]?.setZIndex(selected ? 100 : 10);
      leafletPinsRef.current[id]?.setZIndexOffset(selected ? 1000 : 0);
    });
    if (selectedJob) focusPoint(selectedJob.latitude, selectedJob.longitude);
    reclusterRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedJob, mapEngine, jobs]);

  // 5. The user's position
  useEffect(() => {
    if (kakaoUserRef.current) { kakaoUserRef.current.setMap(null); kakaoUserRef.current = null; }
    if (leafletUserRef.current) { leafletUserRef.current.remove(); leafletUserRef.current = null; }
    if (!userLocation) return;

    if (mapEngine === 'kakao' && kakaoMapRef.current) {
      const overlay = new window.kakao.maps.CustomOverlay({
        position: new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng),
        content: USER_MARKER_HTML,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 20
      });
      overlay.setMap(kakaoMapRef.current);
      kakaoUserRef.current = overlay;
    } else if (mapEngine === 'leaflet' && leafletMapRef.current) {
      leafletUserRef.current = L.marker([userLocation.lat, userLocation.lng], {
        icon: L.divIcon({ html: USER_MARKER_HTML, className: 'user-dot-wrap', iconSize: [18, 18], iconAnchor: [9, 9] }),
        interactive: false
      }).addTo(leafletMapRef.current);
    }
  }, [userLocation, mapEngine]);

  // 5b. First known position: open the map about 1 km around it (unless a job is already open)
  useEffect(() => {
    if (viewRef.current.kind === 'user' || !userLocation || mapEngine === 'loading' || selectedIdRef.current) return;
    setView('user', userLocation.lat, userLocation.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userLocation, mapEngine]);

  // 6. "Về vị trí của tôi": move once the position is known
  const handledTickRef = useRef(0);
  useEffect(() => {
    if (locateTick > handledTickRef.current && userLocation && mapEngine !== 'loading') {
      handledTickRef.current = locateTick;
      setView('user', userLocation.lat, userLocation.lng);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locateTick, userLocation, mapEngine]);

  // 7. Walking route from the user's real position to the selected job (none without GPS)
  useEffect(() => {
    let isMounted = true;
    const clear = () => {
      kakaoRouteRef.current.forEach(o => o.setMap(null));
      kakaoRouteRef.current = [];
      leafletRouteRef.current.forEach(l => l.remove());
      leafletRouteRef.current = [];
    };
    clear();
    if (!selectedJob || !userLocation || mapEngine === 'loading') return;

    fetchWalkingRoute(userLocation.lat, userLocation.lng, selectedJob.latitude, selectedJob.longitude).then((route) => {
      if (!isMounted) return;
      const straight = route.source === 'straight';

      if (mapEngine === 'kakao' && kakaoMapRef.current) {
        const kakao = window.kakao;
        const path = route.coordinates.map(([lat, lng]) => new kakao.maps.LatLng(lat, lng));
        const overlays = [
          ...(straight ? [] : [new kakao.maps.Polyline({ path, strokeWeight: 10, strokeColor: '#1e3a8a', strokeOpacity: 1, strokeStyle: 'solid', zIndex: 5 })]),
          new kakao.maps.Polyline({ path, strokeWeight: straight ? 4 : 6, strokeColor: '#2563eb', strokeOpacity: 1, strokeStyle: straight ? 'shortdash' : 'solid', zIndex: 6 })
        ];
        overlays.forEach(o => o.setMap(kakaoMapRef.current));
        kakaoRouteRef.current = overlays;
      }

      if (mapEngine === 'leaflet' && leafletMapRef.current) {
        const map = leafletMapRef.current;
        const layers: L.Layer[] = [
          ...(straight ? [] : [L.polyline(route.coordinates, { color: '#1e3a8a', weight: 10, opacity: 0.95 })]),
          L.polyline(route.coordinates, { color: '#2563eb', weight: straight ? 4 : 6, opacity: 1, dashArray: straight ? '8 8' : undefined })
        ];
        layers.forEach(l => l.addTo(map));
        leafletRouteRef.current = layers;
      }

      // Show the whole way from you to the job in the part of the map above the card.
      // The walk time is in the card, not on the map, so nothing covers the pins.
      fitPoints(route.coordinates, 17);
    });

    return () => {
      isMounted = false;
      clear();
    };
  }, [userLocation, selectedJob, mapEngine]);

  // 8. Keep the map sized to its box
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (mapEngine === 'leaflet') leafletMapRef.current?.invalidateSize();
      if (mapEngine === 'kakao') kakaoMapRef.current?.relayout();
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [mapEngine]);

  return (
    <div className="relative w-full h-full bg-raised">
      {mapEngine === 'loading' && (
        <div className="absolute inset-0 z-[500] flex items-center justify-center">
          <p className="text-sm text-muted">Đang tải bản đồ…</p>
        </div>
      )}

      <div ref={containerRef} className="w-full h-full z-0" id="map-container" />

      {/* Fallback notice: why the Kakao map is not showing */}
      {mapEngine === 'leaflet' && (
        <button
          type="button"
          onClick={() => setShowConfigModal(true)}
          className="hidden lg:inline-flex absolute left-4 bottom-8 z-[400] h-8 px-3 items-center rounded-md bg-surface border border-line text-xs text-ink hover:bg-ground cursor-pointer"
        >
          Bản đồ dự phòng · vì sao?
        </button>
      )}

      {showConfigModal && (
        <div className="absolute inset-0 z-[999] flex items-center justify-center p-4 bg-black/40">
          <div role="dialog" aria-modal="true" aria-labelledby="kakao-guide-title" className="bg-surface rounded-lg max-w-md w-full p-5 space-y-4 shadow-[0_8px_32px_rgba(0,0,0,0.18)]">
            <div className="flex justify-between items-start">
              <div>
                <h3 id="kakao-guide-title" className="text-base font-medium text-ink">Chưa tải được Kakao Map</h3>
                <p className="text-sm text-muted mt-0.5">Đang dùng bản đồ dự phòng OpenStreetMap.</p>
              </div>
              <button type="button" onClick={() => setShowConfigModal(false)} aria-label="Đóng" className="w-9 h-9 -mr-2 flex items-center justify-center rounded-md text-muted hover:text-ink hover:bg-raised cursor-pointer">
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            <p className="text-sm text-ink">
              {KAKAO_MAP_KEY
                ? 'Domain này chưa được đăng ký cho JavaScript key trên Kakao Developers. Thêm domain bên dưới rồi tải lại trang.'
                : 'Thêm JavaScript key của ứng dụng Kakao vào biến môi trường VITE_KAKAO_MAP_KEY rồi build lại.'}
            </p>

            <div className="flex items-center gap-2 rounded-md bg-ground p-2 justify-between">
              <code className="text-sm text-ink break-all">{window.location.origin}</code>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(window.location.origin);
                  setCopiedDomain(true);
                  setTimeout(() => setCopiedDomain(false), 2000);
                }}
                aria-label="Sao chép domain"
                className="w-8 h-8 flex-none flex items-center justify-center rounded text-muted hover:text-ink hover:bg-raised cursor-pointer"
              >
                {copiedDomain ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>

            <ol className="list-decimal pl-5 space-y-1 text-sm text-ink">
              <li>
                Mở <a href="https://developers.kakao.com/console/app" target="_blank" rel="noreferrer" className="underline underline-offset-4 inline-flex items-center gap-0.5">Kakao Developers <ExternalLink className="w-3 h-3" /></a> và chọn ứng dụng.
              </li>
              <li>Vào Platform key → JavaScript key → JavaScript SDK domain, thêm domain ở trên.</li>
              <li>Kiểm tra sản phẩm Kakao Map đang bật.</li>
            </ol>

            <button
              type="button"
              onClick={() => window.location.reload()}
              className="w-full h-10 rounded-md bg-primary text-white text-sm font-medium inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" strokeWidth={1.75} />
              Tải lại trang
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
