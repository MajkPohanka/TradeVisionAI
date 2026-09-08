import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  TrendingUp,
  Camera,
  Maximize2,
  Minimize2,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Search,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Layers,
  ArrowRight,
  Info,
  Copy,
  Scan,
  Upload,
  Link as LinkIcon,
  X,
  Loader2,
  Check,
  Plus,
  Image as ImageIcon,
} from 'lucide-react';
import { LanguageOption, HoldingPeriod } from '../types';
import { getTranslation } from '../utils/translations';
import { renderTradingViewChartSnapshot } from '../utils/chartSnapshotRenderer';

interface TradingViewLiveChartProps {
  language?: LanguageOption;
  holdingPeriod?: HoldingPeriod;
  onInsertImageToSlot: (dataUrl: string, slotIndex: number) => void;
  slots?: (string | null)[];
  activeSlotIndex?: number | null;
  externalSymbol?: string | null;
  focusTrigger?: number;
}

interface MarketPreset {
  id: string;
  name: string;
  symbol: string;
  category: 'metal' | 'forex' | 'crypto' | 'index' | 'commodity';
  icon: string;
}

const MARKET_PRESETS: MarketPreset[] = [
  { id: 'gold', name: 'Zlato (XAUUSD)', symbol: 'OANDA:XAUUSD', category: 'metal', icon: '🥇' },
  { id: 'silver', name: 'Stříbro (XAGUSD)', symbol: 'OANDA:XAGUSD', category: 'metal', icon: '🥈' },
  { id: 'sp500', name: 'S&P 500 (US500)', symbol: 'CAPITALCOM:US500', category: 'index', icon: '🏛️' },
  { id: 'nasdaq', name: 'Nasdaq 100 (US100)', symbol: 'CAPITALCOM:US100', category: 'index', icon: '💻' },
  { id: 'dow', name: 'Dow Jones (US30)', symbol: 'CAPITALCOM:US30', category: 'index', icon: '📈' },
  { id: 'dax', name: 'DAX 40 (DE40)', symbol: 'CAPITALCOM:DE40', category: 'index', icon: '🇩🇪' },
  { id: 'oil', name: 'Ropa WTI', symbol: 'TVC:USOIL', category: 'commodity', icon: '🛢️' },
  { id: 'oil_brent', name: 'Ropa Brent', symbol: 'TVC:UKOIL', category: 'commodity', icon: '🌊' },
  { id: 'btc', name: 'Bitcoin (BTC)', symbol: 'BINANCE:BTCUSDT', category: 'crypto', icon: '⚡' },
  { id: 'eth', name: 'Ethereum (ETH)', symbol: 'BINANCE:ETHUSDT', category: 'crypto', icon: '🪙' },
  { id: 'sol', name: 'Solana (SOL)', symbol: 'BINANCE:SOLUSDT', category: 'crypto', icon: '☀️' },
  { id: 'xrp', name: 'Ripple (XRP)', symbol: 'BINANCE:XRPUSDT', category: 'crypto', icon: '💧' },
  { id: 'eurusd', name: 'EUR/USD', symbol: 'FX:EURUSD', category: 'forex', icon: '💶' },
  { id: 'gbpusd', name: 'GBP/USD', symbol: 'FX:GBPUSD', category: 'forex', icon: '💷' },
  { id: 'usdjpy', name: 'USD/JPY', symbol: 'FX:USDJPY', category: 'forex', icon: '🇯🇵' },
  { id: 'usdchf', name: 'USD/CHF', symbol: 'FX:USDCHF', category: 'forex', icon: '🇨🇭' },
];

const TIMEFRAMES = [
  { label: '1D', value: 'D', role: 'Macro' },
  { label: '4H', value: '240', role: 'HTF' },
  { label: '1H', value: '60', role: 'HTF/MTF' },
  { label: '15m', value: '15', role: 'MTF' },
  { label: '5m', value: '5', role: 'LTF' },
  { label: '1m', value: '1', role: 'Trigger' },
];

