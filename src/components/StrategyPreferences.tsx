import React, { useState } from 'react';
import { Sliders, Clock, ShieldAlert, Cpu, FileText, ChevronDown, ChevronUp, Save, Trash2, Bot, Check } from 'lucide-react';
import { StrategySettings, HoldingPeriod, RiskTolerance, TradingStrategy, StrategyPreset } from '../types';
import { getTranslation } from '../utils/translations';

interface StrategyPreferencesProps {
  settings: StrategySettings;
  onUpdateSettings: (newSettings: Partial<StrategySettings>) => void;
}

export const StrategyPreferences: React.FC<StrategyPreferencesProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const t = getTranslation(settings.language);
  const [isExpanded, setIsExpanded] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [showPresetSaveSuccess, setShowPresetSaveSuccess] = useState(false);

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

  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: StrategyPreset = {
      id: Date.now().toString(),
      name: newPresetName.trim(),
      holdingPeriod: settings.holdingPeriod,
      riskTolerance: settings.riskTolerance,
      strategy: settings.strategy,
      strategies: settings.strategies || [settings.strategy],
      customRules: settings.customRules,
      customMentorPrompt: settings.customMentorPrompt,
      accountRiskPercent: settings.accountRiskPercent,
    };

    const updatedPresets = [...(settings.presets || []), newPreset];
    onUpdateSettings({
      presets: updatedPresets,
      activePresetId: newPreset.id,
    });
    setNewPresetName('');
    setShowPresetSaveSuccess(true);
    setTimeout(() => setShowPresetSaveSuccess(false), 2000);
  };

  const handleApplyPreset = (preset: StrategyPreset) => {
    onUpdateSettings({
      holdingPeriod: preset.holdingPeriod,
      riskTolerance: preset.riskTolerance,
      strategy: preset.strategy,
      customRules: preset.customRules,
      customMentorPrompt: preset.customMentorPrompt || '',
      accountRiskPercent: preset.accountRiskPercent,
      activePresetId: preset.id,
    });
  };

  const handleDeletePreset = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = (settings.presets || []).filter((p) => p.id !== id);
    onUpdateSettings({
      presets: updated,
      activePresetId: settings.activePresetId === id ? undefined : settings.activePresetId,
    });
  };

  return (
    <div className="bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-[0_8px_32px_rgba(0,0,0,0.37)] transition-all">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between cursor-pointer group select-none"
      >
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-xs">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition flex items-center gap-2">
              <span>{t.strategyTitle}</span>
              <span className="px-2.5 py-0.5 bg-emerald-500/15 text-emerald-400 text-[10px] font-semibold rounded-full border border-emerald-500/25">
                {t.strategyBadge}
              </span>
            </h3>
            <p className="text-xs text-[#86868b] mt-0.5">
              {holdingPeriods.find((h) => h.id === settings.holdingPeriod)?.label} •{' '}
              {strategies.find((s) => s.id === settings.strategy)?.label}
            </p>
          </div>
        </div>

        <button className="p-2 rounded-full bg-white/[0.06] text-[#86868b] hover:text-white hover:bg-white/10 transition cursor-pointer border border-white/[0.06]">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-6 pt-5 border-t border-white/[0.08] space-y-6 animate-fadeIn">
          {/* Preset Manager Bar */}
          <div className="p-4 bg-black/50 rounded-2xl border border-white/[0.06] space-y-3 backdrop-blur-md">
            <div className="text-xs font-semibold text-[#a1a1a6] flex items-center justify-between">
              <span>{t.presetsTitle}</span>
              {showPresetSaveSuccess && (
                <span className="text-emerald-400 text-[10px] font-bold flex items-center gap-1">
                  <Check className="w-3 h-3" /> {t.presetSaved}
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(settings.presets || []).map((preset) => (
                <div
                  key={preset.id}
                  onClick={() => handleApplyPreset(preset)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium cursor-pointer border flex items-center space-x-2 transition-all duration-200 active:scale-95 ${
                    settings.activePresetId === preset.id
                      ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-300 shadow-sm'
                      : 'bg-white/[0.04] border-white/[0.08] text-[#a1a1a6] hover:text-white hover:bg-white/[0.08]'
                  }`}
                >
                  <span>{preset.name}</span>
                  <button
                    onClick={(e) => handleDeletePreset(preset.id, e)}
                    className="text-[#6e6e73] hover:text-red-400 transition cursor-pointer p-0.5 rounded-full"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <div className="flex items-center space-x-2 w-full sm:w-auto sm:ml-auto mt-2 sm:mt-0">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder={t.presetNamePlaceholder}
                  className="flex-1 sm:w-48 bg-white/[0.05] border border-white/[0.08] rounded-full px-3.5 py-1.5 text-xs text-white placeholder-[#6e6e73] focus:outline-none focus:border-emerald-500/60 focus:bg-white/[0.08] transition"
                />
                <button
                  type="button"
                  onClick={handleSavePreset}
                  disabled={!newPresetName.trim()}
                  className="px-4 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition flex items-center space-x-1.5 disabled:opacity-40 cursor-pointer shrink-0 active:scale-95 shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{t.saveBtn}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 1. Holding Period - Apple Segmented Bento Grid */}
          <div>
            <label className="text-xs font-semibold text-[#a1a1a6] flex items-center space-x-1.5 mb-2.5">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.holdingPeriodLabel}</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
              {holdingPeriods.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onUpdateSettings({ holdingPeriod: item.id })}
                  className={`p-3.5 rounded-2xl text-left border transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                    settings.holdingPeriod === item.id
                      ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300 shadow-md ring-1 ring-emerald-500/20'
                      : 'bg-white/[0.03] border-white/[0.06] text-[#86868b] hover:text-[#f5f5f7] hover:bg-white/[0.06] hover:border-white/[0.12]'
                  }`}
                >
                  <div className="text-xs font-bold text-white">{item.label}</div>
                  <div className="text-[10px] text-[#86868b] mt-1 leading-relaxed">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Strategy Framework (Multi-Selectable) */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-xs font-semibold text-[#a1a1a6] flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t.methodologiesLabel}</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAllStrategies}
                className="text-[11px] font-semibold text-cyan-400 hover:text-cyan-300 cursor-pointer transition"
              >
                {t.combineAllMethodologies}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {strategies.map((strat) => {
                const isSelected = currentStrategies.includes(strat.id);
                return (
                  <button
                    key={strat.id}
                    type="button"
                    onClick={() => toggleStrategy(strat.id)}
                    className={`p-3.5 rounded-2xl text-left border transition-all duration-200 cursor-pointer relative active:scale-[0.98] ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-500/50 text-cyan-300 shadow-md ring-1 ring-cyan-500/25'
                        : 'bg-white/[0.03] border-white/[0.06] text-[#86868b] hover:text-[#f5f5f7] hover:bg-white/[0.06] hover:border-white/[0.12]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-white">{strat.label}</div>
                      <div
                        className={`w-4 h-4 rounded-full border flex items-center justify-center transition-all ${
                          isSelected ? 'bg-cyan-400 border-cyan-300 text-black' : 'border-white/20 bg-white/5'
                        }`}
                      >
                        {isSelected && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                      </div>
                    </div>
                    <div className="text-[10px] text-[#86868b] mt-1.5 leading-relaxed">{strat.desc}</div>
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
              <div className="grid grid-cols-3 gap-2.5">
                {riskLevels.map((risk) => (
                  <button
                    key={risk.id}
                    type="button"
                    onClick={() => onUpdateSettings({ riskTolerance: risk.id })}
                    className={`p-3 rounded-2xl text-center border transition-all duration-200 cursor-pointer active:scale-[0.98] ${
                      settings.riskTolerance === risk.id
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 font-bold ring-1 ring-amber-500/25'
                        : 'bg-white/[0.03] border-white/[0.06] text-[#86868b] hover:text-[#f5f5f7] hover:bg-white/[0.06]'
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
                  className="w-full bg-white/[0.05] border border-white/[0.08] rounded-2xl px-4 py-2.5 text-white text-xs font-bold focus:outline-none focus:border-emerald-500/60 focus:bg-white/[0.08] transition"
                />
                <span className="text-xs font-bold text-emerald-400">%</span>
              </div>
            </div>
          </div>

          {/* 4. Custom Rules Prompt */}
          <div>
            <label className="text-xs font-semibold text-[#a1a1a6] flex items-center space-x-1.5 mb-2">
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              <span>{t.customRulesLabel}</span>
            </label>
            <textarea
              rows={2}
              value={settings.customRules}
              onChange={(e) => onUpdateSettings({ customRules: e.target.value })}
              placeholder={t.customRulesPlaceholder}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl p-3.5 text-xs text-white placeholder-[#6e6e73] focus:outline-none focus:border-emerald-500/60 focus:bg-white/[0.06] transition leading-relaxed"
            />
          </div>

          {/* 5. Custom Mentor Prompt */}
          <div>
            <label className="text-xs font-semibold text-[#a1a1a6] flex items-center space-x-1.5 mb-2">
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.customMentorPromptLabel}</span>
            </label>
            <textarea
              rows={2}
              value={settings.customMentorPrompt}
              onChange={(e) => onUpdateSettings({ customMentorPrompt: e.target.value })}
              placeholder={t.customMentorPromptPlaceholder}
              className="w-full bg-white/[0.04] border border-white/[0.08] rounded-2xl p-3.5 text-xs text-white placeholder-[#6e6e73] focus:outline-none focus:border-cyan-500/60 focus:bg-white/[0.06] transition leading-relaxed"
            />
          </div>
        </div>
      )}
    </div>
  );
};
