import React, { useState } from 'react';
import { History, TrendingUp, TrendingDown, Trash2, CheckCircle2, Download, ExternalLink } from 'lucide-react';
import { AnalysisResult, LanguageOption } from '../types';
import { getTranslation } from '../utils/translations';

interface TradeJournalProps {
  journal: AnalysisResult[];
  onUpdateOutcome: (id: string, outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'PENDING') => void;
  onRemoveEntry: (id: string) => void;
  onSelectEntry: (entry: AnalysisResult) => void;
  language?: LanguageOption;
}

export const TradeJournal: React.FC<TradeJournalProps> = ({
  journal,
  onUpdateOutcome,
  onRemoveEntry,
  onSelectEntry,
  language = 'cs',
}) => {
  const t = getTranslation(language as LanguageOption);
  const [filter, setFilter] = useState<'ALL' | 'LONG' | 'SHORT' | 'WIN' | 'LOSS'>('ALL');

  const filteredJournal = journal.filter((item) => {
    if (filter === 'LONG') return item.signal === 'LONG';
    if (filter === 'SHORT') return item.signal === 'SHORT';
    if (filter === 'WIN') return item.tradeOutcome === 'WIN';
    if (filter === 'LOSS') return item.tradeOutcome === 'LOSS';
    return true;
  });

  const closedTrades = journal.filter((j) => j.tradeOutcome === 'WIN' || j.tradeOutcome === 'LOSS');
  const wins = journal.filter((j) => j.tradeOutcome === 'WIN').length;
  const losses = journal.filter((j) => j.tradeOutcome === 'LOSS').length;
  const winRate = closedTrades.length > 0 ? Math.round((wins / closedTrades.length) * 100) : 0;

  const exportJournalData = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(journal, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `aiautotrader_journal_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Journal Stats Header - Apple Glass Bento Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 flex items-center justify-between shadow-lg">
          <div>
            <div className="text-xs font-semibold text-[#86868b]">{t.totalAnalyses}</div>
            <div className="text-3xl font-extrabold text-white mt-1">{journal.length}</div>
          </div>
          <div className="p-3.5 bg-white/[0.06] rounded-2xl text-emerald-400 border border-white/[0.08]">
            <History className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 flex items-center justify-between shadow-lg">
          <div>
            <div className="text-xs font-semibold text-[#86868b]">{t.winRate}</div>
            <div className="text-3xl font-extrabold text-emerald-400 mt-1">{winRate}%</div>
          </div>
          <div className="p-3.5 bg-emerald-500/15 rounded-2xl text-emerald-400 border border-emerald-500/25">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 flex items-center justify-between shadow-lg">
          <div>
            <div className="text-xs font-semibold text-[#86868b]">{t.winningTrades}</div>
            <div className="text-3xl font-extrabold text-emerald-400 mt-1">{wins} <span className="text-sm font-semibold text-[#86868b]">/ {closedTrades.length}</span></div>
          </div>
          <div className="p-3.5 bg-emerald-500/15 rounded-2xl text-emerald-400 border border-emerald-500/25">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 flex items-center justify-between shadow-lg">
          <div>
            <div className="text-xs font-semibold text-[#86868b]">{t.losingTrades}</div>
            <div className="text-3xl font-extrabold text-red-400 mt-1">{losses}</div>
          </div>
          <div className="p-3.5 bg-red-500/15 rounded-2xl text-red-400 border border-red-500/25">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-5 border-b border-white/[0.08]">
          <div>
            <h3 className="text-base font-bold text-white tracking-tight">{t.tradeJournal}</h3>
            <p className="text-xs text-[#86868b] mt-0.5">Track real results and evaluate AI accuracy</p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={exportJournalData}
              disabled={journal.length === 0}
              className="px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/[0.08] text-xs font-semibold transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-40 active:scale-95 shadow-sm"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.exportJournal} (JSON)</span>
            </button>
          </div>
        </div>

        {/* Filters - Apple Segmented Bar */}
        <div className="flex flex-wrap items-center gap-1.5 p-1 bg-black/40 rounded-full border border-white/[0.08] w-fit mb-5">
          {(['ALL', 'LONG', 'SHORT', 'WIN', 'LOSS'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 cursor-pointer ${
                filter === f
                  ? 'bg-white/15 text-white font-bold shadow-sm'
                  : 'text-[#86868b] hover:text-white hover:bg-white/5'
              }`}
            >
              {f === 'ALL' ? t.allFilters : f}
            </button>
          ))}
        </div>

        {/* Entries List */}
        {filteredJournal.length === 0 ? (
          <div className="text-center py-16 text-[#86868b] text-xs font-medium">
            {journal.length === 0 ? t.emptyJournal : 'No entries match selected filter.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJournal.map((entry) => (
              <div
                key={entry.id}
                className="p-4 sm:p-5 bg-black/40 border border-white/[0.06] hover:border-white/[0.12] rounded-2xl transition-all flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                <div className="flex items-center space-x-4 cursor-pointer" onClick={() => onSelectEntry(entry)}>
                  {entry.uploadedImages[0] && (
                    <div className="w-16 h-12 rounded-xl overflow-hidden bg-black border border-white/[0.08] flex-shrink-0 hidden sm:block shadow-sm">
                      <img src={entry.uploadedImages[0]} alt="Chart" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center space-x-2.5">
                      <span className="font-extrabold text-white text-sm">{entry.symbol}</span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          entry.signal === 'LONG'
                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                            : entry.signal === 'SHORT'
                            ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                            : 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {entry.signal}
                      </span>
                      <span className="text-[10px] font-mono text-[#86868b]">{entry.timeframe}</span>
                    </div>

                    <div className="text-xs text-[#86868b] mt-1.5 flex flex-wrap items-center gap-3">
                      <span>{t.entryZone}: <strong className="text-white">{entry.entryZone?.recommended || (entry.entryZone?.min ? `${entry.entryZone.min} - ${entry.entryZone.max}` : 'N/A')}</strong></span>
                      <span>SL: <strong className="text-red-400">{entry.stopLoss?.price ?? 'N/A'}</strong></span>
                      <span>TP1: <strong className="text-emerald-400">{entry.takeProfitTargets?.[0]?.price ?? 'N/A'}</strong></span>
                      <span>R:R <strong className="text-[#f5f5f7]">{entry.overallRiskRewardRatio ?? 'N/A'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Outcome Toggle & Controls */}
                <div className="flex flex-wrap items-center gap-2 self-start md:self-auto mt-2 md:mt-0">
                  <div className="flex items-center space-x-1 bg-black/60 p-1 rounded-full border border-white/[0.08]">
                    <button
                      onClick={() => onUpdateOutcome(entry.id, 'WIN')}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                        entry.tradeOutcome === 'WIN' ? 'bg-emerald-500 text-black shadow-xs' : 'text-[#86868b] hover:text-emerald-400'
                      }`}
                    >
                      WIN
                    </button>
                    <button
                      onClick={() => onUpdateOutcome(entry.id, 'LOSS')}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                        entry.tradeOutcome === 'LOSS' ? 'bg-red-500 text-white shadow-xs' : 'text-[#86868b] hover:text-red-400'
                      }`}
                    >
                      LOSS
                    </button>
                    <button
                      onClick={() => onUpdateOutcome(entry.id, 'BREAKEVEN')}
                      className={`px-3 py-1 rounded-full text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                        entry.tradeOutcome === 'BREAKEVEN' ? 'bg-amber-500 text-black shadow-xs' : 'text-[#86868b] hover:text-amber-400'
                      }`}
                    >
                      BE
                    </button>
                  </div>

                  <button
                    onClick={() => onSelectEntry(entry)}
                    className="p-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white transition cursor-pointer active:scale-95 border border-white/[0.08]"
                    title="View details"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onRemoveEntry(entry.id)}
                    className="p-2 rounded-full bg-white/[0.06] hover:bg-red-500/20 text-[#86868b] hover:text-red-400 transition cursor-pointer active:scale-95 border border-white/[0.08]"
                    title="Remove entry"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
