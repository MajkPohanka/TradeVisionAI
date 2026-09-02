import React, { useState, useRef, useEffect } from 'react';
import {
  TrendingUp,
  Sliders,
  History,
  Scale,
  Zap,
  Globe,
  FileSpreadsheet,
  Calendar,
  Menu,
  X,
  ShieldAlert,
} from 'lucide-react';
import { StrategySettings, LanguageOption } from '../types';
import { getTranslation } from '../utils/translations';

interface HeaderProps {
  settings: StrategySettings;
  onUpdateSettings: (newSettings: Partial<StrategySettings>) => void;
  activeTab: 'analyzer' | 'audit' | 'calendar' | 'journal';
  setActiveTab: (tab: 'analyzer' | 'audit' | 'calendar' | 'journal') => void;
  savedCount: number;
  creditsCount?: number;
  onOpenCreditsModal?: () => void;
  onOpenTermsModal?: () => void;
  onGoHome?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  activeTab,
  setActiveTab,
  savedCount,
  creditsCount = 0,
  onOpenCreditsModal,
  onOpenTermsModal,
  onGoHome,
}) => {
  const t = getTranslation(settings.language);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);

  // Close mobile menu on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(event.target as Node) &&
        !(event.target as HTMLElement).closest('#mobile-menu-toggle-btn')
      ) {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  const handleLogoClick = () => {
    if (onGoHome) {
      onGoHome();
    } else {
      setActiveTab('analyzer');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTabSelect = (tab: 'analyzer' | 'audit' | 'calendar' | 'journal') => {
    setActiveTab(tab);
    setIsMobileMenuOpen(false);
  };

  const cycleLanguage = () => {
    const nextLang: Record<LanguageOption, LanguageOption> = {
      cs: 'en',
      en: 'es',
      es: 'cs',
    };
    onUpdateSettings({ language: nextLang[settings.language || 'cs'] });
  };

  return (
    <header className="sticky top-0 z-40 bg-[#0c0c0e] sm:bg-[#0c0c0e]/95 sm:backdrop-blur-md border-b border-white/[0.08] text-[#f5f5f7]">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[3.5rem] sm:min-h-[4rem] py-2 gap-2 sm:gap-4">
          {/* Logo & Brand */}
          <button
            id="app-header-logo-btn"
            onClick={handleLogoClick}
            className="flex items-center space-x-2 sm:space-x-3 shrink-0 text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-xl p-1 -m-1 transition-all"
            title="TRADEOY.com — Domů / Homepage"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0 group-hover:scale-105 transition-transform duration-200">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-black stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-1">
                <span className="font-extrabold text-sm sm:text-lg tracking-tight text-white whitespace-nowrap leading-none">
                  TRADE<span className="text-emerald-400">OY.com</span>
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] text-emerald-400 font-bold tracking-widest uppercase mt-0.5">
                TRADE. ENJOY.
              </p>
            </div>
          </button>

          {/* Desktop Primary Navigation Tabs */}
          <nav className="hidden lg:flex items-center bg-[#16161a] border border-white/[0.08] p-1 rounded-xl shadow-inner">
            <button
              onClick={() => handleTabSelect('analyzer')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'analyzer'
                  ? 'bg-white/10 text-white shadow-xs'
                  : 'text-[#a1a1a6] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.tabAnalyzer}</span>
            </button>

            <button
              onClick={() => handleTabSelect('audit')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'audit'
                  ? 'bg-white/10 text-white shadow-xs'
                  : 'text-[#a1a1a6] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
              <span>{t.tabAudit}</span>
            </button>

            <button
              onClick={() => handleTabSelect('calendar')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'calendar'
                  ? 'bg-white/10 text-white shadow-xs'
                  : 'text-[#a1a1a6] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.tabCalendar}</span>
            </button>
          </nav>

          {/* Right Utilities (Credits, Language, Mobile Menu Toggle) */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {/* Credits Button */}
            <button
              id="header-credits-btn"
              onClick={onOpenCreditsModal}
              className={`px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border text-[11px] sm:text-xs font-bold flex items-center space-x-1 sm:space-x-1.5 transition cursor-pointer active:scale-95 shadow-sm shrink-0 ${
                creditsCount > 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25 animate-pulse'
              }`}
              title={t.creditsTooltip || t.creditsTitle}
            >
              <Zap className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${creditsCount > 0 ? 'text-emerald-400 fill-emerald-400/20' : 'text-amber-400 fill-amber-400/20'}`} />
              <span className="tabular-nums">
                {creditsCount >= 9999 ? (
                  <>
                    <span className="sm:hidden">{t.vipBadgeShort || 'VIP ∞'}</span>
                    <span className="hidden sm:inline">{t.vipUnlimitedBadge || t.vipUnlimitedAccount || 'VIP Unlimited ∞'}</span>
                  </>
                ) : creditsCount > 0 ? (
                  <>
                    <span className="sm:hidden">{creditsCount} {t.creditsShort || 'Cr.'}</span>
                    <span className="hidden sm:inline">{creditsCount} {t.creditsBadge}</span>
                  </>
                ) : (
                  <>
                    <span className="sm:hidden">{t.addCreditsShort || '+ Credits'}</span>
                    <span className="hidden sm:inline">{t.buyCreditsBtn}</span>
                  </>
                )}
              </span>
            </button>

            {/* Language Selector */}
            <button
              onClick={cycleLanguage}
              className="px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-white/[0.08] bg-[#16161a] text-[#f5f5f7] hover:bg-white/[0.06] text-[11px] sm:text-xs font-bold flex items-center space-x-1 sm:space-x-1.5 transition cursor-pointer active:scale-95 shrink-0"
              title={t.switchLanguageTooltip || t.switchLanguage}
            >
              <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-400" />
              <span className="uppercase">{settings.language}</span>
            </button>

            {/* Legal Terms & Disclaimer Header Link */}
            {onOpenTermsModal && (
              <button
                id="header-terms-btn"
                onClick={onOpenTermsModal}
                className="hidden md:flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border border-amber-500/20 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 text-[11px] sm:text-xs font-medium transition cursor-pointer active:scale-95 shrink-0"
                title={t.legalTermsTitle}
              >
                <Scale className="w-3.5 h-3.5 text-amber-400" />
                <span className="hidden lg:inline">{t.legalTermsBtn || 'Podmínky & Právní doložka'}</span>
                <span className="lg:hidden">{t.legalTermsBtnShort || 'Podmínky'}</span>
              </button>
            )}

            {/* Mobile Menu Toggle Button */}
            <button
              id="mobile-menu-toggle-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl border border-white/[0.16] bg-[#1a1a1f] text-white hover:bg-white/10 flex items-center justify-center transition active:scale-95 shrink-0 w-9 h-9 sm:w-10 sm:h-10 shadow-sm"
              title={t.navMenu}
              aria-label={t.navMenu}
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-emerald-400 stroke-[2.5]" />
              ) : (
                <Menu className="w-5 h-5 text-emerald-400 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className="lg:hidden border-t border-white/[0.1] bg-[#0e0e12] px-4 py-4 space-y-2 shadow-2xl animate-fadeIn"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => handleTabSelect('analyzer')}
              className={`flex items-center space-x-3 w-full p-3 rounded-xl text-left transition cursor-pointer ${
                activeTab === 'analyzer'
                  ? 'bg-emerald-500/15 text-white border border-emerald-500/30'
                  : 'bg-[#16161a] text-[#a1a1a6] hover:text-white border border-white/[0.06]'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Sliders className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{t.tabAnalyzer}</div>
                <div className="text-[10px] text-[#86868b]">{t.tabAnalyzerSub}</div>
              </div>
            </button>

            <button
              onClick={() => handleTabSelect('audit')}
              className={`flex items-center space-x-3 w-full p-3 rounded-xl text-left transition cursor-pointer ${
                activeTab === 'audit'
                  ? 'bg-purple-500/15 text-white border border-purple-500/30'
                  : 'bg-[#16161a] text-[#a1a1a6] hover:text-white border border-white/[0.06]'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{t.tabAudit}</div>
                <div className="text-[10px] text-[#86868b]">{t.tabAuditSub}</div>
              </div>
            </button>

            <button
              onClick={() => handleTabSelect('calendar')}
              className={`flex items-center space-x-3 w-full p-3 rounded-xl text-left transition cursor-pointer ${
                activeTab === 'calendar'
                  ? 'bg-amber-500/15 text-white border border-amber-500/30'
                  : 'bg-[#16161a] text-[#a1a1a6] hover:text-white border border-white/[0.06]'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center shrink-0">
                <Calendar className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-white">{t.tabCalendar}</div>
                <div className="text-[10px] text-[#86868b]">{t.tabCalendarSub}</div>
              </div>
            </button>
          </div>

          {onOpenTermsModal && (
            <div className="pt-2 border-t border-white/[0.06]">
              <button
                onClick={() => {
                  onOpenTermsModal();
                  setIsMobileMenuOpen(false);
                }}
                className="w-full py-2 px-3 rounded-xl bg-white/[0.03] text-xs text-[#86868b] hover:text-white flex items-center justify-center space-x-2 cursor-pointer transition"
              >
                <Scale className="w-3.5 h-3.5 text-amber-400" />
                <span>{t.legalTermsTitle}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
