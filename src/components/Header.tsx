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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[4rem] py-2.5 gap-4">
          {/* Logo & Brand */}
          <button
            id="app-header-logo-btn"
            onClick={handleLogoClick}
            className="flex items-center space-x-3 shrink-0 text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-xl p-1 -m-1 transition-all"
            title="TRADEOY.com — Domů / Homepage"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/20 shrink-0 group-hover:scale-105 transition-transform duration-200">
              <TrendingUp className="w-5 h-5 text-black stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-1">
                <span className="font-extrabold text-base sm:text-lg tracking-tight text-white whitespace-nowrap">
                  TRADE<span className="text-emerald-400">OY.com</span>
                </span>
              </div>
              <p className="text-[11px] text-[#86868b] hidden md:block">
                Institutional AI Trading Engine
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

            <button
              onClick={() => handleTabSelect('journal')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'journal'
                  ? 'bg-white/10 text-white shadow-xs'
                  : 'text-[#a1a1a6] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <History className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.tabJournal}</span>
              {savedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold bg-emerald-500 text-black rounded-full">
                  {savedCount}
                </span>
              )}
            </button>
          </nav>

          {/* Right Utilities (Credits, Language, Mobile Menu Toggle) */}
          <div className="flex items-center space-x-2 shrink-0">
            {/* Credits Button */}
            <button
              id="header-credits-btn"
              onClick={onOpenCreditsModal}
              className={`px-3.5 py-2 rounded-xl border text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer active:scale-95 shadow-sm shrink-0 ${
                creditsCount > 0
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25 animate-pulse'
              }`}
              title="Kredity & Licenční Správa / Credits & License"
            >
              <Zap className={`w-3.5 h-3.5 ${creditsCount > 0 ? 'text-emerald-400 fill-emerald-400/20' : 'text-amber-400 fill-amber-400/20'}`} />
              <span className="tabular-nums">
                {creditsCount >= 9999
                  ? 'VIP Neomezeně ∞'
                  : creditsCount > 0
                  ? `${creditsCount} ${t.creditsBadge}`
                  : t.buyCreditsBtn}
              </span>
            </button>

            {/* Language Selector */}
            <button
              onClick={cycleLanguage}
              className="px-3 py-2 rounded-xl border border-white/[0.08] bg-[#16161a] text-[#f5f5f7] hover:bg-white/[0.06] text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer active:scale-95 shrink-0"
              title="Přepnout jazyk / Switch Language"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span className="uppercase">{settings.language}</span>
            </button>

            {/* Mobile Menu Toggle Button */}
            <button
              id="mobile-menu-toggle-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="lg:hidden p-2 rounded-xl border border-white/[0.1] bg-[#16161a] text-white hover:bg-white/10 flex items-center justify-center transition active:scale-95 shrink-0"
              title="Menu navigace"
              aria-label="Menu navigace"
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-emerald-400" />
              ) : (
                <Menu className="w-5 h-5 text-emerald-400" />
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
              className={`flex items-center space-x-3 w-full p-3 rounded-xl text-left transition ${
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
                <div className="text-[10px] text-[#86868b]">Multi-timeframe analýza</div>
              </div>
            </button>

            <button
              onClick={() => handleTabSelect('audit')}
              className={`flex items-center space-x-3 w-full p-3 rounded-xl text-left transition ${
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
                <div className="text-[10px] text-[#86868b]">Audit historie a chyb</div>
              </div>
            </button>

            <button
              onClick={() => handleTabSelect('calendar')}
              className={`flex items-center space-x-3 w-full p-3 rounded-xl text-left transition ${
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
                <div className="text-[10px] text-[#86868b]">Makroekonomický kalendář</div>
              </div>
            </button>

            <button
              onClick={() => handleTabSelect('journal')}
              className={`flex items-center space-x-3 w-full p-3 rounded-xl text-left transition ${
                activeTab === 'journal'
                  ? 'bg-emerald-500/15 text-white border border-emerald-500/30'
                  : 'bg-[#16161a] text-[#a1a1a6] hover:text-white border border-white/[0.06]'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <History className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-1.5">
                  <span>{t.tabJournal}</span>
                  {savedCount > 0 && (
                    <span className="px-1.5 py-0.2 text-[9px] font-bold bg-emerald-500 text-black rounded-full">
                      {savedCount}
                    </span>
                  )}
                </div>
                <div className="text-[10px] text-[#86868b]">Uložené obchody a statistiky</div>
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
                className="w-full py-2 px-3 rounded-xl bg-white/[0.03] text-xs text-[#86868b] hover:text-white flex items-center justify-center space-x-2"
              >
                <Scale className="w-3.5 h-3.5 text-amber-400" />
                <span>Podmínky používání & Právní doložka</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
