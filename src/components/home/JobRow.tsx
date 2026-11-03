/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Heart, MapPin } from 'lucide-react';
import { Job } from '../../types';
import { calculateDistanceKm, formatDistance } from '../../utils/geo';
import { CATEGORY_LABELS, formatKRW, formatPostedAgo, isUnderMinimum, wageUnit } from '../../utils/wage';

interface JobRowProps {
  key?: React.Key;
  job: Job;
  isSelected: boolean;
  isBookmarked: boolean;
  userLocation: { lat: number; lng: number } | null;
  onSelect: (job: Job) => void;
  onToggleBookmark: (jobId: string) => void;
}

/**
 * One job as a rounded card: trade and save on top, the job and its wage, then place, distance and age.
 * A job paying under the legal minimum gets one red tag instead of the age.
 */
export default function JobRow({ job, isSelected, isBookmarked, userLocation, onSelect, onToggleBookmark }: JobRowProps) {
  const underMinimum = isUnderMinimum(job);
  const distance = userLocation
    ? formatDistance(calculateDistanceKm(userLocation.lat, userLocation.lng, job.latitude, job.longitude))
    : null;

  return (
    <li className="relative">
      <button
        type="button"
        onClick={() => onSelect(job)}
        aria-current={isSelected ? 'true' : undefined}
        className={`w-full text-left bg-white rounded-2xl border p-4 pr-14 transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
          isSelected
            ? 'border-blue-500 ring-2 ring-blue-500/20 shadow-md'
            : 'border-slate-200/80 shadow-sm hover:shadow-md hover:border-slate-300'
        }`}
      >
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold">
            {CATEGORY_LABELS[job.category]}
          </span>
          {underMinimum ? (
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full bg-rose-50 text-rose-700 text-xs font-semibold">
              Dưới lương tối thiểu
            </span>
          ) : (
            <span className="text-xs text-slate-500">{formatPostedAgo(job.createdAt)}</span>
          )}
        </span>

        <span className="mt-2 block font-display text-base font-bold text-slate-900 leading-snug line-clamp-2">
          {job.title}
        </span>

        <span className="mt-2 flex items-end justify-between gap-3">
          <span className="min-w-0 flex items-center gap-1 text-[13px] text-slate-500">
            <MapPin className="w-3.5 h-3.5 flex-none text-slate-400" />
            <span className="truncate">
              {job.district}, {job.city}
              {distance && <> · <span className="num">{distance}</span></>}
            </span>
          </span>
          <span className="num flex-none whitespace-nowrap">
            <span className={`text-lg font-extrabold ${underMinimum ? 'text-slate-900' : 'text-blue-600'}`}>{formatKRW(job.salary)}</span>
            <span className="text-xs font-semibold text-slate-500"> {wageUnit(job)}</span>
          </span>
        </span>
      </button>

      <button
        type="button"
        onClick={() => onToggleBookmark(job.id)}
        aria-pressed={isBookmarked}
        aria-label={isBookmarked ? `Bỏ lưu ${job.title}` : `Lưu ${job.title}`}
        className={`absolute right-3 top-3 w-9 h-9 flex items-center justify-center rounded-full border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-blue-600 ${
          isBookmarked ? 'bg-rose-50 border-rose-100 text-rose-500' : 'bg-white border-slate-200 text-slate-400 hover:text-rose-500'
        }`}
      >
        <Heart className="w-4 h-4" fill={isBookmarked ? 'currentColor' : 'none'} />
      </button>
    </li>
  );
}
