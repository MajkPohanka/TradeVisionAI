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
}) => {
  const t = getTranslation(settings.language);

  const cycleLanguage = () => {
    const nextLang: Record<LanguageOption, LanguageOption> = {
      cs: 'en',
      en: 'es',
      es: 'cs',
    };
    onUpdateSettings({ language: nextLang[settings.language || 'cs'] });
  };

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 text-slate-100">
      <div className="max-w-7xl mx-auto px-2 sm:px-4 lg:px-8">
        <div className="flex items-center justify-between min-h-[3.75rem] py-2 gap-2">
          {/* Logo & Title */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20 shrink-0">
              <TrendingUp className="w-4 h-4 sm:w-6 sm:h-6 text-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-bold text-sm sm:text-base lg:text-lg tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent whitespace-nowrap">
                  AIAUTO<span className="text-emerald-400 font-extrabold">TRADER.com</span>
                </span>
                <span className="hidden xl:inline-block px-2 py-0.5 text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full">
                  {t.proMentorTag}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 hidden xl:block">
                {t.appSubtitle}
              </p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <div className="flex items-center space-x-1 sm:space-x-1.5 overflow-x-auto no-scrollbar py-1 scroll-smooth max-w-full">
            <button
              onClick={() => setActiveTab('analyzer')}
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'analyzer'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Sliders className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
              <span>{t.tabAnalyzer}</span>
            </button>

            <button
              onClick={() => setActiveTab('audit')}
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'audit'
                  ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-purple-400" />
              <span>{t.tabAudit}</span>
            </button>

            <button
              onClick={() => setActiveTab('calendar')}
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'calendar'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-400" />
              <span>{t.tabCalendar}</span>
            </button>

            <button
              onClick={() => setActiveTab('journal')}
              className={`flex items-center space-x-1 sm:space-x-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                activeTab === 'journal'
                  ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-slate-300 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <History className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-400" />
              <span>{t.tabJournal}</span>
              {savedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.2 text-[10px] font-bold bg-emerald-500 text-slate-950 rounded-full">
                  {savedCount}
                </span>
              )}
            </button>
          </div>

          {/* Right Utilities */}
          <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0">
            {/* Credits / License Button */}
            <button
              id="header-credits-btn"
              onClick={onOpenCreditsModal}
              className={`px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer active:scale-95 shadow-sm ${
                creditsCount > 0
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 hover:text-emerald-200'
                  : 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25 hover:text-amber-200 animate-pulse'
              }`}
              title="Kredity & Licenční Správa / Credits & License"
            >
              <Zap className={`w-3.5 h-3.5 ${creditsCount > 0 ? 'text-emerald-400 fill-emerald-400/20' : 'text-amber-400 fill-amber-400/20'}`} />
              <span>
                {creditsCount > 0 ? `${creditsCount} ${t.creditsBadge}` : t.buyCreditsBtn}
              </span>
            </button>

            {/* Language Selector Cycle */}
            <button
              onClick={cycleLanguage}
              className="px-2 sm:px-2.5 py-1.5 rounded-lg border border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white text-xs font-semibold flex items-center space-x-1 sm:space-x-1.5 transition cursor-pointer active:scale-95"
              title="Přepnout jazyk / Switch Language / Cambiar Idioma"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              <span className="uppercase font-bold text-emerald-300">{settings.language}</span>
            </button>

            {/* GitHub Export Modal Button */}
            <button
              onClick={onOpenGithubModal}
              className="p-1.5 sm:p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 transition flex items-center space-x-1.5 text-xs font-medium cursor-pointer active:scale-95"
              title={t.githubExport}
            >
              <Github className="w-4 h-4 text-slate-300" />
              <span className="hidden md:inline">{t.githubExport}</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
