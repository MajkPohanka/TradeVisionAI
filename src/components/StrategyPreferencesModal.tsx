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
} from 'lucide-react';
import { StrategySettings, HoldingPeriod, RiskTolerance, TradingStrategy } from '../types';
import { getTranslation } from '../utils/translations';

interface StrategyPreferencesModalProps {
  isOpen: boolean;
  onClose: () => void;
  settings: StrategySettings;
  onUpdateSettings: (newSettings: Partial<StrategySettings>) => void;
}

export const StrategyPreferencesModal: React.FC<StrategyPreferencesModalProps> = ({
  isOpen,
  onClose,
  settings,
  onUpdateSettings,
}) => {
  const t = getTranslation(settings.language);

  if (!isOpen) return null;

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
    { id: 'price_action', label: 'Price Action & Svíčky', desc: 'Svíčkové formace, supporty/rezistence, trendlines' },
    { id: 'smc_ict', label: 'Smart Money Concepts (SMC/ICT)', desc: 'Order blocks, FVG, CHoCH, Liquidity sweeps' },
    { id: 'wyckoff', label: 'Wyckoff Metodika', desc: 'Fáze akumulace/distribuce, Spring, UTAD, Markup' },
    { id: 'trend_breakout', label: 'Trend & Breakout System', desc: 'Momentum, průrazy struktur, EMA konfluence' },
    { id: 'supply_demand', label: 'Supply & Demand Zóny', desc: 'Zóny nabídky a poptávky, Imbalance, institutional footprint' },
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
                Přizpůsobte metodiky, risk profil a systémové chování AI analytika.
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
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
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
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold'
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
            Hotovo / Uložit nastavení
          </button>
        </div>
      </div>
    </div>
  );
};
