import React, { useRef, useEffect, useState, useCallback } from 'react';
import {
  Upload,
  Camera,
  Trash2,
  Sparkles,
  Layers,
  HelpCircle,
  Clock,
  Compass,
  ChevronDown,
  ChevronUp,
  Zap,
  TrendingUp,
  Waves,
  Globe,
  Sliders,
  CheckCircle2,
  AlertCircle,
  Plus,
  Command,
  Check,
  RotateCcw,
  X,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Minimize2,
  ChevronLeft,
  ChevronRight,
  Eye,
} from 'lucide-react';
import { LanguageOption, HoldingPeriod, AppTheme } from '../types';
import { getTranslation } from '../utils/translations';
import { convertSvgToPng } from '../utils/sampleChart';

interface ChartUploaderProps {
  images: (string | null)[];
  onImagesChange: (images: (string | null)[]) => void;
  onAnalyze: () => void;
  isLoading: boolean;
  onResetAnalysis?: () => void;
  hasAnalysisResult?: boolean;
  language?: LanguageOption;
  holdingPeriod?: HoldingPeriod;
  onOpenSettings?: () => void;
  theme?: AppTheme;
}

export const ChartUploader: React.FC<ChartUploaderProps> = ({
  images,
  onImagesChange,
  onAnalyze,
  isLoading,
  onResetAnalysis,
  hasAnalysisResult = false,
  language = 'cs',
  holdingPeriod = 'intraday',
  onOpenSettings,
  theme = 'light',
}) => {
  const isLight = theme === 'light';
  const t = getTranslation(language as LanguageOption);
  const [showGuide, setShowGuide] = useState(false);
  const [showConfirmResetModal, setShowConfirmResetModal] = useState(false);
  const [activeSlotIndex, setActiveSlotIndex] = useState<number | null>(null);
  const [previewSlotIndex, setPreviewSlotIndex] = useState<number | null>(null);
  const [isZoomScaleToggled, setIsZoomScaleToggled] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [isMac, setIsMac] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const targetSlotRef = useRef<number | null>(null);

  // Detect platform for keyboard shortcut display (Mac vs Windows/Linux)
  useEffect(() => {
    if (typeof navigator !== 'undefined') {
      setIsMac(/(Mac|iPhone|iPod|iPad)/i.test(navigator.platform || navigator.userAgent));
    }
  }, []);

  // Timeframe Slot Definitions based on Holding Period and Language
  const getSlotDefinitions = (lang: LanguageOption) => ({
    scalp: {
      periodTitle: t.scalpStyleTitle,
      icon: Zap,
      accent: 'amber',
      slots: [
        {
          step: '01',
          tf: '1H',
          role: lang === 'cs' ? 'Vyšší Timeframe' : lang === 'es' ? 'Temporalidad Mayor' : 'Higher Timeframe',
          desc: lang === 'cs' ? 'HTF Trend & Hlavní S/R úrovně' : lang === 'es' ? 'Tendencia HTF y Niveles S/R Clave' : 'HTF Trend & Key S/R Levels',
        },
        {
          step: '02',
          tf: '15m',
          role: lang === 'cs' ? 'Tržní Struktura' : lang === 'es' ? 'Estructura de Mercado' : 'Market Structure',
          desc: lang === 'cs' ? 'MTF Struktura & FVG zóny' : lang === 'es' ? 'Estructura MTF y Zonas FVG' : 'MTF Structure & FVG Zones',
        },
        {
          step: '03',
          tf: '5m / 1m',
          role: lang === 'cs' ? 'Vstup & Trigger' : lang === 'es' ? 'Entrada y Disparador' : 'Entry & Trigger',
          desc: lang === 'cs' ? 'LTF Vstupní trigger & CHoCH' : lang === 'es' ? 'Disparador LTF y CHoCH' : 'LTF Entry Trigger & CHoCH',
        },
      ],
    },
    intraday: {
      periodTitle: t.intradayStyleTitle,
      icon: TrendingUp,
      accent: 'emerald',
      slots: [
        {
          step: '01',
          tf: '4H',
          role: lang === 'cs' ? 'Vyšší Timeframe' : lang === 'es' ? 'Temporalidad Mayor' : 'Higher Timeframe',
          desc: lang === 'cs' ? 'HTF Kontext & Hlavní likvidita' : lang === 'es' ? 'Contexto HTF y Liquidez Principal' : 'HTF Context & Key Liquidity',
        },
        {
          step: '02',
          tf: '15m',
          role: lang === 'cs' ? 'Tržní Struktura' : lang === 'es' ? 'Estructura de Mercado' : 'Market Structure',
          desc: lang === 'cs' ? 'MTF Struktura trhu & BOS zóny' : lang === 'es' ? 'Estructura MTF y Zonas BOS' : 'MTF Market Structure & BOS Zones',
        },
        {
          step: '03',
          tf: '5m',
          role: lang === 'cs' ? 'Vstup & Trigger' : lang === 'es' ? 'Entrada y Disparador' : 'Entry & Trigger',
          desc: lang === 'cs' ? 'LTF Exekuce & Přesný vstup' : lang === 'es' ? 'Ejecución LTF y Entrada Precisa' : 'LTF Execution & Precise Entry',
        },
      ],
    },
    swing: {
      periodTitle: t.swingStyleTitle,
      icon: Waves,
      accent: 'purple',
      slots: [
        {
          step: '01',
          tf: 'Daily (1D)',
          role: lang === 'cs' ? 'Makro Kontext' : lang === 'es' ? 'Contexto Macro' : 'Macro Context',
          desc: lang === 'cs' ? 'Makro trend & Denní likvidita' : lang === 'es' ? 'Tendencia Macro y Liquidez Diaria' : 'Macro Trend & Daily Liquidity',
        },
        {
          step: '02',
          tf: '4H',
          role: lang === 'cs' ? 'Tržní Struktura' : lang === 'es' ? 'Estructura de Mercado' : 'Market Structure',
          desc: lang === 'cs' ? 'Struktura trhu & S&D zóny' : lang === 'es' ? 'Estructura de Mercado y Zonas S&D' : 'Market Structure & S&D Zones',
        },
        {
          step: '03',
          tf: '1H / 15m',
          role: lang === 'cs' ? 'Vstup & Trigger' : lang === 'es' ? 'Entrada y Disparador' : 'Entry & Trigger',
          desc: lang === 'cs' ? 'Lokální reakce & Potvrzení' : lang === 'es' ? 'Reacción Local y Confirmación' : 'Local Reaction & Confirmation',
        },
      ],
    },
    position: {
      periodTitle: t.positionStyleTitle,
      icon: Globe,
      accent: 'cyan',
      slots: [
        {
          step: '01',
          tf: 'Weekly (1W)',
          role: lang === 'cs' ? 'Makro Cyklus' : lang === 'es' ? 'Ciclo Macro' : 'Macro Cycle',
          desc: lang === 'cs' ? 'Týdenní cykly & Makro POI' : lang === 'es' ? 'Ciclos Semanales y POI Macro' : 'Weekly Cycles & Macro POI',
        },
        {
          step: '02',
          tf: 'Daily (1D)',
          role: lang === 'cs' ? 'Fáze Trhu' : lang === 'es' ? 'Fase de Mercado' : 'Market Phase',
          desc: lang === 'cs' ? 'Fáze trhu & Akumulace/Distribuce' : lang === 'es' ? 'Fase de Mercado y Acumulación/Distribución' : 'Market Phase & Accumulation/Distribution',
        },
        {
          step: '03',
          tf: '4H',
          role: lang === 'cs' ? 'Vstup do Pozice' : lang === 'es' ? 'Entrada en Posición' : 'Position Entry',
          desc: lang === 'cs' ? 'Vstupní timing & Risk control' : lang === 'es' ? 'Timing de Posición y Control de Riesgo' : 'Position Timing & Risk Control',
        },
      ],
    },
  });

  const slotDefinitions = getSlotDefinitions(language);
  const currentConfig = slotDefinitions[holdingPeriod] || slotDefinitions.intraday;
  const HoldingIcon = currentConfig.icon;
  const MAX_IMAGES = 3;

  // Normalized 3-slot array representations
  const currentSlots = [images[0] || null, images[1] || null, images[2] || null];
  const uploadedCount = currentSlots.filter((img): img is string => Boolean(img)).length;
  const hasAnyImages = uploadedCount > 0;

  // Handle keyboard navigation & escape for the enlarged image preview modal
  useEffect(() => {
    if (previewSlotIndex === null) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewSlotIndex(null);
        setIsZoomScaleToggled(false);
      } else if (e.key === 'ArrowLeft') {
        for (let offset = 1; offset < 3; offset++) {
          const candidate = (previewSlotIndex - offset + 3) % 3;
          if (currentSlots[candidate]) {
            setPreviewSlotIndex(candidate);
            setIsZoomScaleToggled(false);
            break;
          }
        }
      } else if (e.key === 'ArrowRight') {
        for (let offset = 1; offset < 3; offset++) {
          const candidate = (previewSlotIndex + offset) % 3;
          if (currentSlots[candidate]) {
            setPreviewSlotIndex(candidate);
            setIsZoomScaleToggled(false);
            break;
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewSlotIndex, currentSlots]);

  // Helper for displaying auto-dismissing toast notifications
  const showToast = useCallback((text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 3200);
  }, []);

  const compressImage = (dataUrl: string, maxWidth = 1920, maxHeight = 1080, quality = 0.88): Promise<string> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      if (dataUrl.startsWith('http')) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => {
        try {
          let width = img.width;
          let height = img.height;
          if (width > maxWidth || height > maxHeight) {
            if (width > height) {
              height = Math.round((height * maxWidth) / width);
              width = maxWidth;
            } else {
              width = Math.round((width * maxHeight) / height);
              height = maxHeight;
            }
          }
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            const compressedUrl = canvas.toDataURL('image/jpeg', quality);
            canvas.width = 0;
            canvas.height = 0;
            resolve(compressedUrl);
            return;
          }
        } catch (e) {
          console.error('Image compression error:', e);
        }
        resolve(dataUrl);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve((e.target?.result as string) || '');
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  // Unified File Processing Pipeline used across Clipboard Paste, File Select, Drag&Drop, and Camera
  const processAndAddFiles = useCallback(async (files: File[], requestedSlotIndex?: number) => {
    if (files.length === 0) return;

    const processedUrls: string[] = [];
    for (const file of files) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await readFileAsDataUrl(file);
      let finalUrl = dataUrl;
      if (file.type === 'image/svg+xml' || dataUrl.startsWith('data:image/svg+xml')) {
        finalUrl = await convertSvgToPng(dataUrl);
      }
      const compressed = await compressImage(finalUrl);
      processedUrls.push(compressed);
    }

    if (processedUrls.length === 0) return;

    // Slot assignment logic:
    // SCENARIO 1: User selected 3 (or more) images at once -> directly fill slots 0 (HTF), 1 (MTF), 2 (LTF) in order of selection
    if (processedUrls.length >= 3) {
      const newSlots = [processedUrls[0], processedUrls[1], processedUrls[2]];
      onImagesChange(newSlots);
      setActiveSlotIndex(null);
      showToast(
        language === 'cs'
          ? '✓ Všechny 3 grafy (HTF, MTF, LTF) byly načteny v přesném pořadí vašeho výběru!'
          : language === 'es'
          ? '✓ Los 3 gráficos se cargaron en el orden exacto de selección.'
          : '✓ All 3 charts loaded in the exact order of selection.',
        'success'
      );
      return;
    }

    // SCENARIO 2: User selected 2 images at once -> fill starting from requestedSlot or first empty slot
    if (processedUrls.length === 2) {
      let startIndex = typeof requestedSlotIndex === 'number' && requestedSlotIndex >= 0 && requestedSlotIndex < MAX_IMAGES
        ? requestedSlotIndex
        : currentSlots.findIndex((s) => !s);

      if (startIndex === -1 || startIndex > 1) {
        startIndex = 0;
      }

      const updatedSlots = [...currentSlots];
      updatedSlots[startIndex] = processedUrls[0];
      updatedSlots[startIndex + 1 < MAX_IMAGES ? startIndex + 1 : 0] = processedUrls[1];

      onImagesChange(updatedSlots);

      const nextEmpty = updatedSlots.findIndex((s) => !s);
      setActiveSlotIndex(nextEmpty !== -1 ? nextEmpty : null);
      showToast(
        language === 'cs'
          ? '✓ 2 grafy byly načteny v pořadí výběru'
          : language === 'es'
          ? '✓ 2 gráficos cargados en orden de selección'
          : '✓ 2 charts loaded in selection order',
        'success'
      );
      return;
    }

    // SCENARIO 3: Single image uploaded/pasted
    let destinationSlotIndex: number | null = null;

    if (typeof requestedSlotIndex === 'number' && requestedSlotIndex >= 0 && requestedSlotIndex < MAX_IMAGES) {
      destinationSlotIndex = requestedSlotIndex;
    } else {
      // Find first empty slot among [0, 1, 2]
      const firstEmptyIndex = currentSlots.findIndex((slot) => !slot);
      if (firstEmptyIndex !== -1) {
        destinationSlotIndex = firstEmptyIndex;
      } else {
        // All 3 slots are occupied!
        showToast(
          language === 'cs'
            ? 'Všechny 3 sloty jsou již obsazené. Klikněte na konkrétní slot pro jeho nahrazení.'
            : language === 'es'
            ? 'Las 3 ranuras ya están ocupadas. Haga clic en una ranura específica para reemplazarla.'
            : 'All 3 slots are already filled. Click a specific slot to replace it.',
          'warning'
        );
        return;
      }
    }

    // Build new normalized 3-slot array preserving exact slots
    const updatedSlots = [...currentSlots];
    updatedSlots[destinationSlotIndex] = processedUrls[0];

    onImagesChange(updatedSlots);

    // Provide visual feedback for the destination slot
    const targetTfName = currentConfig.slots[destinationSlotIndex]?.tf || `Slot ${destinationSlotIndex + 1}`;
    showToast(
      language === 'cs'
        ? `✓ Graf vložen do ${targetTfName}`
        : language === 'es'
        ? `✓ Gráfico insertado en ${targetTfName}`
        : `✓ Chart inserted into ${targetTfName}`,
      'success'
    );

    // Auto-advance recommended focus to the next empty slot if any
    const nextEmptyIndex = updatedSlots.findIndex((slot) => !slot);
    if (nextEmptyIndex !== -1) {
      setActiveSlotIndex(nextEmptyIndex);
    } else {
      setActiveSlotIndex(null);
    }
  }, [currentSlots, currentConfig, onImagesChange, language, showToast]);

  // Global Clipboard Paste Handler (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      // Do not intercept if user is typing in a native text input, textarea, or contentEditable element
      const activeElement = document.activeElement;
      if (
        activeElement &&
        (activeElement.tagName === 'INPUT' ||
          activeElement.tagName === 'TEXTAREA' ||
          (activeElement as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            imageFiles.push(file);
          }
        }
      }

      if (imageFiles.length > 0) {
        e.preventDefault();
        processAndAddFiles(imageFiles, activeSlotIndex !== null ? activeSlotIndex : undefined);
        return;
      }

      // Also support TradingView clipboard links (e.g., https://www.tradingview.com/x/XXXXX/ or direct image URLs)
      const pastedText = e.clipboardData?.getData('text/plain')?.trim();
      if (pastedText && (pastedText.startsWith('http://') || pastedText.startsWith('https://') || pastedText.startsWith('data:image/'))) {
        if (pastedText.match(/\.(jpeg|jpg|png|webp|gif)/i) || pastedText.includes('tradingview.com/x/') || pastedText.startsWith('data:image/')) {
          e.preventDefault();
          showToast('Stahuji obrázek z odkazu...', 'info');
          compressImage(pastedText)
            .then((compressed) => {
              const updatedSlots = [...currentSlots];
              const destIndex = activeSlotIndex !== null ? activeSlotIndex : currentSlots.findIndex((s) => !s);
              const finalDest = destIndex !== -1 ? destIndex : 0;
              updatedSlots[finalDest] = compressed;
              onImagesChange(updatedSlots);
              showToast('✓ Graf načten z odkazu!', 'success');
            })
            .catch(() => {
              showToast('Nepodařilo se načíst obrázek z odkazu. Použijte prosím screenshot (Ctrl+V / ⌘+V).', 'warning');
            });
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [activeSlotIndex, processAndAddFiles]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      const target = targetSlotRef.current !== null ? targetSlotRef.current : (activeSlotIndex !== null ? activeSlotIndex : undefined);
      processAndAddFiles(files, target);
      e.target.value = '';
      targetSlotRef.current = null;
    }
  };

  const triggerUploadForSlot = (slotIdx: number, useCamera = false) => {
    targetSlotRef.current = slotIdx;
    setActiveSlotIndex(slotIdx);
    if (useCamera) {
      cameraInputRef.current?.click();
    } else {
      fileInputRef.current?.click();
    }
  };

  const removeSlotImage = (index: number) => {
    const updatedSlots = [...currentSlots];
    updatedSlots[index] = null;
    onImagesChange(updatedSlots);
    setActiveSlotIndex(index); // Focus the newly empty slot
    const slotTf = currentConfig.slots[index]?.tf || `Slot ${index + 1}`;
    showToast(
      language === 'cs'
        ? `Snímek pro ${slotTf} byl odstraněn.`
        : language === 'es'
        ? `Gráfico para ${slotTf} eliminado.`
        : `Chart for ${slotTf} removed.`,
      'info'
    );
  };

  const handleDropOnSlot = (e: React.DragEvent<HTMLDivElement>, slotIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files) as File[];
      processAndAddFiles(files, slotIdx);
    }
  };

  // Find next recommended empty slot for visual badge indication
  const nextEmptySlotIndex = currentSlots.findIndex((slot) => !slot);

  return (
    <section id="chart-uploader-section" className="space-y-6 relative">
      {/* Toast Notification Banner */}
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

      {/* Hidden File Inputs */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept="image/*"
        multiple
        className="hidden"
      />
      <input
        type="file"
        ref={cameraInputRef}
        onChange={handleFileChange}
        accept="image/*"
        capture="environment"
        className="hidden"
      />

      {/* 1. Page Header & Workflow Context */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-2">
        <div className="flex-1">
          <div className="flex items-center space-x-2.5 text-xs text-[#86868b] font-medium mb-1.5 flex-wrap gap-y-1">
            <span className="uppercase tracking-wider">{t.tradingWorkflow}</span>
            <span>•</span>
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              <HoldingIcon className="w-3.5 h-3.5" />
              {currentConfig.periodTitle}
            </span>
            <span>•</span>
            {/* Decent, high-visibility keyboard shortcut badge */}
            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[11px] font-mono font-bold">
              <span>Ctrl+V / ⌘+V</span>
              <span className="font-sans font-normal text-[10px] text-emerald-400/80 hidden sm:inline">{t.pasteScreenshotHint}</span>
            </span>
          </div>

          <h1 className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${isLight ? 'text-slate-900' : 'text-white'}`}>
            {t.uploaderTitle}
          </h1>
          <p className={`text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed ${isLight ? 'text-slate-600' : 'text-[#a1a1a6]'}`}>
            {t.uploaderSubtitle}
          </p>
        </div>

        {/* Secondary & Advanced Action Toolbar - Perfectly aligned single-line row */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
          <button
            type="button"
            onClick={() => {
              const el = document.getElementById('live-tradingview-section');
              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }}
            className={`inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer active:scale-95 shadow-sm whitespace-nowrap border ${
              isLight
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600 shadow-xs'
                : 'bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border-emerald-500/25'
            }`}
            title={language === 'cs' ? 'Přejít na živý TradingView graf' : language === 'es' ? 'Ir al gráfico en vivo' : 'Jump to live chart'}
          >
            <TrendingUp className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-white' : 'text-emerald-400'}`} />
            <span>{language === 'cs' ? 'Živý TradingView' : language === 'es' ? 'TradingView en Vivo' : 'Live TradingView'}</span>
          </button>

          {onOpenSettings && (
            <button
              type="button"
              onClick={onOpenSettings}
              className={`inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer active:scale-95 shadow-sm whitespace-nowrap ${
                isLight
                  ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-xs'
                  : 'bg-[#18181c] hover:bg-[#222226] text-white border-white/10'
              }`}
              title={t.analysisSettingsTooltip}
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
              <span>{t.analysisSettingsBtn}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className={`inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition cursor-pointer active:scale-95 whitespace-nowrap ${
              showGuide
                ? isLight
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-xs'
                  : 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                : isLight
                ? 'bg-white hover:bg-slate-100 text-slate-800 border-slate-300 shadow-xs'
                : 'bg-[#18181c] text-[#a1a1a6] border-white/10 hover:text-white hover:bg-[#222226]'
            }`}
          >
            <HelpCircle className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-emerald-600' : 'text-cyan-400'}`} />
            <span>{t.timeframeGuideBtn}</span>
            {showGuide ? <ChevronUp className="w-3.5 h-3.5 shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 shrink-0" />}
          </button>

          {(hasAnyImages || hasAnalysisResult) && (
            <button
              type="button"
              onClick={() => setShowConfirmResetModal(true)}
              className={`inline-flex items-center space-x-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition cursor-pointer active:scale-95 shadow-sm whitespace-nowrap border ${
                isLight
                  ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                  : 'bg-red-500/10 hover:bg-red-500/20 text-red-300 border-red-500/25'
              }`}
              title={t.clearAndNewAnalysis}
            >
              <RotateCcw className="w-3.5 h-3.5 text-red-500 shrink-0" />
              <span>{t.clearAndNewAnalysis}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. Expandable Timeframe Guide (Contextual) */}
      {showGuide && (
        <div className={`p-5 rounded-2xl text-xs space-y-4 shadow-lg animate-fadeIn border ${
          isLight
            ? 'bg-white border-slate-300 text-slate-800'
            : 'bg-[#141418] border-cyan-500/25 text-[#f5f5f7]'
        }`}>
          <div className={`flex items-center space-x-2.5 border-b pb-3 ${
            isLight ? 'border-slate-200' : 'border-white/[0.08]'
          }`}>
            <div className={`p-1.5 rounded-lg ${isLight ? 'bg-emerald-100 text-emerald-700' : 'bg-cyan-500/10 text-cyan-400'}`}>
              <Compass className="w-4 h-4" />
            </div>
            <div>
              <h3 className={`font-bold text-xs ${isLight ? 'text-slate-900' : 'text-white'}`}>{t.timeframeGuideTitle}</h3>
              <p className={`text-[11px] ${isLight ? 'text-slate-600' : 'text-[#86868b]'}`}>{t.timeframeGuideSubtitle}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className={`p-3.5 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/[0.06]'
            }`}>
              <div className={`font-bold text-[11px] mb-1 flex items-center gap-1.5 ${
                isLight ? 'text-emerald-700' : 'text-emerald-400'
              }`}>
                <span className={`w-4 h-4 rounded-full text-center text-[10px] leading-4 ${
                  isLight ? 'bg-emerald-200 text-emerald-900 font-bold' : 'bg-emerald-500/20'
                }`}>1</span>
                <span>{t.tfStep1Title}</span>
              </div>
              <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-[#a1a1a6]'}`}>{t.tfStep1Desc}</p>
            </div>
            <div className={`p-3.5 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/[0.06]'
            }`}>
              <div className={`font-bold text-[11px] mb-1 flex items-center gap-1.5 ${
                isLight ? 'text-teal-700' : 'text-cyan-400'
              }`}>
                <span className={`w-4 h-4 rounded-full text-center text-[10px] leading-4 ${
                  isLight ? 'bg-teal-200 text-teal-900 font-bold' : 'bg-cyan-500/20'
                }`}>2</span>
                <span>{t.tfStep2Title}</span>
              </div>
              <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-[#a1a1a6]'}`}>{t.tfStep2Desc}</p>
            </div>
            <div className={`p-3.5 rounded-xl border ${
              isLight ? 'bg-slate-50 border-slate-200' : 'bg-black/40 border-white/[0.06]'
            }`}>
              <div className={`font-bold text-[11px] mb-1 flex items-center gap-1.5 ${
                isLight ? 'text-indigo-700' : 'text-purple-400'
              }`}>
                <span className={`w-4 h-4 rounded-full text-center text-[10px] leading-4 ${
                  isLight ? 'bg-indigo-200 text-indigo-900 font-bold' : 'bg-purple-500/20'
                }`}>3</span>
                <span>{t.tfStep3Title}</span>
              </div>
              <p className={`text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-[#a1a1a6]'}`}>{t.tfStep3Desc}</p>
            </div>
          </div>
        </div>
      )}

      {/* 3. PRIMARY WORKFLOW: 3 DEDICATED TIMEFRAME UPLOAD SLOTS WITH INTUITIVE CLICK-TO-SELECT & PASTE FOCUS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {currentConfig.slots.map((slot, idx) => {
          const currentImg = currentSlots[idx];
          const hasImage = Boolean(currentImg);
          const isSelected = activeSlotIndex === idx;
          const isRecommendedNext = !hasImage && nextEmptySlotIndex === idx;

          return (
            <div
              key={idx}
              id={`uploader-slot-${idx}`}
              onClick={() => setActiveSlotIndex(idx)}
              onDrop={(e) => handleDropOnSlot(e, idx)}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              className={`rounded-2xl transition-all duration-200 flex flex-col justify-between overflow-hidden cursor-pointer relative scroll-mt-24 border ${
                isLight
                  ? isSelected
                    ? 'bg-emerald-50/70 border-2 border-emerald-600 shadow-lg shadow-emerald-500/10 ring-2 ring-emerald-500/20'
                    : hasImage
                    ? 'bg-white border-2 border-emerald-500/60 shadow-sm'
                    : isRecommendedNext
                    ? 'bg-white border-2 border-dashed border-emerald-500/50 hover:border-emerald-600 shadow-xs'
                    : 'bg-white hover:bg-slate-50 border-slate-300 hover:border-slate-400 shadow-xs'
                  : isSelected
                  ? 'bg-[#151b17] border-2 border-emerald-400 shadow-xl shadow-emerald-500/10 ring-2 ring-emerald-500/20'
                  : hasImage
                  ? 'bg-[#121216] border-emerald-500/40 hover:border-emerald-500/60 shadow-md'
                  : isRecommendedNext
                  ? 'bg-[#121216]/90 border-dashed border-emerald-500/40 hover:border-emerald-400/70 shadow-sm'
                  : 'bg-[#121216]/80 hover:bg-[#18181e] border-white/10 hover:border-white/20'
              }`}
            >
              {/* Slot Header */}
              <div className={`p-4 border-b flex items-center justify-between transition-colors ${
                isLight
                  ? isSelected
                    ? 'bg-emerald-100/70 border-emerald-200'
                    : 'bg-slate-100/90 border-slate-200'
                  : isSelected
                  ? 'bg-emerald-500/10 border-white/[0.06]'
                  : 'bg-black/30 border-white/[0.06]'
              }`}>
                <div className="flex items-center space-x-2.5">
                  <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md ${
                    isLight
                      ? isSelected
                        ? 'bg-emerald-600 text-white'
                        : 'bg-slate-200 text-slate-700'
                      : isSelected
                      ? 'bg-emerald-500 text-black'
                      : 'bg-white/[0.08] text-[#86868b]'
                  }`}>
                    {slot.step}
                  </span>
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <Camera className={`w-3.5 h-3.5 shrink-0 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                      <span className={`text-xs font-bold ${
                        isLight
                          ? isSelected
                            ? 'text-emerald-900'
                            : 'text-slate-900'
                          : isSelected
                          ? 'text-emerald-300'
                          : 'text-white'
                      }`}>
                        {slot.tf}
                      </span>
                      <span className={`text-[10px] ${isLight ? 'text-slate-600 font-medium' : 'text-[#86868b]'}`}>• {slot.role}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-1.5">
                  {hasImage ? (
                    <span className={`text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                      isLight
                        ? 'text-emerald-800 bg-emerald-100 border-emerald-300'
                        : 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                    }`}>
                      <CheckCircle2 className="w-3 h-3" />
                      {t.slotStatusReady}
                    </span>
                  ) : isSelected ? (
                    <span className={`text-[10px] font-semibold flex items-center gap-1 px-2 py-0.5 rounded-full border animate-pulse ${
                      isLight
                        ? 'text-emerald-900 bg-emerald-200/80 border-emerald-400 font-bold'
                        : 'text-emerald-300 bg-emerald-500/20 border-emerald-500/40'
                    }`}>
                      {t.slotStatusActiveTarget} (Ctrl+V / ⌘+V)
                    </span>
                  ) : isRecommendedNext ? (
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      isLight
                        ? 'text-emerald-800 bg-emerald-50 border-emerald-200 font-semibold'
                        : 'text-emerald-400/80 bg-emerald-500/5 border-emerald-500/15'
                    }`}>
                      {t.slotStatusNext}
                    </span>
                  ) : null}
                </div>
              </div>

              {/* Slot Content: Image Preview OR Upload Target */}
              <div className="p-4 flex-1 flex flex-col justify-center">
                {hasImage ? (
                  <div
                    onClick={() => {
                      setPreviewSlotIndex(idx);
                      setIsZoomScaleToggled(false);
                    }}
                    className={`relative rounded-xl overflow-hidden aspect-video bg-black group border transition-all duration-200 cursor-pointer shadow-sm ${
                      isLight
                        ? 'border-slate-300 hover:border-emerald-600'
                        : 'border-white/10 hover:border-emerald-500/50'
                    }`}
                    title={t.zoomSlotPreviewTooltip || 'Kliknutím zvětšíte náhled snímku grafu'}
                  >
                    <img
                      src={currentImg || ''}
                      alt={`Timeframe slot ${slot.tf}`}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    />

                    {/* Subtle Zoom Badge in top-left corner */}
                    <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-black/75 backdrop-blur-sm border border-white/15 text-white/90 text-[10px] font-semibold flex items-center space-x-1 opacity-80 group-hover:opacity-100 transition-opacity shadow-sm">
                      <ZoomIn className="w-3 h-3 text-emerald-400" />
                      <span>{t.zoomSlotPreview || 'Zvětšit náhled'}</span>
                    </div>

                    {/* Hover Action Controls Overlay */}
                    <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 p-2">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPreviewSlotIndex(idx);
                          setIsZoomScaleToggled(false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 shadow-lg active:scale-95"
                      >
                        <ZoomIn className="w-3.5 h-3.5" />
                        <span>{t.zoomSlotPreview || 'Zvětšit'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerUploadForSlot(idx, false);
                        }}
                        className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-medium transition cursor-pointer"
                      >
                        {t.changeSlotImage}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeSlotImage(idx);
                        }}
                        className="p-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 text-white transition cursor-pointer"
                        title={t.removeSlotImage}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerUploadForSlot(idx, false);
                    }}
                    className={`border border-dashed rounded-xl p-5 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[160px] group ${
                      isLight
                        ? isSelected
                          ? 'border-emerald-500 bg-emerald-50/60'
                          : 'border-slate-300 hover:border-emerald-500 bg-slate-50/70 hover:bg-emerald-50/30'
                        : isSelected
                        ? 'border-emerald-400 bg-emerald-950/20'
                        : 'border-white/15 hover:border-emerald-400/50 bg-black/20 hover:bg-emerald-950/10'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-2.5 transition ${
                      isLight
                        ? isSelected
                          ? 'bg-emerald-100 text-emerald-700 scale-110'
                          : 'bg-slate-200/80 group-hover:bg-emerald-100 text-slate-600 group-hover:text-emerald-700'
                        : isSelected
                        ? 'bg-emerald-500/20 text-emerald-300 scale-110'
                        : 'bg-white/[0.04] group-hover:bg-emerald-500/10 text-[#86868b] group-hover:text-emerald-400'
                    }`}>
                      <Upload className="w-5 h-5" />
                    </div>
                    <div className={`text-xs font-bold transition ${
                      isLight
                        ? isSelected
                          ? 'text-emerald-900'
                          : 'text-slate-800 group-hover:text-emerald-700'
                        : isSelected
                        ? 'text-emerald-300'
                        : 'text-white group-hover:text-emerald-300'
                    }`}>
                      {t.uploadSlotChart.replace('{tf}', slot.tf)}
                    </div>
                    <div className={`text-[11px] mt-1 text-center max-w-[200px] leading-snug ${
                      isLight ? 'text-slate-600' : 'text-[#86868b]'
                    }`}>
                      {slot.desc}
                    </div>

                    <div className={`flex items-center gap-2 mt-3 pt-3 border-t opacity-80 group-hover:opacity-100 ${
                      isLight ? 'border-slate-200' : 'border-white/[0.06]'
                    }`}>
                      <span className={`text-[10px] font-semibold hover:underline ${
                        isLight ? 'text-emerald-700' : 'text-emerald-400'
                      }`}>{t.browseFiles}</span>
                      <span className={`text-[10px] ${isLight ? 'text-slate-400' : 'text-[#86868b]'}`}>•</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerUploadForSlot(idx, true);
                        }}
                        className={`text-[10px] font-medium hover:underline flex items-center gap-1 ${
                          isLight ? 'text-teal-700' : 'text-cyan-400'
                        }`}
                      >
                        <Camera className="w-3 h-3" />
                        {t.camera}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Slot Footer Helper with Keyboard Shortcut instruction */}
              <div className={`px-4 py-2.5 border-t text-[11px] flex items-center justify-between transition-colors ${
                isLight
                  ? isSelected
                    ? 'bg-emerald-100/50 border-emerald-200 text-emerald-900 font-medium'
                    : 'bg-slate-100/80 border-slate-200 text-slate-600'
                  : isSelected
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                  : 'bg-black/20 border-white/[0.04] text-[#86868b]'
              }`}>
                <span>{isSelected ? t.pressPasteHere.replace('{key}', 'Ctrl+V / ⌘+V') : t.slotRolePurpose.replace('{role}', slot.role)}</span>
                <span className="font-mono text-[10px] font-bold">{slot.tf}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* 4. PRIMARY CALL-TO-ACTION (Expanded Dominant Execution Bar) */}
      <div className={`pt-3 space-y-3 rounded-2xl sm:rounded-3xl p-5 sm:p-6 transition-all border ${
        isLight
          ? 'bg-white border-slate-300 shadow-lg shadow-slate-200/50'
          : 'bg-[#121216] border-white/[0.08] shadow-2xl'
      }`}>
        {/* Status and engine guidance row */}
        <div className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b pb-3 text-xs ${
          isLight ? 'border-slate-200 text-slate-600' : 'border-white/[0.06] text-[#a1a1a6]'
        }`}>
          <div className="flex items-center space-x-3">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              isLight
                ? 'bg-emerald-100 text-emerald-700 border border-emerald-300'
                : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            }`}>
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <div className={`font-bold text-xs sm:text-sm ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {language === 'cs'
                  ? `Stav podkladů: ${uploadedCount} / ${MAX_IMAGES} ${uploadedCount === 1 ? 'graf' : (uploadedCount >= 2 && uploadedCount <= 4) ? 'grafy' : 'grafů'}`
                  : t.uploadStatusCount.replace('{count}', String(uploadedCount)).replace('{max}', String(MAX_IMAGES))}
              </div>
              <div className={`text-[11px] ${isLight ? 'text-slate-500 font-medium' : 'text-[#86868b]'}`}>
                {uploadedCount === 0
                  ? t.uploadHintEmpty.replace('{key}', 'Ctrl+V / ⌘+V')
                  : uploadedCount < MAX_IMAGES
                  ? t.uploadHintPartial
                  : t.uploadHintComplete}
              </div>
            </div>
          </div>

          <div className={`flex items-center space-x-2 text-[11px] font-medium ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Top-Down Multi-Timeframe AI Engine</span>
          </div>
        </div>

        {/* WIDE & ENLARGED BUTTON */}
        <button
          type="button"
          id="run-ai-analysis-btn"
          onClick={onAnalyze}
          disabled={uploadedCount === 0 || isLoading}
          className={`w-full py-4 sm:py-5 px-8 rounded-xl sm:rounded-2xl font-black text-base sm:text-lg tracking-wide transition-all duration-200 cursor-pointer disabled:opacity-30 disabled:pointer-events-none flex items-center justify-center space-x-3 active:scale-[0.99] border ${
            isLight
              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 border-emerald-600'
              : 'bg-gradient-to-r from-emerald-500 via-emerald-400 to-emerald-500 hover:brightness-110 text-black shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/35 border-emerald-300/40'
          }`}
        >
          {isLoading ? (
            <>
              <div className={`w-5 h-5 border-3 border-t-transparent rounded-full animate-spin shrink-0 ${
                isLight ? 'border-white' : 'border-black'
              }`} />
              <span>{t.analyzingBtn}</span>
            </>
          ) : (
            <>
              <Sparkles className={`w-5 h-5 sm:w-6 sm:h-6 shrink-0 ${
                isLight ? 'text-white fill-white' : 'text-black fill-black'
              }`} />
              <span className="uppercase tracking-wider">{t.analyzeBtn}</span>
            </>
          )}
        </button>
      </div>

      {/* Confirmation Dialog: Delete and Create New Analysis */}
      {showConfirmResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-150">
          <div
            className={`w-full max-w-md rounded-2xl sm:rounded-3xl p-6 shadow-2xl space-y-5 border ${
              isLight
                ? 'bg-white border-slate-300 text-slate-900'
                : 'bg-[#141418] border-white/10 text-white'
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start space-x-3.5">
              <div className="p-3 rounded-2xl bg-red-500/15 border border-red-500/30 text-red-400 shrink-0">
                <Trash2 className="w-6 h-6" />
              </div>
              <div className="space-y-1.5">
                <h3 className={`text-base font-bold leading-snug ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  {t.confirmResetTitle}
                </h3>
                <p className={`text-xs leading-relaxed ${isLight ? 'text-slate-600' : 'text-[#a1a1a6]'}`}>
                  {t.confirmResetDesc}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirmResetModal(false)}
                className={`px-4 py-2.5 rounded-xl text-xs font-semibold transition cursor-pointer active:scale-95 ${
                  isLight
                    ? 'bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200'
                    : 'bg-white/[0.06] hover:bg-white/10 text-white'
                }`}
              >
                {t.cancel}
              </button>
              <button
                type="button"
                onClick={() => {
                  onImagesChange([null, null, null]);
                  setActiveSlotIndex(0);
                  if (onResetAnalysis) {
                    onResetAnalysis();
                  }
                  setShowConfirmResetModal(false);
                  showToast(
                    language === 'cs'
                      ? 'Analýza i grafy byly smazány. Můžete nahrát nové snímky.'
                      : language === 'es'
                      ? 'Gráficos y análisis borrados. Puede cargar nuevos gráficos.'
                      : 'Analysis and charts cleared. Ready for new uploads.',
                    'info'
                  );
                }}
                className="px-4 py-2.5 rounded-xl bg-red-500 hover:bg-red-600 text-white text-xs font-bold transition flex items-center space-x-1.5 cursor-pointer active:scale-95 shadow-lg shadow-red-500/20"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.confirmResetBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. ENLARGED IMAGE PREVIEW LIGHTBOX / ZOOM MODAL */}
      {previewSlotIndex !== null && currentSlots[previewSlotIndex] && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col justify-between p-3 sm:p-5 animate-in fade-in duration-200"
          onClick={() => {
            setPreviewSlotIndex(null);
            setIsZoomScaleToggled(false);
          }}
        >
          {/* Top Bar */}
          <div
            className="flex flex-wrap items-center justify-between gap-3 bg-[#131318]/95 border border-white/[0.08] rounded-2xl px-4 py-3 shadow-2xl shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Slot Info */}
            <div className="flex items-center space-x-3">
              <span className="text-xs font-mono font-bold px-2.5 py-1 rounded-lg bg-emerald-500 text-black shadow-sm">
                SLOT {currentConfig.slots[previewSlotIndex]?.step || `0${previewSlotIndex + 1}`}
              </span>
              <div>
                <div className="flex items-center space-x-2">
                  <h3 className="text-sm font-bold text-white">
                    {currentConfig.slots[previewSlotIndex]?.tf || `Slot ${previewSlotIndex + 1}`}
                  </h3>
                  <span className="text-xs text-emerald-400 font-medium">
                    • {currentConfig.slots[previewSlotIndex]?.role}
                  </span>
                </div>
                <p className="text-[11px] text-[#86868b] hidden sm:block">
                  {currentConfig.slots[previewSlotIndex]?.desc}
                </p>
              </div>
            </div>

            {/* Quick Switch Slot Tabs */}
            <div className="flex items-center space-x-1.5">
              {currentConfig.slots.map((s, sIdx) => {
                const isSlotAvailable = Boolean(currentSlots[sIdx]);
                const isActive = previewSlotIndex === sIdx;
                if (!isSlotAvailable) return null;
                return (
                  <button
                    key={sIdx}
                    type="button"
                    onClick={() => {
                      setPreviewSlotIndex(sIdx);
                      setIsZoomScaleToggled(false);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border ${
                      isActive
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm ring-1 ring-emerald-500/30'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#a1a1a6] hover:text-white border-white/[0.06]'
                    }`}
                  >
                    <span>Slot {sIdx + 1}</span>
                    <span className="text-[10px] opacity-75">({s.tf})</span>
                  </button>
                );
              })}
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-2">
              {/* Zoom 100% / 150% Toggle */}
              <button
                type="button"
                onClick={() => setIsZoomScaleToggled((prev) => !prev)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer flex items-center space-x-1.5 border active:scale-95 ${
                  isZoomScaleToggled
                    ? 'bg-emerald-500 text-black border-emerald-400 shadow-md shadow-emerald-500/20'
                    : 'bg-white/[0.06] hover:bg-white/10 text-white border-white/10'
                }`}
                title={isZoomScaleToggled ? t.zoomFit : t.zoom150}
              >
                {isZoomScaleToggled ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                <span className="hidden md:inline">
                  {isZoomScaleToggled ? t.zoomFit || 'Přizpůsobit oknu' : t.zoom150 || 'Přiblížit 150%'}
                </span>
              </button>

              {/* Change Image */}
              <button
                type="button"
                onClick={() => {
                  const target = previewSlotIndex;
                  setPreviewSlotIndex(null);
                  triggerUploadForSlot(target, false);
                }}
                className="px-3 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-white text-xs font-medium transition cursor-pointer border border-white/10"
              >
                {t.changeSlotImage || 'Změnit'}
              </button>

              {/* Remove Image */}
              <button
                type="button"
                onClick={() => {
                  const target = previewSlotIndex;
                  removeSlotImage(target);
                  const remaining = currentSlots.map((s, i) => (i === target ? null : s));
                  const nextFilled = remaining.findIndex(Boolean);
                  if (nextFilled !== -1) {
                    setPreviewSlotIndex(nextFilled);
                  } else {
                    setPreviewSlotIndex(null);
                  }
                }}
                className="p-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/30 text-xs transition cursor-pointer"
                title={t.removeSlotImage || 'Odstranit snímek'}
              >
                <Trash2 className="w-4 h-4" />
              </button>

              {/* Close Button */}
              <button
                type="button"
                onClick={() => {
                  setPreviewSlotIndex(null);
                  setIsZoomScaleToggled(false);
                }}
                className="p-2 rounded-xl bg-white/[0.08] hover:bg-white/20 text-white transition cursor-pointer ml-1"
                title={t.closePreviewBtn || 'Zavřít náhled'}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Enlarged Image Viewport */}
          <div
            className="flex-1 my-3 sm:my-4 w-full flex items-center justify-center overflow-auto rounded-2xl bg-[#09090c] border border-white/[0.06] relative p-2 select-none shadow-inner"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setPreviewSlotIndex(null);
                setIsZoomScaleToggled(false);
              }
            }}
          >
            {/* Arrow Nav Left (if multiple slots) */}
            {currentSlots.filter(Boolean).length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  for (let offset = 1; offset < 3; offset++) {
                    const candidate = (previewSlotIndex - offset + 3) % 3;
                    if (currentSlots[candidate]) {
                      setPreviewSlotIndex(candidate);
                      setIsZoomScaleToggled(false);
                      break;
                    }
                  }
                }}
                className="absolute left-3 sm:left-6 z-20 p-3 rounded-full bg-black/70 hover:bg-black text-white/80 hover:text-white border border-white/20 backdrop-blur-md transition cursor-pointer shadow-2xl active:scale-95"
                title={t.prevSlotBtn || 'Předchozí slot'}
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}

            {/* The Enlarged Image */}
            <div
              className={`transition-all duration-300 flex items-center justify-center ${
                isZoomScaleToggled ? 'w-full overflow-auto' : 'max-h-full max-w-full'
              }`}
            >
              <img
                src={currentSlots[previewSlotIndex] || ''}
                alt={`Detail náhledu slot ${previewSlotIndex + 1}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setIsZoomScaleToggled((prev) => !prev);
                }}
                className={`rounded-xl shadow-2xl transition-all duration-300 ${
                  isZoomScaleToggled
                    ? 'min-w-[135%] sm:min-w-[150%] max-w-none cursor-zoom-out'
                    : 'max-h-[70vh] sm:max-h-[76vh] w-auto max-w-full object-contain cursor-zoom-in hover:brightness-105'
                }`}
                title={isZoomScaleToggled ? 'Kliknutím zmenšíte náhled' : 'Kliknutím přiblížíte na 150%'}
              />
            </div>

            {/* Arrow Nav Right (if multiple slots) */}
            {currentSlots.filter(Boolean).length > 1 && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  for (let offset = 1; offset < 3; offset++) {
                    const candidate = (previewSlotIndex + offset) % 3;
                    if (currentSlots[candidate]) {
                      setPreviewSlotIndex(candidate);
                      setIsZoomScaleToggled(false);
                      break;
                    }
                  }
                }}
                className="absolute right-3 sm:right-6 z-20 p-3 rounded-full bg-black/70 hover:bg-black text-white/80 hover:text-white border border-white/20 backdrop-blur-md transition cursor-pointer shadow-2xl active:scale-95"
                title={t.nextSlotBtn || 'Další slot'}
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            )}
          </div>

          {/* Bottom Bar: Instructions & Quick Close */}
          <div
            className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-[#131318]/95 border border-white/[0.08] rounded-xl text-xs text-[#86868b] shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center space-x-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>{t.previewModalHint || 'Kliknutím na obrázek přepnete přiblížení 150% • Šipkami ◄ ► můžete přepínat sloty • ESC pro zavření'}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPreviewSlotIndex(null);
                setIsZoomScaleToggled(false);
              }}
              className="px-3.5 py-1 rounded-lg bg-white/[0.06] hover:bg-white/15 text-white font-medium transition cursor-pointer ml-auto"
            >
              {t.closePreviewBtn || 'Zavřít náhled'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
};
