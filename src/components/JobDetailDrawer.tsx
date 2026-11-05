/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { X, Heart, Phone, MessageCircle, ExternalLink, LocateFixed, Footprints, Clock, MapPin } from 'lucide-react';
import { Job } from '../types';
import {
  formatDistance, fetchWalkingRoute, RouteInfo,
  getNaverMapDirectionUrl, getKakaoMapDirectionUrl, getGoogleMapDirectionUrl
} from '../utils/geo';
import {
  CATEGORY_LABELS, describeWageVsMinimum, formatKRW, formatPostedAgo, isUnderMinimum, wageUnit
} from '../utils/wage';

/** Share of the phone screen the card takes before it is dragged up, so the map and the route stay visible. */
export const DETAIL_SHEET_RATIO = 0.5;

interface JobDetailDrawerProps {
  job: Job | null;
  onClose: () => void;
  isBookmarked: boolean;
  onToggleBookmark: (jobId: string) => void;
  currentUser: any;
  userLocation?: { lat: number; lng: number } | null;
  onLocateUser?: () => void;
  isLocatingUser?: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  'Facebook': 'Nhóm Facebook',
  'Alba': 'Albamon',
  'Karrot': 'Karrot (당근알바)',
  'User': 'Đăng trực tiếp trên 86Job'
};

