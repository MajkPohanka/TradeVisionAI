import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
  Magnet,
  Compass,
  AlertOctagon,
  Printer,
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  Check,
  X,
  RefreshCw,
  BarChart2,
  Radio,
  Camera,
  Globe,
} from 'lucide-react';
import { AnalysisResult, LanguageOption, AppTheme } from '../types';
import { ShareAnalysisModal } from './ShareAnalysisModal';
import { getTranslation } from '../utils/translations';
import { renderTradingViewChartSnapshot } from '../utils/chartSnapshotRenderer';

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
  theme?: AppTheme;
}

export const AnalysisResultView: React.FC<AnalysisResultViewProps> = ({
  result,
  onSaveToJournal,
  isSaved,
  onOpenChat,
  language = 'cs',
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const t = getTranslation(language as LanguageOption);

  // Dynamic analysis result state supporting instant translation on language switch
  const [displayResult, setDisplayResult] = useState<AnalysisResult>(result);
  const [isTranslating, setIsTranslating] = useState(false);
  const [translationError, setTranslationError] = useState<string | null>(null);

  useEffect(() => {
    setDisplayResult(result);
  }, [result]);

  const handleTranslate = async (targetLang: LanguageOption) => {
    if (isTranslating) return;
    setIsTranslating(true);
    setTranslationError(null);
    try {
      const res = await fetch('/api/translate-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          result: displayResult,
          targetLanguage: targetLang,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.translatedResult) {
        setDisplayResult(data.translatedResult);
      } else {
        setTranslationError(data.error || 'Překlad analýzy se nepodařil.');
      }
    } catch (err) {
      console.error('Translation error:', err);
      setTranslationError('Chyba sítě při překladu.');
    } finally {
      setIsTranslating(false);
    }
  };

  // Auto-translate if the active UI language differs from the current analysis result language
  useEffect(() => {
    if (language && displayResult && displayResult.language && displayResult.language !== language && !isTranslating) {
      handleTranslate(language as LanguageOption);
    }
  }, [language]);

  const currentResult = displayResult;

  const [activeTab, setActiveTab] = useState<'levels' | 'candles' | 'mentor' | 'checklist'>('levels');
  const [showChartOverlay, setShowChartOverlay] = useState(true);
  const [selectedImageIdx, setSelectedImageIdx] = useState(0);
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);

  const uploadedImages = currentResult.uploadedImages || [];
  const [chartViewMode, setChartViewMode] = useState<'snapshot' | 'hd_chart' | 'live_tv'>(
    uploadedImages.length > 0 ? 'snapshot' : 'hd_chart'
  );
  const [hdChartUrl, setHdChartUrl] = useState<string | null>(null);
  const [isGeneratingHdChart, setIsGeneratingHdChart] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [isZoomScaleToggled, setIsZoomScaleToggled] = useState(false);
  const [imageLoadError, setImageLoadError] = useState(false);

  const generateHdChart = async () => {
    if (isGeneratingHdChart) return;
    setIsGeneratingHdChart(true);
    try {
      const sym = (result.symbol || 'BTCUSDT').replace(/\s+/g, '');
      const tf = result.timeframe || '15';
      let candles: any[] = [];
      let precision = 2;
      let currentPrice: number | undefined = undefined;

      try {
        const res = await fetch('/api/chart-candles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: sym, timeframe: tf }),
        });
        if (res.ok) {
          const chartData = await res.json();
          if (chartData && chartData.success && Array.isArray(chartData.candles) && chartData.candles.length > 0) {
            candles = chartData.candles;
            precision = chartData.precision ?? 2;
            currentPrice = chartData.currentPrice;
          }
        }
      } catch (err) {
        console.warn('Could not fetch chart candles, generating fallback:', err);
      }

      const slVal = parsePrice(result.stopLoss?.price);
      const entryVal = parsePrice(result.entryZone?.recommended || result.entryZone?.min);
      const tpVals = (result.takeProfitTargets || [])
        .map((t) => ({
          price: parsePrice(t.price),
          target: t.target,
          closePercent: t.closePercentage,
        }))
        .filter((t) => !isNaN(t.price));

      const generatedUrl = renderTradingViewChartSnapshot({
        symbol: sym,
        timeframe: tf,
        displayName: result.assetName || sym,
        candles,
        precision,
        currentPrice,
        theme: isLight ? 'light' : 'dark',
        width: 1280,
        height: 720,
        overlayLevels: {
          isShort: result.signal === 'SHORT',
          slPrice: isNaN(slVal) ? undefined : slVal,
          entryPrice: isNaN(entryVal) ? undefined : entryVal,
          tpPrices: tpVals,
        },
      });

      setHdChartUrl(generatedUrl);
    } catch (e) {
      console.error('Error generating HD chart:', e);
    } finally {
      setIsGeneratingHdChart(false);
    }
  };

  useEffect(() => {
    if (!hdChartUrl && (chartViewMode === 'hd_chart' || uploadedImages.length === 0 || imageLoadError)) {
      generateHdChart();
    }
  }, [chartViewMode, hdChartUrl, uploadedImages.length, imageLoadError]);

  // Handle ESC key for lightbox
  useEffect(() => {
    if (!isLightboxOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsLightboxOpen(false);
        setIsZoomScaleToggled(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen]);

  const getSignalBadge = () => {
    switch (result.signal) {
      case 'LONG':
        return {
          bg: isLight ? 'bg-emerald-100 border-2 border-emerald-400 text-emerald-950 font-bold' : 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400',
          gradient: 'from-emerald-500 via-teal-500 to-emerald-600',
          text: t.buySignal,
          icon: <TrendingUp className={`w-6 h-6 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} />,
          color: 'emerald',
        };
      case 'SHORT':
        return {
          bg: isLight ? 'bg-rose-100 border-2 border-rose-400 text-rose-950 font-black' : 'bg-rose-950/40 border-2 border-rose-500/50 text-rose-200 font-bold',
          gradient: 'from-rose-600 via-red-600 to-rose-700',
          text: t.sellSignal,
          icon: <TrendingDown className={`w-6 h-6 ${isLight ? 'text-rose-700' : 'text-rose-400'}`} />,
          color: 'red',
        };
      default:
        return {
          bg: isLight ? 'bg-amber-100 border-2 border-amber-400 text-amber-950 font-bold' : 'bg-amber-500/15 border-amber-500/40 text-amber-400',
          gradient: 'from-amber-500 via-orange-500 to-amber-600',
          text: t.waitSignal,
          icon: <PauseCircle className={`w-6 h-6 ${isLight ? 'text-amber-700' : 'text-amber-400'}`} />,
          color: 'amber',
        };
    }
  };

  const signalInfo = getSignalBadge();
  const currentImage = uploadedImages[selectedImageIdx] || uploadedImages[0] || '';

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Institutional Engine Notice Banner */}
      {(result.isFallbackEngine || result.authNotice) && (
        <div
          id="institutional-engine-notice-banner"
          className={`p-4 rounded-2xl border flex items-start gap-3.5 shadow-sm transition-all ${
            isLight
              ? 'bg-amber-50/90 border-amber-300 text-amber-950'
              : 'bg-amber-950/25 border-amber-500/30 text-amber-200'
          }`}
        >
          <Zap className={`w-5 h-5 shrink-0 mt-0.5 ${isLight ? 'text-amber-700' : 'text-amber-400'}`} />
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2 font-bold">
              <span>{isLight ? 'Kvantitativní institucionální analýza TRADEOY' : 'TRADEOY Institutional Quantitative Engine'}</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                isLight ? 'bg-emerald-100 border-emerald-300 text-emerald-800' : 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
              }`}>
                ✓ Licenční kredit 100% zachován
              </span>
            </div>
            <p className="opacity-90 leading-relaxed">
              {result.authNotice || 'Analýza byla úspěšně zpracována institucionálním engine TRADEOY na základě technických a mikrostrukturálních pravidel.'}
            </p>
          </div>
        </div>
      )}

      {/* 1. TOP SIGNAL HEADER & CONFIDENCE */}
      <div className={`border rounded-3xl p-6 sm:p-7 relative overflow-hidden transition-all ${
        isLight
          ? 'bg-white border-slate-300 shadow-lg text-slate-900'
          : 'bg-[#121216] border-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.37)]'
      }`}>
        {/* Ambient Glow */}
        <div
          className={`absolute -top-24 -left-24 w-80 h-80 rounded-full blur-[80px] pointer-events-none ${
            result.signal === 'LONG'
              ? (isLight ? 'bg-emerald-400/20' : 'bg-emerald-500/15')
              : result.signal === 'SHORT'
              ? (isLight ? 'bg-red-400/20' : 'bg-red-500/15')
              : (isLight ? 'bg-amber-400/20' : 'bg-amber-500/15')
          }`}
        />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative z-10">
          <div>
            <div className={`flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider mb-2 ${
              isLight ? 'text-slate-600 font-bold' : 'text-[#86868b]'
            }`}>
              <span className={isLight ? 'text-slate-900 font-extrabold' : 'text-[#f5f5f7]'}>{result.symbol || 'Chart'}</span>
              <span>•</span>
              <span className={`font-bold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{result.timeframe || 'Intraday'}</span>
              <span>•</span>
              <span>{new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>

            <div className="flex items-center space-x-3.5">
              <div className={`p-3.5 rounded-2xl border ${signalInfo.bg} shadow-lg`}>
                {signalInfo.icon}
              </div>
              <div>
                <div className={`text-2xl sm:text-3xl font-extrabold tracking-tight flex items-center gap-2 ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}>
                  <span>{signalInfo.text}</span>
                </div>
                <p className={`text-xs mt-1 max-w-xl leading-relaxed ${
                  isLight ? 'text-slate-600' : 'text-[#a1a1a6]'
                }`}>
                  {result.biasReasoning}
                </p>
              </div>
            </div>
          </div>

          {/* Confidence Score & R:R Summary - Apple Pill Card */}
          <div className={`flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-3.5 p-4 sm:p-5 rounded-2xl border ${
            isLight
              ? 'bg-slate-50 border-slate-200'
              : 'bg-black/60 border-white/[0.08]'
          }`}>
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className={`font-medium ${isLight ? 'text-slate-600' : 'text-[#86868b]'}`}>{t.confidenceScore}:</span>
                <span className={`font-extrabold ml-3 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>{result.confidenceScore}%</span>
              </div>
              <div className={`w-40 h-2 rounded-full overflow-hidden ${isLight ? 'bg-slate-200' : 'bg-white/[0.08]'}`}>
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-1000 rounded-full"
                  style={{ width: `${result.confidenceScore}%` }}
                />
              </div>
            </div>

            <div className="text-left sm:text-right">
              <span className={`text-[10px] uppercase tracking-wider block font-semibold ${
                isLight ? 'text-slate-500' : 'text-[#86868b]'
              }`}>{t.riskRewardRatio}</span>
              <span className={`text-xl font-black ${isLight ? 'text-slate-900' : 'text-white'}`}>{result.overallRiskRewardRatio || '1 : 2.5'}</span>
            </div>
          </div>
        </div>

        {/* Quick Actions Bar */}
        <div className={`mt-6 pt-5 border-t flex flex-wrap items-center justify-between gap-3 ${
          isLight ? 'border-slate-200' : 'border-white/[0.08]'
        }`}>
          <div className="flex items-center space-x-2.5 flex-wrap gap-y-2">
            <button
              onClick={() => onSaveToJournal(currentResult)}
              disabled={isSaved}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 flex items-center space-x-1.5 cursor-pointer active:scale-95 shadow-sm ${
                isSaved
                  ? (isLight
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                    : 'bg-white/[0.08] text-emerald-400 border border-emerald-500/30')
                  : (isLight
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-emerald-500/20')
              }`}
            >
              <Bookmark className="w-3.5 h-3.5" />
              <span>{isSaved ? t.savedInJournal : t.saveToJournal}</span>
            </button>

            <button
              onClick={onOpenChat}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 flex items-center space-x-1.5 cursor-pointer active:scale-95 border ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/[0.08]'
              }`}
            >
              <HelpCircle className={`w-3.5 h-3.5 ${isLight ? 'text-teal-700' : 'text-cyan-400'}`} />
              <span>{t.askMentor}</span>
            </button>

            <button
              onClick={() => setIsShareModalOpen(true)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 flex items-center space-x-1.5 cursor-pointer active:scale-95 shadow-xs border ${
                isLight
                  ? 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200'
                  : 'bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-300 border-cyan-500/30'
              }`}
            >
              <Share2 className={`w-3.5 h-3.5 ${isLight ? 'text-teal-700' : 'text-cyan-400'}`} />
              <span>{t.shareAnalysis}</span>
            </button>

            <button
              onClick={() => setIsShareModalOpen(true)}
              className={`px-4 py-2 rounded-full text-xs font-semibold transition-all duration-200 flex items-center space-x-1.5 cursor-pointer active:scale-95 border ${
                isLight
                  ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                  : 'bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/[0.08]'
              }`}
              title={t.printPdfExport}
            >
              <Printer className={`w-3.5 h-3.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} />
              <span>{t.printPdfExport}</span>
            </button>

            {/* Instant AI Translation Button */}
            <button
              onClick={() => handleTranslate(language as LanguageOption)}
              disabled={isTranslating}
              className={`px-4 py-2 rounded-full text-xs font-bold transition-all duration-200 flex items-center space-x-1.5 cursor-pointer active:scale-95 border ${
                isLight
                  ? 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300 shadow-xs'
                  : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-500/35'
              }`}
              title="Přeložit AI analýzu do aktuálního jazyka"
            >
              <Globe className={`w-3.5 h-3.5 ${isTranslating ? 'animate-spin text-amber-400' : ''}`} />
              <span>
                {isTranslating
                  ? (language === 'en' ? 'Translating...' : language === 'es' ? 'Traduciendo...' : 'Překládám...')
                  : (language === 'en' ? 'Translate Analysis 🌐' : language === 'es' ? 'Traducir Análisis 🌐' : 'Přeložit Analýzu 🌐')}
              </span>
            </button>
          </div>

          <div className={`text-[11px] flex items-center space-x-1 font-medium ${
            isLight ? 'text-slate-600' : 'text-[#86868b]'
          }`}>
            <Flame className="w-3.5 h-3.5 text-amber-500" />
            <span>Modelová Edukační Analýza</span>
          </div>
        </div>
      </div>

      {/* 2. KEY EXECUTION LEVELS & OVERLAY MAP (TOP OPERATIONAL PRIORITY) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col: Exact Price Levels */}
        <div className={`lg:col-span-1 rounded-3xl p-5 sm:p-6 flex flex-col justify-between border ${
          isLight
            ? 'bg-white border-slate-300 text-slate-900 shadow-md'
            : 'bg-[#121216] border-white/[0.08] text-white shadow-xl'
        }`}>
          <div>
            <h3 className={`text-sm font-bold flex items-center justify-between mb-4 pb-3 border-b ${
              isLight ? 'text-slate-900 border-slate-200' : 'text-white border-white/[0.08]'
            }`}>
              <span className="flex items-center gap-2">
                <Target className={`w-4 h-4 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                {t.analysisHeader}
              </span>
              <span className={`text-[10px] font-mono px-2.5 py-0.5 rounded-full border ${
                isLight
                  ? 'bg-slate-100 text-slate-700 border-slate-200 font-semibold'
                  : 'bg-white/[0.08] text-[#f5f5f7] border-white/[0.08]'
              }`}>
                {result.symbol}
              </span>
            </h3>

            <div className="space-y-3.5">
              {/* Entry Level */}
              <div className={`p-3.5 rounded-2xl relative overflow-hidden border ${
                isLight
                  ? 'bg-blue-50/70 border-blue-200 text-slate-900'
                  : 'bg-black/50 border-blue-500/30 text-white'
              }`}>
                <div className="absolute top-0 left-0 bottom-0 w-1 bg-blue-500" />
                <div className={`text-[10px] font-bold uppercase tracking-wider ${
                  isLight ? 'text-blue-700' : 'text-blue-400'
                }`}>{t.entryZone}</div>
                <div className={`text-lg font-black mt-0.5 ${
                  isLight ? 'text-slate-900' : 'text-white'
                }`}>
                  {result.entryZone?.recommended || (result.entryZone?.min && result.entryZone?.max ? `${result.entryZone.min} - ${result.entryZone.max}` : 'N/A')}
                </div>
                <div className={`text-[11px] mt-0.5 ${
                  isLight ? 'text-slate-600' : 'text-[#86868b]'
                }`}>
                  Range: {result.entryZone?.min ?? 'N/A'} – {result.entryZone?.max ?? 'N/A'}
                </div>
              </div>

              {/* Stop Loss Level - High Contrast Red/Rose */}
              <div className={`p-3.5 rounded-2xl relative overflow-hidden border ${
                isLight
                  ? 'bg-rose-50 border-2 border-rose-300 text-slate-900 shadow-xs'
                  : 'bg-rose-950/40 border-2 border-rose-500/50 text-white shadow-xs'
              }`}>
                <div className="absolute top-0 left-0 bottom-0 w-1.5 bg-rose-600" />
                <div className="flex items-center justify-between">
                  <span className={`text-[10px] font-black uppercase tracking-wider ${
                    isLight ? 'text-rose-950' : 'text-rose-200'
                  }`}>{t.stopLoss}</span>
                  <span className={`text-[10px] font-mono font-black px-2 py-0.5 rounded-full border ${
                    isLight ? 'bg-rose-200/90 text-rose-950 border-rose-400' : 'bg-rose-900/60 text-rose-200 border-rose-500/40'
                  }`}>-{result.stopLoss?.distancePercent ?? 0}%</span>
                </div>
                <div className={`text-xl font-black mt-1 tracking-tight ${
                  isLight ? 'text-rose-950' : 'text-rose-100'
                }`}>
                  {result.stopLoss?.price ?? 'N/A'}
                </div>
                <div className={`text-[11px] mt-1 font-medium ${
                  isLight ? 'text-rose-900' : 'text-rose-200/90'
                }`}>
                  {result.stopLoss?.reason ?? ''}
                </div>
              </div>

              {/* Take Profit Targets */}
              <div className="space-y-2">
                <div className={`text-[10px] font-bold uppercase tracking-wider mb-1.5 ${
                  isLight ? 'text-slate-700' : 'text-[#86868b]'
                }`}>{t.takeProfit1} / {t.takeProfit2} / {t.takeProfit3}</div>
                {(result.takeProfitTargets || []).map((tp) => (
                  <div
                    key={tp.target}
                    className={`p-3 rounded-2xl flex items-center justify-between border ${
                      isLight
                        ? 'bg-emerald-50/80 border-emerald-300'
                        : 'bg-black/50 border-emerald-500/20'
                    }`}
                  >
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                          isLight
                            ? 'bg-emerald-200 text-emerald-950 border-emerald-400 font-extrabold'
                            : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
                        }`}>
                          TP {tp.target}
                        </span>
                        <span className={`text-sm font-bold ${
                          isLight ? 'text-slate-900 font-extrabold' : 'text-white'
                        }`}>{tp.price}</span>
                      </div>
                      <div className={`text-[10px] mt-0.5 ${
                        isLight ? 'text-slate-600' : 'text-[#86868b]'
                      }`}>{tp.description}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-xs font-black ${
                        isLight ? 'text-emerald-900 font-extrabold' : 'text-emerald-400'
                      }`}>R:R 1:{tp.riskRewardRatio}</div>
                      <div className={`text-[9px] ${
                        isLight ? 'text-slate-600 font-medium' : 'text-[#86868b]'
                      }`}>{tp.closePercentage}%</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Risk Management Box */}
          <div className={`mt-5 pt-4 border-t text-xs space-y-1.5 ${
            isLight ? 'border-slate-200 text-slate-700' : 'border-white/[0.08] text-[#86868b]'
          }`}>
            <div className="flex justify-between">
              <span>{t.suggestedRisk}:</span>
              <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{result.riskManagement?.suggestedPositionSizePercent ?? 1}%</span>
            </div>
            <div className="flex justify-between">
              <span>{t.invalidationCondition}:</span>
              <span className={`font-bold text-[11px] ${isLight ? 'text-rose-900 font-black' : 'text-rose-300'}`}>{result.riskManagement?.invalidationCondition ?? 'N/A'}</span>
            </div>
          </div>
        </div>

        {/* Right Col: Visual Chart Screen with Levels & Multiple View Options */}
        <div className={`lg:col-span-2 rounded-3xl p-4 sm:p-5 flex flex-col justify-between border ${
          isLight
            ? 'bg-white border-slate-300 shadow-md'
            : 'bg-[#121216] border-white/[0.08] shadow-xl'
        }`}>
          {/* Top Bar: View Mode Switcher + Overlay & Fullscreen Controls */}
          <div className={`flex flex-wrap items-center justify-between gap-2.5 mb-3.5 pb-3 border-b ${
            isLight ? 'border-slate-200' : 'border-white/[0.08]'
          }`}>
            {/* View Mode Selector Tabs */}
            <div className="flex items-center space-x-1.5 overflow-x-auto">
              {uploadedImages.length > 0 && !imageLoadError && (
                <button
                  type="button"
                  onClick={() => setChartViewMode('snapshot')}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer border ${
                    chartViewMode === 'snapshot'
                      ? (isLight ? 'bg-slate-900 text-white border-slate-900 shadow-xs' : 'bg-white text-black border-white shadow-xs')
                      : (isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' : 'bg-white/[0.06] hover:bg-white/[0.12] text-[#86868b] border-white/[0.08]')
                  }`}
                  title="Zobrazit původní analyzovaný screenshot s hladinami"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>Snímek s hladinami</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  setChartViewMode('hd_chart');
                  if (!hdChartUrl) generateHdChart();
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer border ${
                  chartViewMode === 'hd_chart'
                    ? (isLight ? 'bg-slate-900 text-white border-slate-900 shadow-xs' : 'bg-white text-black border-white shadow-xs')
                    : (isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' : 'bg-white/[0.06] hover:bg-white/[0.12] text-[#86868b] border-white/[0.08]')
                }`}
                title="Generovat detailní svíčkový graf s hladinami"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Kompletní graf</span>
              </button>

              <button
                type="button"
                onClick={() => setChartViewMode('live_tv')}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer border ${
                  chartViewMode === 'live_tv'
                    ? (isLight ? 'bg-slate-900 text-white border-slate-900 shadow-xs' : 'bg-white text-black border-white shadow-xs')
                    : (isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' : 'bg-white/[0.06] hover:bg-white/[0.12] text-[#86868b] border-white/[0.08]')
                }`}
                title="Otevřít živý interaktivní graf TradingView pro tento symbol"
              >
                <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" />
                <span>Živý TradingView</span>
              </button>
            </div>

            {/* Overlay toggle & Fullscreen Maximize button */}
            <div className="flex items-center space-x-2">
              {chartViewMode === 'hd_chart' && (
                <button
                  type="button"
                  onClick={generateHdChart}
                  disabled={isGeneratingHdChart}
                  className={`p-1.5 rounded-full text-xs transition cursor-pointer border ${
                    isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200' : 'bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/[0.08]'
                  }`}
                  title="Překreslit graf s čerstvými daty"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isGeneratingHdChart ? 'animate-spin' : ''}`} />
                </button>
              )}

              {chartViewMode === 'snapshot' && (
                <button
                  type="button"
                  onClick={() => setShowChartOverlay(!showChartOverlay)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer border ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                      : 'bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/[0.08]'
                  }`}
                  title={showChartOverlay ? 'Skrýt hladiny' : 'Zobrazit hladiny'}
                >
                  {showChartOverlay ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className={`w-3.5 h-3.5 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} />}
                  <span>{showChartOverlay ? 'Skrýt hladiny' : 'Zobrazit hladiny'}</span>
                </button>
              )}

              {/* Fullscreen Maximize Button */}
              <button
                type="button"
                onClick={() => setIsLightboxOpen(true)}
                className={`px-3 py-1.5 rounded-full text-xs font-extrabold flex items-center space-x-1.5 transition cursor-pointer shadow-xs border ${
                  isLight
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-400'
                }`}
                title="Zvětšit graf na celou obrazovku"
              >
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Zvětšit graf</span>
              </button>
            </div>
          </div>

          {/* Interactive Canvas Screenshot Frame */}
          <div className={`relative rounded-2xl overflow-hidden border bg-black aspect-video flex items-center justify-center shadow-lg group ${
            isLight ? 'border-slate-300' : 'border-white/[0.08]'
          }`}>
            {/* 1. SNAPSHOT MODE */}
            {chartViewMode === 'snapshot' && currentImage && !imageLoadError && (
              <div
                className="relative w-full h-full cursor-zoom-in"
                onClick={() => setIsLightboxOpen(true)}
                title="Kliknutím zvětšíte graf na celou obrazovku"
              >
                <img
                  src={currentImage}
                  alt="Chart analysis"
                  onError={() => {
                    setImageLoadError(true);
                    setChartViewMode('hd_chart');
                    generateHdChart();
                  }}
                  className="w-full h-full object-contain"
                />

                {/* Hover hint */}
                <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md text-white border border-white/20 text-[10px] font-bold px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 pointer-events-none z-40">
                  <Maximize2 className="w-3 h-3 text-emerald-400" />
                  <span>Kliknutím zvětšit</span>
                </div>

                {/* Dynamic Price Level Visual Overlay with Risk/Reward Zones */}
                {showChartOverlay && (() => {
                  const overlay = getOverlayLevels(result);

                  return (
                    <div className="absolute inset-0 pointer-events-none p-2 sm:p-4 bg-black/15 overflow-hidden">
                      {/* 1. Shaded Risk Zone Box (Red) */}
                      <div
                        className="absolute left-2 right-2 bg-red-600/20 border-l-4 border-red-500 rounded-r shadow-md transition-all duration-300"
                        style={{
                          top: `${overlay.riskTop}%`,
                          height: `${overlay.riskHeight}%`,
                        }}
                      >
                        <span className="absolute top-1 left-2 text-[10px] font-black text-rose-100 uppercase tracking-widest bg-black/95 px-2.5 py-0.5 rounded-full border border-red-500/80 shadow-md">
                          {t.stopLoss} ZÓNA
                        </span>
                      </div>

                      {/* 2. Shaded Reward Zone Box (Green) */}
                      <div
                        className="absolute left-2 right-2 bg-emerald-500/20 border-l-4 border-emerald-400 rounded-r shadow-md transition-all duration-300"
                        style={{
                          top: `${overlay.rewardTop}%`,
                          height: `${overlay.rewardHeight}%`,
                        }}
                      >
                        <span className="absolute bottom-1 left-2 text-[10px] font-black text-emerald-100 uppercase tracking-widest bg-black/95 px-2.5 py-0.5 rounded-full border border-emerald-400/80 shadow-md">
                          TAKE PROFIT CÍLOVÁ ZÓNA
                        </span>
                      </div>

                      {/* 3. Stop Loss Level Line & Badge (High-contrast Red) */}
                      <div
                        className="absolute left-0 right-0 border-t-[2.5px] border-dashed border-rose-500 flex items-center justify-between px-2 -translate-y-1/2 z-20 transition-all duration-300"
                        style={{ top: `${overlay.sl.top}%` }}
                      >
                        <div className="bg-black/95 border-2 border-rose-500 text-rose-100 text-[11px] font-black px-3 py-0.5 rounded-full shadow-2xl flex items-center space-x-1.5">
                          <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                          <span>STOP LOSS: {overlay.sl.priceStr}</span>
                        </div>
                        <span className="bg-black/95 border-2 border-rose-500 text-rose-200 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-2xl">
                          SL
                        </span>
                      </div>

                      {/* 4. Entry Zone Level Line & Badge (Cyan) */}
                      <div
                        className="absolute left-0 right-0 border-t-[2.5px] border-solid border-cyan-400 flex items-center justify-between px-2 -translate-y-1/2 z-30 transition-all duration-300"
                        style={{ top: `${overlay.entry.top}%` }}
                      >
                        <div className="bg-black/95 border-2 border-cyan-400 text-cyan-100 text-[11px] font-black px-3 py-0.5 rounded-full shadow-2xl flex items-center space-x-1.5">
                          <span className="w-2 h-2 rounded-full bg-cyan-400" />
                          <span>POI / VSTUP: {overlay.entry.priceStr}</span>
                        </div>
                        <span className="bg-black/95 border-2 border-cyan-400 text-cyan-200 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-2xl">
                          POI
                        </span>
                      </div>

                      {/* 5. Take Profit Level Lines & Badges (Green) */}
                      {overlay.tps.map((tp) => (
                        <div
                          key={tp.target}
                          className="absolute left-0 right-0 border-t-[2.5px] border-dashed border-emerald-400 flex items-center justify-between px-2 -translate-y-1/2 z-20 transition-all duration-300"
                          style={{ top: `${tp.top}%` }}
                        >
                          <div className="bg-black/95 border-2 border-emerald-400 text-emerald-100 text-[11px] font-black px-3 py-0.5 rounded-full shadow-2xl flex items-center space-x-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" />
                            <span>
                              TP{tp.target}: {tp.rawPrice} {tp.closePercent ? `(${tp.closePercent}%)` : ''}
                            </span>
                          </div>
                          <span className="bg-black/95 border-2 border-emerald-400 text-emerald-200 text-[10px] font-black px-2.5 py-0.5 rounded-full shadow-2xl">
                            TP{tp.target}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* 2. HD CANDLESTICK GENERATED CHART */}
            {(chartViewMode === 'hd_chart' || !currentImage || imageLoadError) && chartViewMode !== 'live_tv' && (
              <div className="relative w-full h-full flex items-center justify-center">
                {hdChartUrl ? (
                  <div
                    className="relative w-full h-full cursor-zoom-in"
                    onClick={() => setIsLightboxOpen(true)}
                    title="Kliknutím zvětšíte graf na celou obrazovku"
                  >
                    <img
                      src={hdChartUrl}
                      alt="Kompletní svíčkový graf s hladinami"
                      className="w-full h-full object-contain"
                    />
                    <div className="absolute top-3 right-3 bg-black/80 backdrop-blur-md text-white border border-white/20 text-[10px] font-bold px-2.5 py-1 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center space-x-1 pointer-events-none z-40">
                      <Maximize2 className="w-3 h-3 text-emerald-400" />
                      <span>Kliknutím zvětšit</span>
                    </div>
                  </div>
                ) : isGeneratingHdChart ? (
                  <div className="flex flex-col items-center justify-center p-8 text-center space-y-3">
                    <RefreshCw className="w-8 h-8 text-emerald-400 animate-spin" />
                    <div className="text-sm font-bold text-white">Generuji kompletní svíčkový graf s hladinami...</div>
                    <div className="text-xs text-[#86868b]">Vykresluji svíčky, klouzavé průměry, Stop Loss a TP cíle</div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center p-6 text-center space-y-3">
                    <BarChart2 className="w-10 h-10 text-slate-500" />
                    <div className="text-sm font-bold text-white">Graf je připraven k vykreslení</div>
                    <button
                      type="button"
                      onClick={generateHdChart}
                      className="px-4 py-2 rounded-full text-xs font-bold bg-emerald-500 hover:bg-emerald-400 text-black shadow-md cursor-pointer"
                    >
                      Vykreslit kompletní graf
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* 3. LIVE TRADINGVIEW EMBED */}
            {chartViewMode === 'live_tv' && (
              <div className="relative w-full h-full">
                <iframe
                  title="TradingView Live Chart"
                  src={`https://s.tradingview.com/widgetembed/?frameElementId=tradingview_analysis_embed&symbol=${encodeURIComponent(
                    (result.symbol || 'BINANCE:BTCUSDT').replace(/\s+/g, '')
                  )}&interval=${encodeURIComponent(result.timeframe || '15')}&hidesidetoolbar=0&symboledit=1&saveimage=1&toolbarbg=f1f3f6&studies=%5B%5D&theme=${isLight ? 'light' : 'dark'}&style=1&timezone=exchange`}
                  className="w-full h-full border-0"
                />
              </div>
            )}
          </div>

          {/* Multi-image Selector if available */}
          {uploadedImages.length > 1 && chartViewMode === 'snapshot' && (
            <div className="flex space-x-2 mt-3.5 overflow-x-auto pb-1">
              {uploadedImages.map((img, i) => (
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

      {/* 3. DRAW ON LIQUIDITY (MAGNET LIKVIDITY & ANTI-TRAP RULE) */}
      {result.drawOnLiquidity && (
        <div className={`rounded-3xl p-5 sm:p-6 shadow-xl space-y-3 relative overflow-hidden border ${
          isLight
            ? 'bg-white border-teal-300 text-slate-900 shadow-md'
            : 'bg-[#121216] border-cyan-500/30 text-white shadow-xl'
        }`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className={`flex items-center space-x-2 font-bold text-xs ${
              isLight ? 'text-teal-700' : 'text-cyan-400'
            }`}>
              <Magnet className={`w-4 h-4 animate-pulse ${isLight ? 'text-teal-700' : 'text-cyan-400'}`} />
              <span>{t.drawOnLiquidityTitle}</span>
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                result.drawOnLiquidity.direction === 'UPSIDE_BSL'
                  ? (isLight ? 'bg-emerald-100 text-emerald-950 border-emerald-300' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30')
                  : result.drawOnLiquidity.direction === 'DOWNSIDE_SSL'
                  ? (isLight ? 'bg-rose-100 text-rose-950 border-rose-400 font-black' : 'bg-rose-950/40 text-rose-200 border-rose-500/40')
                  : (isLight ? 'bg-slate-100 text-slate-800 border-slate-300' : 'bg-white/10 text-white border-white/20')
              }`}
            >
              {result.drawOnLiquidity.direction === 'UPSIDE_BSL'
                ? t.magnetUpside
                : result.drawOnLiquidity.direction === 'DOWNSIDE_SSL'
                ? t.magnetDownside
                : t.rangeWait}
            </span>
          </div>

          <div className={`p-3.5 rounded-2xl space-y-2 border ${
            isLight
              ? 'bg-teal-50/70 border-teal-200'
              : 'bg-cyan-500/5 border-cyan-500/20'
          }`}>
            <div className={`flex items-center space-x-2 text-xs font-bold ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              <Compass className={`w-3.5 h-3.5 ${isLight ? 'text-teal-700' : 'text-cyan-400'}`} />
              <span>{t.targetLiquidityZone} <span className={`font-mono ${isLight ? 'text-teal-800 font-bold' : 'text-cyan-300'}`}>{result.drawOnLiquidity.targetZone}</span></span>
            </div>
            <p className={`text-xs leading-relaxed ${
              isLight ? 'text-slate-600' : 'text-[#a1a1a6]'
            }`}>
              {result.drawOnLiquidity.reason}
            </p>
          </div>

          {result.drawOnLiquidity.prohibitedOpposingTrade && (
            <div className={`flex items-start space-x-2.5 p-3 rounded-2xl text-xs border ${
              isLight
                ? 'bg-rose-50 border-2 border-rose-300 text-rose-950 shadow-xs'
                : 'bg-rose-950/40 border border-rose-500/40 text-rose-200'
            }`}>
              <AlertOctagon className={`w-4 h-4 shrink-0 mt-0.5 ${isLight ? 'text-rose-700' : 'text-rose-400'}`} />
              <div>
                <span className={`font-black block ${isLight ? 'text-rose-950' : 'text-rose-200'}`}>{t.antiTrapRuleLabel}</span>
                <span className={`text-[11px] leading-relaxed font-medium ${isLight ? 'text-rose-900' : 'text-rose-100/90'}`}>{result.drawOnLiquidity.prohibitedOpposingTrade}</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. ECONOMIC CALENDAR WARNING BANNER */}
      {result.economicCalendarWarning && (
        <div className={`rounded-3xl p-5 sm:p-6 shadow-xl space-y-3 border ${
          isLight
            ? 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-md'
            : 'bg-[#121216] border-amber-500/30 text-white shadow-xl'
        }`}>
          <div className="flex items-center justify-between">
            <div className={`flex items-center space-x-2 font-bold text-xs ${
              isLight ? 'text-amber-800' : 'text-amber-400'
            }`}>
              <ShieldAlert className={`w-4 h-4 ${isLight ? 'text-amber-700' : 'text-amber-400'}`} />
              <span>{t.calendarTitle}</span>
            </div>
            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
              isLight
                ? 'bg-amber-200 text-amber-900 border-amber-300'
                : 'bg-amber-500/15 text-amber-300 border-amber-500/30'
            }`}>
              HIGH VOLATILITY RISK
            </span>
          </div>

          <p className={`text-xs leading-relaxed ${
            isLight ? 'text-amber-900/90 font-medium' : 'text-[#a1a1a6]'
          }`}>
            {result.economicCalendarWarning.riskAdvice}
          </p>

          {result.economicCalendarWarning.upcomingNewsEvents && result.economicCalendarWarning.upcomingNewsEvents.length > 0 && (
            <div className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-3 border-t ${
              isLight ? 'border-amber-200' : 'border-white/[0.08]'
            }`}>
              {result.economicCalendarWarning.upcomingNewsEvents.map((ev, i) => (
                <div key={i} className={`p-3 rounded-2xl text-xs space-y-1 border ${
                  isLight
                    ? 'bg-white border-amber-200 shadow-xs'
                    : 'bg-black/50 border-white/[0.06]'
                }`}>
                  <div className={`flex items-center justify-between font-bold ${
                    isLight ? 'text-slate-900' : 'text-white'
                  }`}>
                    <span>{ev.title} ({ev.currency})</span>
                    <span className={`text-[10px] font-mono ${isLight ? 'text-amber-700 font-bold' : 'text-amber-400'}`}>{ev.date}</span>
                  </div>
                  <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-[#86868b]'}`}>{ev.warningText}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 5. MULTI-STRATEGY METHODOLOGY CONFLUENCES BREAKDOWN */}
      {result.methodologyConfluences && result.methodologyConfluences.length > 0 && (
        <div className={`rounded-3xl p-5 sm:p-6 shadow-xl space-y-4 border ${
          isLight
            ? 'bg-white border-slate-300 text-slate-900 shadow-md'
            : 'bg-[#121216] border-white/[0.08] text-white shadow-xl'
        }`}>
          <h3 className={`text-sm font-bold flex items-center space-x-2 ${
            isLight ? 'text-slate-900' : 'text-white'
          }`}>
            <Sparkles className={`w-4 h-4 ${isLight ? 'text-teal-700' : 'text-cyan-400'}`} />
            <span>{t.methodologyConfluences} ({result.methodologyConfluences.length})</span>
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {result.methodologyConfluences.map((conf, idx) => (
              <div key={idx} className={`p-4 rounded-2xl space-y-2 border ${
                isLight
                  ? 'bg-slate-50 border-slate-200'
                  : 'bg-black/40 border-white/[0.06]'
              }`}>
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{conf.methodology}</span>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border ${
                      conf.bias === 'BULLISH'
                        ? (isLight ? 'bg-emerald-100 text-emerald-950 border-emerald-300' : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30')
                        : conf.bias === 'BEARISH'
                        ? (isLight ? 'bg-rose-100 text-rose-950 border-rose-400' : 'bg-rose-500/20 text-rose-200 border-rose-500/40')
                        : (isLight ? 'bg-slate-200 text-slate-800 border-slate-300' : 'bg-white/10 text-white border-white/20')
                    }`}
                  >
                    {conf.bias}
                  </span>
                </div>
                <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-[#a1a1a6]'}`}>{conf.keyObservation}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 6. TABBED DETAILED ANALYSIS & MENTOR DISSECTION */}
      <div className={`rounded-3xl overflow-hidden shadow-xl border ${
        isLight
          ? 'bg-white border-slate-300 shadow-md text-slate-900'
          : 'bg-[#121216] border-white/[0.08] shadow-xl text-white'
      }`}>
        {/* Navigation Tabs Header - Segmented Top Bar */}
        <div className={`flex border-b overflow-x-auto p-1.5 gap-1 ${
          isLight ? 'bg-slate-100 border-slate-200' : 'bg-black/40 border-white/[0.08]'
        }`}>
          <button
            onClick={() => setActiveTab('levels')}
            className={`px-4 py-2 text-xs font-semibold rounded-2xl transition-all duration-200 flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'levels'
                ? (isLight ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200' : 'bg-white/15 text-white font-bold shadow-sm')
                : (isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50' : 'text-[#86868b] hover:text-white hover:bg-white/5')
            }`}
          >
            <Zap className={`w-4 h-4 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
            <span>{t.priceActionStructures}</span>
          </button>

          <button
            onClick={() => setActiveTab('candles')}
            className={`px-4 py-2 text-xs font-semibold rounded-2xl transition-all duration-200 flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'candles'
                ? (isLight ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200' : 'bg-white/15 text-white font-bold shadow-sm')
                : (isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50' : 'text-[#86868b] hover:text-white hover:bg-white/5')
            }`}
          >
            <Sparkles className={`w-4 h-4 ${isLight ? 'text-teal-700' : 'text-cyan-400'}`} />
            <span>{t.candlestickPatterns} ({(result.candlestickPatterns || []).length})</span>
          </button>

          <button
            onClick={() => setActiveTab('mentor')}
            className={`px-4 py-2 text-xs font-semibold rounded-2xl transition-all duration-200 flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'mentor'
                ? (isLight ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200' : 'bg-white/15 text-white font-bold shadow-sm')
                : (isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50' : 'text-[#86868b] hover:text-white hover:bg-white/5')
            }`}
          >
            <BookOpen className={`w-4 h-4 ${isLight ? 'text-purple-600' : 'text-purple-400'}`} />
            <span>{t.mentorAdviceTitle}</span>
          </button>

          <button
            onClick={() => setActiveTab('checklist')}
            className={`px-4 py-2 text-xs font-semibold rounded-2xl transition-all duration-200 flex items-center space-x-2 whitespace-nowrap cursor-pointer ${
              activeTab === 'checklist'
                ? (isLight ? 'bg-white text-slate-900 font-bold shadow-xs border border-slate-200' : 'bg-white/15 text-white font-bold shadow-sm')
                : (isLight ? 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50' : 'text-[#86868b] hover:text-white hover:bg-white/5')
            }`}
          >
            <CheckCircle2 className={`w-4 h-4 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
            <span>{t.tradeChecklist}</span>
          </button>
        </div>

        {/* Tab Content Panes */}
        <div className="p-5 sm:p-6">
          {/* TAB 1: Price Action & Structures */}
          {activeTab === 'levels' && (
            <div className="space-y-4">
              <h4 className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{t.priceActionStructures}</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(result.priceActionStructures || []).map((pas, i) => (
                  <div key={i} className={`p-4 rounded-2xl space-y-1.5 border ${
                    isLight
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-black/40 border-white/[0.06]'
                  }`}>
                    <div className={`text-xs font-extrabold flex items-center space-x-1.5 ${
                      isLight ? 'text-emerald-700' : 'text-emerald-400'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${isLight ? 'bg-emerald-600' : 'bg-emerald-400'}`} />
                      <span>{pas.structure}</span>
                    </div>
                    <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-[#a1a1a6]'}`}>{pas.description}</p>
                  </div>
                ))}
              </div>

              {/* Support & Resistance Summary */}
              <div className={`mt-5 pt-4 border-t grid grid-cols-1 sm:grid-cols-2 gap-4 ${
                isLight ? 'border-slate-200' : 'border-white/[0.08]'
              }`}>
                <div className={`p-4 rounded-2xl border ${
                  isLight
                    ? 'bg-emerald-50 border-emerald-200'
                    : 'bg-emerald-950/20 border-emerald-500/20'
                }`}>
                  <span className={`text-[10px] font-bold uppercase tracking-wider block mb-2 ${
                    isLight ? 'text-emerald-800' : 'text-emerald-400'
                  }`}>
                    {t.supportLevels}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(result.keyLevels?.support || []).map((lvl, idx) => (
                      <span key={idx} className={`px-2.5 py-1 font-mono text-xs rounded-full font-bold border ${
                        isLight
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                      }`}>
                        {lvl}
                      </span>
                    ))}
                  </div>
                </div>

                <div className={`p-4 rounded-2xl border ${
                  isLight
                    ? 'bg-rose-50 border-2 border-rose-300 shadow-xs'
                    : 'bg-rose-950/30 border border-rose-500/30'
                }`}>
                  <span className={`text-[10px] font-black uppercase tracking-wider block mb-2 ${
                    isLight ? 'text-rose-950' : 'text-rose-300'
                  }`}>
                    {t.resistanceLevels}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    {(result.keyLevels?.resistance || []).map((lvl, idx) => (
                      <span key={idx} className={`px-2.5 py-1 font-mono text-xs rounded-full font-black border ${
                        isLight
                          ? 'bg-rose-100 text-rose-950 border-rose-300'
                          : 'bg-rose-500/20 text-rose-200 border-rose-500/30'
                      }`}>
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
              <h4 className={`text-sm font-bold mb-3 ${isLight ? 'text-slate-900' : 'text-white'}`}>{t.candlestickPatterns}</h4>
              {(result.candlestickPatterns || []).map((cp, idx) => (
                <div
                  key={idx}
                  className={`p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-2 border ${
                    isLight
                      ? 'bg-slate-50 border-slate-200'
                      : 'bg-black/40 border-white/[0.06]'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{cp.pattern}</span>
                      <span
                        className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                          cp.signalType === 'Bullish'
                            ? (isLight ? 'bg-emerald-100 text-emerald-950 border-emerald-300' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30')
                            : cp.signalType === 'Bearish'
                            ? (isLight ? 'bg-rose-100 text-rose-950 border-rose-400' : 'bg-rose-500/20 text-rose-200 border-rose-500/40')
                            : (isLight ? 'bg-slate-200 text-slate-800 border-slate-300' : 'bg-white/10 text-white border-white/20')
                        }`}
                      >
                        {cp.signalType}
                      </span>
                    </div>
                    <p className={`text-xs ${isLight ? 'text-slate-600' : 'text-[#86868b]'}`}>{cp.significance}</p>
                  </div>

                  <div className={`text-[11px] font-mono px-3 py-1 rounded-full border self-start sm:self-auto ${
                    isLight
                      ? 'bg-slate-200 text-slate-800 border-slate-300'
                      : 'bg-white/[0.04] text-[#a1a1a6] border-white/[0.06]'
                  }`}>
                    {cp.location}
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* TAB 3: Mentor Advice */}
          {activeTab === 'mentor' && (
            <div className="space-y-4">
              <div className={`flex items-center space-x-3 p-3.5 rounded-2xl text-xs border ${
                isLight
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
              }`}>
                <BookOpen className={`w-5 h-5 flex-shrink-0 ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`} />
                <span>
                  <strong>{t.mentorAdviceTitle}:</strong> Edukační rozbor tržní psychologie, institucionálního toku objednávek a modelového řízení rizika.
                </span>
              </div>

              <div className={`text-sm leading-relaxed whitespace-pre-line p-5 rounded-2xl border font-sans ${
                isLight
                  ? 'bg-slate-50 border-slate-200 text-slate-800'
                  : 'bg-black/40 border-white/[0.06] text-[#f5f5f7]'
              }`}>
                {result.mentorAdvice}
              </div>
            </div>
          )}

          {/* TAB 4: Checklist */}
          {activeTab === 'checklist' && (
            <div className="space-y-3">
              <h4 className={`text-sm font-bold mb-3 ${isLight ? 'text-slate-900' : 'text-white'}`}>{t.tradeChecklist}</h4>
              {(result.tradeChecklist || []).map((item, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-2xl border flex items-center justify-between transition ${
                    item.passed
                      ? (isLight ? 'bg-emerald-50/80 border-emerald-200 text-slate-900' : 'bg-emerald-950/15 border-emerald-500/25 text-[#f5f5f7]')
                      : (isLight ? 'bg-rose-50 border-2 border-rose-300 text-slate-900 shadow-xs' : 'bg-rose-950/25 border border-rose-500/35 text-[#f5f5f7]')
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    {item.passed ? (
                      <CheckCircle2 className={`w-5 h-5 flex-shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                    ) : (
                      <XCircle className={`w-5 h-5 flex-shrink-0 ${isLight ? 'text-rose-700' : 'text-rose-400'}`} />
                    )}
                    <div>
                      <div className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{item.rule}</div>
                      <div className={`text-[11px] mt-0.5 ${isLight ? (item.passed ? 'text-slate-600' : 'text-rose-950 font-medium') : 'text-[#86868b]'}`}>{item.comment}</div>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                      item.passed
                        ? (isLight ? 'bg-emerald-100 text-emerald-950 border-emerald-300' : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30')
                        : (isLight ? 'bg-rose-100 text-rose-950 border-rose-400' : 'bg-rose-500/25 text-rose-200 border-rose-500/40')
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

      {/* FULLSCREEN LIGHTBOX MODAL WITH OVERLAY & ZOOM */}
      {isLightboxOpen && typeof document !== 'undefined' && createPortal(
        <div
          className={`fixed inset-0 z-[99999] backdrop-blur-md flex flex-col justify-between select-none animate-fadeIn ${
            isLight ? 'bg-slate-200/95 text-slate-900' : 'bg-black/95 text-white'
          }`}
          role="dialog"
          aria-modal="true"
          aria-label="Detail grafu na celou obrazovku"
        >
          {/* Lightbox Header */}
          <div className={`flex items-center justify-between px-4 py-3 z-50 border-b ${
            isLight ? 'bg-white/95 border-slate-300 text-slate-900' : 'bg-[#121216]/95 border-white/10 text-white'
          }`}>
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2">
                <span className={`font-black text-sm tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>{result.symbol}</span>
                <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full font-semibold border ${
                  isLight ? 'bg-slate-100 text-slate-700 border-slate-300' : 'bg-white/10 text-slate-300 border-white/10'
                }`}>
                  {result.timeframe || '15m'}
                </span>
                <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                  result.signal === 'LONG'
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/40'
                    : result.signal === 'SHORT'
                    ? 'bg-rose-500/20 text-rose-700 dark:text-rose-200 border-rose-500/50'
                    : 'bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/40'
                }`}>
                  {result.signal}
                </span>
              </div>

              {/* View Switcher in Lightbox */}
              <div className={`hidden sm:flex items-center space-x-1.5 ml-4 pl-4 border-l ${
                isLight ? 'border-slate-300' : 'border-white/10'
              }`}>
                {uploadedImages.length > 0 && !imageLoadError && (
                  <button
                    type="button"
                    onClick={() => setChartViewMode('snapshot')}
                    className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer border ${
                      chartViewMode === 'snapshot'
                        ? (isLight ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-black border-white')
                        : (isLight ? 'bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300' : 'bg-white/10 text-white/70 hover:text-white border-white/10')
                    }`}
                  >
                    Snímek s hladinami
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setChartViewMode('hd_chart');
                    if (!hdChartUrl) generateHdChart();
                  }}
                  className={`px-3 py-1 rounded-full text-xs font-bold transition cursor-pointer border ${
                    chartViewMode === 'hd_chart'
                      ? (isLight ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-black border-white')
                      : (isLight ? 'bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300' : 'bg-white/10 text-white/70 hover:text-white border-white/10')
                  }`}
                >
                  Kompletní graf
                </button>
              </div>
            </div>

            {/* Lightbox Controls & Close Button */}
            <div className="flex items-center space-x-2">
              {chartViewMode === 'snapshot' && (
                <button
                  type="button"
                  onClick={() => setShowChartOverlay(!showChartOverlay)}
                  className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer border ${
                    isLight
                      ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300'
                      : 'bg-white/10 hover:bg-white/20 text-white border-white/15'
                  }`}
                  title="Skrýt / Zobrazit hladiny"
                >
                  {showChartOverlay ? <EyeOff className="w-3.5 h-3.5 text-amber-500" /> : <Eye className="w-3.5 h-3.5 text-emerald-500" />}
                  <span className="hidden sm:inline">{showChartOverlay ? 'Skrýt hladiny' : 'Zobrazit hladiny'}</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setIsZoomScaleToggled(!isZoomScaleToggled)}
                className={`px-3 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer border ${
                  isZoomScaleToggled
                    ? 'bg-emerald-500 text-black border-emerald-400'
                    : (isLight ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-300' : 'bg-white/10 hover:bg-white/20 text-white border-white/15')
                }`}
                title="Zvětšit zobrazení"
              >
                {isZoomScaleToggled ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{isZoomScaleToggled ? '100%' : '150%'}</span>
              </button>

              {/* Close Button - Highly prominent */}
              <button
                type="button"
                onClick={() => {
                  setIsLightboxOpen(false);
                  setIsZoomScaleToggled(false);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-black flex items-center space-x-1.5 shadow-lg transition cursor-pointer ${
                  isLight
                    ? 'bg-slate-900 hover:bg-slate-800 text-white'
                    : 'bg-white hover:bg-slate-200 text-black'
                }`}
                title="Zavřít graf (ESC)"
              >
                <X className="w-4 h-4" />
                <span>Zavřít (ESC)</span>
              </button>
            </div>
          </div>

          {/* Lightbox Center Content with high-resolution scroll/zoom */}
          <div className={`flex-1 relative overflow-auto flex items-center justify-center p-2 sm:p-6 ${
            isLight ? 'bg-slate-100/90' : 'bg-black'
          }`}>
            <div
              className={`relative transition-transform duration-200 flex items-center justify-center max-w-full max-h-full ${
                isZoomScaleToggled ? 'scale-150 transform cursor-zoom-out' : 'cursor-zoom-in'
              }`}
              onClick={() => setIsZoomScaleToggled(!isZoomScaleToggled)}
            >
              {chartViewMode === 'snapshot' && currentImage && !imageLoadError ? (
                <div className="relative inline-block max-w-[95vw] max-h-[80vh]">
                  <img
                    src={currentImage}
                    alt="Detail grafu"
                    className="max-w-[95vw] max-h-[80vh] object-contain rounded-lg shadow-2xl border border-white/10"
                  />

                  {/* High-contrast Overlay on Lightbox */}
                  {showChartOverlay && (() => {
                    const overlay = getOverlayLevels(result);
                    return (
                      <div className="absolute inset-0 pointer-events-none p-4 overflow-hidden">
                        {/* Risk zone */}
                        <div
                          className="absolute left-2 right-2 bg-red-600/25 border-l-4 border-rose-500 rounded-r shadow-lg"
                          style={{ top: `${overlay.riskTop}%`, height: `${overlay.riskHeight}%` }}
                        >
                          <span className="absolute top-1 left-2 text-[10px] font-black text-rose-100 uppercase tracking-widest bg-black/95 px-2.5 py-0.5 rounded-full border border-rose-500/80 shadow-md">
                            {t.stopLoss} ZÓNA
                          </span>
                        </div>

                        {/* Reward zone */}
                        <div
                          className="absolute left-2 right-2 bg-emerald-500/25 border-l-4 border-emerald-400 rounded-r shadow-lg"
                          style={{ top: `${overlay.rewardTop}%`, height: `${overlay.rewardHeight}%` }}
                        >
                          <span className="absolute bottom-1 left-2 text-[10px] font-black text-emerald-100 uppercase tracking-widest bg-black/95 px-2.5 py-0.5 rounded-full border border-emerald-400/80 shadow-md">
                            TAKE PROFIT CÍLOVÁ ZÓNA
                          </span>
                        </div>

                        {/* SL Line */}
                        <div
                          className="absolute left-0 right-0 border-t-[3px] border-dashed border-rose-500 flex items-center justify-between px-3 -translate-y-1/2 z-20"
                          style={{ top: `${overlay.sl.top}%` }}
                        >
                          <div className="bg-black/95 border-2 border-rose-500 text-rose-100 text-xs font-black px-3 py-1 rounded-full shadow-2xl flex items-center space-x-1.5">
                            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                            <span>STOP LOSS: {overlay.sl.priceStr}</span>
                          </div>
                          <span className="bg-black/95 border-2 border-rose-500 text-rose-100 text-xs font-black px-3 py-1 rounded-full shadow-2xl">
                            SL
                          </span>
                        </div>

                        {/* Entry Line */}
                        <div
                          className="absolute left-0 right-0 border-t-[3px] border-solid border-cyan-400 flex items-center justify-between px-3 -translate-y-1/2 z-30"
                          style={{ top: `${overlay.entry.top}%` }}
                        >
                          <div className="bg-black/95 border-2 border-cyan-400 text-cyan-100 text-xs font-black px-3 py-1 rounded-full shadow-2xl flex items-center space-x-1.5">
                            <span className="w-2 h-2 rounded-full bg-cyan-400" />
                            <span>POI / VSTUP: {overlay.entry.priceStr}</span>
                          </div>
                          <span className="bg-black/95 border-2 border-cyan-400 text-cyan-100 text-xs font-black px-3 py-1 rounded-full shadow-2xl">
                            POI
                          </span>
                        </div>

                        {/* TP Lines */}
                        {overlay.tps.map((tp) => (
                          <div
                            key={tp.target}
                            className="absolute left-0 right-0 border-t-[3px] border-dashed border-emerald-400 flex items-center justify-between px-3 -translate-y-1/2 z-20"
                            style={{ top: `${tp.top}%` }}
                          >
                            <div className="bg-black/95 border-2 border-emerald-400 text-emerald-100 text-xs font-black px-3 py-1 rounded-full shadow-2xl flex items-center space-x-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-400" />
                              <span>TP{tp.target}: {tp.rawPrice} {tp.closePercent ? `(${tp.closePercent}%)` : ''}</span>
                            </div>
                            <span className="bg-black/95 border-2 border-emerald-400 text-emerald-100 text-xs font-black px-3 py-1 rounded-full shadow-2xl">
                              TP{tp.target}
                            </span>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              ) : hdChartUrl ? (
                <div className="relative inline-block max-w-[95vw] max-h-[80vh]">
                  <img
                    src={hdChartUrl}
                    alt="Kompletní svíčkový graf"
                    className="max-w-[95vw] max-h-[80vh] object-contain rounded-lg shadow-2xl border border-white/10"
                  />
                </div>
              ) : isGeneratingHdChart ? (
                <div className="flex flex-col items-center justify-center p-12 text-center space-y-4">
                  <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" />
                  <div className="text-base font-bold text-white">Vykresluji kompletní svíčkový graf s hladinami...</div>
                </div>
              ) : (
                <div className="text-white text-sm">Graf není momentálně k dispozici</div>
              )}
            </div>
          </div>

          {/* Lightbox Footer with Levels & Close OK Button */}
          <div className="px-4 py-3 bg-[#121216]/95 border-t border-white/10 z-50 flex flex-wrap items-center justify-between gap-3">
            {/* Quick Levels Pills */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-rose-950/80 border border-rose-500/60 text-rose-200 font-bold">
                SL: {currentResult.stopLoss?.price ?? 'N/A'}
              </span>
              <span className="text-[11px] font-mono px-3 py-1 rounded-full bg-cyan-950/80 border border-cyan-500/60 text-cyan-200 font-bold">
                POI: {currentResult.entryZone?.recommended || currentResult.entryZone?.min || 'N/A'}
              </span>
              {(currentResult.takeProfitTargets || []).map((tp) => (
                <span key={tp.target} className="text-[11px] font-mono px-3 py-1 rounded-full bg-emerald-950/80 border border-emerald-500/60 text-emerald-200 font-bold">
                  TP{tp.target}: {tp.price}
                </span>
              ))}
            </div>

            {/* Big Close Button */}
            <button
              type="button"
              onClick={() => {
                setIsLightboxOpen(false);
                setIsZoomScaleToggled(false);
              }}
              className="px-5 py-2 rounded-full text-xs font-black flex items-center space-x-2 bg-emerald-500 hover:bg-emerald-400 text-black shadow-xl transition cursor-pointer"
            >
              <Check className="w-4 h-4 stroke-[3]" />
              <span>Rozumím / Zavřít graf</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* SHARE ANALYSIS MODAL */}
      <ShareAnalysisModal
        result={currentResult}
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        language={language}
      />
    </div>
  );
};
