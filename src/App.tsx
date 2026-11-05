/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, MapPin, Briefcase, Filter, Heart, SlidersHorizontal, 
  Map as MapIcon, ChevronRight, BookmarkCheck, CheckCircle2, 
  AlertCircle, Sparkles, Loader2, ArrowRight, Columns, BarChart3,
  History, Trash2, X
} from 'lucide-react';
import Header from './components/Header';
import JobsHome from './components/home/JobsHome';
import JobCard from './components/JobCard';
import JobDetailDrawer from './components/JobDetailDrawer';
// Tabs most visitors never open load on demand
const AIParsingTool = lazy(() => import('./components/AIParsingTool'));
const AdminPanel = lazy(() => import('./components/AdminPanel'));
import ContactModal from './components/ContactModal';
import Logo from './components/Logo';
import AuthModal from './components/AuthModal';
import { Job, User, Bookmark, RecentSearchItem } from './types';
import { INITIAL_JOBS } from './data/initialJobs';
import { auth, db, logoutFirebase } from './lib/firebase';
import { apiFetch, fetchServerRole, getDevToken, setDevToken, DEV_TEST_PROFILES, DevTestAccount } from './lib/api';
import { onAuthStateChanged, User as FirebaseUser } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

const formatFilterLabel = (
  q: string,
  city: string,
  cat: string,
  salType: string,
  minSal: string
): string => {
  const parts: string[] = [];
  if (q.trim()) parts.push(`"${q.trim()}"`);
  if (city !== 'All') parts.push(city);
  if (cat !== 'All') {
    const catMap: Record<string, string> = {
      Restaurant: 'Nhà hàng',
      Cafe: 'Cà phê',
      Factory: 'Nhà xưởng',
      Warehouse: 'Kho bãi',
      'Convenience Store': 'Cửa hàng tiện lợi',
      Office: 'Văn phòng',
      Other: 'Khác',
    };
    parts.push(catMap[cat] || cat);
  }
  if (salType !== 'All') parts.push(salType === 'Hourly' ? 'Theo giờ' : 'Theo tháng');
  if (minSal.trim()) parts.push(`≥${minSal.trim()} KRW`);
  return parts.length > 0 ? parts.join(' • ') : 'Tất cả việc làm';
};