function useIsDesktop() {
  const query = '(min-width: 1024px)';
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setIsDesktop(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return isDesktop;
}

/**
 * One job as a place card, the way map apps show a place: on a phone it opens at half the screen
 * (name, wage, walk time, call) so the map and the route stay in view; drag it up for the rest,
 * down to close. On desktop it is a right-hand panel.
 */
export default function JobDetailDrawer({
  job,
  onClose,
  isBookmarked,
  onToggleBookmark,
  userLocation,
  onLocateUser,
  isLocatingUser
}: JobDetailDrawerProps) {
  const isDesktop = useIsDesktop();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const dragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);

  useEffect(() => {
    // preventScroll: focusing must not scroll the page under the map (it pushed the search row away)
    panelRef.current?.focus({ preventScroll: true });
    setExpanded(false);
    scrollRef.current?.scrollTo({ top: 0 });
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [job?.id, onClose]);

  // Walk distance and time for the card (the server caches it, the map draws the same route)
  useEffect(() => {
    setRoute(null);
    if (!job || !userLocation) return;
    let active = true;
    fetchWalkingRoute(userLocation.lat, userLocation.lng, job.latitude, job.longitude).then(r => { if (active) setRoute(r); });
    return () => { active = false; };
  }, [job?.id, userLocation?.lat, userLocation?.lng]);

  if (!job) return null;

  const underMinimum = isUnderMinimum(job);
  const walkMins = route ? Math.max(1, Math.round(route.durationSeconds / 60)) : null;
  const straight = route?.source === 'straight';

  const directions = [
    { label: 'Kakao Map', className: 'bg-amber-400 text-amber-950 hover:bg-amber-300', href: getKakaoMapDirectionUrl(job.latitude, job.longitude, job.title, userLocation?.lat, userLocation?.lng) },
    { label: 'Naver Map', className: 'bg-emerald-600 text-white hover:bg-emerald-500', href: getNaverMapDirectionUrl(job.latitude, job.longitude, job.title, userLocation?.lat, userLocation?.lng) },
    { label: 'Google Maps', className: 'bg-blue-600 text-white hover:bg-blue-500', href: getGoogleMapDirectionUrl(job.latitude, job.longitude, job.title, userLocation?.lat, userLocation?.lng) }
  ];

  // ----- Phone sheet height: half, full, or following the finger -----
  const viewportH = typeof window !== 'undefined' ? window.innerHeight : 800;
  const halfH = Math.round(viewportH * DETAIL_SHEET_RATIO);
  const fullH = viewportH - 56;
  const baseH = expanded ? fullH : halfH;
  const sheetH = dragOffset !== null ? Math.min(fullH, Math.max(80, baseH - dragOffset)) : baseH;

  const onHandleDown = (e: React.PointerEvent) => {
    if (isDesktop) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startH: baseH };
    setDragOffset(0);
  };
  const onHandleMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return;
    setDragOffset(e.clientY - dragRef.current.startY);
  };
  const onHandleUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    setDragOffset(null);
    if (!d) return;
    const dy = e.clientY - d.startY;
    if (Math.abs(dy) < 6) { setExpanded(x => !x); return; }        // a tap toggles
    const h = d.startH - dy;
    if (h < halfH * 0.6) { onClose(); return; }                       // pulled well below half: close
    setExpanded(h > (halfH + fullH) / 2);
  };

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-labelledby="job-detail-title"
      style={!isDesktop ? { height: sheetH } : undefined}
      className={`fixed z-[1500] inset-x-0 bottom-0 rounded-t-[1.75rem] shadow-[0_-8px_30px_rgba(15,23,42,0.14)] bg-white flex flex-col outline-none animate-in slide-in-from-bottom duration-200 lg:top-14 lg:left-auto lg:right-0 lg:h-auto lg:w-[420px] lg:rounded-none lg:shadow-2xl lg:border-l lg:border-slate-200/80 lg:slide-in-from-right ${
        dragOffset === null ? 'transition-[height] duration-200 ease-out' : ''
      }`}
    >
      {/* Phone: grab handle (tap to expand, drag to resize or close) */}
      <button
        type="button"
        aria-label={expanded ? 'Thu nhỏ thông tin' : 'Mở rộng thông tin'}
        onPointerDown={onHandleDown}
        onPointerMove={onHandleMove}
        onPointerUp={onHandleUp}
        onKeyDown={(e) => {
          if (e.key === 'ArrowUp') { e.preventDefault(); setExpanded(true); }
          if (e.key === 'ArrowDown') { e.preventDefault(); setExpanded(false); }
        }}
        className="lg:hidden flex-none h-6 w-full flex items-center justify-center touch-none cursor-grab"
      >
        <span className="w-10 h-1.5 rounded-full bg-slate-300" />
      </button>

      <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {/* Summary: what shows at half height */}
        <div className="px-5 pt-1 lg:pt-5 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="job-detail-title" className="font-display text-lg lg:text-xl font-extrabold text-slate-900 leading-snug line-clamp-2">
                {job.title}
              </h2>
              <p className="mt-0.5 text-[13px] text-slate-500 truncate">
                <span className="font-semibold text-blue-600">{job.company}</span> · {CATEGORY_LABELS[job.category]} · {formatPostedAgo(job.createdAt)}
              </p>
            </div>
            <div className="flex-none flex items-center gap-1.5 -mr-1">
              <button
                type="button"
                onClick={() => onToggleBookmark(job.id)}
                aria-pressed={isBookmarked}
                aria-label={isBookmarked ? 'Bỏ lưu việc này' : 'Lưu việc này'}
                className={`w-9 h-9 flex items-center justify-center rounded-full border cursor-pointer transition-colors ${isBookmarked ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-white border-slate-200 text-slate-400 hover:text-rose-500'}`}
              >
                <Heart className="w-[18px] h-[18px]" strokeWidth={1.75} fill={isBookmarked ? 'currentColor' : 'none'} />
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Đóng chi tiết"
                className="w-9 h-9 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-900 cursor-pointer"
              >
                <X className="w-[18px] h-[18px]" strokeWidth={1.75} />
              </button>
            </div>
          </div>

          {/* Wage against the legal minimum, one line */}
          <div className="mt-3 flex items-baseline flex-wrap gap-x-2 gap-y-1">
            <p className="num whitespace-nowrap">
              <span className={`font-display text-[26px] leading-none font-extrabold ${underMinimum ? 'text-slate-900' : 'text-blue-600'}`}>{formatKRW(job.salary)}</span>
              <span className="text-sm font-semibold text-slate-500"> {wageUnit(job)}</span>
            </p>
            <span className={`num inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${underMinimum ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>
              {describeWageVsMinimum(job)}
            </span>
          </div>

          {/* Place and walk */}
          <div className="mt-3 space-y-1.5 text-sm text-slate-700">
            <p className="flex items-center gap-2 min-w-0">
              <MapPin className="w-4 h-4 flex-none text-slate-400" />
              <span className="truncate">{job.district}, {job.city}</span>
            </p>
            <p className="flex items-center gap-2">
              <Footprints className="w-4 h-4 flex-none text-slate-400" />
              {userLocation ? (
                route ? (
                  <span className="num">
                    <span className="font-semibold text-slate-900">{straight ? '~' : ''}{walkMins} phút đi bộ</span>
                    {' · '}{formatDistance(route.distanceMeters / 1000)}
                    {straight && <span className="text-slate-500"> (đường chim bay)</span>}
                  </span>
                ) : (
                  <span className="text-slate-500">Đang tính đường đi…</span>
                )
              ) : (
                <button
                  type="button"
                  onClick={onLocateUser}
                  disabled={isLocatingUser}
                  className="inline-flex items-center gap-1 font-semibold text-blue-600 cursor-pointer disabled:text-slate-400"
                >
                  <LocateFixed className="w-3.5 h-3.5" strokeWidth={2} />
                  {isLocatingUser ? 'Đang định vị…' : 'Bật vị trí để xem đường đi'}
                </button>
              )}
            </p>
            <p className="flex items-start gap-2">
              <Clock className="w-4 h-4 flex-none text-slate-400 mt-0.5" />
              <span>{job.workingTime}</span>
            </p>
          </div>

          {/* Main actions */}
          <div className="mt-4 flex gap-2">
            {job.phone ? (
              <a
                href={`tel:${job.phone}`}
                className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 text-white text-sm font-bold shadow-sm hover:bg-emerald-700 transition-colors"
              >
                <Phone className="w-4 h-4" strokeWidth={2} />
                Gọi điện
              </a>
            ) : (
              <span className="flex-1 h-11 inline-flex items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">Không có SĐT</span>
            )}
            {job.kakao && (
              <a
                href={`https://open.kakao.com/me/${job.kakao}`}
                target="_blank"
                rel="noreferrer"
                className="flex-1 h-11 inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 text-amber-950 text-sm font-bold shadow-sm hover:bg-amber-500 transition-colors"
              >
                <MessageCircle className="w-4 h-4" strokeWidth={2} />
                KakaoTalk
              </a>
            )}
            <a
              href={directions[0].href}
              target="_blank"
              rel="noreferrer"
              className="flex-1 h-11 inline-flex items-center justify-center gap-1.5 rounded-full border border-slate-200 bg-white text-sm font-bold text-slate-800 hover:bg-slate-50 transition-colors"
            >
              Chỉ đường
            </a>
          </div>
        </div>

        {/* Details: what dragging up reveals */}
        <div className="px-5 pb-6 pt-4 space-y-5 border-t border-slate-100">
          <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-slate-50/50 px-4">
            <div className="py-2.5 grid grid-cols-[96px_1fr] gap-3">
              <dt className="text-sm text-slate-500">Địa chỉ</dt>
              <dd className="text-sm text-slate-900">{job.address}</dd>
            </div>
            {job.phone && (
              <div className="py-2.5 grid grid-cols-[96px_1fr] gap-3">
                <dt className="text-sm text-slate-500">Điện thoại</dt>
                <dd className="text-sm text-slate-900 num">{job.phone}</dd>
              </div>
            )}
            {(job.kakao || job.line) && (
              <div className="py-2.5 grid grid-cols-[96px_1fr] gap-3">
                <dt className="text-sm text-slate-500">Liên hệ khác</dt>
                <dd className="text-sm text-slate-900 space-y-0.5">
                  {job.kakao && <p>Kakao ID: {job.kakao}</p>}
                  {job.line && <p>Line ID: {job.line}</p>}
                </dd>
              </div>
            )}
          </dl>

          <section aria-labelledby="description-title" className="space-y-2">
            <h3 id="description-title" className="font-display text-sm font-bold text-slate-900">Mô tả công việc</h3>
            <p className="text-[15px] leading-6 text-slate-700 whitespace-pre-line">{job.description}</p>
          </section>

          <section aria-labelledby="directions-title" className="space-y-2">
            <h3 id="directions-title" className="font-display text-sm font-bold text-slate-900">Mở trong ứng dụng bản đồ</h3>
            <div className="grid grid-cols-3 gap-2">
              {directions.map(d => (
                <a
                  key={d.label}
                  href={d.href}
                  target="_blank"
                  rel="noreferrer"
                  className={`h-10 inline-flex items-center justify-center gap-1 rounded-xl text-xs font-extrabold shadow-sm transition-colors ${d.className}`}
                >
                  {d.label}
                  <ExternalLink className="w-3 h-3 opacity-80" />
                </a>
              ))}
            </div>
          </section>

          <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-[13px] leading-5 text-[#92400e]">
            Không đóng phí hay đặt cọc để được nhận việc, và không giao hộ chiếu hoặc thẻ cư trú cho chủ. Du học sinh D-2/D-4 cần giấy phép làm thêm (시간제취업허가) trước khi đi làm.
          </div>

          <p className="text-xs text-slate-500">
            Nguồn: {SOURCE_LABELS[job.source] || job.source}
            {job.sourceUrl && (
              <> · <a href={job.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 text-slate-900">Xem tin gốc</a></>
            )}
            {' '}· Đăng ngày {new Date(job.createdAt).toLocaleDateString('vi-VN')} · <span className="num">{job.views}</span> lượt xem
          </p>
        </div>
      </div>
    </div>
  );
}
