import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
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

interface TradingViewLiveChartProps {
  language?: LanguageOption;
  holdingPeriod?: HoldingPeriod;
  onInsertImageToSlot: (dataUrl: string, slotIndex: number) => void;
  slots?: (string | null)[];
  activeSlotIndex?: number | null;
  externalSymbol?: string | null;
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
  { id: 'eurusd', name: 'EUR/USD', symbol: 'FX:EURUSD', category: 'forex', icon: '💶' },
  { id: 'btc', name: 'Bitcoin (BTC)', symbol: 'BINANCE:BTCUSDT', category: 'crypto', icon: '⚡' },
  { id: 'nasdaq', name: 'Nasdaq (US100)', symbol: 'CAPITALCOM:US100', category: 'index', icon: '📈' },
  { id: 'sp500', name: 'S&P 500 (US500)', symbol: 'CAPITALCOM:US500', category: 'index', icon: '🏛️' },
  { id: 'gbpusd', name: 'GBP/USD', symbol: 'FX:GBPUSD', category: 'forex', icon: '💷' },
  { id: 'usdjpy', name: 'USD/JPY', symbol: 'FX:USDJPY', category: 'forex', icon: '🇯🇵' },
  { id: 'oil', name: 'Ropa (WTI)', symbol: 'TVC:USOIL', category: 'commodity', icon: '🛢️' },
  { id: 'eth', name: 'Ethereum (ETH)', symbol: 'BINANCE:ETHUSDT', category: 'crypto', icon: '🪙' },
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
}) => {
  const t = getTranslation(language);

  const [symbol, setSymbol] = useState<string>('OANDA:XAUUSD');
  const [customSymbolInput, setCustomSymbolInput] = useState<string>('');
  const [interval, setInterval] = useState<string>('15');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [chartHeight, setChartHeight] = useState<'standard' | 'tall' | 'fullscreen'>('standard');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  // Sync external symbol if requested (e.g. from the top Market Overview bar)
  useEffect(() => {
    if (externalSymbol && externalSymbol !== symbol) {
      setSymbol(externalSymbol);
      setIsExpanded(true);
    }
  }, [externalSymbol]);

  // Quick Insert Modal State
  const [modalSlotIndex, setModalSlotIndex] = useState<number | null>(null);
  const [urlInput, setUrlInput] = useState<string>('');
  const [isLoadingUrl, setIsLoadingUrl] = useState<boolean>(false);
  const [urlError, setUrlError] = useState<string | null>(null);

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

  const scrollToUploader = () => {
    try {
      const el = document.getElementById('chart-uploader-section');
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    } catch {
      // Ignore scroll errors
    }
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

  // Direct slot insertion workflow with intelligent fallbacks
  const handleSlotClick = async (targetSlot: number) => {
    const targetLabel = slotLabels[targetSlot]?.short || `Slot ${targetSlot + 1}`;

    // 1. Try reading binary image directly from system clipboard
    let hasImageInClipboard = false;
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
                  ? `✓ Snímek grafu ze schránky byl úspěšně vložen do ${targetLabel}!`
                  : `✓ Chart snapshot from clipboard inserted into ${targetLabel}!`,
                'success'
              );
              scrollToUploader();
              return;
            }
          }
        }
      }
    } catch (e) {
      // Browser permission might be denied or in an iframe without direct focus
    }

    // 2. Try reading clipboard text (URL or base64)
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        const text = (await navigator.clipboard.readText()).trim();
        if (text.startsWith('data:image/')) {
          onInsertImageToSlot(text, targetSlot);
          showToast(
            language === 'cs'
              ? `✓ Snímek byl úspěšně vložen do ${targetLabel}!`
              : `✓ Chart snapshot inserted into ${targetLabel}!`,
            'success'
          );
          scrollToUploader();
          return;
        } else if (text.startsWith('http://') || text.startsWith('https://')) {
          if (text.includes('tradingview.com') || text.match(/\.(png|jpg|jpeg|webp)$/i)) {
            showToast(
              language === 'cs'
                ? `Načítám snímek z odkazu ve schránce pro ${targetLabel}...`
                : `Fetching chart snapshot from clipboard URL for ${targetLabel}...`,
              'info'
            );
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
                  ? `✓ Snímek byl úspěšně stažen a vložen do ${targetLabel}!`
                  : `✓ Chart snapshot fetched and inserted into ${targetLabel}!`,
                'success'
              );
              scrollToUploader();
              return;
            }
          }
        }
      }
    } catch (e) {
      // Ignored
    }

    // 3. If clipboard was empty or browser blocked clipboard reading:
    // Open the Quick Insert Modal immediately for that slot!
    setModalSlotIndex(targetSlot);
    setUrlInput('');
    setUrlError(null);
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
      setModalSlotIndex(null);
      showToast(
        language === 'cs'
          ? `✓ Snímek „${file.name}“ byl úspěšně vložen do ${targetLabel}!`
          : `✓ Snapshot "${file.name}" inserted into ${targetLabel}!`,
        'success'
      );
      scrollToUploader();
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
        scrollToUploader();
      } catch {
        showToast(language === 'cs' ? 'Chyba při zpracování snímku.' : 'Error processing image.', 'warning');
      }
    }
  };

  // Handle URL fetch submission in the modal
  const handleFetchUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim() || modalSlotIndex === null) return;

    setIsLoadingUrl(true);
    setUrlError(null);

    const targetLabel = slotLabels[modalSlotIndex]?.short || `Slot ${modalSlotIndex + 1}`;

    try {
      const res = await fetch('/api/fetch-chart-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();

      if (data.success && data.dataUrl) {
        onInsertImageToSlot(data.dataUrl, modalSlotIndex);
        const savedSlot = modalSlotIndex;
        setModalSlotIndex(null);
        setUrlInput('');
        showToast(
          language === 'cs'
            ? `✓ Snímek byl úspěšně stažen z odkazu a vložen do ${targetLabel}!`
            : `✓ Snapshot fetched and inserted into ${targetLabel}!`,
          'success'
        );
        scrollToUploader();
      } else {
        setUrlError(
          data.error ||
            (language === 'cs'
              ? 'Nepodařilo se načíst snímek z tohoto odkazu. Ujistěte se, že jde o platný odkaz z TradingView (např. https://www.tradingview.com/x/...).'
              : 'Failed to fetch image from URL. Please ensure it is a valid TradingView snapshot URL.')
        );
      }
    } catch (err: any) {
      setUrlError(err.message || 'Chyba sítě při stahování snímku.');
    } finally {
      setIsLoadingUrl(false);
    }
  };

  // Handle paste in the interactive dropzone inside the modal (works 100% without clipboard permissions)
  const handleModalZonePaste = async (e: React.ClipboardEvent) => {
    if (modalSlotIndex === null) return;
    const targetLabel = slotLabels[modalSlotIndex]?.short || `Slot ${modalSlotIndex + 1}`;

    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const blob = items[i].getAsFile();
          if (blob) {
            const dataUrl = await fileToDataUrl(blob);
            onInsertImageToSlot(dataUrl, modalSlotIndex);
            setModalSlotIndex(null);
            showToast(
              language === 'cs'
                ? `✓ Snímek byl úspěšně vložen do ${targetLabel}!`
                : `✓ Snapshot inserted into ${targetLabel}!`,
              'success'
            );
            scrollToUploader();
            return;
          }
        }
      }
    }

    const text = e.clipboardData?.getData('text');
    if (text) {
      if (text.startsWith('http://') || text.startsWith('https://')) {
        setUrlInput(text.trim());
      }
    }
  };

  // Optional Native Web Screen/Window capture for instant snapshots
  const handleScreenCapture = async (targetSlot: number) => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      showToast(
        language === 'cs'
          ? 'Použijte prosím ikonu Fotoaparátu 📷 nahoře v grafu nebo klávesy Win+Shift+S / Cmd+Shift+4 a poté Ctrl+V.'
          : 'Please use the Camera icon 📷 in the chart or screenshot shortcut, then Ctrl+V.',
        'info'
      );
      return;
    }

    try {
      setIsCapturing(true);
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: 'browser' } as any,
      });

      const video = document.createElement('video');
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);

        // Stop media stream tracks
        stream.getTracks().forEach((t) => t.stop());
        video.srcObject = null;

        if (dataUrl) {
          onInsertImageToSlot(dataUrl, targetSlot);
          const targetLabel = slotLabels[targetSlot]?.short || `Slot ${targetSlot + 1}`;
          showToast(
            language === 'cs'
              ? `✓ Snímek obrazovky vložen do ${targetLabel}!`
              : `✓ Screen capture inserted into ${targetLabel}!`,
            'success'
          );
          scrollToUploader();
        }
      }
    } catch (e: any) {
      // If browser blocked getDisplayMedia due to iframe security policy
      if (e?.name === 'NotAllowedError' || e?.message?.includes('permissions policy')) {
        showToast(
          language === 'cs'
            ? 'V grafu klikněte na ikonu Fotoaparátu 📷 (nebo Alt+S) ➔ „Kopírovat obrázek“, a poté stiskněte tlačítko Slotu.'
            : 'In the chart, click Camera 📷 (or Alt+S) ➔ "Copy chart image", then click the Slot button.',
          'info'
        );
      }
    } finally {
      setIsCapturing(false);
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
      className={`bg-[#121216] border border-white/[0.08] rounded-2xl sm:rounded-3xl shadow-2xl transition-all duration-300 relative overflow-hidden rr-block rr-ignore ${
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

      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-4 sm:right-8 z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div
            className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center space-x-2.5 shadow-2xl border ${
              toastMessage.type === 'success'
                ? 'bg-emerald-950 border-emerald-500/50 text-emerald-200'
                : toastMessage.type === 'warning'
                ? 'bg-amber-950 border-amber-500/50 text-amber-200'
                : 'bg-cyan-950 border-cyan-500/50 text-cyan-200'
            }`}
          >
            {toastMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Quick Insert Modal */}
      {modalSlotIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#15151c] border border-emerald-500/30 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Camera className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>{t.tvModalInsertTitle || 'Vložit snímek grafu do:'}</span>
                    <span className="text-emerald-400 font-mono">
                      {slotLabels[modalSlotIndex]?.short || `Slot ${modalSlotIndex + 1}`}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#86868b]">
                    {slotLabels[modalSlotIndex]?.role || 'Timeframe analýza'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setModalSlotIndex(null)}
                className="p-1.5 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-[#86868b] hover:text-white transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Option 1: File Picker (Direct & 100% Reliable) */}
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => {
                  targetSlotRef.current = modalSlotIndex;
                  slotFileInputRef.current?.click();
                }}
                className="w-full py-3 px-4 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 hover:border-emerald-400 text-emerald-300 font-bold text-xs flex items-center justify-center space-x-2.5 transition cursor-pointer active:scale-98 shadow-sm"
              >
                <Upload className="w-4 h-4" />
                <span>
                  {t.tvModalChooseFile || '📁 Vybrat soubor snímku z počítače'}
                </span>
              </button>
            </div>

            {/* Option 2: Interactive Paste & Drop Zone */}
            <div
              tabIndex={0}
              onPaste={handleModalZonePaste}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const file = e.dataTransfer.files?.[0];
                if (file && file.type.startsWith('image/')) {
                  fileToDataUrl(file).then((dataUrl) => {
                    onInsertImageToSlot(dataUrl, modalSlotIndex);
                    setModalSlotIndex(null);
                    showToast(
                      language === 'cs'
                        ? `✓ Snímek vložen do ${slotLabels[modalSlotIndex]?.short}!`
                        : `✓ Snapshot inserted into ${slotLabels[modalSlotIndex]?.short}!`,
                      'success'
                    );
                    scrollToUploader();
                  });
                }
              }}
              className="border-2 border-dashed border-white/20 hover:border-emerald-500/50 focus:border-emerald-400 bg-black/30 rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center space-y-2 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            >
              <div className="w-10 h-10 rounded-xl bg-white/[0.04] flex items-center justify-center text-emerald-400">
                <Copy className="w-5 h-5" />
              </div>
              <div className="text-xs font-bold text-white">
                {t.tvModalPasteZone || 'Klikněte sem a stiskněte Ctrl + V (nebo ⌘ + V)'}
              </div>
              <p className="text-[11px] text-[#86868b] max-w-xs leading-relaxed">
                {t.tvModalPasteHint || 'Okamžitě převezme zkopírovaný snímek z TradingView (Alt+S) nebo výstřižku Windows (Win+Shift+S).'}
              </p>
            </div>

            {/* Option 3: TradingView Snapshot URL Input */}
            <div className="pt-2 border-t border-white/[0.08] space-y-2">
              <label className="text-[11px] font-medium text-[#a1a1a6] flex items-center gap-1.5">
                <LinkIcon className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {t.tvModalOrUrl || 'Nebo vložte odkaz na graf z TradingView:'}
                </span>
              </label>
              <form onSubmit={handleFetchUrlSubmit} className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => {
                    setUrlInput(e.target.value);
                    setUrlError(null);
                  }}
                  placeholder="https://www.tradingview.com/x/..."
                  className="flex-1 bg-black/40 border border-white/10 focus:border-emerald-400 rounded-xl px-3 py-2 text-xs text-white placeholder-[#52525b] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={isLoadingUrl || !urlInput.trim()}
                  className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs transition cursor-pointer flex items-center gap-1.5 shrink-0"
                >
                  {isLoadingUrl ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>{t.tvModalFetching || 'Stahuji...'}</span>
                    </>
                  ) : (
                    <span>{t.tvModalFetchBtn || 'Stáhnout'}</span>
                  )}
                </button>
              </form>
              {urlError && (
                <div className="text-[11px] text-red-400 flex items-center gap-1 mt-1">
                  <AlertCircle className="w-3 h-3 shrink-0" />
                  <span>{urlError}</span>
                </div>
              )}
            </div>

            {/* Helpful TradingView Tips */}
            <div className="p-3 bg-white/[0.03] rounded-xl border border-white/[0.06] text-[11px] text-[#86868b] space-y-1">
              <div className="font-semibold text-white flex items-center gap-1.5">
                <Info className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.tvModalHowTo || 'Jak vyfotit graf v TradingView:'}</span>
              </div>
              <p>
                {t.tvModalHowTo1 || '1. V pravém horním rohu grafu klikněte na ikonu Fotoaparátu 📷 (nebo klávesu Alt + S).'}
              </p>
              <p>
                {t.tvModalHowTo2 || '2. Zvolte „Kopírovat obrázek grafu“ nebo „Kopírovat odkaz na obrázek grafu“.'}
              </p>
            </div>
          </div>
        </div>
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
                {t.tvInsertIntoAnalysisLabel || 'Vložit do analýzy:'}
              </span>

              {slotLabels.map((slotInfo, idx) => {
                const isFilled = Boolean(slots[idx]);
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
                    {/* Main Slot Insertion Button */}
                    <button
                      type="button"
                      onClick={() => handleSlotClick(idx)}
                      className={`px-2.5 py-1 rounded-l-lg text-[11px] font-bold transition cursor-pointer flex items-center space-x-1.5 active:scale-95 border ${
                        isFilled
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30'
                          : 'bg-white/[0.05] hover:bg-emerald-500/15 text-[#f5f5f7] hover:text-emerald-300 border-white/[0.08] hover:border-emerald-500/30'
                      }`}
                      title={
                        isFilled
                          ? (t.tvSlotFilledTooltip || `${slotInfo.short} je obsazen. Klikněte pro nahrazení nebo vložení nového snímku.`)
                          : (t.tvSlotEmptyTooltip || `Klikněte pro vložení snímku ze schránky nebo otevření nabídky pro ${slotInfo.short}`)
                      }
                    >
                      {isFilled ? (
                        <Check className="w-3 h-3 text-emerald-400" />
                      ) : (
                        <Plus className="w-3 h-3 text-emerald-400" />
                      )}
                      <span>{slotInfo.short}</span>
                    </button>

                    {/* Direct Upload Icon (One-Click file selector for this slot) */}
                    <button
                      type="button"
                      onClick={(e) => handleDirectUploadClick(idx, e)}
                      className={`p-1 rounded-r-lg border-y border-r transition cursor-pointer ${
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

              {/* Native Screen Capture button */}
              <button
                type="button"
                onClick={() => handleScreenCapture(activeSlotIndex ?? 0)}
                disabled={isCapturing}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-500/30 text-[11px] font-bold transition cursor-pointer flex items-center space-x-1 active:scale-95 shrink-0"
                title={t.tvScreenCaptureTooltip || t.tvScreenCaptureBtn || 'Pořídit snímek výřezu obrazovky'}
              >
                <Camera className="w-3 h-3 text-emerald-400" />
                <span className="hidden sm:inline">{t.tvScreenCaptureBtn || 'Snímek'}</span>
              </button>
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
                {t.tvSnapshotGuideTitle || 'Jak pořídit snímek z TradingView do analýzy:'}
              </span>
              <p className="text-[11px] text-[#86868b] leading-tight mt-0.5">
                {language === 'cs'
                  ? '1. V grafu nahoře klikněte na ikonu Fotoaparátu 📷 (nebo Alt+S) ➔ 2. Zvolte „Zkopírovat obrázek grafu“ nebo „Kopírovat odkaz“ ➔ 3. Klikněte na tlačítko Slot 1, Slot 2 nebo Slot 3 nahoře.'
                  : language === 'es'
                  ? '1. En el gráfico arriba haga clic en la Cámara 📷 (o Alt+S) ➔ 2. Elija "Copiar imagen del gráfico" o "Copiar enlace" ➔ 3. Haga clic en Ranura 1, Ranura 2 o Ranura 3 arriba.'
                  : '1. In chart header, click Camera 📷 (or Alt+S) ➔ 2. Choose "Copy chart image" or "Copy link" ➔ 3. Click Slot 1, Slot 2 or Slot 3 above.'}
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
