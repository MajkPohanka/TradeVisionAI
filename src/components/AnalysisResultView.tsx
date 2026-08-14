import React, { useState } from 'react';
import {
  TrendingUp,
  TrendingDown,
  PauseCircle,
  ShieldAlert,
  Target,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Bookmark,
  Share2,
  Flame,
  Layers,
  Sparkles,
  Zap,
  BookOpen,
  Eye,
  EyeOff,
} from 'lucide-react';
import { AnalysisResult, LanguageOption } from '../types';
import { ShareAnalysisModal } from './ShareAnalysisModal';
import { getTranslation } from '../utils/translations';

const parsePrice = (val: any): number => {
  if (typeof val === 'number') return val;
  if (!val) return NaN;
  const cleaned = String(val).replace(/,/g, '.').replace(/[^0-9.]/g, '');
  return parseFloat(cleaned);
};

const getOverlayLevels = (result: AnalysisResult) => {
  const isShort = result.signal === 'SHORT';

  const slPrice = parsePrice(result.stopLoss?.price);
  const entryPrice = parsePrice(result.entryZone?.recommended || result.entryZone?.min);
  const tps = (result.takeProfitTargets || []).map((tp) => ({
    target: tp.target,
    price: parsePrice(tp.price),
    rawPrice: tp.price,
    closePercent: tp.closePercentage,
  }));

  const validPrices = [slPrice, entryPrice, ...tps.map((t) => t.price)].filter((p) => !isNaN(p) && p > 0);

  if (validPrices.length < 2) {
    return {
      sl: { top: isShort ? 10 : 88, priceStr: String(result.stopLoss?.price ?? 'N/A') },
      entry: { top: 48, priceStr: String(result.entryZone?.recommended ?? (result.entryZone?.min ? `${result.entryZone.min} - ${result.entryZone.max}` : 'N/A')) },
      tps: tps.map((tp, idx) => {
        let top = 88;
        if (isShort) {
          top = 62 + idx * 10;
        } else {
          top = 34 - idx * 10;
        }
        return { ...tp, top };
      }),
      isShort,
      riskTop: isShort ? 10 : 48,
      riskHeight: 38,
      rewardTop: isShort ? 48 : 10,
      rewardHeight: 40,
    };
  }

  const minPrice = Math.min(...validPrices);
  const maxPrice = Math.max(...validPrices);
  const range = maxPrice - minPrice || 1;

  const paddedMin = minPrice - range * 0.16;
  const paddedMax = maxPrice + range * 0.16;
  const paddedRange = paddedMax - paddedMin;

  const calcTop = (price: number) => {
    if (isNaN(price)) return 50;
    const rawTop = 100 - ((price - paddedMin) / paddedRange) * 100;
    return Math.max(6, Math.min(92, rawTop));
  };

  const slTop = calcTop(slPrice);
  const entryTop = calcTop(entryPrice);

  const tpLevels = tps.map((tp) => ({
    ...tp,
    top: calcTop(tp.price),
  }));

  const maxTpTop = tpLevels.length > 0 ? tpLevels[tpLevels.length - 1].top : (isShort ? 88 : 10);

  const riskTop = Math.min(entryTop, slTop);
  const riskHeight = Math.max(2, Math.abs(entryTop - slTop));

  const rewardTop = Math.min(entryTop, maxTpTop);
  const rewardHeight = Math.max(2, Math.abs(entryTop - maxTpTop));

  return {
    sl: { top: slTop, priceStr: String(result.stopLoss?.price ?? 'N/A') },
    entry: { top: entryTop, priceStr: String(result.entryZone?.recommended ?? (result.entryZone?.min ? `${result.entryZone.min} - ${result.entryZone.max}` : 'N/A')) },
    tps: tpLevels,
    isShort,
    riskTop,
    riskHeight,
    rewardTop,
    rewardHeight,
  };
};

interface AnalysisResultViewProps {
  result: AnalysisResult;
  onSaveToJournal: (result: AnalysisResult) => void;
  isSaved: boolean;
  onOpenChat: () => void;
  language?: LanguageOption;
}

