import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  SlidersHorizontal,
  Play,
  Pause,
} from 'lucide-react';
import { MarketAssetData, MarketCategory, LanguageOption } from '../types';
import { getTranslation } from '../utils/translations';

interface MarketOverviewBarProps {
  language?: LanguageOption;
  onSelectAsset?: (tvSymbol: string) => void;
  selectedTvSymbol?: string | null;
}

export const MarketOverviewBar: React.FC<MarketOverviewBarProps> = ({
  language = 'cs',
  onSelectAsset,
  selectedTvSymbol,
}) => {
  const t = getTranslation(language);

  const [assets, setAssets] = useState<MarketAssetData[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<MarketCategory>('all');
  const [viewMode, setViewMode] = useState<'ticker' | 'grid'>('ticker');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  // Auto-scroll controls
  const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState<boolean>(true);
  const [isHovered, setIsHovered] = useState<boolean>(false);

  // Animation & Drag Refs
  const trackRef = useRef<HTMLDivElement>(null);
  const set1Ref = useRef<HTMLDivElement>(null);
  const offsetRef = useRef<number>(0);
  const singleSetWidthRef = useRef<number>(0);
  const targetNudgeRef = useRef<number>(0);
  const animFrameIdRef = useRef<number | null>(null);

  const isHoveredRef = useRef<boolean>(false);
  const isInteractingRef = useRef<boolean>(false);
  const interactionTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  isHoveredRef.current = isHovered;

  // Fetch market data from server endpoint
  const fetchMarketData = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch('/api/market-overview');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      const assetList = Array.isArray(json.data) ? json.data : Array.isArray(json.assets) ? json.assets : [];
      if (assetList.length > 0) {
        setAssets(assetList);
        setLastUpdated(new Date());
      }
    } catch (err) {
      console.warn('Market overview fetch failed, will retry:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial fetch and auto-refresh every 30s
  useEffect(() => {
    fetchMarketData();
    const interval = setInterval(fetchMarketData, 30000);
    return () => clearInterval(interval);
  }, [fetchMarketData]);

  // Filter assets by selected category
  const filteredAssets = useMemo(() => {
    return assets.filter((asset) => {
      if (selectedCategory === 'all') return true;
      return asset.category === selectedCategory;
    });
  }, [assets, selectedCategory]);

  // Ensure each track set has enough width to span across large displays without gaps
  const trackAssets = useMemo(() => {
    if (filteredAssets.length === 0) return [];
    const minItems = 12;
    const repeats = Math.max(1, Math.ceil(minItems / filteredAssets.length));
    const result: MarketAssetData[] = [];
    for (let i = 0; i < repeats; i++) {
      result.push(...filteredAssets);
    }
    return result;
  }, [filteredAssets]);

  // Measure single set width when DOM updates or category changes
  useEffect(() => {
    if (!set1Ref.current) return;
    const measure = () => {
      if (set1Ref.current) {
        // Track A width + gap (10px for gap-2.5)
        singleSetWidthRef.current = set1Ref.current.offsetWidth + 10;
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(set1Ref.current);
    return () => ro.disconnect();
  }, [trackAssets, isExpanded, viewMode]);

  // Reset or wrap offset safely
  const wrapOffset = useCallback(() => {
    const w = singleSetWidthRef.current;
    if (w > 0) {
      while (offsetRef.current >= w) offsetRef.current -= w;
      while (offsetRef.current < 0) offsetRef.current += w;
    }
  }, []);

  // Apply GPU hardware-accelerated translation
  const applyTransform = useCallback(() => {
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(-${offsetRef.current.toFixed(2)}px, 0, 0)`;
    }
  }, []);

  // Continuous buttery smooth auto-scrolling loop via requestAnimationFrame & GPU translate3d
  useEffect(() => {
    if (viewMode !== 'ticker' || !isExpanded || trackAssets.length === 0) {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
      return;
    }

    let lastTime = performance.now();

    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;

      // 1. Process smooth nudge animation (from clicking arrows)
      if (Math.abs(targetNudgeRef.current) > 0.4) {
        const step = targetNudgeRef.current * 0.14; // smooth exponential glide
        offsetRef.current += step;
        targetNudgeRef.current -= step;
      } else if (targetNudgeRef.current !== 0) {
        offsetRef.current += targetNudgeRef.current;
        targetNudgeRef.current = 0;
      }

      // 2. Process constant slow auto-advance if not paused
      const canAutoAdvance =
        isAutoScrollEnabled &&
        !isHoveredRef.current &&
        !isInteractingRef.current;

      if (canAutoAdvance) {
        // Slow, readable speed: 25px per second
        const speed = 25;
        offsetRef.current += speed * dt;
      }

      // 3. Seamless wrap
      const w = singleSetWidthRef.current;
      if (w > 0) {
        while (offsetRef.current >= w) offsetRef.current -= w;
        while (offsetRef.current < 0) offsetRef.current += w;
      }

      // 4. Update GPU transform
      if (trackRef.current) {
        trackRef.current.style.transform = `translate3d(-${offsetRef.current.toFixed(2)}px, 0, 0)`;
      }

      animFrameIdRef.current = requestAnimationFrame(loop);
    };

    animFrameIdRef.current = requestAnimationFrame(loop);

    return () => {
      if (animFrameIdRef.current) cancelAnimationFrame(animFrameIdRef.current);
    };
  }, [viewMode, isExpanded, isAutoScrollEnabled, trackAssets]);

  // Nudge ribbon manually with left/right arrows
  const nudge = (direction: 'left' | 'right') => {
    const step = 320;
    targetNudgeRef.current += direction === 'left' ? -step : step;

    // Pause auto-scroll briefly (2.5s) after manual navigation
    isInteractingRef.current = true;
    if (interactionTimeoutRef.current) clearTimeout(interactionTimeoutRef.current);
    interactionTimeoutRef.current = setTimeout(() => {
      isInteractingRef.current = false;
    }, 2500);
  };

  // Format price
  const formatPrice = (price: number, precision: number, currency: string) => {
    const formattedNum = price.toLocaleString(language === 'cs' ? 'cs-CZ' : 'en-US', {
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
    });
    if (currency === '$') return `$${formattedNum}`;
    if (currency === '€') return `€${formattedNum}`;
    return `${formattedNum} ${currency}`;
  };

  // Render mini SVG sparkline
  const renderSparkline = (points: number[], isPositive: boolean) => {
    if (!points || points.length < 2) return null;
    const min = Math.min(...points);
    const max = Math.max(...points);
    const range = max - min || 1;
    const width = 64;
    const height = 22;

    const pathPoints = points.map((p, idx) => {
      const x = (idx / (points.length - 1)) * width;
      const y = height - ((p - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });

    const pathData = `M ${pathPoints.join(' L ')}`;
    const strokeColor = isPositive ? '#10b981' : '#f43f5e';

    return (
      <svg width={width} height={height} className="overflow-visible shrink-0 pointer-events-none">
        <path
          d={pathData}
          fill="none"
          stroke={strokeColor}
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    );
  };

  const getCategoryTitle = (cat: MarketCategory) => {
    switch (cat) {
      case 'indices':
        return t.marketCatIndices || 'Indexy';
      case 'commodities':
        return t.marketCatCommodities || 'Zlato & Komodity';
      case 'crypto':
        return t.marketCatCrypto || 'Krypto';
      case 'forex':
        return t.marketCatForex || 'Forex';
      default:
        return t.marketCatAll || 'Všechny trhy';
    }
  };

  const getAssetName = (asset: MarketAssetData) => {
    if (language === 'cs') return asset.nameCs || asset.name;
    return asset.name;
  };

  // Render single asset card
  const renderAssetCard = (asset: MarketAssetData, key: string) => {
    const isPos = asset.changePercent >= 0;
    const isSelectedInChart = selectedTvSymbol === asset.tvSymbol;

    return (
      <button
        key={key}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onSelectAsset?.(asset.tvSymbol);
        }}
        title={`${getAssetName(asset)} - ${t.marketClickToChart || 'Kliknutím otevřete v živém grafu TradingView'}`}
        className={`flex items-center space-x-3 px-3.5 py-2 rounded-xl transition-all duration-150 cursor-pointer shrink-0 text-left border select-none ${
          isSelectedInChart
            ? 'bg-emerald-500/25 border-emerald-400 ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-500/20'
            : 'bg-[#15151c] hover:bg-[#1e1e28] border-white/[0.06] hover:border-emerald-500/40 hover:scale-[1.02]'
        }`}
      >
        {/* Icon */}
        <span className="text-base select-none">{asset.icon}</span>

        {/* Info & Price */}
        <div className="flex flex-col">
          <div className="flex items-center space-x-1.5">
            <span className="text-xs font-bold text-white whitespace-nowrap">
              {getAssetName(asset)}
            </span>
            <span className="text-[10px] font-mono text-[#71717a]">
              {asset.symbol}
            </span>
          </div>
          <div className="flex items-center space-x-2 mt-0.5">
            <span className="text-xs font-mono font-semibold text-[#e4e4e7]">
              {formatPrice(asset.price, asset.precision, asset.currency)}
            </span>
          </div>
        </div>

        {/* Sparkline & Change Badge */}
        <div className="flex flex-col items-end pl-1">
          {renderSparkline(asset.sparkline, isPos)}
          <span
            className={`inline-flex items-center text-[10px] font-mono font-bold mt-1 px-1.5 py-0.2 rounded ${
              isPos
                ? 'text-emerald-400 bg-emerald-500/10'
                : 'text-rose-400 bg-rose-500/10'
            }`}
          >
            {isPos ? '+' : ''}
            {asset.changePercent.toFixed(2)}%
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="w-full bg-[#111116] border border-white/[0.08] rounded-2xl shadow-xl overflow-hidden mb-6 transition-all duration-300">
      {/* Top Header Bar */}
      <div className="px-3.5 sm:px-5 py-2.5 bg-gradient-to-r from-[#14141c] via-[#121217] to-[#14141c] border-b border-white/[0.06] flex flex-wrap items-center justify-between gap-2.5">
        {/* Title & Live Status */}
        <div className="flex items-center space-x-2.5">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs sm:text-sm font-bold text-white tracking-wide">
                {t.marketOverviewTitle || 'Globální Trhy & Rychlý Přehled'}
              </span>
              <div className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-mono font-bold text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>LIVE</span>
              </div>
            </div>
            <p className="text-[10px] text-[#86868b] hidden sm:block">
              {t.marketOverviewSubtitle || 'Živé ceny a 24h vývoj klíčových indexů, zlata, kryptoměn a forexu'}
            </p>
          </div>
        </div>

        {/* Category Pills + Toolbar Controls */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* Category Filter Pills (Desktop) */}
          <div className="hidden md:flex items-center space-x-1 bg-black/40 p-1 rounded-xl border border-white/[0.05]">
            {(['all', 'indices', 'commodities', 'crypto', 'forex'] as MarketCategory[]).map((cat) => {
              const isCatActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    isCatActive
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                      : 'text-[#86868b] hover:text-white hover:bg-white/[0.04]'
                  }`}
                >
                  {getCategoryTitle(cat)}
                </button>
              );
            })}
          </div>

          {/* View Mode Toggle: Ticker vs Grid */}
          <div className="flex items-center bg-black/40 p-0.5 rounded-xl border border-white/[0.05]">
            <button
              type="button"
              onClick={() => setViewMode('ticker')}
              className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                viewMode === 'ticker'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-[#86868b] hover:text-white'
              }`}
              title={t.marketViewTicker || 'Pás'}
            >
              <SlidersHorizontal className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg text-xs transition cursor-pointer ${
                viewMode === 'grid'
                  ? 'bg-white/[0.1] text-white'
                  : 'text-[#86868b] hover:text-white'
              }`}
              title={t.marketViewGrid || 'Mřížka'}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Auto-Scroll Toggle Button (Only in Ticker View) */}
          {viewMode === 'ticker' && (
            <button
              type="button"
              onClick={() => setIsAutoScrollEnabled((prev) => !prev)}
              className={`p-1.5 rounded-xl border transition cursor-pointer flex items-center justify-center ${
                isAutoScrollEnabled
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25'
                  : 'bg-white/[0.04] text-[#86868b] border-white/[0.06] hover:text-white hover:bg-white/[0.08]'
              }`}
              title={
                isAutoScrollEnabled
                  ? (t.marketAutoScrollPause || 'Pozastavit automatický posun')
                  : (t.marketAutoScrollPlay || 'Spustit automatický posun')
              }
            >
              {isAutoScrollEnabled ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Manual Refresh Button */}
          <button
            type="button"
            onClick={fetchMarketData}
            disabled={isLoading}
            className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#86868b] hover:text-white border border-white/[0.06] transition cursor-pointer disabled:opacity-50"
            title={t.marketRefreshNow || 'Aktualizovat'}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          {/* Collapse/Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-[#86868b] hover:text-white border border-white/[0.06] transition cursor-pointer"
            title={isExpanded ? (t.marketCollapse || 'Skrýt přehled') : (t.marketExpand || 'Zobrazit přehled')}
          >
            {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Body */}
      {isExpanded && (
        <div className="p-2 sm:p-3 relative bg-[#0d0d12]">
          {/* Mobile Category Selector */}
          <div className="flex md:hidden items-center space-x-1 overflow-x-auto pb-2 mb-2 scrollbar-none">
            {(['all', 'indices', 'commodities', 'crypto', 'forex'] as MarketCategory[]).map((cat) => {
              const isCatActive = selectedCategory === cat;
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer ${
                    isCatActive
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'bg-white/[0.03] text-[#86868b] hover:text-white'
                  }`}
                >
                  {getCategoryTitle(cat)}
                </button>
              );
            })}
          </div>

          {viewMode === 'ticker' ? (
            /* GPU-Accelerated Smooth Ribbon View */
            <div
              className="relative group select-none overflow-hidden"
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            >
              {/* Left & Right Gradient Fade Masks */}
              <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-12 bg-gradient-to-r from-[#0d0d12] via-[#0d0d12]/80 to-transparent z-10" />
              <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-12 bg-gradient-to-l from-[#0d0d12] via-[#0d0d12]/80 to-transparent z-10" />

              {/* Left Scroll Button (Manual Nav / Nudge) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  nudge('left');
                }}
                className="absolute left-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-12 bg-black/85 hover:bg-emerald-600 text-white rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-xl border border-white/10 hover:border-emerald-400/50 backdrop-blur-md hover:scale-105 active:scale-95 opacity-90 sm:opacity-0 group-hover:opacity-100"
                title={t.marketScrollLeft || 'Posunout doleva'}
                aria-label="Scroll left"
              >
                <ChevronLeft className="w-4 h-4 pointer-events-none" />
              </button>

              {/* Seamless Infinite Track (3 identical sets for gapless looping) */}
              <div
                ref={trackRef}
                className="flex items-center gap-2.5 will-change-transform py-1 px-4"
                style={{ transform: 'translate3d(0px, 0, 0)' }}
              >
                <div ref={set1Ref} className="flex items-center gap-2.5 shrink-0">
                  {trackAssets.map((asset, i) => renderAssetCard(asset, `s1-${asset.id}-${i}`))}
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  {trackAssets.map((asset, i) => renderAssetCard(asset, `s2-${asset.id}-${i}`))}
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  {trackAssets.map((asset, i) => renderAssetCard(asset, `s3-${asset.id}-${i}`))}
                </div>
              </div>

              {/* Right Scroll Button (Manual Nav / Push Forward) */}
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  nudge('right');
                }}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 z-20 w-8 h-12 bg-black/85 hover:bg-emerald-600 text-white rounded-xl flex items-center justify-center transition-all cursor-pointer shadow-xl border border-white/10 hover:border-emerald-400/50 backdrop-blur-md hover:scale-105 active:scale-95 opacity-90 sm:opacity-0 group-hover:opacity-100"
                title={t.marketScrollRight || 'Posunout doprava'}
                aria-label="Scroll right"
              >
                <ChevronRight className="w-4 h-4 pointer-events-none" />
              </button>
            </div>
          ) : (
            /* Bento Grid View (Max 4 items per category) */
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {filteredAssets.map((asset) => {
                const isPos = asset.changePercent >= 0;
                const isSelectedInChart = selectedTvSymbol === asset.tvSymbol;

                return (
                  <button
                    key={asset.id}
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelectAsset?.(asset.tvSymbol);
                    }}
                    title={`${getAssetName(asset)} - ${t.marketClickToChart || 'Kliknutím otevřete v živém grafu TradingView'}`}
                    className={`p-3 rounded-xl transition-all duration-150 cursor-pointer text-left border flex flex-col justify-between ${
                      isSelectedInChart
                        ? 'bg-emerald-500/25 border-emerald-400 ring-2 ring-emerald-500/50 shadow-lg shadow-emerald-500/20'
                        : 'bg-[#15151c] hover:bg-[#1e1e28] border-white/[0.06] hover:border-emerald-500/40 hover:scale-[1.01]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="text-base select-none">{asset.icon}</span>
                        <div>
                          <div className="text-xs font-bold text-white truncate max-w-[120px]">
                            {getAssetName(asset)}
                          </div>
                          <div className="text-[10px] font-mono text-[#71717a]">
                            {asset.symbol}
                          </div>
                        </div>
                      </div>
                      <span
                        className={`inline-flex items-center text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          isPos
                            ? 'text-emerald-400 bg-emerald-500/10'
                            : 'text-rose-400 bg-rose-500/10'
                        }`}
                      >
                        {isPos ? <TrendingUp className="w-2.5 h-2.5 mr-1" /> : <TrendingDown className="w-2.5 h-2.5 mr-1" />}
                        {isPos ? '+' : ''}
                        {asset.changePercent.toFixed(2)}%
                      </span>
                    </div>

                    <div className="flex items-end justify-between mt-3">
                      <div>
                        <div className="text-sm font-mono font-bold text-white">
                          {formatPrice(asset.price, asset.precision, asset.currency)}
                        </div>
                        <div className="text-[10px] text-[#71717a] font-mono">
                          {asset.high24h > 0 ? `H: ${formatPrice(asset.high24h, asset.precision, asset.currency)}` : ''}
                        </div>
                      </div>
                      <div>{renderSparkline(asset.sparkline, isPos)}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
