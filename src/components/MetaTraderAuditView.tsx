import React, { useState } from 'react';
import {
  FileSpreadsheet,
  AlertOctagon,
  ShieldAlert,
  Brain,
  Upload,
  Calendar,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { MetaTraderAuditResult, StrategySettings } from '../types';
import { getTranslation } from '../utils/translations';

interface MetaTraderAuditViewProps {
  settings: StrategySettings;
}

export const MetaTraderAuditView: React.FC<MetaTraderAuditViewProps> = ({ settings }) => {
  const t = getTranslation(settings.language);
  const [rawText, setRawText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [auditResult, setAuditResult] = useState<MetaTraderAuditResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sample MT4/MT5 report data for quick loading
  const handleLoadSampleReport = () => {
    setRawText(`Ticket\tOpen Time\tType\tSize\tItem\tPrice\tS/L\tT/P\tClose Time\tPrice\tProfit
#102941\t2026.08.06 14:28\tBUY\t1.00\tEURUSD\t1.08500\t0.00000\t1.09200\t2026.08.06 14:32\t1.08120\t-380.00
#102945\t2026.08.06 14:33\tSELL\t2.00\tEURUSD\t1.08100\t0.00000\t0.00000\t2026.08.06 14:36\t1.08350\t-500.00
#102950\t2026.08.06 15:10\tBUY\t0.50\tBTCUSD\t63200.00\t62500.00\t64500.00\t2026.08.06 18:20\t64500.00\t+650.00
#102962\t2026.08.07 19:55\tBUY\t1.50\tNAS100\t18400.00\t0.00000\t0.00000\t2026.08.07 20:05\t18210.00\t-2850.00`);
    setError(null);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      Array.from(e.target.files).forEach((file) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            setImages((prev) => [...prev, reader.result as string]);
          }
        };
        reader.readAsDataURL(file as File);
      });
    }
  };

  const handleRunAudit = async () => {
    if (!rawText.trim() && images.length === 0) {
      setError(t.pasteMT4Text);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/audit-metatrader', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rawText,
          images,
          settings,
        }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        if (text.trim().startsWith('<')) {
          throw new Error('Časový limit auditu vypršel nebo je služba dočasně vytížena. Zkuste to prosím znovu za okamžik.');
        }
        throw new Error(`Chyba při komunikaci se serverem (HTTP ${res.status}).`);
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Audit error');
      }

      setAuditResult({
        ...data.data,
        id: Date.now().toString(),
        timestamp: Date.now(),
      });
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Server communication error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Intro Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-purple-950/40 to-slate-900 border border-purple-500/30 rounded-2xl p-5 sm:p-6 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
          <FileSpreadsheet className="w-48 h-48 text-purple-400" />
        </div>

        <div className="relative z-10 max-w-3xl space-y-2">
          <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-bold">
            <Brain className="w-3.5 h-3.5 text-purple-400" />
            <span>{t.auditTitle}</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-black text-white">
            {t.auditSubtitle}
          </h2>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {t.auditTitle} (MT4 / MT5)
          </p>
        </div>
      </div>

      {/* Input Section */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <Upload className="w-4 h-4 text-emerald-400" />
            <span>{t.auditTitle} (MT4 / MT5)</span>
          </h3>
          <button
            onClick={handleLoadSampleReport}
            className="text-xs text-cyan-400 hover:text-cyan-300 font-bold underline cursor-pointer self-start sm:self-auto"
          >
            + {t.loadSampleReport}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Text/CSV/HTML paste area */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t.pasteMT4Text}
            </label>
            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Ticket, Open Time, Type, Size, Symbol, Price, SL, TP, Close Time, Profit..."
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-purple-500 font-mono transition"
            />
          </div>

          {/* Screenshot upload area */}
          <div>
            <label className="text-xs font-semibold text-slate-300 block mb-1">
              {t.orUploadScreenshot}
            </label>
            <div className="border-2 border-dashed border-slate-800 hover:border-purple-500/50 bg-slate-950/60 rounded-xl p-4 text-center h-[135px] flex flex-col items-center justify-center space-y-2 cursor-pointer relative transition">
              <input
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="absolute inset-0 opacity-0 cursor-pointer"
              />
              <Upload className="w-6 h-6 text-slate-500" />
              <div className="text-xs font-bold text-slate-300">{t.orUploadScreenshot}</div>
              <div className="text-[10px] text-slate-500">PNG, JPG, WEBP</div>
            </div>

            {images.length > 0 && (
              <div className="flex items-center space-x-2 mt-2">
                <span className="text-xs text-emerald-400 font-bold">{t.uploadedCharts} {images.length}</span>
                <button
                  onClick={() => setImages([])}
                  className="text-[10px] text-red-400 hover:underline cursor-pointer"
                >
                  {t.clearAll}
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex items-center space-x-2">
            <AlertOctagon className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleRunAudit}
          disabled={isLoading}
          className="w-full py-3.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-extrabold text-sm shadow-lg shadow-purple-950/50 flex items-center justify-center space-x-2 transition disabled:opacity-50 cursor-pointer"
        >
          {isLoading ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>{t.runningAudit}</span>
            </>
          ) : (
            <>
              <Zap className="w-4 h-4 fill-white" />
              <span>{t.runAuditBtn}</span>
            </>
          )}
        </button>
      </div>

      {/* Audit Results View */}
      {auditResult && (
        <div className="space-y-6 animate-fadeIn">
          {/* Key Metrics Banner */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-center">
              <div className="text-[11px] font-bold text-slate-400 uppercase">{t.tradesAnalyzed}</div>
              <div className="text-2xl font-black text-slate-100 mt-1">{auditResult.tradesAnalyzedCount}</div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-center">
              <div className="text-[11px] font-bold text-slate-400 uppercase">{t.winRate}</div>
              <div
                className={`text-2xl font-black mt-1 ${
                  auditResult.winRatePercent >= 50 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {auditResult.winRatePercent}%
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-center">
              <div className="text-[11px] font-bold text-slate-400 uppercase">{t.totalPnL}</div>
              <div
                className={`text-2xl font-black mt-1 ${
                  auditResult.totalProfitLoss >= 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
              >
                {auditResult.totalProfitLoss >= 0 ? '+' : ''}
                {auditResult.totalProfitLoss} $
              </div>
            </div>

            <div className="p-4 bg-slate-900 border border-slate-800 rounded-2xl text-center">
              <div className="text-[11px] font-bold text-slate-400 uppercase">{t.profitFactor}</div>
              <div className="text-2xl font-black text-cyan-400 mt-1">{auditResult.profitFactor || 'N/A'}</div>
            </div>
          </div>

          {/* Primary Mistakes Breakdown */}
          {auditResult.primaryMistakes && auditResult.primaryMistakes.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <AlertOctagon className="w-4 h-4 text-red-400" />
                <span>{t.primaryMistakes}</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {auditResult.primaryMistakes.map((mistake, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl bg-slate-950/80 border border-red-500/30 space-y-1.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-red-300 flex items-center space-x-1.5">
                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                        <span>{mistake.title}</span>
                      </span>
                      <span className="px-2 py-0.5 rounded text-[10px] font-extrabold bg-red-500/20 text-red-400 border border-red-500/30">
                        {mistake.severity} RISK
                      </span>
                    </div>

                    <p className="text-xs text-slate-300 leading-relaxed">{mistake.description}</p>

                    {mistake.affectedTrades && mistake.affectedTrades.length > 0 && (
                      <div className="text-[10px] text-slate-400 font-mono pt-1 border-t border-slate-800">
                        Affected trades: {mistake.affectedTrades.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Economic News Correlations */}
          {auditResult.economicNewsCorrelations && auditResult.economicNewsCorrelations.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-3">
              <h3 className="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <Calendar className="w-4 h-4 text-amber-400" />
                <span>{t.newsCorrelations}</span>
              </h3>

              <div className="space-y-2">
                {auditResult.economicNewsCorrelations.map((news, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl bg-slate-950/90 border border-amber-500/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-extrabold text-amber-300">{news.tradeTicketOrTime}</span>
                        <span className="text-xs font-bold text-slate-200">• {news.newsTitle}</span>
                      </div>
                      <p className="text-xs text-slate-300">{news.explanation}</p>
                    </div>

                    <span className="px-2.5 py-1 rounded bg-red-500/20 text-red-400 text-[10px] font-extrabold border border-red-500/30 self-start sm:self-auto flex-shrink-0">
                      🔴 HIGH IMPACT NEWS
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Psychology & Recommendations */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Psychology Assessment */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-2">
              <h3 className="text-sm font-bold text-purple-300 flex items-center space-x-2">
                <Brain className="w-4 h-4 text-purple-400" />
                <span>{t.psychologyAssessment}</span>
              </h3>
              <p className="text-xs text-slate-300 leading-relaxed bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                {auditResult.psychologyAssessment}
              </p>
            </div>

            {/* Actionable Recommendations */}
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-2">
              <h3 className="text-sm font-bold text-emerald-300 flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>{t.recommendations}</span>
              </h3>
              <ul className="space-y-2 bg-slate-950 p-3.5 rounded-xl border border-slate-800">
                {auditResult.actionableRecommendations?.map((rec, i) => (
                  <li key={i} className="text-xs text-slate-200 flex items-start space-x-2">
                    <span className="text-emerald-400 font-bold">•</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
