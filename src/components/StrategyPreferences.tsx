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

  const currentStrategies = settings.strategies || (settings.strategy ? [settings.strategy] : ['price_action', 'smc_ict']);

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
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-lg">
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between cursor-pointer group"
      >
        <div className="flex items-center space-x-2">
          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Sliders className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100 group-hover:text-emerald-400 transition flex items-center gap-2">
              <span>{t.strategyTitle}</span>
              <span className="px-2 py-0.2 bg-emerald-500/20 text-emerald-400 text-[10px] rounded-full border border-emerald-500/30">
                {t.strategyBadge}
              </span>
            </h3>
            <p className="text-xs text-slate-400">
              {holdingPeriods.find((h) => h.id === settings.holdingPeriod)?.label} •{' '}
              {strategies.find((s) => s.id === settings.strategy)?.label}
            </p>
          </div>
        </div>

        <button className="p-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer">
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="mt-5 pt-4 border-t border-slate-800 space-y-5 animate-fadeIn">
          {/* Preset Manager Bar */}
          <div className="p-3 bg-slate-950 rounded-xl border border-slate-800/80 space-y-2">
            <div className="text-xs font-bold text-slate-300 flex items-center justify-between">
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
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border flex items-center space-x-2 transition ${
                    settings.activePresetId === preset.id
                      ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                      : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <span>{preset.name}</span>
                  <button
                    onClick={(e) => handleDeletePreset(preset.id, e)}
                    className="text-slate-500 hover:text-red-400 transition cursor-pointer p-0.5"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}

              <div className="flex items-center space-x-1.5 w-full sm:w-auto sm:ml-auto mt-1 sm:mt-0">
                <input
                  type="text"
                  value={newPresetName}
                  onChange={(e) => setNewPresetName(e.target.value)}
                  placeholder={t.presetNamePlaceholder}
                  className="flex-1 sm:w-44 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  type="button"
                  onClick={handleSavePreset}
                  disabled={!newPresetName.trim()}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition flex items-center space-x-1 disabled:opacity-50 cursor-pointer shrink-0 active:scale-95"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{t.saveBtn}</span>
                </button>
              </div>
            </div>
          </div>

          {/* 1. Holding Period */}
          <div>
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5 mb-2">
              <Clock className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.holdingPeriodLabel}</span>
            </label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {holdingPeriods.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onUpdateSettings({ holdingPeriod: item.id })}
                  className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer active:scale-98 ${
                    settings.holdingPeriod === item.id
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-300 shadow-md'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold text-slate-200">{item.label}</div>
                  <div className="text-[10px] text-slate-400 mt-0.5 leading-tight">{item.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* 2. Strategy Framework (Multi-Selectable) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5">
                <Cpu className="w-3.5 h-3.5 text-cyan-400" />
                <span>{t.methodologiesLabel}</span>
              </label>
              <button
                type="button"
                onClick={handleSelectAllStrategies}
                className="text-[11px] font-bold text-cyan-400 hover:text-cyan-300 underline cursor-pointer"
              >
                {t.combineAllMethodologies}
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {strategies.map((strat) => {
                const isSelected = currentStrategies.includes(strat.id);
                return (
                  <button
                    key={strat.id}
                    type="button"
                    onClick={() => toggleStrategy(strat.id)}
                    className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer relative ${
                      isSelected
                        ? 'bg-cyan-500/15 border-cyan-500 text-cyan-300 shadow-md ring-1 ring-cyan-500/30'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-xs font-bold text-slate-200">{strat.label}</div>
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isSelected ? 'bg-cyan-500 border-cyan-400 text-slate-950' : 'border-slate-700 bg-slate-900'
                        }`}
                      >
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 mt-1">{strat.desc}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. Risk Profile & Account Risk */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-2">
              <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5 mb-2">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span>{t.riskProfileLabel}</span>
              </label>
              <div className="grid grid-cols-3 gap-2">
                {riskLevels.map((risk) => (
                  <button
                    key={risk.id}
                    type="button"
                    onClick={() => onUpdateSettings({ riskTolerance: risk.id })}
                    className={`p-2 rounded-xl text-center border transition-all cursor-pointer ${
                      settings.riskTolerance === risk.id
                        ? 'bg-amber-500/15 border-amber-500 text-amber-300 font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                    }`}
                  >
                    <div className="text-xs font-bold text-slate-200">{risk.label}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">{risk.badge}</div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
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
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-slate-200 text-xs font-bold focus:outline-none focus:border-emerald-500"
                />
                <span className="text-xs font-bold text-emerald-400">%</span>
              </div>
            </div>
          </div>

          {/* 4. Custom Rules Prompt */}
          <div>
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5 mb-1.5">
              <FileText className="w-3.5 h-3.5 text-purple-400" />
              <span>{t.customRulesLabel}</span>
            </label>
            <textarea
              rows={2}
              value={settings.customRules}
              onChange={(e) => onUpdateSettings({ customRules: e.target.value })}
              placeholder={t.customRulesPlaceholder}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          {/* 5. Custom Mentor Prompt */}
          <div>
            <label className="text-xs font-semibold text-slate-300 flex items-center space-x-1.5 mb-1.5">
              <Bot className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.customMentorPromptLabel}</span>
            </label>
            <textarea
              rows={2}
              value={settings.customMentorPrompt}
              onChange={(e) => onUpdateSettings({ customMentorPrompt: e.target.value })}
              placeholder={t.customMentorPromptPlaceholder}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500 transition"
            />
          </div>
        </div>
      )}
    </div>
  );
};
