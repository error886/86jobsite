/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Search, X, SlidersHorizontal, LocateFixed, History, Plus, Map as MapIcon } from 'lucide-react';
import { Job, JobCategory, RecentSearchItem } from '../../types';
import MapContainer from '../MapContainer';
import JobRow from './JobRow';
import FilterSheet from './FilterSheet';
import { calculateDistanceKm } from '../../utils/geo';
import { DETAIL_SHEET_RATIO } from '../JobDetailDrawer';
import { CATEGORY_LABELS, formatKRW, isUnderMinimum } from '../../utils/wage';

/*
 * Grid: on desktop (lg, >= 1024px) a 440px list column beside the map, which takes the rest.
 * The column has one 24px inset; rows bleed 8px past it (pl-4 inside a px-2 list = 24px text edge).
 * On a phone the map fills the screen under one floating search row and one chip row,
 * and the same list column becomes a bottom sheet with three heights.
 */

type SheetState = 'peek' | 'half' | 'full';
type SortKey = 'newest' | 'wage' | 'distance';

interface JobsHomeProps {
  jobs: Job[];
  allJobs: Job[];
  loading: boolean;
  error?: string | null;
  onRetry?: () => void;
  selectedJob: Job | null;
  onSelectJob: (job: Job | null) => void;
  bookmarkedIds: string[];
  onToggleBookmark: (jobId: string) => void;
  userLocation: { lat: number; lng: number } | null;
  onLocateUser: () => void;
  isLocating: boolean;
  searchQuery: string;
  setSearchQuery: (v: string) => void;
  cityFilter: string;
  setCityFilter: (v: string) => void;
  categoryFilter: string;
  setCategoryFilter: (v: string) => void;
  salaryTypeFilter: string;
  setSalaryTypeFilter: (v: string) => void;
  minSalaryFilter: string;
  setMinSalaryFilter: (v: string) => void;
  showSavedOnly: boolean;
  setShowSavedOnly: (v: boolean) => void;
  onResetFilters: () => void;
  recentSearches: RecentSearchItem[];
  onSelectRecentSearch: (item: RecentSearchItem) => void;
  onRemoveRecentSearch: (id: string, e: React.MouseEvent) => void;
  onClearRecentSearches: () => void;
  listTab: 'list' | 'chart';
  setListTab: (tab: 'list' | 'chart') => void;
  onPostJob: () => void;
}

// The wage chart (recharts) loads only when its tab is opened
const SalaryChart = lazy(() => import('../SalaryChart'));

const CATEGORY_CHIPS: { id: 'All' | JobCategory; label: string }[] = [
  { id: 'All', label: 'Tất cả' },
  ...(Object.keys(CATEGORY_LABELS) as JobCategory[]).map(id => ({ id, label: CATEGORY_LABELS[id] }))
];

