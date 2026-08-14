import React from 'react';
import { TrendingUp, Github, History, Sliders, Globe, FileSpreadsheet, Calendar, Zap } from 'lucide-react';
import { StrategySettings, LanguageOption } from '../types';
import { getTranslation } from '../utils/translations';

interface HeaderProps {
  settings: StrategySettings;
  onUpdateSettings: (newSettings: Partial<StrategySettings>) => void;
  activeTab: 'analyzer' | 'audit' | 'calendar' | 'journal';
  setActiveTab: (tab: 'analyzer' | 'audit' | 'calendar' | 'journal') => void;
  onOpenGithubModal: () => void;
  savedCount: number;
  creditsCount: number;
  onOpenCreditsModal: () => void;
  onGoHome?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  settings,
  onUpdateSettings,
  activeTab,
  setActiveTab,
  onOpenGithubModal,
  savedCount,
  creditsCount,
  onOpenCreditsModal,
  onGoHome,
}) => {
  const t = getTranslation(settings.language);

  const handleLogoClick = () => {
    if (onGoHome) {
      onGoHome();
    } else {
      setActiveTab('analyzer');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
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
    <header className="sticky top-0 z-40 bg-black/75 backdrop-blur-2xl border-b border-white/[0.08] text-[#f5f5f7] transition-all">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between min-h-[4rem] py-2.5 gap-2">
          {/* Logo & Title (Clickable -> Homepage) */}
          <button
            id="app-header-logo-btn"
            onClick={handleLogoClick}
            className="flex items-center space-x-3 shrink-0 text-left cursor-pointer group focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 rounded-2xl p-1 -m-1 transition-all active:scale-[0.97]"
            title="AIAUTOTRADER.com — Domů / Homepage"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 flex items-center justify-center shadow-lg shadow-emerald-500/25 shrink-0 group-hover:scale-105 group-hover:shadow-emerald-500/40 transition-all duration-300">
              <TrendingUp className="w-4 h-4 sm:w-5 sm:h-5 text-black stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-bold text-sm sm:text-base lg:text-[17px] tracking-tight text-white whitespace-nowrap group-hover:text-emerald-300 transition-colors">
                  AIAUTO<span className="text-emerald-400 font-extrabold">TRADER.com</span>
                </span>
                <span className="hidden xl:inline-block px-2.5 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-full backdrop-blur-md">
                  {t.proMentorTag}
                </span>
              </div>
              <p className="text-[11px] text-[#86868b] hidden xl:block group-hover:text-[#a1a1a6] transition-colors">
                {t.appSubtitle}
              </p>
            </div>
          </button>

          {/* Navigation Tabs - Apple Segmented Control Pill Bar */}
          <div className="flex items-center bg-[#1c1c1e]/80 backdrop-blur-xl border border-white/[0.08] p-1 rounded-full overflow-x-auto no-scrollbar scroll-smooth max-w-full shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
            <button
              onClick={() => setActiveTab('analyzer')}
              className={`flex items-center space-x-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-[13px] font-medium transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.98] ${
                activeTab === 'analyzer'
                  ? 'bg-white/15 text-white shadow-sm font-semibold border border-white/10'
                  : 'text-[#a1a1a6] hover:text-white hover:bg-white/5'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.tabAnalyzer}</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center space-x-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-[13px] font-medium transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.98] ${
                activeTab === 'audit'
                  ? 'bg-white/15 text-white shadow-sm font-semibold border border-white/10'
                  : 'text-[#a1a1a6] hover:text-white hover:bg-white/5'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-purple-400" />
              <span>{t.tabAudit}</span>
            </button>

            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex items-center space-x-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-[13px] font-medium transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.98] ${
                activeTab === 'calendar'
                  ? 'bg-white/15 text-white shadow-sm font-semibold border border-white/10'
                  : 'text-[#a1a1a6] hover:text-white hover:bg-white/5'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.tabCalendar}</span>
            </button>

            <button
              onClick={() => setActiveTab('journal')}
              className={`flex items-center space-x-1.5 px-3 sm:px-4 py-1.5 rounded-full text-xs sm:text-[13px] font-medium transition-all duration-200 cursor-pointer whitespace-nowrap shrink-0 active:scale-[0.98] ${
                activeTab === 'journal'
                  ? 'bg-white/15 text-white shadow-sm font-semibold border border-white/10'
                  : 'text-[#a1a1a6] hover:text-white hover:bg-white/5'
              }`}
            >
              <History className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.tabJournal}</span>
              {savedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold bg-emerald-500 text-black rounded-full shadow-xs">
                  {savedCount}
                </span>
              )}
            </button>
          </div>

          {/* Right Utilities */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {/* Credits / License Button - Apple Style Pill */}
            <button
              id="header-credits-btn"
              onClick={onOpenCreditsModal}
              className={`px-3 sm:px-3.5 py-1.5 rounded-full border text-xs font-semibold flex items-center space-x-1.5 transition-all duration-200 cursor-pointer active:scale-95 shadow-sm backdrop-blur-xl ${
                creditsCount > 0
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/25 hover:border-emerald-500/50'
                  : 'bg-amber-500/15 border-amber-500/30 text-amber-300 hover:bg-amber-500/25 hover:border-amber-500/50 animate-pulse'
              }`}
              title="Kredity & Licenční Správa / Credits & License"
            >
              <Zap className={`w-3.5 h-3.5 ${creditsCount > 0 ? 'text-emerald-400 fill-emerald-400/20' : 'text-amber-400 fill-amber-400/20'}`} />
              <span>
                {creditsCount > 0 ? `${creditsCount} ${t.creditsBadge}` : t.buyCreditsBtn}
              </span>
            </button>

            {/* Language Selector Cycle - Apple Style Pill */}
            <button
              onClick={cycleLanguage}
              className="px-2.5 sm:px-3 py-1.5 rounded-full border border-white/[0.08] bg-[#1c1c1e]/80 text-[#f5f5f7] hover:bg-white/10 hover:border-white/20 text-xs font-semibold flex items-center space-x-1.5 transition-all duration-200 cursor-pointer active:scale-95 backdrop-blur-xl"
              title="Přepnout jazyk / Switch Language / Cambiar Idioma"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span className="uppercase font-bold text-emerald-300">{settings.language}</span>
            </button>

            {/* GitHub Export Modal Button - Apple Style Pill */}
            <button
              onClick={onOpenGithubModal}
              className="p-1.5 sm:px-3 sm:py-1.5 rounded-full bg-[#1c1c1e]/80 hover:bg-white/10 text-[#a1a1a6] hover:text-white border border-white/[0.08] hover:border-white/20 transition-all duration-200 flex items-center space-x-1.5 text-xs font-medium cursor-pointer active:scale-95 backdrop-blur-xl"
              title={t.githubExport}
            >
              <Github className="w-4 h-4 text-[#f5f5f7]" />
              <span className="hidden md:inline">{t.githubExport}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
