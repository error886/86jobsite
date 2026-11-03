/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { X, Heart, Phone, MessageCircle, ExternalLink, LocateFixed } from 'lucide-react';
import { Job } from '../types';
import { calculateDistanceKm, formatDistance, getNaverMapDirectionUrl, getKakaoMapDirectionUrl, getGoogleMapDirectionUrl } from '../utils/geo';
import {
  CATEGORY_LABELS, describeWageVsMinimum, formatKRW, formatPostedAgo, isUnderMinimum, wageUnit
} from '../utils/wage';

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

/**
 * One job: its header (title, employer, place), the wage against the legal minimum, the two ways to
 * reach the employer, then the facts. A right-hand panel on desktop, a sheet over the map's lower part on a phone.
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
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [job?.id, onClose]);

  if (!job) return null;

  const underMinimum = isUnderMinimum(job);
  const distance = userLocation
    ? formatDistance(calculateDistanceKm(userLocation.lat, userLocation.lng, job.latitude, job.longitude))
    : null;

  const directions = [
    { label: 'Kakao Map', className: 'bg-amber-400 text-amber-950 hover:bg-amber-300', href: getKakaoMapDirectionUrl(job.latitude, job.longitude, job.title, userLocation?.lat, userLocation?.lng) },
    { label: 'Naver Map', className: 'bg-emerald-600 text-white hover:bg-emerald-500', href: getNaverMapDirectionUrl(job.latitude, job.longitude, job.title, userLocation?.lat, userLocation?.lng) },
    { label: 'Google Maps', className: 'bg-blue-600 text-white hover:bg-blue-500', href: getGoogleMapDirectionUrl(job.latitude, job.longitude, job.title, userLocation?.lat, userLocation?.lng) }
  ];

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-labelledby="job-detail-title"
      className="fixed z-[1500] inset-x-0 bottom-0 h-[72dvh] rounded-t-[2rem] shadow-2xl lg:top-14 lg:bottom-0 lg:left-auto lg:right-0 lg:h-auto lg:w-[420px] lg:rounded-none lg:shadow-2xl lg:border-l lg:border-slate-200/80 bg-white flex flex-col outline-none animate-in slide-in-from-bottom lg:slide-in-from-right duration-200"
    >
      {/* Header: the object itself */}
      <div className="flex-none px-5 pt-5 pb-5 border-b border-slate-100">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="job-detail-title" className="font-display text-xl font-extrabold text-slate-900 leading-snug">{job.title}</h2>
            <p className="mt-1 text-sm font-bold text-blue-600">{job.company}</p>
            <p className="mt-1 text-[13px] text-slate-500">
              {CATEGORY_LABELS[job.category]} · {job.district}, {job.city} · {formatPostedAgo(job.createdAt)}
            </p>
          </div>
          <div className="flex-none flex items-center gap-1 -mr-2 -mt-1">
            <button
              type="button"
              onClick={() => onToggleBookmark(job.id)}
              aria-pressed={isBookmarked}
              aria-label={isBookmarked ? 'Bỏ lưu việc này' : 'Lưu việc này'}
              className={`w-10 h-10 flex items-center justify-center rounded-full border cursor-pointer transition-colors ${isBookmarked ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-white border-slate-200 text-slate-400 hover:text-rose-500'}`}
            >
              <Heart className="w-5 h-5" strokeWidth={1.75} fill={isBookmarked ? 'currentColor' : 'none'} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Đóng chi tiết"
              className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-slate-200 text-slate-500 hover:text-slate-900 cursor-pointer"
            >
              <X className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>
        </div>

        {/* The wage, against the legal minimum */}
        <div className={`mt-4 rounded-2xl p-4 text-white shadow-md ${underMinimum ? 'bg-rose-600 shadow-rose-500/20' : 'bg-blue-600 shadow-blue-500/20'}`}>
          <p className="text-xs font-semibold text-white/80">{job.salaryType === 'Monthly' ? 'Lương theo tháng (월급)' : 'Lương theo giờ (시급)'}</p>
          <p className="num whitespace-nowrap mt-0.5">
            <span className="font-display text-[30px] leading-none font-extrabold">{formatKRW(job.salary)}</span>
            <span className="text-sm font-bold text-white/90"> {wageUnit(job)}</span>
          </p>
          <p className="mt-1.5 text-[13px] num text-white/90">{describeWageVsMinimum(job)}</p>
        </div>

        {/* The job's main action: reach the employer */}
        <div className="mt-4 flex gap-2">
          {job.phone ? (
            <a
              href={`tel:${job.phone}`}
              className="flex-1 h-12 inline-flex items-center justify-center gap-2 rounded-full bg-emerald-600 text-white text-sm font-bold shadow-sm hover:bg-emerald-700 transition-colors"
            >
              <Phone className="w-4 h-4" strokeWidth={1.75} />
              Gọi <span className="num">{job.phone}</span>
            </a>
          ) : (
            <span className="flex-1 h-12 inline-flex items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-500">Không có số điện thoại</span>
          )}
          {job.kakao && (
            <a
              href={`https://open.kakao.com/me/${job.kakao}`}
              target="_blank"
              rel="noreferrer"
              className="flex-1 h-12 inline-flex items-center justify-center gap-2 rounded-full bg-amber-400 text-amber-950 text-sm font-bold shadow-sm hover:bg-amber-500 transition-colors"
            >
              <MessageCircle className="w-4 h-4" strokeWidth={1.75} />
              KakaoTalk
            </a>
          )}
        </div>
      </div>

      {/* Facts */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-6">
        <dl className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 bg-slate-50/50 px-4">
          <div className="py-2.5 grid grid-cols-[112px_1fr] gap-3">
            <dt className="text-sm text-muted">Giờ làm</dt>
            <dd className="text-sm text-ink">{job.workingTime}</dd>
          </div>
          <div className="py-2.5 grid grid-cols-[112px_1fr] gap-3">
            <dt className="text-sm text-muted">Địa chỉ</dt>
            <dd className="text-sm text-ink">{job.address}</dd>
          </div>
          <div className="py-2.5 grid grid-cols-[112px_1fr] gap-3 items-center">
            <dt className="text-sm text-muted">Khoảng cách</dt>
            <dd className="text-sm text-ink">
              {distance ? (
                <span className="num">{distance} đường chim bay từ vị trí của bạn</span>
              ) : (
                <button
                  type="button"
                  onClick={onLocateUser}
                  disabled={isLocatingUser}
                  className="inline-flex items-center gap-1.5 font-bold text-emerald-600 underline underline-offset-4 cursor-pointer disabled:text-slate-400"
                >
                  <LocateFixed className="w-4 h-4" strokeWidth={1.75} />
                  {isLocatingUser ? 'Đang định vị…' : 'Bật vị trí để tính'}
                </button>
              )}
            </dd>
          </div>
          {(job.kakao || job.line) && (
            <div className="py-2.5 grid grid-cols-[112px_1fr] gap-3">
              <dt className="text-sm text-muted">Liên hệ khác</dt>
              <dd className="text-sm text-ink space-y-0.5">
                {job.kakao && <p>Kakao ID: {job.kakao}</p>}
                {job.line && <p>Line ID: {job.line}</p>}
              </dd>
            </div>
          )}
        </dl>

        <section aria-labelledby="directions-title" className="space-y-2">
          <h3 id="directions-title" className="font-display text-sm font-bold text-slate-900">Chỉ đường</h3>
          <div className="grid grid-cols-3 gap-2">
            {directions.map(d => (
              <a
                key={d.label}
                href={d.href}
                target="_blank"
                rel="noreferrer"
                className={`h-11 inline-flex items-center justify-center gap-1 rounded-xl text-xs font-extrabold shadow-sm transition-colors ${d.className}`}
              >
                {d.label}
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>
            ))}
          </div>
        </section>

        <section aria-labelledby="description-title" className="space-y-2">
          <h3 id="description-title" className="font-display text-sm font-bold text-slate-900">Mô tả công việc</h3>
          <p className="rounded-2xl border border-slate-200/80 bg-white p-4 text-[15px] leading-6 text-slate-700 whitespace-pre-line">{job.description}</p>
        </section>

        <div className="rounded-2xl bg-amber-50 border border-amber-200 px-3.5 py-3 text-[13px] leading-5 text-[#92400e]">
          Không đóng phí hay đặt cọc để được nhận việc, và không giao hộ chiếu hoặc thẻ cư trú cho chủ. Du học sinh D-2/D-4 cần giấy phép làm thêm (시간제취업허가) trước khi đi làm.
        </div>

        <p className="text-xs text-muted pb-2">
          Nguồn: {SOURCE_LABELS[job.source] || job.source}
          {job.sourceUrl && (
            <> · <a href={job.sourceUrl} target="_blank" rel="noreferrer" className="underline underline-offset-4 text-ink">Xem tin gốc</a></>
          )}
          {' '}· Đăng ngày {new Date(job.createdAt).toLocaleDateString('vi-VN')} · <span className="num">{job.views}</span> lượt xem
        </p>
      </div>
    </div>
  );
}