export default function App() {
  const [jobs, setJobs] = useState<Job[]>(() => INITIAL_JOBS.filter(j => j.status === 'approved'));
  const [adminJobsList, setAdminJobsList] = useState<Job[]>(INITIAL_JOBS); // Full list including pending for Admin
  const [loading, setLoading] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<'list' | 'chart'>('list');
  
  // Auth state (Default to guest / null)
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('86job_user');
    if (saved) {
      try { return JSON.parse(saved); } catch (e) { return null; }
    }
    return null;
  });

  // Auth Modal State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register'>('login');
  const [authPromptMessage, setAuthPromptMessage] = useState<string>('');

  const openAuthModal = (tab: 'login' | 'register' = 'login', promptMessage: string = '') => {
    setAuthModalTab(tab);
    setAuthPromptMessage(promptMessage);
    setAuthModalOpen(true);
  };

  // Build the app user from Firebase; the role always comes from the server
  const syncUser = async (fbUser: FirebaseUser) => {
    let profile: User = {
      id: fbUser.uid,
      name: fbUser.displayName || fbUser.email?.split('@')[0] || 'Người dùng',
      email: fbUser.email || '',
      avatar: fbUser.photoURL || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(fbUser.email || 'user')}`,
      role: 'user',
      createdAt: new Date().toISOString()
    };
    try {
      const snap = await getDoc(doc(db, 'users', fbUser.uid));
      if (snap.exists()) {
        profile = { ...profile, ...(snap.data() as User), id: fbUser.uid };
      }
    } catch (e) {
      console.warn("Firebase Auth state fetch error:", e);
    }
    const fullUser = { ...profile, role: await fetchServerRole() };
    setCurrentUser(fullUser);
    localStorage.setItem('86job_user', JSON.stringify(fullUser));
  };

  // Local test account (dev server with DEV_AUTH=1): the role still comes from the server
  const syncDevUser = async (token: DevTestAccount) => {
    const fullUser: User = { ...DEV_TEST_PROFILES[token], role: await fetchServerRole() };
    setCurrentUser(fullUser);
    localStorage.setItem('86job_user', JSON.stringify(fullUser));
  };

  // Sync Firebase Auth state with App state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (fbUser) => {
      const devToken = getDevToken();
      if (fbUser) {
        syncUser(fbUser);
      } else if (devToken) {
        syncDevUser(devToken);
      } else {
        // No Firebase session means no valid token: drop any cached user
        setCurrentUser(null);
        localStorage.removeItem('86job_user');
      }
    });

    return () => unsubscribe();
  }, []);

  // Bookmark state
  const [bookmarkedIds, setBookmarkedIds] = useState<string[]>([]);
  
  // Geolocation User Location State
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isLocating, setIsLocating] = useState(false);

  const handleLocateUser = () => {
    if (!navigator.geolocation) return;
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setIsLocating(false);
      },
      (err) => {
        console.warn('Geolocation error:', err);
        setIsLocating(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
  };

  useEffect(() => {
    handleLocateUser();
  }, []);

  // View/Route control
  const [activeTab, setActiveTab] = useState<string>('jobs');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [showFilters, setShowFilters] = useState<boolean>(false);
  // Advanced Filters State
  const [searchQuery, setSearchQuery] = useState('');
  const [cityFilter, setCityFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [salaryTypeFilter, setSalaryTypeFilter] = useState('All');
  const [minSalaryFilter, setMinSalaryFilter] = useState('');
  const [showSavedOnly, setShowSavedOnly] = useState(false);

  // Recent Searches stored in localStorage (last 5 filter combinations)
  const [recentSearches, setRecentSearches] = useState<RecentSearchItem[]>(() => {
    try {
      const saved = localStorage.getItem('86job_recent_searches');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Could not load recent searches from localStorage:', e);
    }
    return [];
  });

  // Automatically save filter combination to recent searches (debounced)
  useEffect(() => {
    const isDefault =
      !searchQuery.trim() &&
      cityFilter === 'All' &&
      categoryFilter === 'All' &&
      salaryTypeFilter === 'All' &&
      !minSalaryFilter.trim();

    if (isDefault) return;

    const timer = setTimeout(() => {
      const qVal = searchQuery.trim();
      const minSalVal = minSalaryFilter.trim();
      const newLabel = formatFilterLabel(qVal, cityFilter, categoryFilter, salaryTypeFilter, minSalVal);

      setRecentSearches((prev) => {
        const filtered = prev.filter((item) => {
          return !(
            item.searchQuery.toLowerCase() === qVal.toLowerCase() &&
            item.cityFilter === cityFilter &&
            item.categoryFilter === categoryFilter &&
            item.salaryTypeFilter === salaryTypeFilter &&
            item.minSalaryFilter === minSalVal
          );
        });

        const nextItem: RecentSearchItem = {
          id: `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          label: newLabel,
          searchQuery: qVal,
          cityFilter,
          categoryFilter,
          salaryTypeFilter,
          minSalaryFilter: minSalVal,
          timestamp: Date.now(),
        };

        const updated = [nextItem, ...filtered].slice(0, 5);
        try {
          localStorage.setItem('86job_recent_searches', JSON.stringify(updated));
        } catch (e) {
          console.warn('Could not save recent searches to localStorage:', e);
        }
        return updated;
      });
    }, 800);

    return () => clearTimeout(timer);
  }, [searchQuery, cityFilter, categoryFilter, salaryTypeFilter, minSalaryFilter]);

  const handleSelectRecentSearch = (item: RecentSearchItem) => {
    setSearchQuery(item.searchQuery);
    setCityFilter(item.cityFilter);
    setCategoryFilter(item.categoryFilter);
    setSalaryTypeFilter(item.salaryTypeFilter);
    setMinSalaryFilter(item.minSalaryFilter);
    setActiveTab('jobs');
  };

  const handleRemoveRecentSearch = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRecentSearches((prev) => {
      const updated = prev.filter((item) => item.id !== id);
      try {
        localStorage.setItem('86job_recent_searches', JSON.stringify(updated));
      } catch (err) {
        console.warn('Failed to update localStorage after removing recent search:', err);
      }
      return updated;
    });
  };

  const handleClearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem('86job_recent_searches');
    } catch (err) {
      console.warn('Failed to clear localStorage recent searches:', err);
    }
  };

  // Compute displayed jobs based on normal filters and showSavedOnly toggle
  const displayedJobs = showSavedOnly ? jobs.filter(j => bookmarkedIds.includes(j.id)) : jobs;

  // Fetch Jobs from backend API with client fallback
  const fetchJobs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (searchQuery) params.append('q', searchQuery);
      if (cityFilter && cityFilter !== 'All') params.append('city', cityFilter);
      if (categoryFilter && categoryFilter !== 'All') params.append('category', categoryFilter);
      if (salaryTypeFilter && salaryTypeFilter !== 'All') params.append('salaryType', salaryTypeFilter);
      if (minSalaryFilter) params.append('minSalary', minSalaryFilter);

      const res = await fetch(`/api/jobs?${params.toString()}`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        setJobs(data);
      } else {
        // Fallback to local filtering if backend unavailable
        let filtered = INITIAL_JOBS.filter(j => j.status === 'approved');
        if (searchQuery) {
          const s = searchQuery.toLowerCase();
          filtered = filtered.filter(j => j.title.toLowerCase().includes(s) || j.company.toLowerCase().includes(s) || j.city.toLowerCase().includes(s));
        }
        if (cityFilter && cityFilter !== 'All') filtered = filtered.filter(j => j.city.toLowerCase() === cityFilter.toLowerCase());
        if (categoryFilter && categoryFilter !== 'All') filtered = filtered.filter(j => j.category === categoryFilter);
        if (salaryTypeFilter && salaryTypeFilter !== 'All') filtered = filtered.filter(j => j.salaryType === salaryTypeFilter);
        if (minSalaryFilter) filtered = filtered.filter(j => j.salary >= parseInt(minSalaryFilter, 10));
        setJobs(filtered);
      }
    } catch (err) {
      console.warn('Jobs fetch notice:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch full list for Admin
  const fetchAdminJobs = async () => {
    if (currentUser?.role !== 'admin') return;
    try {
      const r1 = await apiFetch('/api/jobs?status=approved').catch(() => null);
      const r2 = await apiFetch('/api/jobs?status=pending').catch(() => null);
      const r3 = await apiFetch('/api/jobs?status=rejected').catch(() => null);
      
      const approved = r1 && r1.ok ? await r1.json() : INITIAL_JOBS.filter(j => j.status === 'approved');
      const pending = r2 && r2.ok ? await r2.json() : INITIAL_JOBS.filter(j => j.status === 'pending');
      const rejected = r3 && r3.ok ? await r3.json() : INITIAL_JOBS.filter(j => j.status === 'rejected');

      setAdminJobsList([...pending, ...approved, ...rejected]);
    } catch (err) {
      console.warn('Admin jobs fetch notice:', err);
    }
  };

  // Fetch user bookmarks from backend
  const fetchBookmarks = async () => {
    if (!currentUser) {
      setBookmarkedIds([]);
      return;
    }
    try {
      const res = await apiFetch(`/api/bookmarks/${currentUser.id}`).catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        setBookmarkedIds(data.map((b: Bookmark) => b.jobId));
      }
    } catch (err) {
      console.warn('Bookmarks fetch notice:', err);
    }
  };

  useEffect(() => {
    fetchJobs();
    if (currentUser?.role === 'admin') {
      fetchAdminJobs();
    }
  }, [searchQuery, cityFilter, categoryFilter, salaryTypeFilter, minSalaryFilter, activeTab]);

  useEffect(() => {
    fetchBookmarks();
    if (currentUser?.role === 'admin') {
      fetchAdminJobs();
    }
  }, [currentUser]);

  // Handle Quick Search Suggestions
  const handleQuickSearch = (keyword: string, cityVal?: string, catVal?: string) => {
    setSearchQuery(keyword);
    if (cityVal) setCityFilter(cityVal);
    if (catVal) setCategoryFilter(catVal);
    setActiveTab('jobs');
  };

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setCityFilter('All');
    setCategoryFilter('All');
    setSalaryTypeFilter('All');
    setMinSalaryFilter('');
    fetchJobs();
  };

  // Bookmarking Toggle
  const handleToggleBookmark = async (jobId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!currentUser) {
      openAuthModal('login', '🔒 Vui lòng đăng nhập để lưu công việc này vào danh sách yêu thích!');
      return;
    }

    try {
      const res = await apiFetch('/api/bookmarks/toggle', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ jobId })
      });

      if (res.ok) {
        const data = await res.json();
        if (data.bookmarked) {
          setBookmarkedIds(prev => [...prev, jobId]);
        } else {
          setBookmarkedIds(prev => prev.filter(id => id !== jobId));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Auth logins & persistance
  const handleLogin = () => {
    const devToken = getDevToken();
    if (auth.currentUser) {
      syncUser(auth.currentUser);
    } else if (devToken) {
      syncDevUser(devToken);
    }
  };

  const handleLogout = () => {
    logoutFirebase();
    setDevToken(null);
    setCurrentUser(null);
    localStorage.removeItem('86job_user');
    setBookmarkedIds([]);
    if (activeTab === 'bookmarks' || activeTab === 'admin') {
      setActiveTab('jobs');
    }
  };

  // MODERATOR ACTIONS
  const handleStatusUpdate = async (jobId: string, status: 'approved' | 'rejected') => {
    try {
      const res = await apiFetch(`/api/jobs/${jobId}/status`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchAdminJobs();
        fetchJobs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteJob = async (jobId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa vĩnh viễn công việc này khỏi hệ thống?')) return;
    try {
      const res = await apiFetch(`/api/jobs/${jobId}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        fetchAdminJobs();
        fetchJobs();
        if (selectedJob?.id === jobId) {
          setSelectedJob(null);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSimulateCrawl = async (source: string, url: string) => {
    try {
      const res = await apiFetch('/api/crawler/simulate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source, url })
      });
      if (res.ok) {
        fetchAdminJobs();
        fetchJobs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Trigger when new job created from AI Parser
  const handleNewJobCreated = (newJob: Job) => {
    setJobs(prev => [newJob, ...prev]);
    if (currentUser?.role === 'admin') {
      fetchAdminJobs();
    }
  };

  const handleNavTabChange = (tab: string) => {
    if (tab === 'chart') {
      setActiveTab('jobs');
      setSidebarTab('chart');
    } else {
      setActiveTab(tab);
    }
  };

  return (
    <div className="min-h-screen bg-ground text-ink font-sans">
      
      {/* HEADER */}
      <Header 
        currentUser={currentUser}
        onLogin={handleLogin}
        onLogout={handleLogout}
        activeTab={sidebarTab === 'chart' && activeTab === 'jobs' ? 'chart' : activeTab}
        setActiveTab={handleNavTabChange}
        onOpenContact={() => setContactOpen(true)}
        onOpenAuthModal={(tab) => openAuthModal(tab || 'login')}
      />

      {/* CONTACT MODAL */}
      <ContactModal isOpen={contactOpen} onClose={() => setContactOpen(false)} />

      {/* MAIN CONTAINER */}
      {activeTab === 'jobs' ? (
        <JobsHome
          jobs={displayedJobs}
          allJobs={jobs}
          loading={loading}
          selectedJob={selectedJob}
          onSelectJob={setSelectedJob}
          bookmarkedIds={bookmarkedIds}
          onToggleBookmark={(jobId) => handleToggleBookmark(jobId)}
          userLocation={userLocation}
          onLocateUser={handleLocateUser}
          isLocating={isLocating}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          cityFilter={cityFilter}
          setCityFilter={setCityFilter}
          categoryFilter={categoryFilter}
          setCategoryFilter={setCategoryFilter}
          salaryTypeFilter={salaryTypeFilter}
          setSalaryTypeFilter={setSalaryTypeFilter}
          minSalaryFilter={minSalaryFilter}
          setMinSalaryFilter={setMinSalaryFilter}
          showSavedOnly={showSavedOnly}
          setShowSavedOnly={setShowSavedOnly}
          onResetFilters={() => { handleResetFilters(); setShowSavedOnly(false); }}
          recentSearches={recentSearches}
          onSelectRecentSearch={handleSelectRecentSearch}
          onRemoveRecentSearch={handleRemoveRecentSearch}
          onClearRecentSearches={handleClearRecentSearches}
          listTab={sidebarTab}
          setListTab={setSidebarTab}
          onPostJob={() => setActiveTab('parse')}
        />
      ) : (
        // Standard max-width container for content tabs (parse, bookmarks, admin)
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <Suspense fallback={<p className="py-24 text-center text-sm text-slate-500">Đang tải…</p>}>
          
          {/* ========================================== */}
          {/* TAB 4: AI PARSING TOOL & MANUAL POSTING */}
          {/* ========================================== */}
          {activeTab === 'parse' && (
            <AIParsingTool 
              currentUser={currentUser}
              onJobCreated={handleNewJobCreated}
              setActiveTab={setActiveTab}
              onOpenAuthModal={(tab, prompt) => openAuthModal(tab || 'login', prompt)}
            />
          )}

          {/* ========================================== */}
          {/* TAB 5: SAVED BOOKMARKS */}
          {/* ========================================== */}
          {activeTab === 'bookmarks' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div>
                <h1 className="font-display text-2xl font-extrabold text-slate-950">Việc làm đã lưu của bạn ({bookmarkedIds.length})</h1>
                <p className="text-xs text-slate-400 mt-1">Lưu trữ các công việc lương cao, hỗ trợ visa tốt để ứng tuyển sau</p>
              </div>

              {!currentUser ? (
                <div className="bg-white rounded-3xl p-12 text-center border border-slate-200/80 shadow-md space-y-4 max-w-md mx-auto my-6">
                  <div className="w-14 h-14 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto border border-blue-100/80 shadow-xs">
                    <Heart className="w-7 h-7 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-base font-extrabold text-slate-800">Bạn chưa đăng nhập</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Đăng nhập hoặc tạo tài khoản để lưu trữ các việc làm thêm tốt nhất, xem lại trên mọi thiết bị.
                    </p>
                  </div>
                  <div className="flex justify-center gap-2.5 pt-2">
                    <button
                      onClick={() => openAuthModal('login', '🔒 Đăng nhập để xem công việc đã lưu')}
                      className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 px-5 rounded-full shadow-md cursor-pointer transition-all"
                    >
                      Đăng nhập
                    </button>
                    <button
                      onClick={() => openAuthModal('register')}
                      className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs py-2.5 px-5 rounded-full border border-slate-200 cursor-pointer transition-all"
                    >
                      Đăng ký ngay
                    </button>
                  </div>
                </div>
              ) : bookmarkedIds.length === 0 ? (
                <div className="bg-white rounded-2xl p-12 text-center border border-slate-200/80 shadow-md space-y-2">
                  <p className="text-sm font-bold text-slate-700">Danh sách yêu thích trống.</p>
                  <p className="text-xs text-slate-400">Hãy nhấn biểu tượng trái tim ở các thẻ công việc để lưu trữ lại đây.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {jobs.filter(job => bookmarkedIds.includes(job.id)).map(job => (
                    <JobCard 
                      key={job.id}
                      job={job}
                      isBookmarked={true}
                      onToggleBookmark={handleToggleBookmark}
                      onSelect={(j) => setSelectedJob(j)}
                      userLocation={userLocation}
                      onLocateUser={handleLocateUser}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ========================================== */}
          {/* TAB 6: ADMIN CONTROL PANEL (ADMINS ONLY) */}
          {/* ========================================== */}
          {activeTab === 'admin' && currentUser?.role === 'admin' && (
            <AdminPanel 
              jobs={adminJobsList}
              onStatusUpdate={handleStatusUpdate}
              onDeleteJob={handleDeleteJob}
              onSimulateCrawl={handleSimulateCrawl}
            />
          )}

          </Suspense>
        </main>
      )}

      {/* FOOTER */}
      {activeTab !== 'jobs' && (
        <footer className="bg-white border-t border-slate-200/80 mt-24 py-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center sm:text-left flex flex-col sm:flex-row justify-between items-center gap-4">
            <div>
              <p className="text-sm font-extrabold text-blue-600 font-display">86Job</p>
              <p className="text-xs text-slate-400 mt-1">© 2026 86Job. Nền tảng tổng hợp việc làm uy tín cho cộng đồng Việt Nam tại Hàn Quốc.</p>
            </div>
            <div className="flex gap-4 text-xs font-semibold text-slate-400">
              <span className="hover:text-blue-600 cursor-pointer" onClick={() => setContactOpen(true)}>Hỗ trợ kĩ thuật</span>
              <span>•</span>
              <span className="hover:text-blue-600 cursor-pointer" onClick={() => setActiveTab('parse')}>Đăng tin bằng AI</span>
              {currentUser?.role === 'admin' && (
                <>
                  <span>•</span>
                  <span className="hover:text-blue-600 cursor-pointer" onClick={() => setActiveTab('admin')}>Quản trị</span>
                </>
              )}
            </div>
          </div>
        </footer>
      )}

      {/* AUTHENTICATION MODAL */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        initialTab={authModalTab}
        onLoginSuccess={handleLogin}
        promptMessage={authPromptMessage}
      />

      {/* JOB DETAIL DRAWER WITH DISTANCE & DIRECTIONS */}
      {selectedJob && activeTab === 'jobs' && (
        <JobDetailDrawer
          job={selectedJob}
          onClose={() => setSelectedJob(null)}
          isBookmarked={bookmarkedIds.includes(selectedJob.id)}
          onToggleBookmark={handleToggleBookmark}
          currentUser={currentUser}
          userLocation={userLocation}
          onLocateUser={handleLocateUser}
          isLocatingUser={isLocating}
        />
      )}

    </div>
  );
}
