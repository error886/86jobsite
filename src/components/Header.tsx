/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { LogOut, Menu, X, Plus } from 'lucide-react';
import { User as UserType } from '../types';
import Logo from './Logo';

interface HeaderProps {
  currentUser: UserType | null;
  onLogin: () => void;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  onOpenContact: () => void;
  onOpenAuthModal?: (tab?: 'login' | 'register') => void;
}

/** A plain bar: the 86Job mark, the destinations, one action. On a phone the destinations fold into a full-screen menu. */
export default function Header({
  currentUser,
  onLogout,
  activeTab,
  setActiveTab,
  onOpenContact,
  onOpenAuthModal
}: HeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const menuItems = [
    { id: 'jobs', label: 'Bản đồ việc làm' },
    { id: 'bookmarks', label: 'Đã lưu' },
    { id: 'parse', label: 'Đăng tin' },
    ...(currentUser?.role === 'admin' ? [{ id: 'admin', label: 'Quản trị' }] : [])
  ];

  const go = (id: string) => {
    setActiveTab(id);
    setMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-[1000] w-full bg-surface border-b border-line">
      <div className="h-12 lg:h-14 px-4 lg:px-6 flex items-center justify-between gap-4">
        <button type="button" onClick={() => go('jobs')} className="flex items-center gap-2 cursor-pointer" aria-label="86Job, về bản đồ việc làm">
          <Logo className="h-7 lg:h-8 w-auto" />
        </button>

        {/* Desktop destinations */}
        <nav className="hidden lg:flex items-center gap-1 flex-1" aria-label="Chính">
          {menuItems.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => go(item.id)}
              aria-current={activeTab === item.id ? 'page' : undefined}
              className={`h-10 px-4 rounded-full text-sm font-semibold cursor-pointer transition-colors ${
                activeTab === item.id ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              {item.label}
            </button>
          ))}
          <button type="button" onClick={onOpenContact} className="h-10 px-4 rounded-full text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-50 cursor-pointer">
            Liên hệ
          </button>
        </nav>

        <div className="flex items-center gap-2">
          {currentUser ? (
            <div className="hidden lg:flex items-center gap-3">
              <span className="text-sm text-ink">{currentUser.name}</span>
              <img src={currentUser.avatar} alt="" className="w-8 h-8 rounded-full bg-raised" />
              <button
                type="button"
                onClick={onLogout}
                aria-label="Đăng xuất"
                className="w-9 h-9 flex items-center justify-center rounded-md text-muted hover:text-ink hover:bg-raised cursor-pointer"
              >
                <LogOut className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => onOpenAuthModal?.('login')}
              className="hidden lg:inline-flex h-10 px-5 items-center rounded-full bg-blue-600 text-white text-sm font-bold shadow-md hover:bg-blue-700 hover:shadow-lg transition-all cursor-pointer"
            >
              Đăng nhập
            </button>
          )}

          {/* Phone: the one action and the menu */}
          <button
            type="button"
            onClick={() => go('parse')}
            className="lg:hidden h-9 px-3.5 inline-flex items-center gap-1 rounded-full bg-blue-600 text-white text-sm font-bold shadow-md hover:bg-blue-700 cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={2} />
            Đăng tin
          </button>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="Mở menu"
            aria-expanded={menuOpen}
            className="lg:hidden w-10 h-10 -mr-2 flex items-center justify-center rounded-md text-ink hover:bg-raised cursor-pointer"
          >
            <Menu className="w-5 h-5" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* Phone menu: a full-screen sheet */}
      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-[3000] bg-surface flex flex-col" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="h-12 px-4 flex items-center justify-between border-b border-line">
            <Logo className="h-7 w-auto" />
            <button
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Đóng menu"
              className="w-10 h-10 -mr-2 flex items-center justify-center rounded-md text-ink hover:bg-raised cursor-pointer"
            >
              <X className="w-5 h-5" strokeWidth={1.75} />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Chính">
            {menuItems.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => go(item.id)}
                aria-current={activeTab === item.id ? 'page' : undefined}
                className={`w-full h-12 px-4 rounded-xl text-left text-base font-semibold cursor-pointer ${
                  activeTab === item.id ? 'bg-blue-50 text-blue-600' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => { onOpenContact(); setMenuOpen(false); }}
              className="w-full h-12 px-4 rounded-xl text-left text-base font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              Liên hệ
            </button>
          </nav>

          <div className="border-t border-line px-4 py-4">
            {currentUser ? (
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <img src={currentUser.avatar} alt="" className="w-9 h-9 rounded-full bg-raised" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{currentUser.name}</p>
                    <p className="text-xs text-muted truncate">{currentUser.email}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => { onLogout(); setMenuOpen(false); }}
                  className="h-10 px-3 rounded-md border border-control text-sm text-ink cursor-pointer"
                >
                  Đăng xuất
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => { onOpenAuthModal?.('login'); setMenuOpen(false); }}
                className="w-full h-12 rounded-full bg-blue-600 text-white text-sm font-bold shadow-md cursor-pointer"
              >
                Đăng nhập bằng Google
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
