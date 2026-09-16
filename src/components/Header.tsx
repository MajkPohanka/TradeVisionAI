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
  Sun,
  Moon,
  Eclipse,
  ChevronDown,
} from 'lucide-react';
import { StrategySettings, LanguageOption, AppTheme } from '../types';
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
  theme?: AppTheme;
  onUpdateTheme?: (theme: AppTheme) => void;
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
  theme = 'light',
  onUpdateTheme,
}) => {
  const t = getTranslation(settings.language);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isThemeDropdownOpen, setIsThemeDropdownOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const themeDropdownRef = useRef<HTMLDivElement>(null);

  // Close menus on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        mobileMenuRef.current &&
        !mobileMenuRef.current.contains(target) &&
        !(event.target as HTMLElement).closest('#mobile-menu-toggle-btn')
      ) {
        setIsMobileMenuOpen(false);
      }
      if (
        themeDropdownRef.current &&
        !themeDropdownRef.current.contains(target) &&
        !(event.target as HTMLElement).closest('#header-theme-btn')
      ) {
        setIsThemeDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

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

  const cycleTheme = () => {
    if (!onUpdateTheme) return;
    const nextTheme: Record<AppTheme, AppTheme> = {
      light: 'dark',
      dark: 'black',
      black: 'light',
    };
    onUpdateTheme(nextTheme[theme]);
  };

  const selectTheme = (newTheme: AppTheme) => {
    if (onUpdateTheme) {
      onUpdateTheme(newTheme);
    }
    setIsThemeDropdownOpen(false);
  };

  const isLight = theme === 'light';

  return (
    <header className={`sticky top-0 z-40 border-b transition-colors ${
      isLight
        ? 'bg-[#eaedf1] border-slate-300/90 text-slate-900 shadow-xs'
        : theme === 'black'
        ? 'bg-black border-white/[0.08] text-[#f5f5f7]'
        : 'bg-[#0c0c0e] border-white/[0.08] text-[#f5f5f7]'
    }`}>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[3.5rem] sm:min-h-[4rem] py-2 gap-2 sm:gap-4">
          {/* Logo & Brand */}
          <button
            id="app-header-logo-btn"
            onClick={handleLogoClick}
            className="flex items-center space-x-2 sm:space-x-3 shrink-0 text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-xl p-1 -m-1 transition-all"
            title="TRADEOY.com — Domů / Homepage"
          >
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-500/25 shrink-0 group-hover:scale-105 transition-transform duration-200">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-black stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-1">
                <span className={`brand-title font-extrabold text-sm sm:text-lg tracking-tight whitespace-nowrap leading-none ${isLight ? 'text-slate-950' : 'text-white'}`}>
                  TRADE<span className="text-emerald-500 font-black">OY.com</span>
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] font-bold tracking-widest uppercase mt-0.5 whitespace-nowrap">
                <span className={`brand-dark-text ${isLight ? 'text-slate-900' : 'text-slate-300'}`}>TRADE.</span>{' '}
                <span className="text-emerald-500 font-black">ENJOY.</span>
              </p>
            </div>
          </button>

          {/* Desktop Primary Navigation Tabs */}
          <nav className={`hidden lg:flex items-center p-1 rounded-xl shadow-inner border ${
            isLight ? 'bg-slate-200/90 border-slate-300' : 'bg-[#16161a] border-white/[0.08]'
          }`}>
            <button
              onClick={() => handleTabSelect('analyzer')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'analyzer'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'bg-white/10 text-white shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-300/60'
                  : 'text-[#a1a1a6] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-500" />
              <span>{t.tabAnalyzer}</span>
            </button>

            <button
              onClick={() => handleTabSelect('audit')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'audit'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'bg-white/10 text-white shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-300/60'
                  : 'text-[#a1a1a6] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-purple-500" />
              <span>{t.tabAudit}</span>
            </button>

            <button
              onClick={() => handleTabSelect('calendar')}
              className={`flex items-center space-x-2 px-4 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer whitespace-nowrap ${
                activeTab === 'calendar'
                  ? isLight
                    ? 'bg-white text-slate-900 shadow-xs font-bold'
                    : 'bg-white/10 text-white shadow-xs'
                  : isLight
                  ? 'text-slate-600 hover:text-slate-950 hover:bg-slate-300/60'
                  : 'text-[#a1a1a6] hover:text-white hover:bg-white/[0.04]'
              }`}
            >
              <Calendar className={`w-3.5 h-3.5 ${isLight ? 'text-emerald-600' : 'text-amber-500'}`} />
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
                  ? isLight
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-800 hover:bg-emerald-200/80 shadow-xs'
                    : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : isLight
                  ? 'bg-emerald-600 border-emerald-700 text-white hover:bg-emerald-700 shadow-xs'
                  : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/30 animate-pulse'
              }`}
              title={t.creditsTooltip || t.creditsTitle}
            >
              <Zap className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${creditsCount > 0 ? (isLight ? 'text-emerald-700 fill-emerald-700/20' : 'text-emerald-400 fill-emerald-400/20') : (isLight ? 'text-white fill-white/30' : 'text-emerald-300 fill-emerald-300/20')}`} />
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

            {/* Theme Appearance Selector (Light, Dark, Black) */}
            <div className="relative">
              <button
                id="header-theme-btn"
                type="button"
                onClick={() => setIsThemeDropdownOpen((prev) => !prev)}
                className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border text-[11px] sm:text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer active:scale-95 shrink-0 ${
                  isLight
                    ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100 shadow-xs'
                    : 'border-white/[0.08] bg-[#16161a] text-[#f5f5f7] hover:bg-white/[0.06]'
                }`}
                title={t.themeSwitchTooltip || 'Přepnout vzhled (Světlý / Tmavý / Černý)'}
              >
                {theme === 'light' ? (
                  <Sun className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                ) : theme === 'dark' ? (
                  <Moon className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                ) : (
                  <Eclipse className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                )}
                <span className="hidden sm:inline">
                  {theme === 'light' ? (t.themeLight || 'Světlý') : theme === 'dark' ? (t.themeDark || 'Tmavý') : (t.themeBlack || 'Černý')}
                </span>
                <ChevronDown className={`w-3 h-3 shrink-0 ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`} />
              </button>

              {/* Theme Dropdown Menu */}
              {isThemeDropdownOpen && (
                <div
                  ref={themeDropdownRef}
                  className={`absolute right-0 mt-2 w-60 rounded-2xl p-1.5 shadow-2xl z-50 animate-in fade-in zoom-in-95 duration-150 border ${
                    isLight
                      ? 'bg-white border-slate-300 text-slate-900'
                      : 'bg-[#141418] border-white/[0.12] text-[#f5f5f7]'
                  }`}
                >
                  <div className={`px-2.5 py-1.5 text-[10px] font-bold uppercase tracking-wider ${
                    isLight ? 'text-slate-500' : 'text-[#86868b]'
                  }`}>
                    {t.themeLabel || 'Vzhled aplikace'}
                  </div>

                  {/* Light Option (Primary default) */}
                  <button
                    type="button"
                    onClick={() => selectTheme('light')}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left transition text-xs cursor-pointer ${
                      theme === 'light'
                        ? isLight
                          ? 'bg-emerald-50 text-emerald-950 font-bold border border-emerald-300'
                          : 'bg-emerald-500/15 text-emerald-300 font-bold border border-emerald-500/30'
                        : isLight
                        ? 'text-slate-700 hover:bg-slate-100'
                        : 'text-[#f5f5f7] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                      <Sun className="w-4 h-4 text-emerald-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="font-bold">{t.themeLight || 'Světlý'}</span>
                        <span className="text-[9px] bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.2 rounded border border-emerald-200">
                          {settings.language === 'cs' ? 'Šetrný k očím' : 'Eye Comfort'}
                        </span>
                      </div>
                      <p className={`text-[10px] truncate mt-0.5 ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>
                        {t.themeLightDesc || 'Jemný a přehledný světlý design'}
                      </p>
                    </div>
                  </button>

                  {/* Dark Option */}
                  <button
                    type="button"
                    onClick={() => selectTheme('dark')}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left transition text-xs cursor-pointer mt-1 ${
                      theme === 'dark'
                        ? isLight
                          ? 'bg-sky-50 text-sky-950 font-bold border border-sky-300'
                          : 'bg-sky-500/15 text-sky-300 font-bold border border-sky-500/30'
                        : isLight
                        ? 'text-slate-700 hover:bg-slate-100'
                        : 'text-[#f5f5f7] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
                      <Moon className="w-4 h-4 text-sky-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold">{t.themeDark || 'Tmavý'}</span>
                      <p className={`text-[10px] truncate mt-0.5 ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>
                        {t.themeDarkDesc || 'Šedý břidlicový režim příjemný pro oči'}
                      </p>
                    </div>
                  </button>

                  {/* Black Option */}
                  <button
                    type="button"
                    onClick={() => selectTheme('black')}
                    className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-left transition text-xs cursor-pointer mt-1 ${
                      theme === 'black'
                        ? isLight
                          ? 'bg-purple-50 text-purple-950 font-bold border border-purple-300'
                          : 'bg-purple-500/15 text-purple-300 font-bold border border-purple-500/30'
                        : isLight
                        ? 'text-slate-700 hover:bg-slate-100'
                        : 'text-[#f5f5f7] hover:bg-white/[0.06]'
                    }`}
                  >
                    <div className="w-7 h-7 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center shrink-0">
                      <Eclipse className="w-4 h-4 text-purple-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold">{t.themeBlack || 'Černý'}</span>
                      <p className={`text-[10px] truncate mt-0.5 ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>
                        {t.themeBlackDesc || 'Čistě černý OLED režim'}
                      </p>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Language Selector */}
            <button
              onClick={cycleLanguage}
              className={`px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border text-[11px] sm:text-xs font-bold flex items-center space-x-1 sm:space-x-1.5 transition cursor-pointer active:scale-95 shrink-0 ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-800 hover:bg-slate-100 shadow-xs'
                  : 'border-white/[0.08] bg-[#16161a] text-[#f5f5f7] hover:bg-white/[0.06]'
              }`}
              title={t.switchLanguageTooltip || t.switchLanguage}
            >
              <Globe className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-emerald-600" />
              <span className="uppercase">{settings.language}</span>
            </button>

            {/* Legal Terms & Disclaimer Header Link */}
            {onOpenTermsModal && (
              <button
                id="header-terms-btn"
                onClick={onOpenTermsModal}
                className={`hidden md:flex items-center space-x-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg sm:rounded-xl border text-[11px] sm:text-xs font-medium transition cursor-pointer active:scale-95 shrink-0 ${
                  isLight
                    ? 'border-emerald-300 bg-emerald-100 text-emerald-900 hover:bg-emerald-200/80 shadow-xs'
                    : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20'
                }`}
                title={t.legalTermsTitle}
              >
                <Scale className="w-3.5 h-3.5 text-emerald-600" />
                <span className="hidden lg:inline">{t.legalTermsBtn || 'Podmínky & Právní doložka'}</span>
                <span className="lg:hidden">{t.legalTermsBtnShort || 'Podmínky'}</span>
              </button>
            )}

            {/* Mobile Menu Toggle Button */}
            <button
              id="mobile-menu-toggle-btn"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className={`lg:hidden p-2 rounded-xl border flex items-center justify-center transition active:scale-95 shrink-0 w-9 h-9 sm:w-10 sm:h-10 shadow-sm ${
                isLight
                  ? 'bg-white border-slate-300 text-slate-900 hover:bg-slate-100'
                  : 'border-white/[0.16] bg-[#1a1a1f] text-white hover:bg-white/10'
              }`}
              title={t.navMenu}
              aria-label={t.navMenu}
            >
              {isMobileMenuOpen ? (
                <X className="w-5 h-5 text-emerald-600 stroke-[2.5]" />
              ) : (
                <Menu className="w-5 h-5 text-emerald-600 stroke-[2.5]" />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Drawer */}
      {isMobileMenuOpen && (
        <div
          ref={mobileMenuRef}
          className={`lg:hidden border-t px-4 py-4 space-y-2 shadow-2xl animate-fadeIn ${
            isLight
              ? 'bg-[#f1f5f9] border-slate-300'
              : 'bg-[#0e0e12] border-white/[0.1]'
          }`}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <button
              onClick={() => handleTabSelect('analyzer')}
              className={`flex items-center space-x-3 w-full p-3 rounded-xl text-left transition cursor-pointer border ${
                activeTab === 'analyzer'
                  ? isLight
                    ? 'bg-white text-slate-900 border-emerald-500 shadow-xs'
                    : 'bg-emerald-500/15 text-white border-emerald-500/30'
                  : isLight
                  ? 'bg-white/70 text-slate-700 hover:bg-white border-slate-200'
                  : 'bg-[#16161a] text-[#a1a1a6] hover:text-white border-white/[0.06]'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center shrink-0">
                <Sliders className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{t.tabAnalyzer}</div>
                <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>{t.tabAnalyzerSub}</div>
              </div>
            </button>

            <button
              onClick={() => handleTabSelect('audit')}
              className={`flex items-center space-x-3 w-full p-3 rounded-xl text-left transition cursor-pointer border ${
                activeTab === 'audit'
                  ? isLight
                    ? 'bg-white text-slate-900 border-purple-500 shadow-xs'
                    : 'bg-purple-500/15 text-white border-purple-500/30'
                  : isLight
                  ? 'bg-white/70 text-slate-700 hover:bg-white border-slate-200'
                  : 'bg-[#16161a] text-[#a1a1a6] hover:text-white border-white/[0.06]'
              }`}
            >
              <div className="w-8 h-8 rounded-lg bg-purple-500/15 flex items-center justify-center shrink-0">
                <FileSpreadsheet className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <div className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{t.tabAudit}</div>
                <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>{t.tabAuditSub}</div>
              </div>
            </button>

            <button
              onClick={() => handleTabSelect('calendar')}
              className={`flex items-center space-x-3 w-full p-3 rounded-xl text-left transition cursor-pointer border ${
                activeTab === 'calendar'
                  ? isLight
                    ? 'bg-white text-slate-900 border-emerald-500 shadow-xs'
                    : 'bg-amber-500/15 text-white border-amber-500/30'
                  : isLight
                  ? 'bg-white/70 text-slate-700 hover:bg-white border-slate-200'
                  : 'bg-[#16161a] text-[#a1a1a6] hover:text-white border-white/[0.06]'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                isLight ? 'bg-emerald-500/15' : 'bg-amber-500/15'
              }`}>
                <Calendar className={`w-4 h-4 ${isLight ? 'text-emerald-600' : 'text-amber-600'}`} />
              </div>
              <div>
                <div className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{t.tabCalendar}</div>
                <div className={`text-[10px] ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>{t.tabCalendarSub}</div>
              </div>
            </button>
          </div>

          {/* Mobile Theme Switcher */}
          <div className={`p-3 rounded-xl border space-y-2 ${
            isLight ? 'bg-white border-slate-200 shadow-xs' : 'bg-white/[0.03] border-white/[0.08]'
          }`}>
            <div className="flex items-center justify-between text-xs">
              <span className={`font-bold flex items-center space-x-1.5 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                <Sun className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t.themeLabel || 'Vzhled aplikace'}:</span>
              </span>
              <span className="text-[11px] font-semibold text-emerald-600">
                {theme === 'light' ? (t.themeLight || 'Světlý') : theme === 'dark' ? (t.themeDark || 'Tmavý') : (t.themeBlack || 'Černý')}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button
                type="button"
                onClick={() => selectTheme('light')}
                className={`py-2 px-1 rounded-lg text-xs font-bold flex flex-col items-center justify-center space-y-1 transition cursor-pointer border ${
                  theme === 'light'
                    ? isLight
                      ? 'bg-emerald-50 text-emerald-900 border-emerald-400 shadow-xs'
                      : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs'
                    : isLight
                    ? 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                    : 'bg-white/[0.04] text-[#a1a1a6] hover:text-white border-white/[0.06]'
                }`}
              >
                <Sun className="w-4 h-4 text-emerald-600" />
                <span className="text-[10px]">{t.themeLight || 'Světlý'}</span>
              </button>

              <button
                type="button"
                onClick={() => selectTheme('dark')}
                className={`py-2 px-1 rounded-lg text-xs font-bold flex flex-col items-center justify-center space-y-1 transition cursor-pointer border ${
                  theme === 'dark'
                    ? isLight
                      ? 'bg-sky-50 text-sky-900 border-sky-400 shadow-xs'
                      : 'bg-sky-500/20 text-sky-300 border-sky-500/40 shadow-xs'
                    : isLight
                    ? 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                    : 'bg-white/[0.04] text-[#a1a1a6] hover:text-white border-white/[0.06]'
                }`}
              >
                <Moon className="w-4 h-4 text-sky-500" />
                <span className="text-[10px]">{t.themeDark || 'Tmavý'}</span>
              </button>

              <button
                type="button"
                onClick={() => selectTheme('black')}
                className={`py-2 px-1 rounded-lg text-xs font-bold flex flex-col items-center justify-center space-y-1 transition cursor-pointer border ${
                  theme === 'black'
                    ? isLight
                      ? 'bg-purple-50 text-purple-900 border-purple-400 shadow-xs'
                      : 'bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-xs'
                    : isLight
                    ? 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'
                    : 'bg-white/[0.04] text-[#a1a1a6] hover:text-white border-white/[0.06]'
                }`}
              >
                <Eclipse className="w-4 h-4 text-purple-500" />
                <span className="text-[10px]">{t.themeBlack || 'Černý'}</span>
              </button>
            </div>
          </div>

          {onOpenTermsModal && (
            <div className={`pt-2 border-t ${isLight ? 'border-slate-300' : 'border-white/[0.06]'}`}>
              <button
                onClick={() => {
                  onOpenTermsModal();
                  setIsMobileMenuOpen(false);
                }}
                className={`w-full py-2 px-3 rounded-xl text-xs flex items-center justify-center space-x-2 cursor-pointer transition ${
                  isLight
                    ? 'bg-white text-slate-700 hover:text-slate-950 border border-slate-200 shadow-xs'
                    : 'bg-white/[0.03] text-[#86868b] hover:text-white'
                }`}
              >
                <Scale className="w-3.5 h-3.5 text-emerald-600" />
                <span>{t.legalTermsTitle}</span>
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};
