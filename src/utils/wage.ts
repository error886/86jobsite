/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Job, JobCategory } from '../types';

// 2026 legal minimum wage in South Korea (최저임금): 10,320 KRW per hour.
// The monthly figure is the official 209-hour month (40h/week incl. paid weekly rest).
export const MIN_WAGE_YEAR = 2026;
export const MIN_HOURLY_WAGE = 10320;
export const MIN_MONTHLY_WAGE = MIN_HOURLY_WAGE * 209; // 2,156,880

console.assert(MIN_MONTHLY_WAGE === 2156880, 'monthly minimum wage must be 209 × hourly');

export const CATEGORY_LABELS: Record<JobCategory, string> = {
  'Restaurant': 'Nhà hàng',
  'Cafe': 'Cà phê',
  'Factory': 'Nhà xưởng',
  'Warehouse': 'Kho bãi',
  'Convenience Store': 'Cửa hàng tiện lợi',
  'Office': 'Văn phòng',
  'Other': 'Khác'
};

export const CITY_LABELS: Record<string, string> = {
  'Seoul': 'Seoul',
  'Gyeonggi': 'Gyeonggi',
  'Incheon': 'Incheon',
  'Daejeon': 'Daejeon',
  'Busan': 'Busan',
  'Daegu': 'Daegu',
  'Gwangju': 'Gwangju'
};

const numberFormat = new Intl.NumberFormat('vi-VN');

/** "13.500" — Vietnamese thousands separators, no decimals (KRW has none). */
export function formatKRW(amount: number): string {
  return numberFormat.format(Math.round(amount));
}

/** "13,5k" — short form for map pins only. */
export function formatKRWShort(amount: number): string {
  if (amount >= 1000000) {
    return `${(amount / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}tr`;
  }
  if (amount >= 1000) {
    return `${(amount / 1000).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}k`;
  }
  return String(amount);
}

export function wageUnit(job: Pick<Job, 'salaryType'>): string {
  return job.salaryType === 'Monthly' ? '₩/tháng' : '₩/giờ';
}

/** The job's wage against the legal minimum for its pay type, in KRW. Negative means under the minimum. */
export function wageVsMinimum(job: Pick<Job, 'salary' | 'salaryType'>): number {
  const minimum = job.salaryType === 'Monthly' ? MIN_MONTHLY_WAGE : MIN_HOURLY_WAGE;
  return job.salary - minimum;
}

export function isUnderMinimum(job: Pick<Job, 'salary' | 'salaryType'>): boolean {
  return wageVsMinimum(job) < 0;
}

/** "+1.180 ₩ so với lương tối thiểu" / "Thấp hơn lương tối thiểu 460 ₩" / "Bằng lương tối thiểu". */
export function describeWageVsMinimum(job: Pick<Job, 'salary' | 'salaryType'>): string {
  const diff = wageVsMinimum(job);
  if (diff === 0) return `Bằng lương tối thiểu ${MIN_WAGE_YEAR}`;
  if (diff < 0) return `Thấp hơn lương tối thiểu ${MIN_WAGE_YEAR} ${formatKRW(-diff)} ₩`;
  return `+${formatKRW(diff)} ₩ so với lương tối thiểu ${MIN_WAGE_YEAR}`;
}

/** "Hôm nay", "Hôm qua", "3 ngày trước", or a date for older posts. */
export function formatPostedAgo(iso: string, now: Date = new Date()): string {
  const posted = new Date(iso);
  const days = Math.floor((startOfDay(now) - startOfDay(posted)) / 86400000);
  if (days <= 0) return 'Hôm nay';
  if (days === 1) return 'Hôm qua';
  if (days < 7) return `${days} ngày trước`;
  return posted.toLocaleDateString('vi-VN', { day: 'numeric', month: 'numeric' });
}

function startOfDay(d: Date): number {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
