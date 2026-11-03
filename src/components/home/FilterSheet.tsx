/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { CITY_LABELS, MIN_HOURLY_WAGE, MIN_MONTHLY_WAGE, MIN_WAGE_YEAR, formatKRW } from '../../utils/wage';

interface FilterSheetProps {
  open: boolean;
  onClose: () => void;
  resultCount: number;
  cityFilter: string;
  setCityFilter: (v: string) => void;
  salaryTypeFilter: string;
  setSalaryTypeFilter: (v: string) => void;
  minSalaryFilter: string;
  setMinSalaryFilter: (v: string) => void;
  showSavedOnly: boolean;
  setShowSavedOnly: (v: boolean) => void;
  onReset: () => void;
}

const CITY_OPTIONS = [{ id: 'All', label: 'Tất cả' }, ...Object.entries(CITY_LABELS).map(([id, label]) => ({ id, label }))];
const PAY_OPTIONS = [
  { id: 'All', label: 'Tất cả' },
  { id: 'Hourly', label: 'Theo giờ' },
  { id: 'Monthly', label: 'Theo tháng' }
];

function OptionGroup({ label, options, value, onChange }: {
  label: string;
  options: { id: string; label: string }[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-bold text-slate-900">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map(opt => (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={value === opt.id}
            onClick={() => onChange(opt.id)}
            className={`h-9 px-4 rounded-full text-sm font-semibold border transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
              value === opt.id
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** Filters that do not fit the chip row: city, pay type, a wage floor and saved jobs. Changes apply at once. */
export default function FilterSheet(props: FilterSheetProps) {
  const {
    open, onClose, resultCount,
    cityFilter, setCityFilter, salaryTypeFilter, setSalaryTypeFilter,
    minSalaryFilter, setMinSalaryFilter, showSavedOnly, setShowSavedOnly, onReset
  } = props;
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const floor = salaryTypeFilter === 'Monthly' ? MIN_MONTHLY_WAGE : MIN_HOURLY_WAGE;
  const floorUnit = salaryTypeFilter === 'Monthly' ? '₩/tháng' : '₩/giờ';

  return (
    <div className="fixed inset-0 z-[2500] flex items-end sm:items-center justify-center" role="presentation">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="filter-sheet-title"
        className="relative w-full sm:max-w-md bg-white rounded-t-[2rem] sm:rounded-3xl shadow-[0_8px_32px_rgba(0,0,0,0.18)] outline-none max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-5 h-14 border-b border-rule">
          <h2 id="filter-sheet-title" className="font-display text-lg font-extrabold text-slate-900">Bộ lọc</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng bộ lọc"
            className="w-10 h-10 -mr-2 flex items-center justify-center rounded-full text-muted hover:text-ink hover:bg-raised cursor-pointer"
          >
            <X className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5 space-y-6">
          <OptionGroup label="Khu vực" options={CITY_OPTIONS} value={cityFilter} onChange={setCityFilter} />
          <OptionGroup label="Hình thức trả lương" options={PAY_OPTIONS} value={salaryTypeFilter} onChange={setSalaryTypeFilter} />

          <div className="space-y-2">
            <label htmlFor="min-salary" className="block text-sm font-bold text-slate-900">Lương từ</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  id="min-salary"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  step={100}
                  value={minSalaryFilter}
                  onChange={(e) => setMinSalaryFilter(e.target.value)}
                  placeholder={formatKRW(floor)}
                  aria-describedby="min-salary-hint"
                  className="num w-full h-11 pl-4 pr-20 rounded-xl border border-slate-200 bg-slate-50 font-semibold bg-surface text-sm text-ink placeholder:text-muted focus:outline-2 focus:outline-offset-0 focus:outline-ink"
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted pointer-events-none">{floorUnit}</span>
              </div>
              <button
                type="button"
                onClick={() => setMinSalaryFilter(String(floor))}
                className="h-11 px-4 rounded-xl border border-blue-200 bg-blue-50 text-sm font-bold text-blue-600 hover:bg-blue-100 cursor-pointer whitespace-nowrap"
              >
                Từ mức tối thiểu
              </button>
            </div>
            <p id="min-salary-hint" className="text-xs text-muted">
              Lương tối thiểu {MIN_WAGE_YEAR}: <span className="num">{formatKRW(MIN_HOURLY_WAGE)}</span> ₩/giờ · <span className="num">{formatKRW(MIN_MONTHLY_WAGE)}</span> ₩/tháng
            </p>
          </div>

          <label className="flex items-center justify-between gap-4 cursor-pointer">
            <span className="text-sm font-bold text-slate-900">Chỉ việc đã lưu</span>
            <input
              type="checkbox"
              checked={showSavedOnly}
              onChange={(e) => setShowSavedOnly(e.target.checked)}
              className="w-5 h-5 accent-[#2563eb] cursor-pointer"
            />
          </label>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-rule">
          <button
            type="button"
            onClick={onReset}
            className="h-12 px-5 rounded-full text-sm font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
          >
            Xóa bộ lọc
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 h-12 rounded-full bg-blue-600 text-white text-sm font-bold shadow-md hover:bg-blue-700 cursor-pointer"
          >
            Xem <span className="num">{resultCount}</span> việc
          </button>
        </div>
      </div>
    </div>
  );
}