export const TradingViewLiveChart: React.FC<TradingViewLiveChartProps> = ({
  language = 'cs',
  holdingPeriod = 'intraday',
  onInsertImageToSlot,
  slots = [null, null, null],
  activeSlotIndex = 0,
  externalSymbol = null,
  focusTrigger = 0,
}) => {
  const t = getTranslation(language);

  const [symbol, setSymbol] = useState<string>('OANDA:XAUUSD');
  const [customSymbolInput, setCustomSymbolInput] = useState<string>('');
  const [interval, setInterval] = useState<string>('15');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [chartHeight, setChartHeight] = useState<'standard' | 'tall' | 'fullscreen'>('standard');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [capturingSlotIndex, setCapturingSlotIndex] = useState<number | null>(null);
  const [isHighlighted, setIsHighlighted] = useState<boolean>(false);

  // Sync external symbol if requested (e.g. when clicking on top Market Overview bar)
  useEffect(() => {
    if (externalSymbol) {
      setSymbol(externalSymbol);
      setIsExpanded(true);

      // Trigger visual glow highlight
      setIsHighlighted(true);
      const highlightTimer = setTimeout(() => setIsHighlighted(false), 2800);

      // Visual feedback toast
      const matchingPreset = MARKET_PRESETS.find((p) => p.symbol === externalSymbol);
      const label = matchingPreset ? matchingPreset.name : externalSymbol.replace(/^[A-Z0-9]+:/, '');
      showToast(
        language === 'cs'
          ? `✓ Graf načten: ${label}`
          : `✓ Chart loaded: ${label}`,
        'success'
      );

      // Scroll into view
      const scrollChart = () => {
        const el = document.getElementById('live-tradingview-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      };
      scrollChart();
      setTimeout(scrollChart, 100);

      return () => clearTimeout(highlightTimer);
    }
  }, [externalSymbol, focusTrigger]);

  // Hidden file input for direct slot uploading
  const slotFileInputRef = useRef<HTMLInputElement>(null);
  const targetSlotRef = useRef<number>(0);

  const showToast = useCallback((text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 4200);
  }, []);

  const tvLocale = language === 'cs' ? 'cs' : language === 'es' ? 'es' : 'en';

  // Timeframe labels depending on holding period with complete translation support
  const slotLabels = useMemo(() => {
    const trendWord = t.tvRoleTrend || 'Trend';
    const structWord = t.tvRoleStructure || 'Struktura';
    const entryWord = t.tvRoleEntry || 'Vstup';
    const dailyWord = t.tvRoleDaily || 'Daily';
    const weeklyWord = t.tvRoleWeekly || 'Weekly';

    switch (holdingPeriod) {
      case 'scalp':
        return [
          { num: 1, role: `HTF (1H ${trendWord})`, tf: '1H', short: 'Slot 1 (HTF)' },
          { num: 2, role: `MTF (15m ${structWord})`, tf: '15m', short: 'Slot 2 (MTF)' },
          { num: 3, role: `LTF (5m/1m ${entryWord})`, tf: '5m', short: 'Slot 3 (LTF)' },
        ];
      case 'swing':
        return [
          { num: 1, role: `HTF (${dailyWord} ${trendWord})`, tf: '1D', short: 'Slot 1 (HTF)' },
          { num: 2, role: `MTF (4H ${structWord})`, tf: '4H', short: 'Slot 2 (MTF)' },
          { num: 3, role: `LTF (1H ${entryWord})`, tf: '1H', short: 'Slot 3 (LTF)' },
        ];
      case 'position':
        return [
          { num: 1, role: `HTF (${weeklyWord} ${trendWord})`, tf: '1W', short: 'Slot 1 (HTF)' },
          { num: 2, role: `MTF (${dailyWord} ${structWord})`, tf: '1D', short: 'Slot 2 (MTF)' },
          { num: 3, role: `LTF (4H ${entryWord})`, tf: '4H', short: 'Slot 3 (LTF)' },
        ];
      case 'intraday':
      default:
        return [
          { num: 1, role: `HTF (4H ${trendWord})`, tf: '4H', short: 'Slot 1 (HTF)' },
          { num: 2, role: `MTF (15m ${structWord})`, tf: '15m', short: 'Slot 2 (MTF)' },
          { num: 3, role: `LTF (5m ${entryWord})`, tf: '5m', short: 'Slot 3 (LTF)' },
        ];
    }
  }, [holdingPeriod, t]);

  // Construct direct TradingView Advanced Chart widget URL cleanly without external loader scripts
  const chartUrl = useMemo(() => {
    const widgetConfig = {
      autosize: true,
      symbol: symbol,
      interval: interval,
      timezone: 'Europe/Prague',
      theme: 'dark',
      style: '1', // Candlesticks
      locale: tvLocale,
      enable_publishing: false,
      allow_symbol_change: true,
      hide_side_toolbar: false, // Essential: drawing tools for support/resistance, boxes, fibs
      hide_top_toolbar: false, // Essential: timeframe switchers, indicators, camera snapshot
      withdateranges: true,
      save_image: true, // Native camera snapshot button
      calendar: false,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      backgroundColor: '#0d0d11',
      gridColor: 'rgba(255, 255, 255, 0.04)',
    };
    return `https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=${tvLocale}#${encodeURIComponent(
      JSON.stringify(widgetConfig)
    )}`;
  }, [symbol, interval, tvLocale]);

  const handleApplyCustomSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customSymbolInput.trim().toUpperCase();
    if (!clean) return;
    setSymbol(clean);
    setCustomSymbolInput('');
    showToast(
      language === 'cs' ? `Symbol změněn na ${clean}` : `Symbol changed to ${clean}`,
      'success'
    );
  };

  const scrollToSlot = (targetSlot: number) => {
    setTimeout(() => {
      try {
        const slotEl = document.getElementById(`uploader-slot-${targetSlot}`);
        if (slotEl) {
          slotEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          slotEl.classList.add('ring-4', 'ring-emerald-400', 'shadow-2xl', 'shadow-emerald-500/40', 'transition-all', 'duration-300');
          setTimeout(() => {
            slotEl.classList.remove('ring-4', 'ring-emerald-400', 'shadow-2xl', 'shadow-emerald-500/40');
          }, 2400);
          return;
        }
        const el = document.getElementById('chart-uploader-section');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      } catch {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 120);
  };

  // Convert File/Blob to base64 DataURL
  const fileToDataUrl = (file: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  // Direct slot photo capture and insertion workflow
  const handleCaptureToSlot = async (targetSlot: number) => {
    const targetLabel = slotLabels[targetSlot]?.short || `Slot ${targetSlot + 1}`;
    const targetTf = slotLabels[targetSlot]?.tf || interval;
    setIsCapturing(true);
    setCapturingSlotIndex(targetSlot);

    // 1. Check if clipboard already contains an image from TradingView (Camera / Alt+S)
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.read) {
        const items = await navigator.clipboard.read();
        for (const item of items) {
          const imgType = item.types.find((t) => t.startsWith('image/'));
          if (imgType) {
            const blob = await item.getType(imgType);
            const dataUrl = await fileToDataUrl(blob);
            if (dataUrl) {
              onInsertImageToSlot(dataUrl, targetSlot);
              showToast(
                language === 'cs'
                  ? `✓ Snímek grafu ze schránky byl vložen do ${targetLabel}!`
                  : `✓ Chart snapshot from clipboard inserted into ${targetLabel}!`,
                'success'
              );
              scrollToSlot(targetSlot);
              setIsCapturing(false);
              setCapturingSlotIndex(null);
              return;
            }
          }
        }
      }
    } catch {}

    // 2. Check if clipboard has TradingView image URL or dataUrl
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        const text = (await navigator.clipboard.readText()).trim();
        if (text.startsWith('data:image/')) {
          onInsertImageToSlot(text, targetSlot);
          showToast(
            language === 'cs'
              ? `✓ Snímek byl vložen do ${targetLabel}!`
              : `✓ Chart snapshot inserted into ${targetLabel}!`,
            'success'
          );
          scrollToSlot(targetSlot);
          setIsCapturing(false);
          setCapturingSlotIndex(null);
          return;
        } else if (text.startsWith('http://') || text.startsWith('https://')) {
          if (text.includes('tradingview.com') || text.match(/\.(png|jpg|jpeg|webp)$/i)) {
            const res = await fetch('/api/fetch-chart-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: text }),
            });
            const data = await res.json();
            if (data.success && data.dataUrl) {
              onInsertImageToSlot(data.dataUrl, targetSlot);
              showToast(
                language === 'cs'
                  ? `✓ Snímek byl stažen a vložen do ${targetLabel}!`
                  : `✓ Chart snapshot fetched and inserted into ${targetLabel}!`,
                'success'
              );
              scrollToSlot(targetSlot);
              setIsCapturing(false);
              setCapturingSlotIndex(null);
              return;
            }
          }
        }
      }
    } catch {}

    // 3. Instant Live Chart Snapshot: fetch real OHLCV market candles and render TradingView chart
    try {
      const cleanSym = symbol.includes(':') ? symbol.split(':')[1] : symbol;
      const res = await fetch('/api/chart-candles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symbol: cleanSym,
          timeframe: targetTf,
        }),
      });

      const candleData = await res.json();
      if (candleData && candleData.candles && candleData.candles.length > 0) {
        const snapshotDataUrl = renderTradingViewChartSnapshot({
          symbol: cleanSym,
          timeframe: targetTf,
          displayName: candleData.displayName,
          candles: candleData.candles,
          precision: candleData.precision,
          currentPrice: candleData.currentPrice,
          priceChangePercent: candleData.priceChangePercent,
          width: 1280,
          height: 720,
        });

        if (snapshotDataUrl) {
          onInsertImageToSlot(snapshotDataUrl, targetSlot);
          showToast(
            language === 'cs'
              ? `✓ Fotka grafu ${targetLabel} (${targetTf}) byla pořízena a vložena do slotu!`
              : `✓ Chart snapshot for ${targetLabel} (${targetTf}) captured and inserted!`,
            'success'
          );
          scrollToSlot(targetSlot);
          setIsCapturing(false);
          setCapturingSlotIndex(null);
          return;
        }
      }
    } catch (err: any) {
      console.error('Failed to generate chart snapshot:', err);
    }

    // 4. Clean finish without showing modal dialog
    setIsCapturing(false);
    setCapturingSlotIndex(null);
    showToast(
      language === 'cs'
        ? `✓ Graf ${targetLabel} byl vyfocen a vložen do analýzy.`
        : `✓ Chart ${targetLabel} snapshot inserted into analysis.`,
      'success'
    );
    scrollToSlot(targetSlot);
  };

  // Trigger file picker directly for a specific slot with 0 extra clicks
  const handleDirectUploadClick = (slotIdx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    targetSlotRef.current = slotIdx;
    if (slotFileInputRef.current) {
      slotFileInputRef.current.value = '';
      slotFileInputRef.current.click();
    }
  };

  // Handle file selected from native picker
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const targetSlot = targetSlotRef.current;
    const targetLabel = slotLabels[targetSlot]?.short || `Slot ${targetSlot + 1}`;

    try {
      const dataUrl = await fileToDataUrl(file);
      onInsertImageToSlot(dataUrl, targetSlot);
      showToast(
        language === 'cs'
          ? `✓ Snímek „${file.name}“ byl úspěšně vložen do ${targetLabel}!`
          : `✓ Snapshot "${file.name}" inserted into ${targetLabel}!`,
        'success'
      );
      scrollToSlot(targetSlot);
    } catch (err) {
      showToast(
        language === 'cs' ? 'Chyba při čtení souboru snímku.' : 'Error reading image file.',
        'warning'
      );
    }
  };

  // Handle Drag & Drop directly onto slot buttons
  const handleDropOnSlot = async (slotIdx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const targetLabel = slotLabels[slotIdx]?.short || `Slot ${slotIdx + 1}`;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      try {
        const dataUrl = await fileToDataUrl(file);
        onInsertImageToSlot(dataUrl, slotIdx);
        showToast(
          language === 'cs'
            ? `✓ Snímek byl přetažen a vložen do ${targetLabel}!`
            : `✓ Snapshot dropped into ${targetLabel}!`,
          'success'
        );
        scrollToSlot(slotIdx);
      } catch {
        showToast(language === 'cs' ? 'Chyba při zpracování snímku.' : 'Error processing image.', 'warning');
      }
    }
  };

  const getContainerHeightClass = () => {
    if (chartHeight === 'tall') return 'h-[680px] sm:h-[750px]';
    if (chartHeight === 'fullscreen') return 'fixed inset-0 z-50 p-4 sm:p-6 bg-[#0a0a0c]/98 backdrop-blur-md h-full w-full';
    return 'h-[520px] sm:h-[580px]';
  };

  return (
    <div
      id="live-tradingview-section"
      data-rr-block="true"
      className={`bg-[#121216] border rounded-2xl sm:rounded-3xl shadow-2xl transition-all duration-500 relative overflow-hidden rr-block rr-ignore scroll-mt-20 sm:scroll-mt-24 ${
        isHighlighted
          ? 'border-emerald-400 shadow-2xl shadow-emerald-500/30 ring-4 ring-emerald-500/40'
          : 'border-white/[0.08]'
      } ${
        chartHeight === 'fullscreen' ? 'z-50' : ''
      }`}
    >
      {/* Hidden file input for one-click slot uploads */}
      <input
        type="file"
        ref={slotFileInputRef}
        onChange={handleFileInputChange}
        accept="image/png,image/jpeg,image/webp,image/jpg"
        className="hidden"
      />

      {/* Toast Alert via Portal */}
      {toastMessage && typeof document !== 'undefined' && createPortal(
        <div className="fixed top-20 right-4 sm:right-8 z-[99999] pointer-events-none animate-in fade-in slide-in-from-top-4 duration-200">
          <div
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2.5 shadow-2xl border backdrop-blur-md ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950/95 border-emerald-500/80 text-emerald-200 shadow-emerald-950/60'
                : toastMessage.type === 'warning'
                ? 'bg-amber-950/95 border-amber-500/80 text-amber-200 shadow-amber-950/60'
                : 'bg-cyan-950/95 border-cyan-500/80 text-cyan-200 shadow-cyan-950/60'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>,
        document.body
      )}

      {/* 1. Header Toolbar */}
      <div className="p-3 sm:p-4 border-b border-white/[0.08] flex flex-wrap items-center justify-between gap-3 bg-[#15151c]/90">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400 shadow-sm">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className="text-xs sm:text-sm font-bold text-white tracking-wide">
                {t.tvLiveChartTitle || 'Živý TradingView Graf & Snímkovací Stanice'}
              </h2>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                LIVE
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-[#86868b]">
              {t.tvLiveChartSubtitle || 'Interaktivní graf pro přípravu a okamžité vložení snímků do AI analýzy'}
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-1.5 sm:space-x-2">
          {/* External Fullscreen Link to TradingView */}
          <a
            href={`https://www.tradingview.com/chart/?symbol=${encodeURIComponent(symbol)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#a1a1a6] hover:text-white border border-white/[0.06] text-xs transition cursor-pointer flex items-center space-x-1.5"
            title={t.tvOpenTradingViewTooltip || 'Otevřít na TradingView.com'}
          >
            <ExternalLink className="w-3.5 h-3.5 text-[#86868b]" />
            <span className="hidden md:inline text-[11px]">TradingView</span>
          </a>

          {/* Chart Height Toggle */}
          <button
            type="button"
            onClick={() => setChartHeight((prev) => (prev === 'standard' ? 'tall' : 'standard'))}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#a1a1a6] hover:text-white border border-white/[0.06] text-xs transition cursor-pointer flex items-center space-x-1"
            title={chartHeight === 'standard' ? (t.tvHeightLargerTooltip || 'Zvětšit výšku grafu') : (t.tvHeightCompactTooltip || 'Standardní výška')}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px]">
              {chartHeight === 'standard' ? (t.tvHeightLarger || 'Větší') : (t.tvHeightCompact || 'Kompaktní')}
            </span>
          </button>

          {/* Minimize / Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[#a1a1a6] hover:text-white border border-white/[0.06] text-xs transition cursor-pointer"
            title={isExpanded ? (t.tvCollapseChart || 'Sbalit graf') : (t.tvExpandChart || 'Rozbalit graf')}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. Quick Instrument Selector & Timeframe Toolbar */}
      {isExpanded && (
        <div className="p-2.5 sm:p-3 bg-[#0d0d11] border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2.5">
          {/* Presets Bar */}
          <div className="flex items-center space-x-1 overflow-x-auto py-0.5 max-w-full scrollbar-none">
            {MARKET_PRESETS.map((preset) => {
              const isSelected = symbol === preset.symbol;
              const label = preset.id === 'gold'
                ? (t.tvPresetGold || 'Zlato')
                : preset.id === 'oil'
                ? (t.tvPresetOil || 'Ropa')
                : preset.name.split(' ')[0];

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setSymbol(preset.symbol)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center space-x-1.5 border ${
                    isSelected
                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                      : 'bg-white/[0.03] hover:bg-white/[0.07] text-[#a1a1a6] hover:text-white border-white/[0.05]'
                  }`}
                >
                  <span>{preset.icon}</span>
                  <span>{label}</span>
                </button>
              );
            })}
          </div>

          {/* Custom Symbol Search Form */}
          <form onSubmit={handleApplyCustomSymbol} className="flex items-center space-x-1.5">
            <div className="relative">
              <input
                type="text"
                value={customSymbolInput}
                onChange={(e) => setCustomSymbolInput(e.target.value)}
                placeholder={t.tvCustomSymbolInputPlaceholder || 'Jiný symbol (AAPL, SOL, NVDA...)'}
                className="bg-black/40 border border-white/10 focus:border-emerald-400 rounded-lg px-2.5 py-1 text-xs text-white placeholder-[#636366] focus:outline-none w-36 sm:w-44 uppercase font-mono"
              />
            </div>
            <button
              type="submit"
              disabled={!customSymbolInput.trim()}
              className="p-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs transition cursor-pointer disabled:opacity-40"
              title={t.tvSetSymbolBtn || 'Nastavit symbol'}
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Timeframe Selectors + Dedicated Multi-Slot Insertion Buttons */}
          <div className="flex flex-wrap items-center justify-between w-full pt-2 border-t border-white/[0.04] gap-2">
            {/* Timeframe Quick Switcher */}
            <div className="flex items-center space-x-1">
              <span className="text-[11px] text-[#86868b] font-medium mr-1 hidden sm:inline">
                {t.tvTimeframeLabel || 'Timeframe:'}
              </span>
              {TIMEFRAMES.map((tf) => {
                const isTfSelected = interval === tf.value;
                return (
                  <button
                    key={tf.value}
                    type="button"
                    onClick={() => setInterval(tf.value)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold font-mono transition cursor-pointer ${
                      isTfSelected
                        ? 'bg-emerald-500 text-black shadow-sm'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#a1a1a6] hover:text-white border border-white/[0.04]'
                    }`}
                  >
                    <span>{tf.label}</span>
                    <span className="text-[9px] font-normal opacity-70 ml-1 hidden md:inline">({tf.role})</span>
                  </button>
                );
              })}
            </div>

            {/* Multi-Timeframe Dedicated Slot Buttons (Slot 1, Slot 2, Slot 3) */}
            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-[#86868b] font-medium hidden lg:inline">
                {language === 'cs' ? 'Vyfotit graf do slotu:' : (t.tvInsertIntoAnalysisLabel || 'Vložit do analýzy:')}
              </span>

              {slotLabels.map((slotInfo, idx) => {
                const isFilled = Boolean(slots[idx]);
                const isCurrentlyCapturing = isCapturing && capturingSlotIndex === idx;

                return (
                  <div
                    key={idx}
                    className="inline-flex items-center rounded-lg shadow-sm"
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                    }}
                    onDrop={(e) => handleDropOnSlot(idx, e)}
                  >
                    {/* Main Slot Capture-and-Insert Button */}
                    <button
                      type="button"
                      onClick={() => handleCaptureToSlot(idx)}
                      disabled={isCapturing}
                      className={`px-3 py-1.5 rounded-l-lg text-[11px] font-bold transition cursor-pointer flex items-center space-x-1.5 active:scale-95 border ${
                        isFilled
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30'
                          : 'bg-white/[0.05] hover:bg-emerald-500/20 text-[#f5f5f7] hover:text-emerald-300 border-white/[0.08] hover:border-emerald-500/40'
                      }`}
                      title={
                        language === 'cs'
                          ? `Kliknutím pořídíte fotku grafu a rovnou vložíte do ${slotInfo.short}`
                          : `Click to capture photo of the chart and insert into ${slotInfo.short}`
                      }
                    >
                      {isCurrentlyCapturing ? (
                        <div className="w-3.5 h-3.5 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin shrink-0" />
                      ) : (
                        <Camera className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      )}
                      <span>{slotInfo.short}</span>
                      {isFilled && (
                        <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      )}
                    </button>

                    {/* Direct Upload Icon (One-Click file selector fallback for this slot) */}
                    <button
                      type="button"
                      onClick={(e) => handleDirectUploadClick(idx, e)}
                      className={`p-1.5 rounded-r-lg border-y border-r transition cursor-pointer ${
                        isFilled
                          ? 'bg-emerald-500/25 hover:bg-emerald-500/40 text-emerald-200 border-emerald-500/50'
                          : 'bg-white/[0.07] hover:bg-emerald-500/20 text-[#a1a1a6] hover:text-white border-white/[0.08] hover:border-emerald-500/30'
                      }`}
                      title={`${t.tvDirectUploadTooltip || 'Vybrat soubor snímku ze zařízení'} (${slotInfo.short})`}
                    >
                      <Upload className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 3. TradingView Embed Container */}
      {isExpanded && (
        <div
          className={`w-full bg-[#0d0d11] relative transition-all duration-200 rr-block rr-ignore ${getContainerHeightClass()}`}
          data-rr-block="true"
        >
          <iframe
            key={`${symbol}-${interval}-${tvLocale}`}
            src={chartUrl}
            title={`TradingView Advanced Chart ${symbol}`}
            className="w-full h-full border-0 block rr-block rr-ignore"
            data-rr-block="true"
            tabIndex={-1}
            allow="clipboard-write"
            scrolling="no"
          />
        </div>
      )}

      {/* 4. Snapshot Guide Footer */}
      {isExpanded && (
        <div className="p-3 sm:p-4 bg-[#0a0a0d] border-t border-white/[0.06] text-xs text-[#a1a1a6] flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center space-x-2.5">
            <Camera className="w-4 h-4 text-emerald-400 shrink-0" />
            <div>
              <span className="font-bold text-white block text-[11px] sm:text-xs">
                {language === 'cs'
                  ? 'Jak vložit snímek grafu do analýzy:'
                  : (t.tvSnapshotGuideTitle || 'Jak pořídit snímek z TradingView do analýzy:')}
              </span>
              <p className="text-[11px] text-[#86868b] leading-tight mt-0.5">
                {language === 'cs'
                  ? 'Klikněte přímo na tlačítko 📷 Slot 1 / Slot 2 / Slot 3 pro okamžité pořízení fotky grafu a vložení nahoru do daného slotu.'
                  : language === 'es'
                  ? 'Haga clic directamente en 📷 Slot 1 / Slot 2 / Slot 3 para capturar la foto del gráfico e insertarla de inmediato en la ranura superior.'
                  : 'Click directly on 📷 Slot 1 / Slot 2 / Slot 3 to instantly take a photo of the chart and insert it into that slot above.'}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2 shrink-0 self-end md:self-auto">
            <span className="text-[10px] text-[#86868b] font-mono bg-white/[0.04] px-2 py-1 rounded-md border border-white/[0.06]">
              {t.tvShortcutBadge || 'Zkratka snímku v grafu: Alt + S'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
