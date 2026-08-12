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
    downloadAnchor.setAttribute('download', `tradevision_journal_${new Date().toISOString().slice(0, 10)}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Journal Stats Header */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400">{t.totalAnalyses}</div>
            <div className="text-2xl font-black text-white mt-1">{journal.length}</div>
          </div>
          <div className="p-3 bg-slate-800 rounded-xl text-emerald-400">
            <History className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400">{t.winRate}</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{winRate}%</div>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
            <CheckCircle2 className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400">{t.winningTrades}</div>
            <div className="text-2xl font-black text-emerald-400 mt-1">{wins} / {closedTrades.length}</div>
          </div>
          <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
            <TrendingUp className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-400">{t.losingTrades}</div>
            <div className="text-2xl font-black text-red-400 mt-1">{losses}</div>
          </div>
          <div className="p-3 bg-red-500/10 rounded-xl text-red-400">
            <TrendingDown className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Main Table Card */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-4 border-b border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-100">{t.tradeJournal}</h3>
            <p className="text-xs text-slate-400">Track real results and evaluate AI accuracy</p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={exportJournalData}
              disabled={journal.length === 0}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Download className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.exportJournal} (JSON)</span>
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          {(['ALL', 'LONG', 'SHORT', 'WIN', 'LOSS'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer ${
                filter === f
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {f === 'ALL' ? t.allFilters : f}
            </button>
          ))}
        </div>

        {/* Entries List */}
        {filteredJournal.length === 0 ? (
          <div className="text-center py-12 text-slate-500 text-xs">
            {journal.length === 0 ? t.emptyJournal : 'No entries match selected filter.'}
          </div>
        ) : (
          <div className="space-y-3">
            {filteredJournal.map((entry) => (
              <div
                key={entry.id}
                className="p-4 bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-xl transition flex flex-col md:flex-row md:items-center justify-between gap-3"
              >
                <div className="flex items-center space-x-3 cursor-pointer" onClick={() => onSelectEntry(entry)}>
                  {entry.uploadedImages[0] && (
                    <div className="w-14 h-10 rounded-lg overflow-hidden bg-slate-900 border border-slate-800 flex-shrink-0 hidden sm:block">
                      <img src={entry.uploadedImages[0]} alt="Chart" className="w-full h-full object-cover" />
                    </div>
                  )}

                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-white text-sm">{entry.symbol}</span>
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded ${
                          entry.signal === 'LONG'
                            ? 'bg-emerald-500/20 text-emerald-400'
                            : entry.signal === 'SHORT'
                            ? 'bg-red-500/20 text-red-400'
                            : 'bg-amber-500/20 text-amber-400'
                        }`}
                      >
                        {entry.signal}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">{entry.timeframe}</span>
                    </div>

                    <div className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-3">
                      <span>{t.entryZone}: <strong className="text-slate-200">{entry.entryZone?.recommended || (entry.entryZone?.min ? `${entry.entryZone.min} - ${entry.entryZone.max}` : 'N/A')}</strong></span>
                      <span>SL: <strong className="text-red-400">{entry.stopLoss?.price ?? 'N/A'}</strong></span>
                      <span>TP1: <strong className="text-emerald-400">{entry.takeProfitTargets?.[0]?.price ?? 'N/A'}</strong></span>
                      <span>R:R <strong className="text-slate-200">{entry.overallRiskRewardRatio ?? 'N/A'}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Outcome Toggle & Controls */}
                <div className="flex flex-wrap items-center gap-2 self-start md:self-auto mt-2 md:mt-0">
                  <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
                    <button
                      onClick={() => onUpdateOutcome(entry.id, 'WIN')}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                        entry.tradeOutcome === 'WIN' ? 'bg-emerald-500 text-slate-950' : 'text-slate-400 hover:text-emerald-400'
                      }`}
                    >
                      WIN
                    </button>
                    <button
                      onClick={() => onUpdateOutcome(entry.id, 'LOSS')}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                        entry.tradeOutcome === 'LOSS' ? 'bg-red-500 text-white' : 'text-slate-400 hover:text-red-400'
                      }`}
                    >
                      LOSS
                    </button>
                    <button
                      onClick={() => onUpdateOutcome(entry.id, 'BREAKEVEN')}
                      className={`px-2 py-1 rounded text-[10px] font-bold transition cursor-pointer active:scale-95 ${
                        entry.tradeOutcome === 'BREAKEVEN' ? 'bg-amber-500 text-slate-950' : 'text-slate-400 hover:text-amber-400'
                      }`}
                    >
                      BE
                    </button>
                  </div>

                  <button
                    onClick={() => onSelectEntry(entry)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition cursor-pointer active:scale-95"
                    title="View details"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => onRemoveEntry(entry.id)}
                    className="p-2 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition cursor-pointer active:scale-95"
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
