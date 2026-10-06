/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Job } from '../types';
import { Settings, ExternalLink, Copy, Check, AlertTriangle, X, RefreshCw, Navigation, Footprints, ArrowRight } from 'lucide-react';
import { fetchWalkingRoute, RouteInfo, getKakaoMapDirectionUrl } from '../utils/geo';

declare global {
  interface Window {
    kakao: any;
    naver?: any;
  }
}

interface MapContainerProps {
  jobs: Job[];
  selectedJob: Job | null;
  onSelectJob: (job: Job) => void;
  userLocation?: { lat: number; lng: number } | null;
  onLocateUser?: () => void;
  isLocatingUser?: boolean;
}

const colors: Record<string, { bg: string; border: string }> = {
  'Restaurant': { bg: '#22c55e', border: '#15803d' }, // Green
  'Cafe': { bg: '#f97316', border: '#c2410c' }, // Orange
  'Factory': { bg: '#a855f7', border: '#7e22ce' }, // Purple
  'Warehouse': { bg: '#6366f1', border: '#4338ca' }, // Indigo
  'Convenience Store': { bg: '#3b82f6', border: '#1d4ed8' }, // Blue
  'Office': { bg: '#ec4899', border: '#be185d' }, // Pink
  'Other': { bg: '#6b7280', border: '#374151' } // Gray
};