const SHEET_HEIGHTS: Record<SheetState, string> = {
  peek: '132px',
  half: '50%',
  full: 'calc(100% - 64px)'
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

export default function JobsHome(props: JobsHomeProps) {
  const {
    jobs, allJobs, loading, error, onRetry, selectedJob, onSelectJob, bookmarkedIds, onToggleBookmark,
    userLocation, onLocateUser, isLocating,
    searchQuery, setSearchQuery, cityFilter, setCityFilter, categoryFilter, setCategoryFilter,
    salaryTypeFilter, setSalaryTypeFilter, minSalaryFilter, setMinSalaryFilter,
    showSavedOnly, setShowSavedOnly, onResetFilters,
    recentSearches, onSelectRecentSearch, onRemoveRecentSearch, onClearRecentSearches,
    listTab, setListTab, onPostJob
  } = props;

  const isDesktop = useIsDesktop();
  const [sheet, setSheet] = useState<SheetState>('half');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>('newest');
  const [locateTick, setLocateTick] = useState(0);
  const sheetRef = useRef<HTMLElement | null>(null);
  const [sheetPx, setSheetPx] = useState(0);

  // Track the sheet's real height so the map fits its pins into the part the sheet leaves visible
  useEffect(() => {
    if (!sheetRef.current) return;
    const el = sheetRef.current;
    const observer = new ResizeObserver(() => setSheetPx(el.getBoundingClientRect().height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const sortedJobs = useMemo(() => {
    const list = [...jobs];
    if (sort === 'wage') {
      // Hourly first, each group from the highest wage
      list.sort((a, b) => (a.salaryType === b.salaryType ? b.salary - a.salary : a.salaryType === 'Hourly' ? -1 : 1));
    } else if (sort === 'distance' && userLocation) {
      const d = (j: Job) => calculateDistanceKm(userLocation.lat, userLocation.lng, j.latitude, j.longitude);
      list.sort((a, b) => d(a) - d(b));
    } else {
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return list;
  }, [jobs, sort, userLocation]);

  // The screen's finding, computed from the rows on screen
  const finding = useMemo(() => {
    const hourly = jobs.filter(j => j.salaryType === 'Hourly');
    const top = hourly.reduce<Job | null>((best, j) => (!best || j.salary > best.salary ? j : best), null);
    const under = jobs.filter(isUnderMinimum).length;
    return { top, under };
  }, [jobs]);

  const activeFilterCount =
    (cityFilter !== 'All' ? 1 : 0) +
    (salaryTypeFilter !== 'All' ? 1 : 0) +
    (minSalaryFilter.trim() ? 1 : 0) +
    (showSavedOnly ? 1 : 0);

  // Drag the sheet's handle: follow the finger, then snap to the nearest height
  const dragRef = useRef<{ startY: number; startH: number; parentH: number } | null>(null);
  const [dragHeight, setDragHeight] = useState<number | null>(null);

  const onHandlePointerDown = (e: React.PointerEvent) => {
    if (isDesktop || !sheetRef.current?.parentElement) return;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = {
      startY: e.clientY,
      startH: sheetRef.current.getBoundingClientRect().height,
      parentH: sheetRef.current.parentElement.getBoundingClientRect().height
    };
  };
  const onHandlePointerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const h = Math.min(d.parentH - 64, Math.max(96, d.startH - (e.clientY - d.startY)));
    setDragHeight(h);
  };
  const onHandlePointerUp = (e: React.PointerEvent) => {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    const moved = Math.abs(e.clientY - d.startY);
    setDragHeight(null);
    if (moved < 6) {
      setSheet(s => (s === 'peek' ? 'half' : s === 'half' ? 'full' : 'half'));
      return;
    }
    const h = d.startH - (e.clientY - d.startY);
    const targets: [SheetState, number][] = [['peek', 132], ['half', d.parentH * 0.5], ['full', d.parentH - 64]];
    targets.sort((a, b) => Math.abs(a[1] - h) - Math.abs(b[1] - h));
    setSheet(targets[0][0]);
  };

  const handleSelect = (job: Job) => {
    onSelectJob(job);
    if (!isDesktop && sheet === 'full') setSheet('half');
  };

  const handleLocate = () => {
    onLocateUser();
    setLocateTick(t => t + 1);
  };

  // The job card covers the lower half of a phone, or a 420px column on desktop
  const mapBottomInset = isDesktop ? 0 : selectedJob ? Math.round(window.innerHeight * DETAIL_SHEET_RATIO) : Math.round(sheetPx);
  const mapRightInset = isDesktop && selectedJob ? 420 : 0;

  const searchField = (
    <SearchField
      value={searchQuery}
      onChange={setSearchQuery}
      recentSearches={recentSearches}
      onSelectRecent={onSelectRecentSearch}
      onRemoveRecent={onRemoveRecentSearch}
      onClearRecent={onClearRecentSearches}
    />
  );

  const chipRow = (
    <div className="flex gap-2 overflow-x-auto no-scrollbar" role="toolbar" aria-label="Lọc theo ngành">
      <button
        type="button"
        onClick={() => setFiltersOpen(true)}
        className={`flex-none h-9 px-3.5 inline-flex items-center gap-1.5 rounded-full border text-sm font-semibold shadow-sm cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
          activeFilterCount > 0 ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
        }`}
      >
        <SlidersHorizontal className="w-4 h-4" strokeWidth={1.75} />
        <span>Bộ lọc{activeFilterCount > 0 && <span className="num"> {activeFilterCount}</span>}</span>
      </button>
      {CATEGORY_CHIPS.map(chip => (
        <button
          key={chip.id}
          type="button"
          aria-pressed={categoryFilter === chip.id}
          onClick={() => setCategoryFilter(chip.id)}
          className={`flex-none h-9 px-3.5 rounded-full border text-sm font-semibold whitespace-nowrap shadow-sm cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink ${
            categoryFilter === chip.id
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          {chip.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="relative w-full h-[calc(100dvh-48px)] lg:h-[calc(100dvh-56px)] lg:grid lg:grid-cols-[440px_1fr] bg-ground overflow-hidden">

      {/* MAP — full screen on a phone, the right side on desktop */}
      <div className="absolute inset-0 lg:static lg:order-2 lg:h-full">
        <MapContainer
          jobs={jobs}
          selectedJob={selectedJob}
          onSelectJob={(j) => handleSelect(j)}
          userLocation={userLocation}
          locateTick={locateTick}
          bottomInset={mapBottomInset}
          rightInset={mapRightInset}
        />

        {/* Phone: one search row and one chip row over the map */}
        <div className="lg:hidden absolute top-3 left-4 right-4 z-[900] space-y-2">
          {searchField}
          {chipRow}
        </div>

        <button
          type="button"
          onClick={handleLocate}
          aria-label="Về vị trí của tôi"
          style={!isDesktop ? { bottom: mapBottomInset + 12 } : undefined}
          className={`absolute right-4 lg:top-4 lg:bottom-auto z-[900] w-11 h-11 rounded-full bg-white border border-slate-200 shadow-xl flex items-center justify-center cursor-pointer hover:bg-slate-50 transition-colors focus-visible:outline-2 focus-visible:outline-ink ${
            userLocation ? 'text-emerald-600' : 'text-blue-600'
          }`}
        >
          <LocateFixed className={`w-5 h-5 ${isLocating ? "opacity-40" : ""}`} strokeWidth={1.75} />
        </button>
      </div>

      {/* LIST — the left column on desktop, a bottom sheet on a phone */}
      <section
        ref={sheetRef}
        aria-labelledby="jobs-title"
        style={!isDesktop ? { height: dragHeight !== null ? `${dragHeight}px` : SHEET_HEIGHTS[sheet] } : undefined}
        className={`absolute inset-x-0 bottom-0 z-[950] flex flex-col bg-white rounded-t-[2rem] shadow-[0_-10px_30px_rgba(15,23,42,0.10)] lg:static lg:order-1 lg:h-full lg:rounded-none lg:shadow-none lg:border-r lg:border-slate-200/80 ${
          dragHeight === null ? 'transition-[height] duration-200 ease-out' : ''
        }`}
      >
        {/* Phone: the handle; a tap steps the sheet up, a drag sets it */}
        <button
          type="button"
          aria-label={sheet === 'full' ? 'Thu nhỏ danh sách' : 'Mở rộng danh sách'}
          onPointerDown={onHandlePointerDown}
          onPointerMove={onHandlePointerMove}
          onPointerUp={onHandlePointerUp}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') { e.preventDefault(); setSheet(s => (s === 'peek' ? 'half' : 'full')); }
            if (e.key === 'ArrowDown') { e.preventDefault(); setSheet(s => (s === 'full' ? 'half' : 'peek')); }
          }}
          className="lg:hidden flex-none w-full h-6 flex items-center justify-center touch-none cursor-grab active:cursor-grabbing"
        >
          <span className="w-12 h-1.5 rounded-full bg-slate-300" />
        </button>

        {/* Title row */}
        <div className="flex-none px-4 lg:px-6 pt-1 lg:pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 id="jobs-title" className="font-display text-xl lg:text-2xl font-extrabold text-slate-900">
                Việc làm thêm
              </h1>
              <p className="mt-1 text-sm text-slate-500 truncate">
                {loading ? 'Đang tải tin tuyển dụng…' : (
                  <>
                    <span className="num">{jobs.length}</span> việc
                    {finding.top && (
                      <> · cao nhất <span className="num font-bold text-blue-600">{formatKRW(finding.top.salary)}</span> ₩/giờ</>
                    )}
                    {finding.under > 0 && (
                      <span className="lg:hidden font-semibold text-rose-600"> · <span className="num">{finding.under}</span> dưới mức tối thiểu</span>
                    )}
                  </>
                )}
              </p>
              {!loading && finding.under > 0 && (
                <p className="hidden lg:block text-sm font-semibold text-rose-600">
                  <span className="num">{finding.under}</span> tin trả dưới lương tối thiểu
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={onPostJob}
              className="hidden lg:inline-flex flex-none h-10 px-4 items-center gap-1.5 rounded-full bg-blue-600 text-white text-sm font-bold shadow-md hover:bg-blue-700 hover:shadow-lg transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            >
              <Plus className="w-4 h-4" strokeWidth={2} />
              <span>Đăng tin</span>
            </button>
          </div>

          {/* Desktop: search and chips sit in the column */}
          <div className="hidden lg:block mt-5 space-y-3">
            {searchField}
            {chipRow}
          </div>

          {/* Tabs and sort */}
          <div className="mt-3 lg:mt-5 flex items-end justify-between border-b border-slate-200">
            <div className="flex gap-5" role="tablist" aria-label="Chế độ xem">
              {([['list', 'Danh sách'], ['chart', 'Mức lương']] as const).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={listTab === id}
                  onClick={() => { setListTab(id); if (!isDesktop && sheet === 'peek') setSheet('half'); }}
                  className={`h-10 -mb-px border-b-2 text-sm whitespace-nowrap cursor-pointer transition-colors ${
                    listTab === id ? 'border-blue-600 text-blue-600 font-bold' : 'border-transparent text-slate-500 font-semibold hover:text-slate-900'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {listTab === 'list' && (
              <label className="mb-1.5 flex items-center gap-1.5 text-sm text-muted">
                <span className="sr-only">Sắp xếp</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as SortKey)}
                  className="h-8 pl-3 pr-7 rounded-xl border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 cursor-pointer"
                >
                  <option value="newest">Mới nhất</option>
                  <option value="wage">Lương cao nhất</option>
                  <option value="distance" disabled={!userLocation}>Gần nhất</option>
                </select>
              </label>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-slate-50">
          {listTab === 'chart' ? (
            <div className="p-4 lg:p-6">
              <Suspense fallback={<p className="py-12 text-center text-sm text-slate-500">Đang tải biểu đồ…</p>}>
              <SalaryChart
                jobs={allJobs}
                onSelectCategory={(cat) => { setCategoryFilter(cat); setListTab('list'); }}
                onSelectCity={(city) => { setCityFilter(city); setListTab('list'); }}
                currentCityFilter={cityFilter}
                currentCategoryFilter={categoryFilter}
              />
              </Suspense>
            </div>
          ) : loading && jobs.length === 0 ? (
            <ul className="px-4 lg:px-6 py-4 space-y-3" aria-busy="true">
              {[0, 1, 2, 3].map(i => (
                <li key={i} className="bg-white rounded-2xl border border-slate-200/80 p-4">
                  <span className="block h-[18px] w-3/5 rounded bg-raised" />
                  <span className="block mt-2 h-[14px] w-2/5 rounded bg-raised" />
                </li>
              ))}
            </ul>
          ) : error && jobs.length === 0 ? (
            <div className="px-4 lg:px-6 py-6">
              <div className="bg-white rounded-2xl border border-rose-200 shadow-sm px-5 py-6 text-center" role="alert">
                <p className="text-sm text-slate-800">{error}</p>
                <button type="button" onClick={onRetry} className="mt-3 h-10 px-5 rounded-full bg-blue-600 text-white text-sm font-bold cursor-pointer">
                  Thử lại
                </button>
              </div>
            </div>
          ) : sortedJobs.length === 0 ? (
            <div className="px-4 lg:px-6 py-6">
              <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm px-5 py-6 text-center">
                <p className="text-sm text-ink">Không có việc nào khớp bộ lọc này.</p>
                <button type="button" onClick={onResetFilters} className="mt-2 text-sm font-bold text-blue-600 underline underline-offset-4 cursor-pointer">
                  Xóa bộ lọc
                </button>
              </div>
            </div>
          ) : (
            <ul className="px-4 lg:px-6 py-4 pb-8 space-y-3">
              {sortedJobs.map(job => (
                <JobRow
                  key={job.id}
                  job={job}
                  isSelected={selectedJob?.id === job.id}
                  isBookmarked={bookmarkedIds.includes(job.id)}
                  userLocation={userLocation}
                  onSelect={handleSelect}
                  onToggleBookmark={onToggleBookmark}
                />
              ))}
            </ul>
          )}
        </div>

        {/* Phone, full sheet: a way back to the map */}
        {!isDesktop && sheet === 'full' && (
          <button
            type="button"
            onClick={() => setSheet('peek')}
            className="absolute left-1/2 -translate-x-1/2 bottom-5 h-11 px-4 inline-flex items-center gap-2 rounded-full bg-primary text-white text-sm font-medium shadow-[0_4px_16px_rgba(0,0,0,0.25)] cursor-pointer"
          >
            <MapIcon className="w-4 h-4" strokeWidth={1.75} />
            <span>Bản đồ</span>
          </button>
        )}
      </section>

      <FilterSheet
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        resultCount={jobs.length}
        cityFilter={cityFilter}
        setCityFilter={setCityFilter}
        salaryTypeFilter={salaryTypeFilter}
        setSalaryTypeFilter={setSalaryTypeFilter}
        minSalaryFilter={minSalaryFilter}
        setMinSalaryFilter={setMinSalaryFilter}
        showSavedOnly={showSavedOnly}
        setShowSavedOnly={setShowSavedOnly}
        onReset={onResetFilters}
      />
    </div>
  );
}

// ----------------------------------------------------
// SEARCH with recent searches under it while focused
// ----------------------------------------------------
function SearchField({ value, onChange, recentSearches, onSelectRecent, onRemoveRecent, onClearRecent }: {
  value: string;
  onChange: (v: string) => void;
  recentSearches: RecentSearchItem[];
  onSelectRecent: (item: RecentSearchItem) => void;
  onRemoveRecent: (id: string, e: React.MouseEvent) => void;
  onClearRecent: () => void;
}) {
  const [focused, setFocused] = useState(false);
  const showRecent = focused && !value && recentSearches.length > 0;

  return (
    <div
      className="relative"
      onFocus={() => setFocused(true)}
      onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocused(false); }}
    >
      <label className="flex items-center gap-2 h-12 lg:h-11 px-4 rounded-full bg-white border border-slate-200 shadow-xl lg:shadow-sm focus-within:border-blue-500 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
        <Search className="w-[18px] h-[18px] text-blue-600 flex-none" />
        <span className="sr-only">Tìm việc</span>
        <input
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Tìm việc, khu vực, 식당, 카페…"
          className="w-full bg-transparent outline-none text-[15px] lg:text-sm font-semibold text-slate-800 placeholder:text-slate-500 placeholder:font-medium [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            onClick={() => onChange('')}
            aria-label="Xóa nội dung tìm"
            className="flex-none w-8 h-8 -mr-1 flex items-center justify-center rounded text-muted hover:text-ink cursor-pointer"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        )}
      </label>

      {showRecent && (
        <div className="absolute left-0 right-0 top-full mt-2 z-[1000] bg-white rounded-2xl border border-slate-200 shadow-xl py-2">
          <div className="flex items-center justify-between px-3 h-8">
            <span className="text-xs text-muted">Tìm gần đây</span>
            <button type="button" onClick={onClearRecent} className="text-xs text-muted hover:text-ink cursor-pointer">Xóa hết</button>
          </div>
          <ul>
            {recentSearches.map(item => (
              <li key={item.id} className="flex items-center">
                <button
                  type="button"
                  onClick={() => { onSelectRecent(item); setFocused(false); }}
                  className="flex-1 min-w-0 flex items-center gap-2 h-10 px-3 text-left text-sm text-ink hover:bg-ground cursor-pointer"
                >
                  <History className="w-4 h-4 text-muted flex-none" strokeWidth={1.75} />
                  <span className="truncate">{item.label}</span>
                </button>
                <button
                  type="button"
                  onClick={(e) => onRemoveRecent(item.id, e)}
                  aria-label={`Xóa "${item.label}" khỏi tìm gần đây`}
                  className="w-10 h-10 flex items-center justify-center text-muted hover:text-ink cursor-pointer"
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
