import React, { useRef, useEffect, useState } from 'react';
import {
  Upload,
  Camera,
  Image as ImageIcon,
  Trash2,
  Plus,
  Sparkles,
  Layers,
  Clipboard,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Compass,
  ArrowRight,
  Zap,
  TrendingUp,
  Waves,
  Globe,
  CheckCircle2,
} from 'lucide-react';
import { convertSvgToPng } from '../utils/sampleChart';
import { LanguageOption, HoldingPeriod } from '../types';
import { getTranslation } from '../utils/translations';

interface ChartUploaderProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  onAnalyze: () => void;
  isLoading: boolean;
  onLoadSampleChart: () => void;
  language?: LanguageOption;
  holdingPeriod?: HoldingPeriod;
}

export const ChartUploader: React.FC<ChartUploaderProps> = ({
  images,
  onImagesChange,
  onAnalyze,
  isLoading,
  onLoadSampleChart,
  language = 'cs',
  holdingPeriod = 'intraday',
}) => {
  const t = getTranslation(language as LanguageOption);
  const [showGuide, setShowGuide] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Dynamic TF recommendation mapping based on selected Holding Period
  const holdingRecommendations: Record<
    HoldingPeriod,
    {
      title: string;
      icon: any;
      accentColor: string;
      bgColor: string;
      borderColor: string;
      textColor: string;
      badgeColor: string;
      steps: [string, string, string];
      summary: string;
    }
  > = {
    scalp: {
      title: t.scalpStyleTitle,
      icon: Zap,
      accentColor: 'text-amber-400',
      bgColor: 'bg-amber-950/40',
      borderColor: 'border-amber-500/40',
      textColor: 'text-amber-300',
      badgeColor: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
      steps: ['1. Snímek: 1H (HTF Kontext & S/R)', '2. Snímek: 15m (MTF Struktura & FVG)', '3. Snímek: 5m / 1m (LTF Vstup & CHoCH)'],
      summary: t.scalpStyleTF,
    },
    intraday: {
      title: t.intradayStyleTitle,
      icon: TrendingUp,
      accentColor: 'text-cyan-400',
      bgColor: 'bg-cyan-950/40',
      borderColor: 'border-cyan-500/40',
      textColor: 'text-cyan-300',
      badgeColor: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40',
      steps: ['1. Snímek: 4H (HTF Trend & Likvidita)', '2. Snímek: 15m (MTF Struktura & BOS)', '3. Snímek: 5m (LTF Vstup & Trigger)'],
      summary: t.intradayStyleTF,
    },
    swing: {
      title: t.swingStyleTitle,
      icon: Waves,
      accentColor: 'text-purple-400',
      bgColor: 'bg-purple-950/40',
      borderColor: 'border-purple-500/40',
      textColor: 'text-purple-300',
      badgeColor: 'bg-purple-500/20 text-purple-300 border-purple-500/40',
      steps: ['1. Snímek: Daily (Makro Trend & Zóny)', '2. Snímek: 4H (MTF Struktura & S&D)', '3. Snímek: 1H (LTF Vstup & Potvrzení)'],
      summary: t.swingStyleTF,
    },
    position: {
      title: t.positionStyleTitle,
      icon: Globe,
      accentColor: 'text-emerald-400',
      bgColor: 'bg-emerald-950/40',
      borderColor: 'border-emerald-500/40',
      textColor: 'text-emerald-300',
      badgeColor: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
      steps: ['1. Snímek: Weekly (Makro Kontext)', '2. Snímek: Daily (Trend & Fáze trhu)', '3. Snímek: 4H (Vstup & Risk Control)'],
      summary: t.positionStyleTF,
    },
  };

  const currentHint = holdingRecommendations[holdingPeriod] || holdingRecommendations.intraday;
  const CurrentIcon = currentHint.icon;

  // Global paste handler for image from clipboard
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) imageFiles.push(file);
        }
      }
      if (imageFiles.length > 0) {
        processAndAddFiles(imageFiles);
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [images]);

  const compressImage = (dataUrl: string, maxWidth = 1200, maxHeight = 1200, quality = 0.78): Promise<string> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      // Only set crossOrigin if loading external http URLs, not local data: URLs
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

  const MAX_IMAGES = 3;

  const processAndAddFiles = async (files: File[]) => {
    const availableSlots = MAX_IMAGES - images.length;
    if (availableSlots <= 0) return;

    const filesToProcess = files.slice(0, availableSlots);
    const processed: string[] = [];
    for (const file of filesToProcess) {
      if (!file.type.startsWith('image/')) continue;
      const dataUrl = await readFileAsDataUrl(file);
      let finalUrl = dataUrl;
      if (file.type === 'image/svg+xml' || dataUrl.startsWith('data:image/svg+xml')) {
        finalUrl = await convertSvgToPng(dataUrl);
      }
      const compressed = await compressImage(finalUrl);
      processed.push(compressed);
    }
    if (processed.length > 0) {
      onImagesChange([...images, ...processed].slice(0, MAX_IMAGES));
    }
  };

  const readFileAsDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve((e.target?.result as string) || '');
      };
      reader.onerror = () => resolve('');
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files) as File[];
      processAndAddFiles(files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files) as File[];
      processAndAddFiles(files);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const removeImage = (index: number) => {
    const updated = images.filter((_, i) => i !== index);
    onImagesChange(updated);
  };

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      className="bg-[#121216]/75 backdrop-blur-2xl border border-white/[0.08] rounded-3xl p-5 sm:p-7 shadow-[0_8px_32px_rgba(0,0,0,0.37)] relative overflow-hidden transition-all"
    >
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

      {/* Background Glow */}
      <div className="absolute -top-24 -right-24 w-72 h-72 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h2 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2.5">
            <div className="p-2 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <ImageIcon className="w-5 h-5" />
            </div>
            <span>{t.uploaderTitle}</span>
          </h2>
          <p className="text-xs text-[#86868b] mt-1">
            {t.uploaderSubtitle}
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowGuide(!showGuide)}
            className={`inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all duration-200 cursor-pointer active:scale-95 backdrop-blur-md ${
              showGuide
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/40'
                : 'bg-white/[0.05] text-[#a1a1a6] border-white/[0.08] hover:text-white hover:bg-white/10'
            }`}
          >
            <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
            <span>Návod pro Timeframy</span>
            {showGuide ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>

          <button
            type="button"
            onClick={onLoadSampleChart}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25 transition-all duration-200 cursor-pointer active:scale-95 backdrop-blur-md shadow-xs"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t.loadSampleChart}</span>
          </button>
        </div>
      </div>

      {/* Interactive Timeframe Guide & Strategy Matrix */}
      {showGuide && (
        <div className="mb-6 p-5 rounded-2xl bg-black/60 border border-cyan-500/30 text-[#f5f5f7] text-xs space-y-5 shadow-xl backdrop-blur-xl animate-fadeIn">
          <div className="flex items-start justify-between border-b border-white/[0.08] pb-3">
            <div className="flex items-center space-x-2.5">
              <div className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20">
                <Compass className="w-4 h-4 text-cyan-400 shrink-0" />
              </div>
              <div>
                <h3 className="font-bold text-white text-xs">{t.timeframeGuideTitle}</h3>
                <p className="text-[11px] text-[#86868b]">{t.timeframeGuideSubtitle}</p>
              </div>
            </div>
          </div>

          {/* 1. Upload Order Steps */}
          <div>
            <h4 className="font-bold text-cyan-300 text-[11px] uppercase tracking-wider mb-2.5 flex items-center space-x-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{t.timeframeOrderTitle}</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* Step 1 */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-cyan-500/40 transition">
                <div className="flex items-center space-x-2 mb-1.5 text-emerald-400 font-bold text-[11px]">
                  <span className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center text-[10px] text-emerald-300">1</span>
                  <span>{t.tfStep1Title}</span>
                </div>
                <p className="text-[11px] text-[#a1a1a6] leading-relaxed">{t.tfStep1Desc}</p>
              </div>

              {/* Step 2 */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-cyan-500/40 transition">
                <div className="flex items-center space-x-2 mb-1.5 text-cyan-400 font-bold text-[11px]">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 flex items-center justify-center text-[10px] text-cyan-300">2</span>
                  <span>{t.tfStep2Title}</span>
                </div>
                <p className="text-[11px] text-[#a1a1a6] leading-relaxed">{t.tfStep2Desc}</p>
              </div>

              {/* Step 3 */}
              <div className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.08] hover:border-cyan-500/40 transition">
                <div className="flex items-center space-x-2 mb-1.5 text-teal-400 font-bold text-[11px]">
                  <span className="w-5 h-5 rounded-full bg-teal-500/20 flex items-center justify-center text-[10px] text-teal-300">3</span>
                  <span>{t.tfStep3Title}</span>
                </div>
                <p className="text-[11px] text-[#a1a1a6] leading-relaxed">{t.tfStep3Desc}</p>
              </div>
            </div>
          </div>

          {/* 2. Strategy Matrix Grid */}
          <div>
            <h4 className="font-bold text-amber-300 text-[11px] uppercase tracking-wider mb-2.5 flex items-center space-x-1.5">
              <Layers className="w-3.5 h-3.5 text-amber-400" />
              <span>{t.tradingStyleMatrixTitle}</span>
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Scalping */}
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-amber-500/20 flex flex-col justify-between">
                <div className="font-bold text-amber-300 text-[11px] flex items-center space-x-1.5 mb-1.5">
                  <Zap className="w-3.5 h-3.5 text-amber-400" />
                  <span>{t.scalpStyleTitle}</span>
                </div>
                <div className="text-[11px] font-mono text-white bg-black/60 px-2.5 py-1.5 rounded-xl border border-white/[0.06] mt-1 text-center">
                  {t.scalpStyleTF}
                </div>
              </div>

              {/* Intraday */}
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-cyan-500/20 flex flex-col justify-between">
                <div className="font-bold text-cyan-300 text-[11px] flex items-center space-x-1.5 mb-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-cyan-400" />
                  <span>{t.intradayStyleTitle}</span>
                </div>
                <div className="text-[11px] font-mono text-white bg-black/60 px-2.5 py-1.5 rounded-xl border border-white/[0.06] mt-1 text-center">
                  {t.intradayStyleTF}
                </div>
              </div>

              {/* Swing */}
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-purple-500/20 flex flex-col justify-between">
                <div className="font-bold text-purple-300 text-[11px] flex items-center space-x-1.5 mb-1.5">
                  <Waves className="w-3.5 h-3.5 text-purple-400" />
                  <span>{t.swingStyleTitle}</span>
                </div>
                <div className="text-[11px] font-mono text-white bg-black/60 px-2.5 py-1.5 rounded-xl border border-white/[0.06] mt-1 text-center">
                  {t.swingStyleTF}
                </div>
              </div>

              {/* Position */}
              <div className="p-3 rounded-2xl bg-white/[0.03] border border-emerald-500/20 flex flex-col justify-between">
                <div className="font-bold text-emerald-300 text-[11px] flex items-center space-x-1.5 mb-1.5">
                  <Globe className="w-3.5 h-3.5 text-emerald-400" />
                  <span>{t.positionStyleTitle}</span>
                </div>
                <div className="text-[11px] font-mono text-white bg-black/60 px-2.5 py-1.5 rounded-xl border border-white/[0.06] mt-1 text-center">
                  {t.positionStyleTF}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Dynamic Active Holding Period Recommendation Bar */}
      <div className={`mb-5 p-4 rounded-2xl ${currentHint.bgColor} ${currentHint.borderColor} border flex flex-col md:flex-row md:items-center justify-between gap-3 transition-all shadow-md backdrop-blur-xl`}>
        <div className="flex items-center space-x-3">
          <div className={`w-9 h-9 rounded-2xl ${currentHint.bgColor} ${currentHint.borderColor} border flex items-center justify-center ${currentHint.accentColor} shrink-0 shadow-xs`}>
            <CurrentIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold text-[#86868b] uppercase tracking-wider">
                {t.activeHoldingHintLabel}:
              </span>
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold border ${currentHint.badgeColor}`}>
                {currentHint.title}
              </span>
            </div>
            <p className="text-xs font-semibold text-white font-mono mt-0.5">
              {currentHint.summary}
            </p>
          </div>
        </div>

        {/* 3 Step Pills */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {currentHint.steps.map((step, sIdx) => (
            <span
              key={sIdx}
              className="text-[10px] px-2.5 py-1 rounded-full bg-black/50 text-[#f5f5f7] border border-white/[0.08] font-medium whitespace-nowrap shadow-xs backdrop-blur-md"
            >
              {step}
            </span>
          ))}
        </div>
      </div>

      {/* Main Upload Area */}
      {images.length === 0 ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border border-dashed border-white/20 hover:border-emerald-500/50 bg-black/40 hover:bg-black/60 rounded-3xl p-10 text-center transition-all duration-300 cursor-pointer group flex flex-col items-center justify-center min-h-[240px] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]"
        >
          <div className="w-16 h-16 rounded-3xl bg-white/[0.05] border border-white/[0.1] group-hover:border-emerald-500/40 group-hover:scale-105 transition-all duration-300 flex items-center justify-center mb-4 text-emerald-400 shadow-xl shadow-emerald-500/10">
            <Upload className="w-8 h-8" />
          </div>

          <p className="text-base font-bold text-white tracking-tight">
            {t.clickToBrowse}
          </p>
          <p className="text-xs text-[#86868b] mt-1 max-w-sm">
            {t.supportedFormats}
          </p>

          <div className="flex items-center space-x-3 mt-6 pt-5 border-t border-white/[0.08]">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white border border-white/[0.08] transition cursor-pointer active:scale-95"
            >
              <Clipboard className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t.clickToBrowse.split(' ')[0]}</span>
            </button>

            {/* Mobile Camera Snapshot */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                cameraInputRef.current?.click();
              }}
              className="inline-flex items-center space-x-1.5 px-4 py-2 rounded-full bg-white/[0.06] hover:bg-white/[0.12] text-xs font-semibold text-white border border-white/[0.08] transition cursor-pointer active:scale-95"
            >
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              <span>Camera</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Quick Toolbar for Multi-Chart Uploads */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-black/50 rounded-2xl border border-white/[0.08] backdrop-blur-md">
            <div className="flex items-center space-x-2">
              {images.length < MAX_IMAGES && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white border border-white/[0.08] transition cursor-pointer active:scale-95"
                  >
                    <Plus className="w-3.5 h-3.5 text-emerald-400" />
                    <span>{t.addMoreCharts}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-full bg-white/[0.08] hover:bg-white/[0.14] text-xs font-semibold text-white border border-white/[0.08] transition cursor-pointer active:scale-95"
                  >
                    <Camera className="w-3.5 h-3.5 text-cyan-400" />
                    <span>Camera</span>
                  </button>
                </>
              )}
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-xs text-[#86868b]">
                {t.uploadedCharts} <strong className="text-emerald-400">{images.length}/{MAX_IMAGES}</strong>
              </span>

              <button
                type="button"
                onClick={() => onImagesChange([])}
                className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-xs font-semibold transition cursor-pointer active:scale-95"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.clearAll}</span>
              </button>
            </div>
          </div>

          {/* Thumbnails Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="relative group rounded-2xl overflow-hidden border border-white/[0.1] bg-black aspect-video shadow-lg"
              >
                <img
                  src={img}
                  alt={`Chart ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute top-2.5 left-2.5 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-md border border-white/10 text-[10px] font-semibold text-emerald-400 flex items-center space-x-1 shadow-sm">
                  <Layers className="w-3 h-3" />
                  <span>{currentHint.steps[idx] ? currentHint.steps[idx] : `Graf ${idx + 1}`}</span>
                </div>

                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute top-2.5 right-2.5 p-2 rounded-full bg-red-500/80 hover:bg-red-600 text-white shadow-md transition opacity-90 group-hover:opacity-100 cursor-pointer active:scale-90"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* Add More Image Slot if < 3 */}
            {images.length < MAX_IMAGES && (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border border-dashed border-white/15 hover:border-emerald-500/50 bg-white/[0.02] hover:bg-white/[0.05] rounded-2xl aspect-video flex flex-col items-center justify-center transition-all duration-200 cursor-pointer text-[#86868b] hover:text-emerald-400 group"
              >
                <div className="p-3 rounded-full bg-white/[0.04] group-hover:bg-emerald-500/10 mb-1.5 transition">
                  <Plus className="w-5 h-5 text-[#86868b] group-hover:text-emerald-400" />
                </div>
                <span className="text-xs font-semibold text-white">{t.addMoreCharts}</span>
                <span className="text-[10px] text-[#86868b] mt-0.5">(Max {MAX_IMAGES} grafy)</span>
              </div>
            )}
          </div>

          {/* Action Trigger - Apple High-End Primary Button */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onAnalyze}
              disabled={isLoading}
              className="w-full sm:w-auto px-8 py-3.5 rounded-full bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-400 hover:from-emerald-300 hover:to-cyan-300 text-black font-extrabold text-sm shadow-xl shadow-emerald-500/25 transition-all duration-200 transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-40 disabled:pointer-events-none flex items-center justify-center space-x-2.5 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  <span>{t.analyzingBtn}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-black fill-black" />
                  <span>{t.analyzeBtn}</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