export const AnalysisResultView: React.FC<AnalysisResultViewProps> = ({
  result,
  onSaveToJournal,
  isSaved,
  onOpenChat,
  language = 'cs',
}) => {
  const t = getTranslation(language as LanguageOption);
  const [activeTab, setActiveTab] = useState<'levels' | 'candles' | 'mentor' | 'checklist'>('levels');
  const [showChartOverlay, setShowChartOverlay] = useState(true);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const getSignalBadge = () => {
    switch (result.signal) {
      case 'LONG':
        return {
          bg: 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
          gradient: 'from-emerald-500 via-teal-500 to-emerald-600',
          text: t.buySignal,
          icon: <TrendingUp className="w-6 h-6 text-emerald-400" />,
          color: 'emerald',
        };
      case 'SHORT':
        return {
          bg: 'bg-red-500/15 border-red-500/40 text-red-400',
          gradient: 'from-red-500 via-rose-500 to-red-600',
          text: t.sellSignal,
          icon: <TrendingDown className="w-6 h-6 text-red-400" />,
          color: 'red',
        };
      default:
        return {
          bg: 'bg-amber-500/15 border-amber-500/40 text-amber-400',
          gradient: 'from-amber-500 via-orange-500 to-amber-600',
          text: t.waitSignal,
          icon: <PauseCircle className="w-6 h-6 text-amber-400" />,
          color: 'amber',
        };
    }
  };

  const signalInfo = getSignalBadge();
  const uploadedImages = result.uploadedImages || [];
  const currentImage = uploadedImages[selectedImageIdx] || uploadedImages[0] || '';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 1. TOP SIGNAL HEADER & CONFIDENCE */}
      <div className="bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-6 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.37)] relative overflow-hidden transition-all">
        {/* Ambient Glow */}
        <div
          className={`absolute -top-24 -left-24 w-80 h-80 rounded-full blur-[110px] pointer-events-none ${
            result.signal === 'LONG'
              ? 'bg-emerald-500/15'
              : result.signal === 'SHORT'
              ? 'bg-red-500/15'
              : 'bg-amber-500/15'
          }`}
        />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div>
            <div className="flex items-center space-x-2 text-xs font-semibold text-[#86868b] uppercase tracking-wider mb-2">
              <span>{result.symbol || 'Chart'}</span>
              <span>•</span>
              <span className="text-emerald-400 font-bold">{result.timeframe || 'Intraday'}</span>
              <span>•</span>
              <span>{new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div className="flex items-center space-x-3.5">
              <div className={`p-3.5 rounded-2xl border ${signalInfo.bg} shadow-lg backdrop-blur-md`}>
                {signalInfo.icon}
              </div>
              <div>
                <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white flex items-center gap-2">
                  <span>{signalInfo.text}</span>
                </div>
                <p className="text-xs text-[#a1a1a6] mt-1 max-w-xl leading-relaxed">
                  {result.biasReasoning}
                </p>
              </div>
            </div>
          </div>

          {/* Confidence Score & R:R Summary - Apple Pill Card */}
          <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-3.5 bg-black/50 p-4 sm:p-5 rounded-2xl border border-white/[0.08] backdrop-blur-md">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="text-[#86868b] font-medium">{t.confidenceScore}:</span>
                <span className="font-extrabold text-emerald-400 ml-3">{result.confidenceScore}%</span>
              </div>
              <div className="w-40 h-2 bg-white/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-400 to-cyan-400 transition-all duration-1000 rounded-full"
                  style={{ width: `${result.confidenceScore}%` }}
                />
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className="text-[10px] text-[#86868b] uppercase tracking-wider block font-semibold">{t.riskRewardRatio}</span>
              <span className="text-xl font-black text-white">{result.overallRiskRewardRatio || '1 : 2.5'}</span>
            </div>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className="mt-6 pt-5 border-t border-white/[0.08] flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <button
              onClick={() => onSaveToJournal(result)}
              disabled={isSaved}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 flex items-center space-x-1.5 cursor-pointer active:scale-95 shadow-sm ${
                isSaved
                  ? 'bg-white/[0.08] text-emerald-400 border border-emerald-500/30'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20'
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>{isSaved ? t.savedInJournal : t.saveToJournal}</span>
            </button>

            <button
              onClick={onOpenChat}
              className="px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white border border-white/[0.08] text-xs font-semibold transition-all duration-200 flex items-center space-x-1.5 cursor-pointer active:scale-95 backdrop-blur-md"
            >
              <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.askMentor}</span>
            </button>

            <button
              onClick={() => setIsShareModalOpen(true)}
              className="px-4 py-2 rounded-full bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border border-cyan-500/30 text-xs font-semibold transition-all duration-200 flex items-center space-x-1.5 cursor-pointer active:scale-95 backdrop-blur-md shadow-xs"
            >
              <Share2 className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.shareAnalysis}</span>
            </button>
          </div>

          <div className="text-[11px] text-[#86868b] flex items-center space-x-1 font-medium">
            <Flame className="w-3.5 h-3.5 text-amber-400" />
            <span>Institutional Grade Analysis</span>
          </div>
        </div>
      </div>

      {/* ECONOMIC CALENDAR WARNING BANNER */}
      {result.economicCalendarWarning && (
        <div className="bg-[#121216]/75 backdrop-blur-2xl border border-amber-500/30 rounded-3xl p-5 sm:p-6 shadow-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 text-amber-400 font-bold text-xs">
              <ShieldAlert className="w-4 h-4 text-amber-400" />
              <span>{t.calendarTitle}</span>
            </div>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-500/15 text-amber-300 border border-amber-500/30 backdrop-blur-md">
              HIGH VOLATILITY RISK
            </span>
          </div>

          <p className="text-xs text-[#a1a1a6] leading-relaxed">
            {result.economicCalendarWarning.riskAdvice}
          </p>

          {result.economicCalendarWarning.upcomingNewsEvents && result.economicCalendarWarning.upcomingNewsEvents.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t border-white/[0.08]">
              {result.economicCalendarWarning.upcomingNewsEvents.map((ev, i) => (
                <div key={i} className="p-3 rounded-2xl bg-black/50 border border-white/[0.06] text-xs space-y-1">
                  <div className="flex items-center justify-between font-bold text-white">
                    <span>{ev.title} ({ev.currency})</span>
                    <span className="text-[10px] text-amber-400 font-mono">{ev.date}</span>
                  </div>
                  <p className="text-[11px] text-[#86868b]">{ev.warningText}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MULTI-STRATEGY METHODOLOGY CONFLUENCES BREAKDOWN */}
      {result.methodologyConfluences && result.methodologyConfluences.length > 0 && (
        <div className="bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2">
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>{t.methodologyConfluences} ({result.methodologyConfluences.length})</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.methodologyConfluences.map((conf, idx) => (
              <div key={idx} className="p-4 rounded-2xl bg-black/40 border border-white/[0.06] space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-white">{conf.methodology}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      conf.bias === 'BULLISH'
                        ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30'
                        : conf.bias === 'BEARISH'
                        ? 'bg-red-500/15 text-red-400 border border-red-500/30'
                        : 'bg-white/10 text-white border border-white/20'
                    }`}
                  >
                    {conf.bias}
                  </span>
                </div>
                <p className="text-xs text-[#a1a1a6] leading-relaxed">{conf.keyObservation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. KEY EXECUTION LEVELS & OVERLAY MAP */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Exact Price Levels */}
        <div className="lg:col-span-1 bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 sm:p-6 shadow-xl flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white flex items-center justify-between mb-4 pb-3 border-b border-white/[0.08]">
              <span className="flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" />
                {t.analysisHeader}
              </span>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded-full bg-white/[0.08] text-[#f5f5f7] border border-white/[0.08]">
                {result.symbol}
              </span>
            </h3>

            <div className="space-y-3.5">
              {/* Entry Level */}
              <div className="p-3.5 bg-black/50 border border-blue-500/30 rounded-2xl relative overflow-hidden backdrop-blur-md">
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-blue-400" />
                <div className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">{t.entryZone}</div>
                <div className="text-lg font-black text-white mt-0.5">
                  {result.entryZone?.recommended || (result.entryZone?.min && result.entryZone?.max ? `${result.entryZone.min} - ${result.entryZone.max}` : 'N/A')}
                </div>
                <div className="text-[11px] text-[#86868b] mt-0.5">
                  Range: {result.entryZone?.min ?? 'N/A'} – {result.entryZone?.max ?? 'N/A'}
                </div>
              </div>

              {/* Stop Loss Level */}
              <div className="p-3.5 bg-black/50 border border-red-500/30 rounded-2xl relative overflow-hidden backdrop-blur-md">
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-red-400" />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider">{t.stopLoss}</span>
                  <span className="text-[10px] text-red-400 font-mono font-bold">-{result.stopLoss?.distancePercent ?? 0}%</span>
                </div>
                <div className="text-lg font-black text-red-300 mt-0.5">
                  {result.stopLoss?.price ?? 'N/A'}
                </div>
                <div className="text-[11px] text-[#86868b] mt-0.5">
                  {result.stopLoss?.reason ?? ''}
                </div>
              </div>

              {/* Take Profit Targets */}
              <div className="space-y-2">
                <div className="text-[10px] font-bold text-[#86868b] uppercase tracking-wider mb-1.5">{t.takeProfit1} / {t.takeProfit2} / {t.takeProfit3}</div>
                {(result.takeProfitTargets || []).map((tp) => (
                  <div
                    key={tp.target}
                    className="p-3 bg-black/50 border border-emerald-500/20 rounded-2xl flex items-center justify-between backdrop-blur-md"
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                          TP {tp.target}
                        </span>
                        <span className="text-sm font-bold text-white">{tp.price}</span>
                      </div>
                      <div className="text-[10px] text-[#86868b] mt-0.5">{tp.description}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-emerald-400">R:R 1:{tp.riskRewardRatio}</div>
                      <div className="text-[9px] text-[#86868b]">{tp.closePercentage}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Risk Management Box */}
          <div className="mt-5 pt-4 border-t border-white/[0.08] text-xs space-y-1.5 text-[#86868b]">
            <div className="flex justify-between">
              <span>{t.suggestedRisk}:</span>
              <span className="font-bold text-white">{result.riskManagement?.suggestedPositionSizePercent ?? 1}%</span>
            </div>
            <div className="flex justify-between">
              <span>{t.invalidationCondition}:</span>
              <span className="font-semibold text-red-400 text-[11px]">{result.riskManagement?.invalidationCondition ?? 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Right Col: Visual Chart Screenshot with Overlay Lines */}
        <div className="lg:col-span-2 bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 shadow-xl flex flex-col justify-between">
          <div className="flex items-center justify-between mb-3.5 pb-3 border-b border-white/[0.08]">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">{t.keyLevels}</h3>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowChartOverlay(!showChartOverlay)}
                className="px-3 py-1 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium flex items-center space-x-1.5 transition cursor-pointer border border-white/[0.08]"
              >
                {showChartOverlay ? <EyeOff className="w-3.5 h-3.5 text-amber-400" /> : <Eye className="w-3.5 h-3.5 text-emerald-400" />}
                <span>{showChartOverlay ? 'Hide' : 'Show'}</span>
              </button>
            </div>
          </div>

          {/* Interactive Canvas Screenshot Frame */}
          <div className="relative rounded-2xl overflow-hidden border border-white/[0.08] bg-black aspect-video flex items-center justify-center shadow-lg">
            {currentImage ? (
              <div className="relative w-full h-full">
                <img
                  src={currentImage}
                  alt="Chart analysis"
                  className="w-full h-full object-contain"
                />

                {/* Dynamic Price Level Visual Overlay with Risk/Reward Zones */}
                {showChartOverlay && (() => {
                  const overlay = getOverlayLevels(result);

                  return (
                    <div className="absolute inset-0 pointer-events-none p-2 sm:p-4 bg-black/20 overflow-hidden">
                      {/* 1. Shaded Risk Zone Box (Red) */}
                      <div
                        className="absolute left-2 right-2 bg-red-500/15 border-l-4 border-red-500/80 rounded-r shadow-sm transition-all duration-300"
                        style={{
                          top: `${overlay.riskTop}%`,
                          height: `${overlay.riskHeight}%`,
                        }}
                      >
                        <span className="absolute top-1 left-2 text-[9px] font-extrabold text-red-300 uppercase tracking-widest bg-black/80 px-2 py-0.5 rounded-full border border-red-500/30">
                          {t.stopLoss} Zone
                        </span>
                      </div>

                      {/* 2. Shaded Reward Zone Box (Green) */}
                      <div
                        className="absolute left-2 right-2 bg-emerald-500/15 border-l-4 border-emerald-500/80 rounded-r shadow-sm transition-all duration-300"
                        style={{
                          top: `${overlay.rewardTop}%`,
                          height: `${overlay.rewardHeight}%`,
                        }}
                      >
                        <span className="absolute bottom-1 left-2 text-[9px] font-extrabold text-emerald-300 uppercase tracking-widest bg-black/80 px-2 py-0.5 rounded-full border border-emerald-500/30">
                          Take Profit Target Zone
                        </span>
                      </div>

                      {/* 3. Stop Loss Level Line & Badge (Red) */}
                      <div
                        className="absolute left-0 right-0 border-t-2 border-dashed border-red-500 flex items-center justify-between px-2 -translate-y-1/2 z-20 transition-all duration-300"
                        style={{ top: `${overlay.sl.top}%` }}
                      >
                        <div className="bg-black/90 border border-red-500/80 text-red-200 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-lg flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          <span>STOP LOSS: {overlay.sl.priceStr}</span>
                        </div>
                        <span className="bg-black/90 border border-red-500/80 text-red-300 text-[9px] font-bold px-2 py-0.5 rounded-full shadow">
                          SL
                        </span>
                      </div>

                      {/* 4. Entry Zone Level Line & Badge (Cyan) */}
                      <div
                        className="absolute left-0 right-0 border-t-2 border-solid border-cyan-400 flex items-center justify-between px-2 -translate-y-1/2 z-30 transition-all duration-300"
                        style={{ top: `${overlay.entry.top}%` }}
                      >
                        <div className="bg-black/90 border border-cyan-400 text-cyan-200 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-lg flex items-center space-x-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                          <span>ENTRY: {overlay.entry.priceStr}</span>
                        </div>
                        <span className="bg-black/90 border border-cyan-400 text-cyan-200 text-[9px] font-bold px-2 py-0.5 rounded-full shadow">
                          ENTRY
                        </span>
                      </div>

                      {/* 5. Take Profit Level Lines & Badges (Green) */}
                      {overlay.tps.map((tp) => (
                        <div
                          key={tp.target}
                          className="absolute left-0 right-0 border-t-2 border-dashed border-emerald-400 flex items-center justify-between px-2 -translate-y-1/2 z-20 transition-all duration-300"
                          style={{ top: `${tp.top}%` }}
                        >
                          <div className="bg-black/90 border border-emerald-500/80 text-emerald-200 text-[10px] font-extrabold px-2.5 py-0.5 rounded-full shadow-lg flex items-center space-x-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                            <span>
                              TP{tp.target}: {tp.rawPrice} {tp.closePercent ? `(${tp.closePercent}%)` : ''}
                            </span>
                          </div>
                          <span className="bg-black/90 border border-emerald-500/80 text-emerald-300 text-[9px] font-bold px-2 py-0.5 rounded-full shadow">
                            TP{tp.target}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div className="text-[#86868b] text-xs">Chart image not available</div>
            )}
          </div>

          {/* Multi-image Selector if available */}
          {result.uploadedImages.length > 1 && (
            <div className="flex space-x-2 mt-3.5 overflow-x-auto pb-1">
              {result.uploadedImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setSelectedImageIdx(i)}
                  className={`relative w-16 h-10 rounded-xl overflow-hidden border transition-all cursor-pointer ${
                    selectedImageIdx === i ? 'border-emerald-400 ring-2 ring-emerald-400/30' : 'border-white/10 opacity-60'
                  }`}
                >
                  <img src={img} alt="Thumb" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 3. TABBED DETAILED ANALYSIS & MENTOR DISSECTION */}
      <div className="bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl overflow-hidden shadow-xl">
        {/* Navigation Tabs Header - Apple Segmented Top Bar */}
        <div className="flex border-b border-white/[0.08] overflow-x-auto bg-black/40 p-1.5 gap-1">
          <button
            onClick={() => setActiveTab('levels')}
            className={`px-4 py-2 text-xs font-semibold rounded-2xl transition-all duration-200 flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'levels'
                ? 'bg-white/15 text-white font-bold shadow-sm'
                : 'text-[#86868b] hover:text-white hover:bg-white/5'
            }`}
          >
            <Zap className="w-4 h-4 text-emerald-400" />
            <span>{t.priceActionStructures}</span>
          </button>

          <button
            onClick={() => setActiveTab('candles')}
            className={`px-4 py-2 text-xs font-semibold rounded-2xl transition-all duration-200 flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'candles'
                ? 'bg-white/15 text-white font-bold shadow-sm'
                : 'text-[#86868b] hover:text-white hover:bg-white/5'
            }`}
          >
            <Sparkles className="w-4 h-4 text-cyan-400" />
            <span>{t.candlestickPatterns} ({(result.candlestickPatterns || []).length})</span>
          </button>

          <button
            onClick={() => setActiveTab('mentor')}
            className={`px-4 py-2 text-xs font-semibold rounded-2xl transition-all duration-200 flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'mentor'
                ? 'bg-white/15 text-white font-bold shadow-sm'
                : 'text-[#86868b] hover:text-white hover:bg-white/5'
            }`}
          >
            <BookOpen className="w-4 h-4 text-purple-400" />
            <span>{t.mentorAdviceTitle}</span>
          </button>

          <button
            onClick={() => setActiveTab('checklist')}
            className={`px-4 py-2 text-xs font-semibold rounded-2xl transition-all duration-200 flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'checklist'
                ? 'bg-white/15 text-white font-bold shadow-sm'
                : 'text-[#86868b] hover:text-white hover:bg-white/5'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>{t.tradeChecklist}</span>
          </button>
        </div>

        {/* Tab Content Panes */}
        <div className="p-5 sm:p-6">
          {/* TAB 1: Price Action & Structures */}
          {activeTab === 'levels' && (
            <div className="space-y-4">
              <h4 className="text-sm font-bold text-white">{t.priceActionStructures}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(result.priceActionStructures || []).map((pas, i) => (
                  <div key={i} className="p-4 bg-black/40 border border-white/[0.06] rounded-2xl space-y-1.5">
                    <div className="text-xs font-extrabold text-emerald-400 flex items-center space-x-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                      <span>{pas.structure}</span>
                    </div>
                    <p className="text-xs text-[#a1a1a6] leading-relaxed">{pas.description}</p>
                  </div>
                ))}
              </div>

              {/* Support & Resistance Summary */}
              <div className="mt-5 pt-4 border-t border-white/[0.08] grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-emerald-950/20 border border-emerald-500/20 rounded-2xl">
                  <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block mb-2">
                    {t.supportLevels}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(result.keyLevels?.support || []).map((lvl, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-emerald-500/20 text-emerald-300 font-mono text-xs rounded-full font-bold border border-emerald-500/30">
                        {lvl}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-4 bg-red-950/20 border border-red-500/20 rounded-2xl">
                  <span className="text-[10px] font-bold text-red-400 uppercase tracking-wider block mb-2">
                    {t.resistanceLevels}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(result.keyLevels?.resistance || []).map((lvl, idx) => (
                      <span key={idx} className="px-2.5 py-1 bg-red-500/20 text-red-300 font-mono text-xs rounded-full font-bold border border-red-500/30">
                        {lvl}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: Candlestick Patterns */}
          {activeTab === 'candles' && (
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-white mb-3">{t.candlestickPatterns}</h4>
              {(result.candlestickPatterns || []).map((cp, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-black/40 border border-white/[0.06] rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-bold text-white">{cp.pattern}</span>
                      <span
                        className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${
                          cp.signalType === 'Bullish'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : cp.signalType === 'Bearish'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : 'bg-white/10 text-white border border-white/20'
                        }`}
                      >
                        {cp.signalType}
                      </span>
                    </div>
                    <p className="text-xs text-[#86868b]">{cp.significance}</p>
                  </div>

                  <div className="text-[11px] text-[#a1a1a6] font-mono bg-white/[0.04] px-3 py-1 rounded-full border border-white/[0.06] self-start sm:self-auto">
                    {cp.location}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: Mentor Advice */}
          {activeTab === 'mentor' && (
            <div className="space-y-4">
              <div className="flex items-center space-x-3 p-3.5 bg-emerald-950/30 border border-emerald-500/30 rounded-2xl text-emerald-300 text-xs backdrop-blur-md">
                <BookOpen className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span>
                  <strong>Top Mentor Advice:</strong> Combining market psychology, institutional flows, and risk management.
                </span>
              </div>

              <div className="text-sm text-[#f5f5f7] leading-relaxed whitespace-pre-line bg-black/40 p-5 rounded-2xl border border-white/[0.06] font-sans">
                {result.mentorAdvice}
              </div>
            </div>
          )}

          {/* TAB 4: Checklist */}
          {activeTab === 'checklist' && (
            <div className="space-y-3">
              <h4 className="text-sm font-bold text-white mb-3">{t.tradeChecklist}</h4>
              {(result.tradeChecklist || []).map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-2xl border flex items-center justify-between transition ${
                    item.passed
                      ? 'bg-emerald-950/15 border-emerald-500/25 text-[#f5f5f7]'
                      : 'bg-red-950/15 border-red-500/25 text-[#f5f5f7]'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {item.passed ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    )}
                    <div>
                      <div className="text-xs font-bold text-white">{item.rule}</div>
                      <div className="text-[11px] text-[#86868b] mt-0.5">{item.comment}</div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                      item.passed ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    {item.passed ? t.passed : t.failed}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* SHARE ANALYSIS MODAL */}
      <ShareAnalysisModal
        result={result}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        language={language}
      />
    </div>
  );
};
