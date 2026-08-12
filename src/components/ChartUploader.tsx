import React, { useRef, useEffect } from 'react';
import { Upload, Camera, Image as ImageIcon, Trash2, Plus, Sparkles, Layers, Clipboard } from 'lucide-react';
import { convertSvgToPng } from '../utils/sampleChart';
import { LanguageOption } from '../types';
import { getTranslation } from '../utils/translations';

interface ChartUploaderProps {
  images: string[];
  onImagesChange: (images: string[]) => void;
  onAnalyze: () => void;
  isLoading: boolean;
  onLoadSampleChart: () => void;
  language?: LanguageOption;
}

export const ChartUploader: React.FC<ChartUploaderProps> = ({
  images,
  onImagesChange,
  onAnalyze,
  isLoading,
  onLoadSampleChart,
  language = 'cs',
}) => {
  const t = getTranslation(language as LanguageOption);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

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

  const compressImage = (dataUrl: string, maxWidth = 1600, maxHeight = 1600, quality = 0.85): Promise<string> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined') {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.crossOrigin = 'anonymous';
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

  const processAndAddFiles = async (files: File[]) => {
    const processed: string[] = [];
    for (const file of files) {
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
      onImagesChange([...images, ...processed]);
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
      className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl relative overflow-hidden"
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
      <div className="absolute -top-24 -right-24 w-60 h-60 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-100 flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-emerald-400" />
            <span>{t.uploaderTitle}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            {t.uploaderSubtitle}
          </p>
        </div>

        {/* Sample Chart Button */}
        <button
          type="button"
          onClick={onLoadSampleChart}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20 transition cursor-pointer self-start sm:self-auto"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{t.loadSampleChart}</span>
        </button>
      </div>

      {/* Main Upload Area */}
      {images.length === 0 ? (
        <div
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onClick={() => fileInputRef.current?.click()}
          className="border-2 border-dashed border-slate-700 hover:border-emerald-500/60 bg-slate-950/50 hover:bg-slate-950/80 rounded-xl p-8 text-center transition cursor-pointer group flex flex-col items-center justify-center min-h-[220px]"
        >
          <div className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 group-hover:border-emerald-500/50 group-hover:scale-105 transition-all flex items-center justify-center mb-3 text-emerald-400 shadow-md">
            <Upload className="w-7 h-7" />
          </div>

          <p className="text-sm font-semibold text-slate-200">
            {t.clickToBrowse}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {t.supportedFormats}
          </p>

          <div className="flex items-center space-x-3 mt-4 pt-4 border-t border-slate-800/80">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                fileInputRef.current?.click();
              }}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition cursor-pointer"
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
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5 text-cyan-400" />
              <span>Camera</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Quick Toolbar for Multi-Chart Uploads */}
          <div className="flex flex-wrap items-center justify-between gap-2 p-2 bg-slate-950/60 rounded-xl border border-slate-800">
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.addMoreCharts}</span>
              </button>

              <button
                type="button"
                onClick={() => cameraInputRef.current?.click()}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 transition cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5 text-cyan-400" />
                <span>Camera</span>
              </button>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[11px] text-slate-400 hidden md:inline">
                {t.uploadedCharts} <strong className="text-emerald-400">{images.length}</strong>
              </span>

              <button
                type="button"
                onClick={() => onImagesChange([])}
                className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{t.clearAll}</span>
              </button>
            </div>
          </div>

          {/* Thumbnails Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {images.map((img, idx) => (
              <div
                key={idx}
                className="relative group rounded-xl overflow-hidden border border-slate-700 bg-slate-950 aspect-video shadow-md"
              >
                <img
                  src={img}
                  alt={`Chart ${idx + 1}`}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
                <div className="absolute top-2 left-2 px-2 py-0.5 rounded-md bg-slate-900/80 backdrop-blur border border-slate-700 text-[10px] font-semibold text-emerald-400 flex items-center space-x-1">
                  <Layers className="w-3 h-3" />
                  <span>{idx === 0 ? 'Main Chart' : `Timeframe #${idx}`}</span>
                </div>

                <button
                  type="button"
                  onClick={() => removeImage(idx)}
                  className="absolute top-2 right-2 p-1.5 rounded-lg bg-red-500/80 hover:bg-red-600 text-white shadow transition opacity-90 group-hover:opacity-100 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}

            {/* Add More Image Button */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-800 hover:border-emerald-500/40 bg-slate-950/40 rounded-xl aspect-video flex flex-col items-center justify-center transition cursor-pointer text-slate-400 hover:text-emerald-400"
            >
              <Plus className="w-6 h-6 mb-1" />
              <span className="text-xs font-medium">{t.addMoreCharts}</span>
            </div>
          </div>

          {/* Action Trigger */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2">
            <button
              type="button"
              onClick={onAnalyze}
              disabled={isLoading}
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 font-extrabold text-sm shadow-lg shadow-emerald-500/25 transition-all transform hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:pointer-events-none flex items-center justify-center space-x-2 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                  <span>{t.analyzingBtn}</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-slate-950 fill-current" />
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
