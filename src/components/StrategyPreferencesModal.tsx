import React from 'react';
import {
  Sliders,
  Clock,
  ShieldAlert,
  Cpu,
  FileText,
  Bot,
  Check,
  X,
  Sun,
  Moon,
  Eclipse,
  Target,
} from 'lucide-react';
import { StrategySettings, HoldingPeriod, RiskTolerance, TradingStrategy, AppTheme } from '../types';
import { getTranslation } from '../utils/translations';

interface StrategyPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: StrategySettings;
  onUpdateSettings: (newSettings: Partial<StrategySettings>) => void;
  theme?: AppTheme;
  onUpdateTheme?: (newTheme: AppTheme) => void;
}

export const StrategyPreferencesModal: React.FC<StrategyPreferencesModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
  theme = 'light',
  onUpdateTheme,
}) => {
  const t = getTranslation(settings.language);

  if (!isOpen) return null;

  const currentTheme = theme || settings.theme || 'light';

  const handleThemeChange = (newTheme: AppTheme) => {
    if (onUpdateTheme) {
      onUpdateTheme(newTheme);
    }
    onUpdateSettings({ theme: newTheme });
  };

  const holdingPeriods: { id: HoldingPeriod; label: string; desc: string }[] = [
    { id: 'scalp', label: t.scalpLabel, desc: t.scalpDesc },
    { id: 'intraday', label: t.intradayLabel, desc: t.intradayDesc },
    { id: 'swing', label: t.swingLabel, desc: t.swingDesc },
    { id: 'position', label: t.positionLabel, desc: t.positionDesc },
  ];

  const riskLevels: { id: RiskTolerance; label: string; badge: string }[] = [
    { id: 'conservative', label: t.conservativeLabel, badge: t.conservativeBadge },
    { id: 'balanced', label: t.balancedLabel, badge: t.balancedBadge },
    { id: 'aggressive', label: t.aggressiveLabel, badge: t.aggressiveBadge },
  ];

  const strategies: { id: TradingStrategy; label: string; desc: string }[] = [
    { id: 'price_action', label: t.strategyPriceActionLabel, desc: t.strategyPriceActionDesc },
    { id: 'smc_ict', label: t.strategySmcLabel, desc: t.strategySmcDesc },
    { id: 'wyckoff', label: t.strategyWyckoffLabel, desc: t.strategyWyckoffDesc },
    { id: 'trend_breakout', label: t.strategyTrendBreakoutLabel, desc: t.strategyTrendBreakoutDesc },
    { id: 'supply_demand', label: t.strategySupplyDemandLabel, desc: t.strategySupplyDemandDesc },
    { id: 'custom', label: t.customRulesLabel, desc: t.customRulesPlaceholder.substring(0, 45) + '...' },
  ];

  const currentStrategies: TradingStrategy[] = settings.strategies && settings.strategies.length > 0
    ? settings.strategies
    : ['price_action', 'smc_ict', 'wyckoff', 'trend_breakout', 'supply_demand'];

  const toggleStrategy = (id: TradingStrategy) => {
    let updated: TradingStrategy[];
    if (currentStrategies.includes(id)) {
      if (currentStrategies.length === 1) return;
      updated = currentStrategies.filter((s) => s !== id);
    } else {
      updated = [...currentStrategies, id];
    }
    onUpdateSettings({
      strategies: updated,
      strategy: updated[0],
    });
  };

  const handleSelectAllStrategies = () => {
    const allIds = strategies.map((s) => s.id);
    onUpdateSettings({
      strategies: allIds,
      strategy: allIds[0],
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto bg-black/80 animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-3xl bg-[#141418] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-white/[0.08] bg-[#18181c] flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                <span>{t.strategyTitle}</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
                  {t.strategyBadge}
                </span>
              </h2>
              <p className="text-xs text-[#86868b]">
                {t.strategyModalSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#86868b] hover:text-white hover:bg-white/10 transition cursor-pointer"
            aria-label="Zavřít"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 space-y-6 overflow-y-auto">
          {/* 1. Holding Period */}
          <div>
            <label className="text-xs font-semibold text-[#a1a1a6] flex items-center space-x-1.5 mb-2.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.holdingPeriodLabel}</span>
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {holdingPeriods.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onUpdateSettings({ holdingPeriod: item.id })}
                  className={`p-3 rounded-xl text-left border transition cursor-pointer ${
                    settings.holdingPeriod === item.id
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                      : 'bg-white/[0.02] border-white/[0.06] text-[#86868b] hover:text-white'
                  }`}
                >
                  <div className="text-xs font-bold text-white">{item.label}</div>
                  <div className="text-[10px] text-[#86868b] mt-1 leading-relaxed">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Methodologies */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-semibold text-[#a1a1a6] flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t.methodologiesLabel}</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAllStrategies}
                className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer"
              >
                {t.combineAllMethodologies}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {strategies.map((strat) => {
                const isSelected = currentStrategies.includes(strat.id);
                return (
                  <button
                    key={strat.id}
                    type="button"
                    onClick={() => toggleStrategy(strat.id)}
                    className={`p-3 rounded-xl text-left border transition cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300'
                        : 'bg-white/[0.02] border-white/[0.06] text-[#86868b] hover:text-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-white">{strat.label}</div>
                      <div
                        className={`w-4 h-4 rounded-md border flex items-center justify-center ${
                          isSelected ? 'bg-cyan-400 border-cyan-300 text-black' : 'border-white/20'
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>
                    <div className="text-[10px] text-[#86868b] mt-1 leading-relaxed">{strat.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Risk Profile & Account Risk */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-[#a1a1a6] flex items-center space-x-1.5 mb-2.5">
                <ShieldAlert className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.riskProfileLabel}</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {riskLevels.map((risk) => (
                  <button
                    key={risk.id}
                    type="button"
                    onClick={() => onUpdateSettings({ riskTolerance: risk.id })}
                    className={`p-2.5 rounded-xl text-center border transition cursor-pointer ${
                      settings.riskTolerance === risk.id
                        ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 font-bold'
                        : 'bg-white/[0.02] border-white/[0.06] text-[#86868b] hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold text-white">{risk.label}</div>
                    <div className="text-[9px] text-[#86868b] mt-0.5">{risk.badge}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#a1a1a6] block mb-2.5">
                {t.riskPerTradeLabel}
              </label>
              <div className="flex items-center space-x-2">
                <input
                  type="number"
                  min="0.25"
                  max="10"
                  step="0.25"
                  value={settings.accountRiskPercent}
                  onChange={(e) =>
                    onUpdateSettings({ accountRiskPercent: parseFloat(e.target.value) || 1.0 })
                  }
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-xl px-3 py-2 text-white text-xs font-bold focus:outline-none focus:border-emerald-500/60"
                />
                <span className="text-xs font-bold text-emerald-400">%</span>
              </div>
            </div>
          </div>

          {/* 4. Target Take Profit Profile & R:R Settings */}
          <div>
            <label className="text-xs font-semibold text-[#a1a1a6] flex items-center justify-between mb-2.5">
              <span className="flex items-center space-x-1.5">
                <Target className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {settings.language === 'cs'
                    ? 'Cílový profil zisku a poměr R:R (Take Profit)'
                    : settings.language === 'es'
                    ? 'Perfil de Take Profit y Ratio R:R'
                    : 'Target Take Profit Profile & R:R Ratio'}
                </span>
              </span>
              <span className="text-[10px] text-cyan-400 font-semibold">
                {settings.riskRewardProfile === 'conservative'
                  ? (settings.language === 'cs' ? 'Konzervativní (1:1.0 - 1:2.3)' : 'Conservative (1:1.0 - 1:2.3)')
                  : settings.riskRewardProfile === 'aggressive'
                  ? (settings.language === 'cs' ? 'Agresivní (1:1.4 - 1:3.4)' : 'Aggressive (1:1.4 - 1:3.4)')
                  : (settings.language === 'cs' ? 'Vyvážený SMC (1:1.2 - 1:2.8)' : 'Balanced SMC (1:1.2 - 1:2.8)')}
              </span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => onUpdateSettings({ riskRewardProfile: 'conservative' })}
                className={`p-3 rounded-xl text-left border transition cursor-pointer ${
                  settings.riskRewardProfile === 'conservative'
                    ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 ring-1 ring-cyan-500/30'
                    : 'bg-white/[0.02] border-white/[0.06] text-[#86868b] hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white">
                    {settings.language === 'cs' ? 'Konzervativní / Strukturální' : 'Conservative / Structural'}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">1:1.0 - 1:2.3</span>
                </div>
                <div className="text-[10px] text-[#86868b] mt-1 leading-relaxed">
                  {settings.language === 'cs'
                    ? 'Realistické cíle v rámci grafu, vysoká pravděpodobnost zásahu a rychlý BE.'
                    : 'Realistic levels on chart, high hit rate, fast breakeven.'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onUpdateSettings({ riskRewardProfile: 'balanced' })}
                className={`p-3 rounded-xl text-left border transition cursor-pointer ${
                  !settings.riskRewardProfile || settings.riskRewardProfile === 'balanced'
                    ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 ring-1 ring-emerald-500/30'
                    : 'bg-white/[0.02] border-white/[0.06] text-[#86868b] hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white">
                    {settings.language === 'cs' ? 'Vyvážený SMC (Doporučeno)' : 'Balanced SMC (Recommended)'}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold">1:1.2 - 1:2.8</span>
                </div>
                <div className="text-[10px] text-[#86868b] mt-1 leading-relaxed">
                  {settings.language === 'cs'
                    ? 'Kotveno na likviditní pooly BSL/SSL a Equal Highs/Lows na grafu.'
                    : 'Anchored to BSL/SSL liquidity pools and Equal Highs/Lows on chart.'}
                </div>
              </button>

              <button
                type="button"
                onClick={() => onUpdateSettings({ riskRewardProfile: 'aggressive' })}
                className={`p-3 rounded-xl text-left border transition cursor-pointer ${
                  settings.riskRewardProfile === 'aggressive'
                    ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 ring-1 ring-amber-500/30'
                    : 'bg-white/[0.02] border-white/[0.06] text-[#86868b] hover:text-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-white">
                    {settings.language === 'cs' ? 'Trendový / Expanzní' : 'Trend / Expansion'}
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">1:1.4 - 1:3.4</span>
                </div>
                <div className="text-[10px] text-[#86868b] mt-1 leading-relaxed">
                  {settings.language === 'cs'
                    ? 'Pro silné expanzní impulsy a dlouhé běhy s trailing stopem.'
                    : 'For strong impulse waves and extended trailing runners.'}
                </div>
              </button>
            </div>
          </div>

          {/* Theme Appearance Setting */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-[#a1a1a6] flex items-center justify-between">
              <span className="flex items-center space-x-1.5">
                <Sun className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.themeLabel || 'Vzhled aplikace (Design & Téma)'}</span>
              </span>
              <span className="text-[11px] text-emerald-400 font-semibold">
                {currentTheme === 'light' ? (t.themeLight || 'Světlý') : currentTheme === 'dark' ? (t.themeDark || 'Tmavý') : (t.themeBlack || 'Černý')}
              </span>
            </label>

            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => handleThemeChange('light')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col items-center text-center space-y-1.5 ${
                  currentTheme === 'light'
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 ring-1 ring-emerald-500/30'
                    : 'bg-white/[0.02] border-white/[0.08] text-[#a1a1a6] hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Sun className="w-5 h-5 text-emerald-400" />
                <div className="flex items-center space-x-1">
                  <span className="text-xs font-bold text-white">{t.themeLight || 'Světlý'}</span>
                  <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-semibold px-1 py-0.2 rounded">
                    {settings.language === 'cs' ? 'Šetrný k očím' : 'Eye Comfort'}
                  </span>
                </div>
                <span className="text-[10px] text-[#86868b] leading-tight">
                  {t.themeLightDesc || 'Jemný a přehledný světlý design'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeChange('dark')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col items-center text-center space-y-1.5 ${
                  currentTheme === 'dark'
                    ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 ring-1 ring-sky-500/30'
                    : 'bg-white/[0.02] border-white/[0.08] text-[#a1a1a6] hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Moon className="w-5 h-5 text-sky-400" />
                <span className="text-xs font-bold text-white">{t.themeDark || 'Tmavý'}</span>
                <span className="text-[10px] text-[#86868b] leading-tight">
                  {t.themeDarkDesc || 'Šedý břidlicový režim šetrný k očím'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleThemeChange('black')}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col items-center text-center space-y-1.5 ${
                  currentTheme === 'black'
                    ? 'bg-purple-500/15 border-purple-500/40 text-purple-300 ring-1 ring-purple-500/30'
                    : 'bg-white/[0.02] border-white/[0.08] text-[#a1a1a6] hover:bg-white/[0.05] hover:text-white'
                }`}
              >
                <Eclipse className="w-5 h-5 text-purple-400" />
                <span className="text-xs font-bold text-white">{t.themeBlack || 'Černý'}</span>
                <span className="text-[10px] text-[#86868b] leading-tight">
                  {t.themeBlackDesc || 'Čistě černý OLED režim'}
                </span>
              </button>
            </div>
          </div>

          {/* 4. Custom Rules & Mentor Prompt */}
          <div className="space-y-3">
            <div>
              <label className="text-xs font-semibold text-[#a1a1a6] flex items-center space-x-1.5 mb-1.5">
                <FileText className="w-3.5 h-3.5 text-purple-400" />
                <span>{t.customRulesLabel}</span>
              </label>
              <textarea
                rows={2}
                value={settings.customRules}
                onChange={(e) => onUpdateSettings({ customRules: e.target.value })}
                placeholder={t.customRulesPlaceholder}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 text-xs text-white placeholder-[#6e6e73] focus:outline-none focus:border-emerald-500/60"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#a1a1a6] flex items-center space-x-1.5 mb-1.5">
                <Bot className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t.customMentorPromptLabel}</span>
              </label>
              <textarea
                rows={2}
                value={settings.customMentorPrompt}
                onChange={(e) => onUpdateSettings({ customMentorPrompt: e.target.value })}
                placeholder={t.customMentorPromptPlaceholder}
                className="w-full bg-white/[0.03] border border-white/[0.08] rounded-xl p-3 text-xs text-white placeholder-[#6e6e73] focus:outline-none focus:border-cyan-500/60"
              />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-white/[0.08] bg-[#18181c] flex items-center justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition cursor-pointer"
          >
            {t.saveSettingsDone}
          </button>
        </div>
      </div>
    </div>
  );
};