export default function MapContainer({ 
  jobs, 
  selectedJob, 
  onSelectJob,
  userLocation: propUserLocation,
  onLocateUser,
  isLocatingUser = false
}: MapContainerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Map engine selection: 'loading' | 'kakao' | 'leaflet'
  const [mapEngine, setMapEngine] = useState<'loading' | 'kakao' | 'leaflet'>('loading');

  // Kakao API App Key (JavaScript Key) Config
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [appKey, setAppKey] = useState(() => {
    return localStorage.getItem('kakao_map_app_key') || (import.meta as any).env?.VITE_KAKAO_MAP_APP_KEY || '';
  });
  const [copiedDomain, setCopiedDomain] = useState<string | null>(null);

  // Leaflet refs
  const leafletMapRef = useRef<L.Map | null>(null);
  const leafletMarkersRef = useRef<Record<string, L.Marker>>({});

  // Kakao refs
  const kakaoMapRef = useRef<any>(null);
  const kakaoOverlaysRef = useRef<any[]>([]);

  // Geolocation states & refs
  const [isLocating, setIsLocating] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (propUserLocation) {
      setUserLocation(propUserLocation);
    }
  }, [propUserLocation]);

  const leafletUserMarkerRef = useRef<L.Marker | null>(null);
  const kakaoUserOverlayRef = useRef<any>(null);

  // Route Suggestion (Kakao Style Polyline & Badges)
  const [routeInfo, setRouteInfo] = useState<RouteInfo | null>(null);
  const [isRouting, setIsRouting] = useState(false);

  // Kakao Route Overlay Refs
  const kakaoPolylineRef = useRef<any>(null);
  const kakaoCasingPolylineRef = useRef<any>(null);
  const kakaoStartOverlayRef = useRef<any>(null);
  const kakaoEndOverlayRef = useRef<any>(null);
  const kakaoBadgeOverlayRef = useRef<any>(null);
  const kakaoVertexOverlaysRef = useRef<any[]>([]);

  // Leaflet Route Overlay Refs
  const leafletPolylineRef = useRef<L.Polyline | null>(null);
  const leafletCasingPolylineRef = useRef<L.Polyline | null>(null);
  const leafletStartMarkerRef = useRef<L.Marker | null>(null);
  const leafletEndMarkerRef = useRef<L.Marker | null>(null);
  const leafletBadgeMarkerRef = useRef<L.Marker | null>(null);
  const leafletVertexMarkersRef = useRef<L.Marker[]>([]);

  // Handle auto-fit map view to frame route path, start location, and job pin
  const handleFocusRoute = () => {
    if (!selectedJob || !routeInfo) return;
    const startLoc = userLocation || {
      lat: selectedJob.latitude - 0.0055,
      lng: selectedJob.longitude - 0.0075
    };

    if (mapEngine === 'kakao' && kakaoMapRef.current && window.kakao?.maps) {
      const bounds = new window.kakao.maps.LatLngBounds();
      routeInfo.coordinates.forEach(([lat, lng]) => {
        bounds.extend(new window.kakao.maps.LatLng(lat, lng));
      });
      bounds.extend(new window.kakao.maps.LatLng(startLoc.lat, startLoc.lng));
      bounds.extend(new window.kakao.maps.LatLng(selectedJob.latitude, selectedJob.longitude));
      kakaoMapRef.current.setBounds(bounds);
    } else if (mapEngine === 'leaflet' && leafletMapRef.current && leafletPolylineRef.current) {
      const bounds = leafletPolylineRef.current.getBounds();
      bounds.extend([startLoc.lat, startLoc.lng]);
      bounds.extend([selectedJob.latitude, selectedJob.longitude]);
      leafletMapRef.current.fitBounds(bounds, {
        paddingTopLeft: [80, 80],
        paddingBottomRight: [80, 160]
      });
    }
  };

  const handleLocate = () => {
    if (!navigator.geolocation) {
      setLocationError("Trình duyệt của bạn không hỗ trợ định vị vị trí.");
      setTimeout(() => setLocationError(null), 4000);
      return;
    }

    setIsLocating(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        setUserLocation({ lat, lng });
        setIsLocating(false);

        // Move viewport to user location
        if (mapEngine === 'leaflet' && leafletMapRef.current) {
          leafletMapRef.current.setView([lat, lng], 15, {
            animate: true,
            duration: 1
          });
        } else if (mapEngine === 'kakao' && kakaoMapRef.current && window.kakao?.maps) {
          const latlng = new window.kakao.maps.LatLng(lat, lng);
          kakaoMapRef.current.panTo(latlng);
          kakaoMapRef.current.setLevel(4);
        }
      },
      (error) => {
        console.warn('Geolocation error:', error);
        setIsLocating(false);
        let errorMsg = 'Không thể lấy vị trí hiện tại của bạn.';
        if (error.code === error.PERMISSION_DENIED) {
          errorMsg = 'Quyền định vị bị từ chối. Vui lòng cấp quyền truy cập vị trí trong cài đặt trình duyệt.';
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          errorMsg = 'Không xác định được vị trí thiết bị của bạn.';
        } else if (error.code === error.TIMEOUT) {
          errorMsg = 'Yêu cầu định vị đã quá thời gian chờ.';
        }
        setLocationError(errorMsg);
        setTimeout(() => setLocationError(null), 5000);
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 0
      }
    );
  };

  // 1. Detect and Load Map Engine (Kakao Map API v2)
  useEffect(() => {
    let active = true;

    const loadEngine = async () => {
      const storedAppKey = localStorage.getItem('kakao_map_app_key');
      const envAppKey = (import.meta as any).env?.VITE_KAKAO_MAP_APP_KEY;
      const activeAppKey = (storedAppKey || envAppKey || '').trim();

      // If Kakao is already loaded and ready
      if (window.kakao && window.kakao.maps && window.kakao.maps.Map) {
        if (active) setMapEngine('kakao');
        return;
      }

      // If no Kakao key provided yet, fallback gracefully to Leaflet
      if (!activeAppKey) {
        if (active) setMapEngine('leaflet');
        return;
      }

      // Try loading Kakao Map v2 script dynamically with &autoload=false
      try {
        const scriptId = 'kakao-map-sdk';
        let script = document.getElementById(scriptId) as HTMLScriptElement;
        
        if (!script) {
          script = document.createElement('script');
          script.id = scriptId;
          script.type = 'text/javascript';
          script.src = `https://dapi.kakao.com/v2/maps/sdk.js?appkey=${encodeURIComponent(activeAppKey)}&autoload=false&libraries=services,clusterer,drawing`;
          script.async = true;
          document.head.appendChild(script);
        }

        const scriptPromise = new Promise<boolean>((resolve) => {
          const onReady = () => {
            if (window.kakao && window.kakao.maps) {
              window.kakao.maps.load(() => {
                if (window.kakao.maps.Map) {
                  resolve(true);
                } else {
                  resolve(false);
                }
              });
            } else {
              resolve(false);
            }
          };

          if (window.kakao && window.kakao.maps) {
            onReady();
          } else {
            script.onload = onReady;
            script.onerror = () => resolve(false);
          }
        });

        // 4s timeout for script load to prevent hanging on blocked connections or bad keys
        const loaded = await Promise.race([
          scriptPromise,
          new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 4000))
        ]);

        if (loaded && window.kakao && window.kakao.maps && window.kakao.maps.Map) {
          if (active) setMapEngine('kakao');
        } else {
          console.warn('Kakao map loading timed out or failed, falling back to OpenStreetMap Leaflet');
          if (active) setMapEngine('leaflet');
        }
      } catch (err) {
        console.warn('Kakao map loading error, falling back to OpenStreetMap Leaflet:', err);
        if (active) setMapEngine('leaflet');
      }
    };

    loadEngine();

    return () => {
      active = false;
    };
  }, []);

  // ----------------------------------------------------
  // ENGINE A: LEAFLET ENGINE (RELIABLE FALLBACK)
  // ----------------------------------------------------
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !containerRef.current) return;

    if (leafletMapRef.current) {
      leafletMapRef.current.remove();
    }

    // Centered around South Korea
    const map = L.map(containerRef.current, {
      zoomControl: true,
      attributionControl: false
    }).setView([36.3504, 127.3845], 7);

    leafletMapRef.current = map;

    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '&copy; Esri, HERE, Garmin, USGS, OpenStreetMap'
    }).addTo(map);

    map.zoomControl.setPosition('bottomright');

    return () => {
      if (leafletMapRef.current) {
        leafletMapRef.current.remove();
        leafletMapRef.current = null;
      }
    };
  }, [mapEngine]);

  // Leaflet Marker & Panning updates
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !leafletMapRef.current) return;
    const map = leafletMapRef.current;

    // Clear old markers
    Object.values(leafletMarkersRef.current).forEach(marker => {
      map.removeLayer(marker);
    });
    leafletMarkersRef.current = {};

    const getLeafletIcon = (job: Job) => {
      const style = colors[job.category] || colors['Other'];
      const emojis: Record<string, string> = {
        'Restaurant': '🍲',
        'Cafe': '☕',
        'Factory': '🏭',
        'Warehouse': '📦',
        'Convenience Store': '🏪',
        'Office': '🏢',
        'Other': '🌟'
      };
      const emoji = emojis[job.category] || emojis['Other'];
      
      let salaryText = '';
      if (job.salary) {
        if (job.salary >= 10000) {
          salaryText = `${(job.salary / 1000).toFixed(0)}k`;
        } else {
          salaryText = `${job.salary}`;
        }
      } else {
        salaryText = job.category[0];
      }

      return L.divIcon({
        html: `
          <div class="shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 flex items-center gap-1 px-2.5 py-1.5 rounded-full border-2 border-white text-white font-sans font-extrabold text-[11px] cursor-pointer" style="
            background-color: ${style.bg};
            box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
            white-space: nowrap;
          ">
            <span>${emoji}</span>
            <span>${salaryText}</span>
          </div>
        `,
        className: 'custom-leaflet-marker',
        iconSize: [85, 32],
        iconAnchor: [42, 16]
      });
    };

    // Draw markers
    jobs.forEach(job => {
      if (!job.latitude || !job.longitude) return;

      const marker = L.marker([job.latitude, job.longitude], {
        icon: getLeafletIcon(job)
      }).addTo(map);

      marker.on('click', () => {
        onSelectJob(job);
      });

      leafletMarkersRef.current[job.id] = marker;
    });

    if (jobs.length > 0 && Object.keys(leafletMarkersRef.current).length > 0) {
      const group = L.featureGroup(Object.values(leafletMarkersRef.current));
      map.fitBounds(group.getBounds().pad(0.15));
    }
  }, [jobs, mapEngine, onSelectJob]);

  // Leaflet focus panning
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !leafletMapRef.current || !selectedJob) return;
    const map = leafletMapRef.current;
    map.setView([selectedJob.latitude, selectedJob.longitude], 14, {
      animate: true,
      duration: 1
    });
  }, [selectedJob, mapEngine]);

  // ----------------------------------------------------
  // ENGINE B: KAKAO MAPS ENGINE V2 (PRIMARY KOREAN MAP)
  // ----------------------------------------------------
  useEffect(() => {
    if (mapEngine !== 'kakao' || !containerRef.current || !window.kakao?.maps) return;

    const container = containerRef.current;
    
    // Center of South Korea in Kakao Map [36.3504, 127.3845]
    // Kakao Map zoom levels: 1 (max in, ~20m) to 14 (max out). Level 11 is country overview.
    const mapOptions = {
      center: new window.kakao.maps.LatLng(36.3504, 127.3845),
      level: 11
    };

    const map = new window.kakao.maps.Map(container, mapOptions);

    // Zoom control
    const zoomControl = new window.kakao.maps.ZoomControl();
    map.addControl(zoomControl, window.kakao.maps.ControlPosition.RIGHT);

    kakaoMapRef.current = map;

    return () => {
      kakaoMapRef.current = null;
    };
  }, [mapEngine]);

  // Kakao Marker Overlays & bounds updates
  useEffect(() => {
    if (mapEngine !== 'kakao' || !kakaoMapRef.current || !window.kakao?.maps) return;
    const map = kakaoMapRef.current;

    // Clear old overlays
    kakaoOverlaysRef.current.forEach(overlay => overlay.setMap(null));
    kakaoOverlaysRef.current = [];

    const bounds = new window.kakao.maps.LatLngBounds();
    let hasCoords = false;

    jobs.forEach(job => {
      if (!job.latitude || !job.longitude) return;

      const style = colors[job.category] || colors['Other'];
      const emojis: Record<string, string> = {
        'Restaurant': '🍲',
        'Cafe': '☕',
        'Factory': '🏭',
        'Warehouse': '📦',
        'Convenience Store': '🏪',
        'Office': '🏢',
        'Other': '🌟'
      };
      const emoji = emojis[job.category] || emojis['Other'];

      let salaryText = '';
      if (job.salary) {
        if (job.salary >= 10000) {
          salaryText = `${(job.salary / 1000).toFixed(0)}k`;
        } else {
          salaryText = `${job.salary}`;
        }
      } else {
        salaryText = job.category[0];
      }

      const position = new window.kakao.maps.LatLng(job.latitude, job.longitude);

      const content = document.createElement('div');
      content.className = 'kakao-marker-item';
      content.style.cursor = 'pointer';
      content.innerHTML = `
        <div class="shadow-xl hover:scale-110 active:scale-95 transition-all duration-200 flex items-center gap-1 px-2.5 py-1.5 rounded-full border-2 border-white text-white font-sans font-extrabold text-[11px] cursor-pointer select-none" style="
          background-color: ${style.bg};
          box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
          white-space: nowrap;
        ">
          <span>${emoji}</span>
          <span>${salaryText}</span>
        </div>
      `;

      content.onclick = (e) => {
        e.stopPropagation();
        onSelectJob(job);
      };

      const overlay = new window.kakao.maps.CustomOverlay({
        position,
        content,
        map,
        xAnchor: 0.5,
        yAnchor: 0.5,
        zIndex: 10
      });

      kakaoOverlaysRef.current.push(overlay);
      bounds.extend(position);
      hasCoords = true;
    });

    if (jobs.length > 0 && hasCoords) {
      map.setBounds(bounds);
    }
  }, [jobs, mapEngine, onSelectJob]);

  // Kakao focus panning
  useEffect(() => {
    if (mapEngine !== 'kakao' || !kakaoMapRef.current || !selectedJob || !window.kakao?.maps) return;
    const map = kakaoMapRef.current;

    const latlng = new window.kakao.maps.LatLng(selectedJob.latitude, selectedJob.longitude);
    map.panTo(latlng);
    map.setLevel(4); // neighborhood level zoom in Kakao
  }, [selectedJob, mapEngine]);

  // Leaflet user location marker rendering
  useEffect(() => {
    if (mapEngine !== 'leaflet' || !leafletMapRef.current) return;
    const map = leafletMapRef.current;

    if (leafletUserMarkerRef.current) {
      map.removeLayer(leafletUserMarkerRef.current);
      leafletUserMarkerRef.current = null;
    }

    if (!userLocation) return;

    const userIcon = L.divIcon({
      html: `
        <div class="relative flex items-center justify-center w-6 h-6">
          <div class="absolute w-6 h-6 bg-amber-400 rounded-full opacity-40 animate-ping"></div>
          <div class="relative w-3.5 h-3.5 bg-amber-500 border-2 border-white rounded-full shadow-md"></div>
        </div>
      `,
      className: 'user-location-marker',
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    const marker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon }).addTo(map);
    leafletUserMarkerRef.current = marker;

    return () => {
      if (leafletUserMarkerRef.current && leafletMapRef.current) {
        leafletMapRef.current.removeLayer(leafletUserMarkerRef.current);
        leafletUserMarkerRef.current = null;
      }
    };
  }, [userLocation, mapEngine]);

  // Kakao user location marker rendering
  useEffect(() => {
    if (mapEngine !== 'kakao' || !kakaoMapRef.current || !window.kakao?.maps) return;
    const map = kakaoMapRef.current;

    if (kakaoUserOverlayRef.current) {
      kakaoUserOverlayRef.current.setMap(null);
      kakaoUserOverlayRef.current = null;
    }

    if (!userLocation) return;

    const position = new window.kakao.maps.LatLng(userLocation.lat, userLocation.lng);

    const userEl = document.createElement('div');
    userEl.innerHTML = `
      <div class="relative flex items-center justify-center w-6 h-6">
        <div class="absolute w-6 h-6 bg-amber-400 rounded-full opacity-40 animate-ping"></div>
        <div class="relative w-3.5 h-3.5 bg-amber-500 border-2 border-white rounded-full shadow-md"></div>
      </div>
    `;

    const marker = new window.kakao.maps.CustomOverlay({
      position,
      content: userEl,
      map,
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 20
    });

    kakaoUserOverlayRef.current = marker;

    return () => {
      if (kakaoUserOverlayRef.current) {
        kakaoUserOverlayRef.current.setMap(null);
        kakaoUserOverlayRef.current = null;
      }
    };
  }, [userLocation, mapEngine]);

  // ----------------------------------------------------
  // ROUTE DRAWING EFFECT (Kakao Map & Leaflet Polyline)
  // ----------------------------------------------------
  useEffect(() => {
    let isMounted = true;

    // Helper to clear existing route overlays
    const clearRouteOverlays = () => {
      if (kakaoCasingPolylineRef.current) { kakaoCasingPolylineRef.current.setMap(null); kakaoCasingPolylineRef.current = null; }
      if (kakaoPolylineRef.current) { kakaoPolylineRef.current.setMap(null); kakaoPolylineRef.current = null; }
      if (kakaoStartOverlayRef.current) { kakaoStartOverlayRef.current.setMap(null); kakaoStartOverlayRef.current = null; }
      if (kakaoEndOverlayRef.current) { kakaoEndOverlayRef.current.setMap(null); kakaoEndOverlayRef.current = null; }
      if (kakaoBadgeOverlayRef.current) { kakaoBadgeOverlayRef.current.setMap(null); kakaoBadgeOverlayRef.current = null; }
      if (kakaoVertexOverlaysRef.current.length > 0) {
        kakaoVertexOverlaysRef.current.forEach((m) => m.setMap(null));
        kakaoVertexOverlaysRef.current = [];
      }

      if (leafletMapRef.current) {
        if (leafletCasingPolylineRef.current) { leafletMapRef.current.removeLayer(leafletCasingPolylineRef.current); leafletCasingPolylineRef.current = null; }
        if (leafletPolylineRef.current) { leafletMapRef.current.removeLayer(leafletPolylineRef.current); leafletPolylineRef.current = null; }
        if (leafletStartMarkerRef.current) { leafletMapRef.current.removeLayer(leafletStartMarkerRef.current); leafletStartMarkerRef.current = null; }
        if (leafletEndMarkerRef.current) { leafletMapRef.current.removeLayer(leafletEndMarkerRef.current); leafletEndMarkerRef.current = null; }
        if (leafletBadgeMarkerRef.current) { leafletMapRef.current.removeLayer(leafletBadgeMarkerRef.current); leafletBadgeMarkerRef.current = null; }
        if (leafletVertexMarkersRef.current.length > 0) {
          leafletVertexMarkersRef.current.forEach((m) => leafletMapRef.current?.removeLayer(m));
          leafletVertexMarkersRef.current = [];
        }
      }
    };

    clearRouteOverlays();

    if (!selectedJob || !selectedJob.latitude || !selectedJob.longitude) {
      setRouteInfo(null);
      return;
    }

    // Starting location: Use GPS position if available, or compute a realistic nearby starting point (~600m away)
    const startLoc = userLocation || {
      lat: selectedJob.latitude - 0.0055,
      lng: selectedJob.longitude - 0.0075
    };

    setIsRouting(true);

    fetchWalkingRoute(
      startLoc.lat,
      startLoc.lng,
      selectedJob.latitude,
      selectedJob.longitude
    ).then((route) => {
      if (!isMounted) return;
      setRouteInfo(route);
      setIsRouting(false);

      const mins = Math.max(1, Math.round(route.durationSeconds / 60));

      // ------------------------------------
      // Render Route on Kakao Map
      // ------------------------------------
      if (mapEngine === 'kakao' && kakaoMapRef.current && window.kakao?.maps) {
        const map = kakaoMapRef.current;
        const kakaoPath = route.coordinates.map(
          ([lat, lng]) => new window.kakao.maps.LatLng(lat, lng)
        );

        // 1. Dark Amber Outer Casing Line (Kakao Style)
        const casingPolyline = new window.kakao.maps.Polyline({
          path: kakaoPath,
          strokeWeight: 10,
          strokeColor: '#B45309',
          strokeOpacity: 0.95,
          strokeStyle: 'solid',
          zIndex: 900
        });
        casingPolyline.setMap(map);
        kakaoCasingPolylineRef.current = casingPolyline;

        // 2. Bright Amber/Gold Inner Route Line
        const polyline = new window.kakao.maps.Polyline({
          path: kakaoPath,
          strokeWeight: 6,
          strokeColor: '#F59E0B',
          strokeOpacity: 1.0,
          strokeStyle: 'solid',
          zIndex: 901
        });
        polyline.setMap(map);
        kakaoPolylineRef.current = polyline;

        // 3. Turn Vertex Waypoint Markers
        const vertexOverlays: any[] = [];
        const coords = route.coordinates;
        for (let i = 1; i < coords.length - 1; i++) {
          const pt = coords[i];
          const dotEl = document.createElement('div');
          dotEl.innerHTML = `<div class="w-2.5 h-2.5 bg-white rounded-full border-2 border-amber-900 shadow-md"></div>`;
          const vertexOverlay = new window.kakao.maps.CustomOverlay({
            position: new window.kakao.maps.LatLng(pt[0], pt[1]),
            content: dotEl,
            map,
            xAnchor: 0.5,
            yAnchor: 0.5,
            zIndex: 905
          });
          vertexOverlays.push(vertexOverlay);
        }
        kakaoVertexOverlaysRef.current = vertexOverlays;

        // 4. Start Marker "출발"
        const startEl = document.createElement('div');
        startEl.innerHTML = `
          <div class="flex flex-col items-center select-none" style="filter: drop-shadow(0 6px 14px rgba(0,0,0,0.35));">
            <div class="bg-emerald-600 text-white font-black text-[11px] px-2.5 py-0.5 rounded-full border-2 border-white flex items-center gap-1 mb-1">
              <span class="w-2 h-2 rounded-full bg-white animate-ping"></span>
              <span>출발</span>
            </div>
            <div class="w-9 h-9 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-base shadow-lg">
              🏠
            </div>
          </div>
        `;
        const startOverlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(startLoc.lat, startLoc.lng),
          content: startEl,
          map,
          xAnchor: 0.5,
          yAnchor: 1.0,
          zIndex: 1000
        });
        kakaoStartOverlayRef.current = startOverlay;

        // 5. End Marker "도착"
        const endEl = document.createElement('div');
        endEl.innerHTML = `
          <div class="flex flex-col items-center select-none" style="filter: drop-shadow(0 6px 14px rgba(0,0,0,0.35));">
            <div class="bg-rose-600 text-white font-black text-[11px] px-2.5 py-0.5 rounded-full border-2 border-white flex items-center gap-1 mb-1">
              <span>도착</span>
            </div>
            <div class="w-9 h-9 bg-rose-500 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-base animate-bounce shadow-lg">
              📍
            </div>
          </div>
        `;
        const endOverlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(selectedJob.latitude, selectedJob.longitude),
          content: endEl,
          map,
          xAnchor: 0.5,
          yAnchor: 1.0,
          zIndex: 1001
        });
        kakaoEndOverlayRef.current = endOverlay;

        // 6. Route Duration Badge "추천 X분" (Kakao Style)
        const badgeEl = document.createElement('div');
        badgeEl.innerHTML = `
          <div class="bg-amber-400 hover:bg-amber-500 text-amber-950 px-3.5 py-1.5 rounded-xl border-2 border-white flex items-center gap-2 text-xs font-black cursor-pointer transition-all hover:scale-105 active:scale-95 select-none shadow-lg">
            <span class="bg-amber-950 text-amber-300 text-[10px] px-1.5 py-0.2 rounded font-black">추천</span>
            <span class="text-xs font-black">${mins}분</span>
          </div>
        `;
        const badgeOverlay = new window.kakao.maps.CustomOverlay({
          position: new window.kakao.maps.LatLng(route.midpoint[0], route.midpoint[1]),
          content: badgeEl,
          map,
          xAnchor: 0.5,
          yAnchor: 0.5,
          zIndex: 1002
        });
        kakaoBadgeOverlayRef.current = badgeOverlay;

        // Fit map bounds to whole route
        const bounds = new window.kakao.maps.LatLngBounds();
        kakaoPath.forEach((pt: any) => bounds.extend(pt));
        bounds.extend(new window.kakao.maps.LatLng(startLoc.lat, startLoc.lng));
        bounds.extend(new window.kakao.maps.LatLng(selectedJob.latitude, selectedJob.longitude));
        map.setBounds(bounds);
      }

      // ------------------------------------
      // Render Route on Leaflet Map
      // ------------------------------------
      if (mapEngine === 'leaflet' && leafletMapRef.current) {
        const map = leafletMapRef.current;

        // 1. Casing Polyline
        const casingPolyline = L.polyline(route.coordinates, {
          color: '#B45309',
          weight: 10,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
        leafletCasingPolylineRef.current = casingPolyline;

        // 2. Core Polyline
        const polyline = L.polyline(route.coordinates, {
          color: '#F59E0B',
          weight: 6,
          opacity: 1.0,
          lineCap: 'round',
          lineJoin: 'round'
        }).addTo(map);
        leafletPolylineRef.current = polyline;

        // 3. Vertex Turn Markers
        const leafVertexes: L.Marker[] = [];
        const coords = route.coordinates;
        for (let i = 1; i < coords.length - 1; i++) {
          const pt = coords[i];
          const nodeIcon = L.divIcon({
            html: `<div class="w-3 h-3 bg-white rounded-full border-2 border-slate-900 shadow-md"></div>`,
            className: 'custom-route-vertex',
            iconSize: [12, 12],
            iconAnchor: [6, 6]
          });
          const m = L.marker([pt[0], pt[1]], { icon: nodeIcon }).addTo(map);
          leafVertexes.push(m);
        }
        leafletVertexMarkersRef.current = leafVertexes;

        // Start Icon
        const startIcon = L.divIcon({
          html: `
            <div class="flex flex-col items-center select-none" style="filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3));">
              <div class="bg-emerald-600 text-white font-extrabold text-[11px] px-2 py-0.5 rounded-full border-2 border-white mb-1">
                출발
              </div>
              <div class="w-8 h-8 bg-emerald-500 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-xs">
                🏠
              </div>
            </div>
          `,
          className: 'custom-route-start',
          iconSize: [40, 52],
          iconAnchor: [20, 52]
        });
        leafletStartMarkerRef.current = L.marker([startLoc.lat, startLoc.lng], { icon: startIcon }).addTo(map);

        // End Icon
        const endIcon = L.divIcon({
          html: `
            <div class="flex flex-col items-center select-none" style="filter: drop-shadow(0 4px 10px rgba(0,0,0,0.3));">
              <div class="bg-rose-600 text-white font-extrabold text-[11px] px-2 py-0.5 rounded-full border-2 border-white mb-1">
                도착
              </div>
              <div class="w-8 h-8 bg-rose-500 rounded-full border-2 border-white flex items-center justify-center text-white font-bold text-xs animate-bounce">
                📍
              </div>
            </div>
          `,
          className: 'custom-route-end',
          iconSize: [40, 52],
          iconAnchor: [20, 52]
        });
        leafletEndMarkerRef.current = L.marker([selectedJob.latitude, selectedJob.longitude], { icon: endIcon }).addTo(map);

        // Badge Icon
        const badgeIcon = L.divIcon({
          html: `
            <div class="bg-amber-400 text-amber-950 px-3.5 py-1.5 rounded-xl border-2 border-white flex items-center gap-1.5 text-xs font-black select-none shadow-xl">
              <span class="bg-amber-950 text-amber-300 text-[10px] px-1.5 py-0.2 rounded font-black">추천</span>
              <span>${mins}분</span>
            </div>
          `,
          className: 'custom-route-badge',
          iconSize: [84, 38],
          iconAnchor: [42, 19]
        });
        leafletBadgeMarkerRef.current = L.marker([route.midpoint[0], route.midpoint[1]], { icon: badgeIcon }).addTo(map);

        const routeBounds = polyline.getBounds();
        routeBounds.extend([startLoc.lat, startLoc.lng]);
        routeBounds.extend([selectedJob.latitude, selectedJob.longitude]);
        map.fitBounds(routeBounds, {
          paddingTopLeft: [80, 80],
          paddingBottomRight: [80, 160]
        });
      }
    });

    return () => {
      isMounted = false;
      clearRouteOverlays();
    };
  }, [userLocation, selectedJob, mapEngine]);

  // ----------------------------------------------------
  // RESIZE AND REFRESH LISTENERS
  // ----------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver(() => {
      if (mapEngine === 'leaflet' && leafletMapRef.current) {
        leafletMapRef.current.invalidateSize();
      } else if (mapEngine === 'kakao' && kakaoMapRef.current) {
        kakaoMapRef.current.relayout();
      }
    });

    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
    };
  }, [mapEngine]);

  return (
    <div className="relative w-full h-full min-h-[300px] md:min-h-[400px] rounded-2xl overflow-hidden border border-slate-200 shadow-lg bg-slate-100">
      
      {/* Loading overlay */}
      {mapEngine === 'loading' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/85 backdrop-blur-md z-[500] gap-3 text-slate-600 animate-in fade-in duration-300">
          <div className="w-8 h-8 rounded-full border-4 border-slate-300 border-t-amber-500 animate-spin" />
          <p className="text-xs font-bold text-slate-600 font-display">Đang tải bản đồ tuyển dụng Kakao Map...</p>
        </div>
      )}

      {/* Map container DOM */}
      <div ref={containerRef} className="w-full h-full z-0" id="map-container" />

      {/* Action Controls */}
      <div className="absolute top-4 right-4 z-[400] flex gap-2 items-center">
        {/* Locate Me Button */}
        <button 
          onClick={handleLocate}
          disabled={isLocating}
          className={`p-2 rounded-full shadow-md border backdrop-blur-md transition-all cursor-pointer flex items-center justify-center ${
            userLocation 
              ? 'bg-amber-50 border-amber-300 text-amber-700 hover:bg-amber-100' 
              : 'bg-white/90 border-slate-200/80 text-slate-700 hover:text-amber-600 hover:bg-slate-50'
          }`}
          title="Định vị vị trí của tôi"
        >
          {isLocating ? (
            <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
          ) : (
            <Navigation className={`w-4 h-4 ${userLocation ? 'text-amber-600 animate-pulse' : 'text-slate-700'}`} />
          )}
        </button>

        <button 
          onClick={() => setShowConfigModal(true)}
          className="bg-white/90 backdrop-blur-md p-2 rounded-full shadow-md border border-slate-200/80 text-slate-700 hover:text-amber-600 hover:bg-slate-50 transition-all cursor-pointer flex items-center justify-center"
          title="Cấu hình Kakao Map API Key"
        >
          <Settings className="w-4 h-4" />
        </button>

        <div 
          onClick={() => setShowConfigModal(true)}
          className="bg-white/90 backdrop-blur-md px-3 py-1.5 rounded-full shadow-md border border-slate-200/80 text-[10px] font-extrabold text-slate-700 flex items-center gap-1.5 select-none uppercase tracking-wide cursor-pointer hover:bg-white transition-all"
        >
          <span className={`w-2 h-2 rounded-full ${mapEngine === 'kakao' ? 'bg-amber-400 animate-pulse' : mapEngine === 'leaflet' ? 'bg-blue-500' : 'bg-slate-300'}`} />
          <span>Bản đồ: {mapEngine === 'kakao' ? 'Kakao Map 💛' : 'Dự phòng 🌍'}</span>
        </div>
      </div>

      {/* Geolocation Error Alert */}
      {locationError && (
        <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:max-w-xs z-[400] bg-rose-500 text-white p-3.5 rounded-2xl shadow-2xl flex items-start gap-2.5 border border-rose-600 animate-in slide-in-from-bottom-4 duration-300">
          <AlertTriangle className="w-5 h-5 flex-shrink-0 mt-0.5 text-rose-100" />
          <div className="space-y-1">
            <h5 className="text-[11px] font-extrabold uppercase tracking-wider text-rose-100">Lỗi định vị</h5>
            <p className="text-[10px] font-medium leading-relaxed text-rose-50">
              {locationError}
            </p>
          </div>
        </div>
      )}

      {/* Floating Route Suggestion Banner (Kakao Style) */}
      {selectedJob && routeInfo && (
        <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-[1100] bg-slate-900/95 backdrop-blur-md text-white p-4 rounded-2xl shadow-2xl border border-slate-700/80 space-y-3 animate-in slide-in-from-bottom-5 duration-300">
          <div className="flex items-start justify-between gap-2 border-b border-slate-800 pb-2.5">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-400/20 text-amber-400 border border-amber-400/30 flex items-center justify-center flex-shrink-0">
                <Footprints className="w-5 h-5 animate-pulse text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-1.5 text-[10px] font-extrabold uppercase tracking-wider text-slate-400">
                  <span className="text-emerald-400">출발 {userLocation ? '(GPS)' : '(Gần đó)'}</span>
                  <ArrowRight className="w-3 h-3 text-slate-500" />
                  <span className="text-rose-400">도착 ({selectedJob.district || 'Nơi làm'})</span>
                </div>
                <h4 className="text-xs font-extrabold text-white truncate max-w-[200px]">
                  {selectedJob.title}
                </h4>
              </div>
            </div>
            <button
              onClick={() => setRouteInfo(null)}
              className="p-1 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
              title="Đóng chỉ đường"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center justify-between text-xs font-bold gap-2">
            <div className="flex items-center gap-2">
              <span className="bg-amber-400 text-amber-950 text-[11px] font-black px-2.5 py-1 rounded-lg shadow-sm flex items-center gap-1">
                <span className="bg-amber-950 text-amber-300 text-[9px] px-1 py-0.2 rounded font-black">추천</span>
                <span>{Math.max(1, Math.round(routeInfo.durationSeconds / 60))}분</span>
              </span>
              <span className="text-slate-300 text-[11px]">
                {routeInfo.distanceMeters >= 1000
                  ? `${(routeInfo.distanceMeters / 1000).toFixed(1)} km`
                  : `${Math.round(routeInfo.distanceMeters)} m`}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={handleFocusRoute}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-extrabold text-[11px] rounded-xl transition-all active:scale-95 flex items-center gap-1 cursor-pointer border border-slate-700"
                title="Căn chỉnh thu phóng vừa toàn bộ tuyến đường"
              >
                <Navigation className="w-3.5 h-3.5 text-amber-400" />
                <span>Toàn cảnh</span>
              </button>

              <a
                href={getKakaoMapDirectionUrl(
                  selectedJob.latitude,
                  selectedJob.longitude,
                  selectedJob.title,
                  userLocation?.lat,
                  userLocation?.lng
                )}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-amber-950 font-extrabold text-[11px] rounded-xl shadow-md transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer"
              >
                <span>Mở Kakao Map</span>
                <ExternalLink className="w-3 h-3 text-amber-900" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Small floating map legend */}
      <div className="absolute top-4 left-4 z-[400] bg-white/90 backdrop-blur-md px-4 py-3 rounded-2xl shadow-xl border border-slate-200/80 text-[11px] leading-relaxed text-slate-600 max-w-[200px] hidden sm:block">
        <h4 className="font-bold text-slate-950 mb-1.5 font-display text-xs">Loại công việc</h4>
        <div className="grid grid-cols-2 gap-x-2 gap-y-1">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#22c55e' }} />
            <span>Nhà hàng</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#f97316' }} />
            <span>Cà phê</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#a855f7' }} />
            <span>Nhà xưởng</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#6366f1' }} />
            <span>Kho bãi</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#3b82f6' }} />
            <span>Cửa hàng</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#ec4899' }} />
            <span>Văn phòng</span>
          </div>
        </div>
      </div>

      {/* Kakao Map Config & Guide Modal */}
      {showConfigModal && (
        <div className="absolute inset-0 bg-slate-950/70 backdrop-blur-md z-[999] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 max-w-md w-full p-5 max-h-[90%] overflow-y-auto space-y-4 text-slate-700 animate-in zoom-in-95 duration-200">
            
            {/* Header */}
            <div className="flex justify-between items-start border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span className="w-5 h-5 rounded-lg bg-amber-400 text-amber-950 flex items-center justify-center text-xs font-black">K</span>
                  Cấu hình Kakao Map API
                </h3>
                <p className="text-[10px] text-slate-400 font-medium">Kết nối với nền tảng bản đồ Kakao Developers Hàn Quốc</p>
              </div>
              <button 
                onClick={() => setShowConfigModal(false)}
                className="p-1 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Guide Steps */}
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-amber-50 border border-amber-200/80 rounded-xl space-y-2">
                <h4 className="font-extrabold text-amber-950 flex items-center gap-1.5 text-[11px]">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-600" />
                  Đăng ký Web Domain trên Kakao Developers
                </h4>
                <p className="text-[11px] text-amber-900 leading-relaxed font-medium">
                  Kakao Map API yêu cầu thêm URL của trang web vào mục <strong>Web 플랫폼 (Web Platform)</strong> trong Kakao Developers console để cho phép tải bản đồ.
                </p>
              </div>

              {/* Dynamic Domain Copy */}
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Web Site Domain cần thêm:</span>
                <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-xl p-2 justify-between">
                  <code className="text-[11px] font-mono font-bold text-slate-800 break-all select-all">
                    {window.location.origin}
                  </code>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(window.location.origin);
                      setCopiedDomain('origin');
                      setTimeout(() => setCopiedDomain(null), 2000);
                    }}
                    className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-500 transition-all flex-shrink-0 cursor-pointer"
                    title="Copy domain"
                  >
                    {copiedDomain === 'origin' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Step List */}
              <div className="space-y-1.5 text-[11px] font-medium text-slate-600">
                <div className="flex gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-[10px] flex-shrink-0">1</span>
                  <span>Truy cập <a href="https://developers.kakao.com" target="_blank" rel="noreferrer" className="text-amber-700 hover:underline font-bold inline-flex items-center gap-0.5">developers.kakao.com <ExternalLink className="w-2.5 h-2.5 inline" /></a></span>
                </div>
                <div className="flex gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-[10px] flex-shrink-0">2</span>
                  <span>Bấm <strong>내 애플리케이션</strong> (My Application) &gt; <strong>애플리케이션 추가하기</strong> (Thêm ứng dụng).</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-[10px] flex-shrink-0">3</span>
                  <span>Vào <strong>플랫폼 (Platform) &gt; Web 플랫폼 등록</strong>, dán Web Site Domain ở trên vào và lưu lại.</span>
                </div>
                <div className="flex gap-1.5">
                  <span className="w-4 h-4 rounded-full bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-[10px] flex-shrink-0">4</span>
                  <span>Vào mục <strong>앱 키 (App Keys)</strong>, sao chép <strong>JavaScript 키 (JavaScript Key)</strong> dán vào ô bên dưới.</span>
                </div>
              </div>

              {/* API Key Input */}
              <div className="space-y-1.5 pt-1">
                <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex justify-between">
                  <span>Kakao JavaScript Key</span>
                  {localStorage.getItem('kakao_map_app_key') && (
                    <span className="text-amber-600 font-bold normal-case">Đang lưu Key trong trình duyệt</span>
                  )}
                </label>
                <input 
                  type="text"
                  value={appKey}
                  onChange={(e) => setAppKey(e.target.value)}
                  placeholder="Nhập Kakao JavaScript Key..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400"
                />
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[10px] text-slate-500 leading-relaxed">
                💡 <strong>Mẹo:</strong> Nếu bạn chưa có Key hoặc đang chờ đăng ký, hệ thống tự động sử dụng bản đồ vệ tinh OpenStreetMap (Leaflet) đầy đủ dữ liệu định vị, tìm việc và chỉ đường.
              </div>
            </div>

            {/* Footer Buttons */}
            <div className="flex gap-2 border-t border-slate-100 pt-3">
              {localStorage.getItem('kakao_map_app_key') && (
                <button
                  onClick={() => {
                    localStorage.removeItem('kakao_map_app_key');
                    setAppKey('');
                    window.location.reload();
                  }}
                  className="flex-1 py-2 border border-rose-200 text-rose-600 hover:bg-rose-50 text-[11px] font-extrabold rounded-xl transition-all cursor-pointer"
                >
                  Xóa Key
                </button>
              )}
              <button
                onClick={() => {
                  if (appKey.trim()) {
                    localStorage.setItem('kakao_map_app_key', appKey.trim());
                  } else {
                    localStorage.removeItem('kakao_map_app_key');
                  }
                  window.location.reload();
                }}
                className="flex-1 py-2.5 bg-amber-400 hover:bg-amber-300 text-amber-950 text-[11px] font-extrabold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Lưu & Tải lại</span>
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
