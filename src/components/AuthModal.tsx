/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { X, LogIn, UserPlus, Sparkles } from 'lucide-react';
import Logo from './Logo';
import { loginWithGoogle } from '../lib/firebase';
import { fetchDevAuthEnabled, setDevToken, DEV_TEST_PROFILES, DevTestAccount } from '../lib/api';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'login' | 'register';
  onLoginSuccess: () => void;
  promptMessage?: string;
}

export default function AuthModal({
  isOpen,
  onClose,
  initialTab = 'login',
  onLoginSuccess,
  promptMessage
}: AuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register'>(initialTab);

  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [devAuthEnabled, setDevAuthEnabled] = useState(false);

  useEffect(() => {
    if (isOpen) fetchDevAuthEnabled().then(setDevAuthEnabled);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleDevLogin = (account: DevTestAccount) => {
    setDevToken(account);
    onLoginSuccess();
    onClose();
  };

  const handleGoogleLogin = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      await loginWithGoogle();
      onLoginSuccess();
      onClose();
    } catch (err: any) {
      console.error("Google auth error:", err);
      if (err?.code === 'auth/popup-closed-by-user') {
        setError('Cửa sổ đăng nhập Google đã bị đóng. Vui lòng thử lại.');
      } else {
        setError(err?.message || 'Không thể đăng nhập bằng Google. Vui lòng thử lại.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[3000] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200/80 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-2 text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header Banner */}
        <div className="bg-gradient-to-br from-blue-600 via-indigo-600 to-blue-700 p-6 text-white text-center relative overflow-hidden">
          <div className="absolute -right-10 -bottom-10 w-32 h-32 bg-white/10 rounded-full blur-2xl" />
          <div className="relative z-10 flex flex-col items-center space-y-2">
            <div className="bg-white/10 p-2.5 rounded-2xl backdrop-blur-md border border-white/20 shadow-inner">
              <Logo className="h-8 w-auto text-white" />
            </div>
            <p className="text-xs font-semibold text-blue-100">
              {tab === 'login' ? 'Đăng nhập để sử dụng đầy đủ tính năng' : 'Tạo tài khoản mới hoàn toàn miễn phí'}
            </p>
          </div>
        </div>

        {/* Optional Context Prompt (e.g., when bookmarking) */}
        {promptMessage && (
          <div className="bg-amber-50 border-b border-amber-200/60 px-5 py-2.5 text-xs text-amber-800 font-medium flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span>{promptMessage}</span>
          </div>
        )}

        {/* Tabs Switcher */}
        <div className="flex border-b border-slate-100 bg-slate-50/80 p-1.5 mx-6 mt-5 rounded-2xl border">
          <button
            type="button"
            onClick={() => {
              setTab('login');
              setError('');
            }}
            className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              tab === 'login'
                ? 'bg-white text-blue-600 shadow-sm border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Đăng nhập</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('register');
              setError('');
            }}
            className={`flex-1 py-2.5 text-xs font-extrabold rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              tab === 'register'
                ? 'bg-white text-blue-600 shadow-sm border border-slate-200/80'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Đăng ký</span>
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-4">
          
          {/* Google Login Button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isSubmitting}
            className="w-full flex items-center justify-center gap-3 bg-white border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-700 font-bold text-xs py-3 px-4 rounded-xl shadow-xs transition-all cursor-pointer group"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            <span>{tab === 'login' ? 'Đăng nhập bằng Google' : 'Đăng ký nhanh bằng Google'}</span>
          </button>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium rounded-xl">
              {error}
            </div>
          )}

          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            86Job hiện chỉ hỗ trợ đăng nhập bằng tài khoản Google để bảo vệ tài khoản của bạn.
          </p>

          {/* Local test accounts: only on a dev server started with DEV_AUTH=1 */}
          {devAuthEnabled && (
            <div className="rounded-2xl border border-dashed border-amber-300 bg-amber-50 p-3 space-y-2">
              <p className="text-xs font-bold text-amber-800">Tài khoản test (chỉ trên máy dev)</p>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(DEV_TEST_PROFILES) as DevTestAccount[]).map(account => (
                  <button
                    key={account}
                    type="button"
                    onClick={() => handleDevLogin(account)}
                    className="py-2.5 px-3 rounded-full bg-white border border-amber-200 text-xs font-bold text-amber-900 hover:bg-amber-100 cursor-pointer"
                  >
                    {DEV_TEST_PROFILES[account].name}
                  </button>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
