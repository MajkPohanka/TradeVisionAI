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
  Scan,
  Check,
  Plus,
  Image as ImageIcon,
} from 'lucide-react';
import { LanguageOption, HoldingPeriod, AppTheme } from '../types';
import { getTranslation } from '../utils/translations';
import { renderTradingViewChartSnapshot, formatTimeframeLabel } from '../utils/chartSnapshotRenderer';
import { getSampleBTCChartDataUrl } from '../utils/sampleChart';

function isCanvasValidChart(canvas: HTMLCanvasElement): boolean {
  if (!canvas || canvas.width < 50 || canvas.height < 50) return false;
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const sampleW = Math.min(canvas.width, 100);
    const sampleH = Math.min(canvas.height, 100);
    const imgData = ctx.getImageData(0, 0, sampleW, sampleH).data;
    if (!imgData || imgData.length === 0) return false;

    let opaqueCount = 0;
    let diffCount = 0;
    const r0 = imgData[0], g0 = imgData[1], b0 = imgData[2];

    for (let i = 0; i < imgData.length; i += 16) {
      if (imgData[i + 3] > 20) opaqueCount++;
      const dr = Math.abs(imgData[i] - r0);
      const dg = Math.abs(imgData[i + 1] - g0);
      const db = Math.abs(imgData[i + 2] - b0);
      if (dr > 15 || dg > 15 || db > 15) {
        diffCount++;
      }
    }
    const totalSampled = imgData.length / 16;
    return (opaqueCount / totalSampled) > 0.5 && (diffCount / totalSampled) > 0.03;
  } catch {
    return false;
  }
}

interface TradingViewLiveChartProps {
  language?: LanguageOption;
  holdingPeriod?: HoldingPeriod;
  onInsertImageToSlot: (dataUrl: string, slotIndex: number) => void;
  onSymbolChange?: (symbol: string) => void;
  slots?: (string | null)[];
  activeSlotIndex?: number | null;
  externalSymbol?: string | null;
  focusTrigger?: number;
  theme?: AppTheme;
}

export function normalizeUserSymbol(raw: string): string {
  const clean = raw.trim().toUpperCase().replace(/\s+/g, '');
  if (!clean) return 'BINANCE:BTCUSDT';
  
  // Direct preset check
  const preset = MARKET_PRESETS.find(
    (p) => p.id.toUpperCase() === clean || p.symbol.toUpperCase() === clean
  );
  if (preset) return preset.symbol;

  // Crypto shortcuts
  if (clean === 'BTC' || clean === 'BITCOIN' || clean === 'BTCUSD' || clean === 'BTCUSDT' || clean === 'BTC/USD') return 'BINANCE:BTCUSDT';
  if (clean === 'ETH' || clean === 'ETHEREUM' || clean === 'ETHUSD' || clean === 'ETHUSDT' || clean === 'ETH/USD') return 'BINANCE:ETHUSDT';
  if (clean === 'SOL' || clean === 'SOLANA' || clean === 'SOLUSD' || clean === 'SOLUSDT' || clean === 'SOL/USD') return 'BINANCE:SOLUSDT';
  if (clean === 'XRP' || clean === 'RIPPLE' || clean === 'XRPUSD' || clean === 'XRPUSDT' || clean === 'XRP/USD') return 'BINANCE:XRPUSDT';
  if (clean === 'BNB' || clean === 'BNBUSD' || clean === 'BNBUSDT') return 'BINANCE:BNBUSDT';
  if (clean === 'DOGE' || clean === 'DOGEUSD' || clean === 'DOGEUSDT') return 'BINANCE:DOGEUSDT';

  // Metals & Commodities
  if (clean === 'GOLD' || clean === 'ZLATO' || clean === 'XAU' || clean === 'XAUUSD' || clean === 'XAU/USD' || clean === 'GC=F' || clean === 'GCF' || clean === 'ORO') return 'OANDA:XAUUSD';
  if (clean === 'SILVER' || clean === 'STRIEBRO' || clean === 'STRIBERO' || clean === 'STRIBR' || clean === 'XAG' || clean === 'XAGUSD' || clean === 'XAG/USD' || clean === 'SI=F' || clean === 'PLATA') return 'OANDA:XAGUSD';
  if (clean === 'OIL' || clean === 'ROPA' || clean === 'USOIL' || clean === 'WTI' || clean === 'CL=F' || clean === 'PETROLEO') return 'TVC:USOIL';
  if (clean === 'BRENT' || clean === 'UKOIL' || clean === 'BZ=F') return 'TVC:UKOIL';

  // Indices
  if (clean === 'SP500' || clean === 'SPX' || clean === 'US500' || clean === '^GSPC') return 'CAPITALCOM:US500';
  if (clean === 'NASDAQ' || clean === 'NDX' || clean === 'US100' || clean === '^NDX') return 'CAPITALCOM:US100';
  if (clean === 'DOW' || clean === 'DJI' || clean === 'US30' || clean === '^DJI') return 'CAPITALCOM:US30';
  if (clean === 'DAX' || clean === 'DE40' || clean === 'GER40' || clean === '^GDAXI') return 'CAPITALCOM:DE40';

  // Forex
  if (clean === 'EURUSD' || clean === 'EUR/USD') return 'FX:EURUSD';
  if (clean === 'GBPUSD' || clean === 'GBP/USD') return 'FX:GBPUSD';
  if (clean === 'USDJPY' || clean === 'USD/JPY') return 'FX:USDJPY';
  if (clean === 'USDCHF' || clean === 'USD/CHF') return 'FX:USDCHF';
  if (clean === 'AUDUSD' || clean === 'AUD/USD') return 'FX:AUDUSD';
  if (clean === 'USDCAD' || clean === 'USD/CAD') return 'FX:USDCAD';

  if (!clean.includes(':')) {
    if (clean.endsWith('USDT') || clean.endsWith('BUSD')) return `BINANCE:${clean}`;
    if (clean.length === 6 && !clean.includes('=')) return `FX:${clean}`;
  }

  return clean;
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
  { id: 'btc', name: 'Bitcoin (BTC)', symbol: 'BINANCE:BTCUSDT', category: 'crypto', icon: '₿' },
  { id: 'eth', name: 'Ethereum (ETH)', symbol: 'BINANCE:ETHUSDT', category: 'crypto', icon: 'Ξ' },
  { id: 'sol', name: 'Solana (SOL)', symbol: 'BINANCE:SOLUSDT', category: 'crypto', icon: '◎' },
  { id: 'xrp', name: 'Ripple (XRP)', symbol: 'BINANCE:XRPUSDT', category: 'crypto', icon: '✕' },
  { id: 'eurusd', name: 'EUR/USD', symbol: 'FX:EURUSD', category: 'forex', icon: '💶' },
  { id: 'gbpusd', name: 'GBP/USD', symbol: 'FX:GBPUSD', category: 'forex', icon: '💷' },
  { id: 'usdjpy', name: 'USD/JPY', symbol: 'FX:USDJPY', category: 'forex', icon: '🇯🇵' },
  { id: 'usdchf', name: 'USD/CHF', symbol: 'FX:USDCHF', category: 'forex', icon: '🇨🇭' },
];

const TIMEFRAMES = [
  { label: '1D', value: 'D', role: 'Macro' },
  { label: '4H', value: '240', role: 'HTF' },
  { label: '1H', value: '60', role: 'HTF/MTF' },
  { label: '30m', value: '30', role: 'MTF' },
  { label: '15m', value: '15', role: 'MTF' },
  { label: '5m', value: '5', role: 'LTF' },
  { label: '1m', value: '1', role: 'Trigger' },
];

const BLACKLISTED_TV_WORDS = new Set([
  'COMPARE', 'DRAWING_TOOLS', 'DRAWING_TOOLBAR', 'HEADER', 'FOOTER', 'PANE', 'CHART',
  'STUDIES', 'INDICATORS', 'EVENTS', 'RESOLUTION', 'INTERVAL', 'TIMEZONE', 'FULLSCREEN',
  'SAVE_IMAGE', 'WIDGET', 'LOAD', 'LOADED', 'READY', 'LAYOUT', 'UNDEFINED', 'NULL',
  'OBJECT', 'SYMBOL', 'TICKER', 'NAME', 'VALUE', 'TRUE', 'FALSE', 'CANDLE', 'BAR',
  'SERIES', 'OVERLAY', 'PANE_0', 'PANE_1', 'PANE_2', 'MAIN_PANE', 'ADVANCED_CHART',
  'PRICE_SCALE', 'TIME_SCALE', 'WIDGETREADY', 'WIDGET_READY', 'CHARTREADY', 'CHART_READY',
  'INIT', 'INITIALIZED', 'LOADING', 'ERROR', 'SUCCESS', 'CONTENT', 'MESSAGE', 'EVENT',
  'STATE', 'UPDATE', 'CHANGE', 'VIEW', 'ACTION', 'DATAFEED', 'HISTORY', 'QUOTES'
]);

function isSymbolCandidate(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || s.length < 2 || s.length > 32 || s.startsWith('{') || s.startsWith('[') || s.startsWith('data:')) return null;
  const upper = s.toUpperCase().replace(/\s+/g, '');
  if (BLACKLISTED_TV_WORDS.has(upper)) return null;
  
  if (upper.includes(':')) {
    return s;
  }

  // Without a colon, require it to look like a strict crypto/forex/commodity ticker (e.g. BTCUSDT, EURUSD, XAUUSD)
  const isLikelyTicker = /^[A-Z0-9^=_\-\/\.]{2,12}$/.test(upper);
  if (!isLikelyTicker) return null;

  // Reject pure alphabetic words longer than 5 chars that are likely UI messages
  if (/^[A-Z]+$/.test(upper) && upper.length > 5 && !['GOLD', 'SILVER', 'BITCOIN', 'ETHEREUM', 'SOLANA', 'RIPPLE', 'NASDAQ'].includes(upper)) {
    return null;
  }

  return s;
}

function isTimeframeCandidate(val: any): string | null {
  if (val === null || val === undefined) return null;
  const s = String(val).trim();
  if (!s || s.length > 10 || s.startsWith('{') || s.startsWith('[')) return null;
  const upper = s.toUpperCase();
  if (/^(?:\d{1,4}|[1-9]\d*[mhdMHD]?|D|W|M|1D|1W|1M|DAILY|WEEKLY|MONTHLY)$/i.test(upper)) {
    return s;
  }
  return null;
}

function normalizeIncomingInterval(raw: string): string {
  if (!raw) return '15';
  const clean = raw.toString().trim();
  const upper = clean.toUpperCase();

  // Exact 1m
  if (clean === '1' || clean === '1m' || upper === '1MIN' || upper === '1MINUTE') return '1';
  // 3m / 5m
  if (clean === '3' || clean === '3m' || clean === '5' || clean === '5m' || upper === '3MIN' || upper === '5MIN' || upper === '5MINUTE') return '5';
  // 15m
  if (clean === '15' || clean === '15m' || upper === '15MIN' || upper === '15MINUTE') return '15';
  // 30m
  if (clean === '30' || clean === '30m' || upper === '30MIN' || upper === '30MINUTE') return '30';
  // 1h (60)
  if (clean === '60' || clean === '60m' || upper === '1H' || upper === '1HOUR' || upper === '60MIN') return '60';
  // 2h / 3h
  if (clean === '120' || upper === '2H' || clean === '180' || upper === '3H') return '60';
  // 4h (240)
  if (clean === '240' || clean === '240m' || upper === '4H' || upper === '4HOUR') return '240';
  // Daily (D, 1D, DAILY, 24H, 1DAY)
  if (upper === 'D' || upper === '1D' || upper === 'DAILY' || upper === '24H' || upper === '1DAY' || upper === 'W' || upper === '1W' || upper === 'M') {
    return 'D';
  }

  return clean;
}

function extractTvMessageData(msg: any): { interval?: string; symbol?: string } | null {
  if (!msg) return null;

  // Direct primitive check
  const directTf = isTimeframeCandidate(msg);
  if (directTf) {
    return { interval: directTf };
  }

  let parsed = msg;

  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
      const parsedDirectTf = isTimeframeCandidate(parsed);
      if (parsedDirectTf) {
        return { interval: parsedDirectTf };
      }
    } catch {
      const intervalMatch =
        parsed.match(/"(?:resolution|interval|timeframe|period|res|tf|time_frame)":\s*"([^"]+)"/i) ||
        parsed.match(/"(?:resolution|interval|timeframe|period|res|tf|time_frame)":\s*(\d+)/i) ||
        parsed.match(/(?:change-resolution|set-resolution|onIntervalChanged|resolution_change|timeframe)[\s\S]*?"(?:data|value|res|resolution)":\s*"([^"]+)"/i) ||
        parsed.match(/(?:change-resolution|set-resolution|onIntervalChanged|resolution_change|timeframe)[\s\S]*?"(?:data|value|res|resolution)":\s*(\d+)/i);

      const symbolMatch =
        parsed.match(/"(?:symbol|ticker|pro_name|short_name|pro_symbol)":\s*"([^"]+)"/i) ||
        parsed.match(/(?:set-symbol|change-symbol|onSymbolChanged|symbol_change)[\s\S]*?"(?:data|value|symbol|ticker)":\s*"([^"]+)"/i);

      const symCandidate = symbolMatch ? isSymbolCandidate(symbolMatch[1]) : null;

      if (intervalMatch || symCandidate) {
        return {
          interval: intervalMatch ? (intervalMatch[1] || intervalMatch[2]) : undefined,
          symbol: symCandidate || undefined,
        };
      }
      return null;
    }
  }

  if (typeof parsed !== 'object' || parsed === null) return null;

  let foundInterval: string | undefined = undefined;
  let foundSymbol: string | undefined = undefined;

  const CANDLE_KEYS = ['resolution', 'interval', 'timeframe', 'period', 'res', 'tf', 'time_frame'];
  const SYMBOL_KEYS = ['symbol', 'ticker', 'pro_name', 'short_name', 'pro_symbol', 'name'];

  const traverse = (obj: any, depth = 0) => {
    if (!obj || typeof obj !== 'object' || depth > 5) return;

    for (const key of Object.keys(obj)) {
      const kLower = key.toLowerCase();
      if (!foundInterval && CANDLE_KEYS.includes(kLower)) {
        const candidate = isTimeframeCandidate(obj[key]);
        if (candidate) {
          foundInterval = candidate;
        }
      }

      if (!foundSymbol && SYMBOL_KEYS.includes(kLower)) {
        const candidate = isSymbolCandidate(obj[key]);
        if (candidate) {
          foundSymbol = candidate;
        }
      }
    }

    const eventName = String(obj.name || obj.event || obj.type || obj.action || '').toLowerCase();
    if (!foundInterval && (eventName.includes('resolution') || eventName.includes('timeframe') || eventName.includes('interval'))) {
      if (!eventName.includes('range')) {
        const candidate =
          isTimeframeCandidate(obj.data) ||
          isTimeframeCandidate(obj.value) ||
          isTimeframeCandidate(obj.val) ||
          isTimeframeCandidate(obj.payload) ||
          isTimeframeCandidate(obj.resolution) ||
          isTimeframeCandidate(obj.timeframe);
        if (candidate) {
          foundInterval = candidate;
        }
      }
    }

    if (!foundSymbol && (eventName.includes('symbol') || eventName.includes('ticker'))) {
      const candidate =
        isSymbolCandidate(obj.data) ||
        isSymbolCandidate(obj.value) ||
        isSymbolCandidate(obj.val) ||
        isSymbolCandidate(obj.payload) ||
        isSymbolCandidate(obj.symbol) ||
        isSymbolCandidate(obj.ticker);
      if (candidate) {
        foundSymbol = candidate;
      }
    }

    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (typeof val === 'object' && val !== null) {
        traverse(val, depth + 1);
      }
    }
  };

  traverse(parsed);

  if (foundInterval || foundSymbol) {
    return { interval: foundInterval, symbol: foundSymbol };
  }
  return null;
}

export const TradingViewLiveChart: React.FC<TradingViewLiveChartProps> = ({
  language = 'cs',
  holdingPeriod = 'intraday',
  onInsertImageToSlot,
  onSymbolChange,
  slots = [null, null, null],
  activeSlotIndex = 0,
  externalSymbol = null,
  focusTrigger = 0,
  theme = 'light',
}) => {
  const isLight = theme === 'light';
  const t = getTranslation(language);

  const isLightTheme = theme === 'light';
  const tvTheme = isLightTheme ? 'light' : 'dark';
  const tvBgColor = isLightTheme ? '#eef1f5' : theme === 'black' ? '#000000' : '#0d0d11';
  const tvGridColor = isLightTheme ? 'rgba(15, 23, 42, 0.05)' : 'rgba(255, 255, 255, 0.04)';
  const tvLocale = language === 'cs' ? 'cs' : language === 'es' ? 'es' : 'en';

  const [symbol, setSymbol] = useState<string>(() => externalSymbol || 'OANDA:XAUUSD');
  const [customSymbolInput, setCustomSymbolInput] = useState<string>('');
  const [interval, setInterval] = useState<string>('15');
  const [isExpanded, setIsExpanded] = useState<boolean>(true);
  const [chartHeight, setChartHeight] = useState<'standard' | 'tall' | 'fullscreen'>('standard');
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isHighlighted, setIsHighlighted] = useState<boolean>(false);
  const chartFrameContainerRef = useRef<HTMLDivElement>(null);
  const widgetInstanceRef = useRef<any>(null);
  const tvContainerId = 'tradingview_live_chart_embed_box';

  const intervalRef = useRef<string>(interval);
  const symbolRef = useRef<string>(symbol);
  const lastUserBarClickTimeRef = useRef<number>(0);
  const lastTopBarResolutionRef = useRef<string>('');
  const mountedChartKeyRef = useRef<string>('');

  // Helper for displaying auto-dismissing toast notifications
  const showToast = useCallback((text: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((prev) => (prev?.text === text ? null : prev));
    }, 3200);
  }, []);

  const updateSymbol = useCallback((newSymbol: string, propagate = true) => {
    const norm = normalizeUserSymbol(newSymbol);
    symbolRef.current = norm;
    setSymbol(norm);
    if (propagate) {
      onSymbolChange?.(norm);
    }
  }, [onSymbolChange]);

  useEffect(() => {
    intervalRef.current = interval;
  }, [interval]);

  useEffect(() => {
    symbolRef.current = symbol;
    onSymbolChange?.(symbol);
  }, [symbol, onSymbolChange]);

  // Bi-directional Timeframe & Symbol Sync: Listen for timeframe & symbol changes originating inside TradingView chart widget
  useEffect(() => {
    const handleWindowMessage = (event: MessageEvent) => {
      try {
        let data = event.data;
        if (!data) return;

        const extracted = extractTvMessageData(data);
        if (extracted?.interval) {
          const norm = normalizeIncomingInterval(extracted.interval);
          if (norm && norm !== intervalRef.current) {
            // Filter out echoes of old resolutions within 1.2s of a top bar click
            if (Date.now() - lastUserBarClickTimeRef.current < 1200 && norm !== lastTopBarResolutionRef.current) {
              return;
            }
            intervalRef.current = norm;
            mountedChartKeyRef.current = `${symbolRef.current}_${norm}_${tvTheme}_${tvLocale}_${tvBgColor}`;
            setInterval(norm);
          }
        }
        if (extracted?.symbol) {
          const rawSym = String(extracted.symbol).trim();
          if (rawSym.includes(':') || MARKET_PRESETS.some(p => p.symbol.toUpperCase() === rawSym.toUpperCase() || p.id.toUpperCase() === rawSym.toUpperCase())) {
            const normSym = normalizeUserSymbol(rawSym);
            if (normSym && normSym !== symbolRef.current) {
              symbolRef.current = normSym;
              mountedChartKeyRef.current = `${normSym}_${intervalRef.current}_${tvTheme}_${tvLocale}_${tvBgColor}`;
              setSymbol(normSym);
              onSymbolChange?.(normSym);
              const matchingPreset = MARKET_PRESETS.find((p) => p.symbol === normSym);
              const label = matchingPreset ? matchingPreset.name : normSym.replace(/^[A-Z0-9]+:/, '');
              showToast(
                language === 'cs'
                  ? `✓ Trh přepnut na: ${label}`
                  : `✓ Market switched to: ${label}`,
                'info'
              );
            }
          }
        }
      } catch {}
    };

    window.addEventListener('message', handleWindowMessage);
    return () => {
      window.removeEventListener('message', handleWindowMessage);
    };
  }, [tvTheme, tvLocale, tvBgColor, language, showToast, onSymbolChange]);

  const handleSetIntervalFromTopBar = (newVal: string) => {
    const norm = normalizeIncomingInterval(newVal);
    lastUserBarClickTimeRef.current = Date.now();
    lastTopBarResolutionRef.current = norm;
    intervalRef.current = norm;

    if (widgetInstanceRef.current && typeof widgetInstanceRef.current.chart === 'function') {
      try {
        widgetInstanceRef.current.chart().setResolution(norm);
      } catch {}
    }

    // Explicitly update React state so useEffect re-mounts chart with new interval
    setInterval(norm);
  };

  // Sync external symbol if requested (e.g. when clicking on top Market Overview bar)
  useEffect(() => {
    if (externalSymbol && externalSymbol !== symbolRef.current) {
      const norm = normalizeUserSymbol(externalSymbol);
      symbolRef.current = norm;
      setSymbol(norm);
      setIsExpanded(true);

      // Trigger visual glow highlight
      setIsHighlighted(true);
      const highlightTimer = setTimeout(() => setIsHighlighted(false), 2800);

      // Visual feedback toast
      const matchingPreset = MARKET_PRESETS.find((p) => p.symbol === norm);
      const label = matchingPreset ? matchingPreset.name : norm.replace(/^[A-Z0-9]+:/, '');
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
  }, [externalSymbol, focusTrigger, language, showToast]);

  // Global paste handler to directly capture any copied chart screenshot into the first free slot
  useEffect(() => {
    const handleGlobalPaste = async (e: ClipboardEvent) => {
      // Do not intercept if user is typing in an input or textarea
      const activeEl = document.activeElement;
      if (
        activeEl &&
        (activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          (activeEl as HTMLElement).isContentEditable)
      ) {
        return;
      }

      const items = e.clipboardData?.items;
      if (!items || items.length === 0) return;

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.type.indexOf('image') !== -1) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            const dataUrl = await fileToDataUrl(file);
            const targetSlot = getTargetSlotIndex();
            const targetLabel = `Slot ${targetSlot + 1}`;
            onInsertImageToSlot(dataUrl, targetSlot);
            showToast(
              language === 'cs'
                ? `✓ Snímek grafu ze schránky byl vložen do ${targetLabel}!`
                : `✓ Chart snapshot from clipboard inserted into ${targetLabel}!`,
              'success'
            );
            scrollToSlot(targetSlot);
            return;
          }
        }
      }

      const text = e.clipboardData?.getData('text/plain')?.trim();
      if (text && (text.startsWith('http://') || text.startsWith('https://') || text.startsWith('data:image/'))) {
        if (text.match(/\.(jpeg|jpg|png|webp|gif)/i) || text.includes('tradingview.com/x/') || text.startsWith('data:image/')) {
          e.preventDefault();
          handleFetchUrlSnapshot(text);
        }
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [activeSlotIndex, slots, language]);

  // Hidden file input for direct slot uploading
  const slotFileInputRef = useRef<HTMLInputElement>(null);
  const targetSlotRef = useRef<number>(0);

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
      theme: tvTheme,
      style: '1', // Candlesticks
      locale: tvLocale,
      enable_publishing: false,
      allow_symbol_change: true,
      hide_side_toolbar: false, // Essential: drawing tools for support/resistance, boxes, fibs
      hide_top_toolbar: false, // Essential: timeframe switchers, indicators, camera snapshot
      withdateranges: true,
      save_image: false, // User requested removing camera icon from chart
      calendar: false,
      hide_volume: false,
      support_host: 'https://www.tradingview.com',
      backgroundColor: tvBgColor,
      gridColor: tvGridColor,
    };
    return `https://www.tradingview-widget.com/embed-widget/advanced-chart/?locale=${tvLocale}#${encodeURIComponent(
      JSON.stringify(widgetConfig)
    )}`;
  }, [symbol, interval, tvLocale, tvTheme, tvBgColor, tvGridColor]);

  // Mount TradingView widget using TradingView.widget constructor or fallback to iframe
  useEffect(() => {
    if (!isExpanded) return;

    const currentChartKey = `${symbol}_${interval}_${tvTheme}_${tvLocale}_${tvBgColor}`;
    if (mountedChartKeyRef.current === currentChartKey) {
      return;
    }

    mountedChartKeyRef.current = currentChartKey;

    let isMounted = true;

    const mountTradingViewWidget = () => {
      if (!isMounted) return;
      const el = document.getElementById(tvContainerId);
      if (!el) return;

      if (typeof (window as any).TradingView?.widget === 'function') {
        el.innerHTML = '';
        try {
          const widget = new (window as any).TradingView.widget({
            autosize: true,
            symbol: symbol,
            interval: interval,
            timezone: 'Europe/Prague',
            theme: tvTheme,
            style: '1',
            locale: tvLocale,
            enable_publishing: false,
            allow_symbol_change: true,
            hide_side_toolbar: false,
            hide_top_toolbar: false,
            withdateranges: true,
            save_image: false,
            hide_volume: false,
            container_id: tvContainerId,
            backgroundColor: tvBgColor,
            gridColor: tvGridColor,
          });

          widget.onChartReady?.(() => {
            try {
              const chart = widget.chart?.();
              if (chart?.onIntervalChanged) {
                chart.onIntervalChanged().subscribe(null, (newInterval: string) => {
                  const norm = normalizeIncomingInterval(newInterval);
                  if (norm && norm !== intervalRef.current) {
                    intervalRef.current = norm;
                    setInterval(norm);
                  }
                });
              }
              if (chart?.onSymbolChanged) {
                chart.onSymbolChanged().subscribe(null, (newSymbolObj: any) => {
                  const sym = typeof newSymbolObj === 'string' ? newSymbolObj : newSymbolObj?.name || newSymbolObj?.ticker;
                  if (sym && sym !== symbolRef.current) {
                    symbolRef.current = sym;
                    setSymbol(sym);
                  }
                });
              }
            } catch {}
          });

          widgetInstanceRef.current = widget;
          return;
        } catch (err) {
          console.warn('TradingView.widget constructor error, falling back to direct iframe:', err);
        }
      }

      // Direct clean iframe fallback
      el.innerHTML = '';
      const iframe = document.createElement('iframe');
      iframe.src = chartUrl;
      iframe.title = `TradingView Advanced Chart ${symbol}`;
      iframe.className = 'w-full h-full border-0 block';
      iframe.setAttribute('allow', 'clipboard-write; clipboard-read');
      iframe.setAttribute('tabIndex', '-1');
      iframe.setAttribute('scrolling', 'no');
      el.appendChild(iframe);
    };

    mountTradingViewWidget();

    // If tv.js is still loading in the background, re-check
    if (typeof window !== 'undefined' && !(window as any).TradingView?.widget) {
      const pollTimer = window.setInterval(() => {
        if ((window as any).TradingView?.widget) {
          window.clearInterval(pollTimer);
          mountTradingViewWidget();
        }
      }, 250);
      const maxTimer = window.setTimeout(() => {
        window.clearInterval(pollTimer);
      }, 3000);
      return () => {
        isMounted = false;
        window.clearInterval(pollTimer);
        window.clearTimeout(maxTimer);
      };
    }

    return () => {
      isMounted = false;
    };
  }, [symbol, interval, tvLocale, isExpanded, tvTheme, tvBgColor, tvGridColor]);

  const handleApplyCustomSymbol = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = customSymbolInput.trim();
    if (!clean) return;
    const normalized = normalizeUserSymbol(clean);
    updateSymbol(normalized, true);
    setCustomSymbolInput('');
    const displayName = normalized.replace(/^[A-Z0-9]+:/, '');
    showToast(
      language === 'cs' ? `Symbol změněn na ${displayName}` : `Symbol changed to ${displayName}`,
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

  // Determine target slot (first empty slot or slot 0/active slot)
  const getTargetSlotIndex = (): number => {
    if (typeof activeSlotIndex === 'number' && activeSlotIndex >= 0 && activeSlotIndex < 3 && !slots[activeSlotIndex]) {
      return activeSlotIndex;
    }
    const emptyIdx = slots.findIndex((s) => !s);
    if (emptyIdx !== -1) return emptyIdx;
    if (typeof activeSlotIndex === 'number' && activeSlotIndex >= 0 && activeSlotIndex < 3) {
      return activeSlotIndex;
    }
    return 0;
  };

  // Fetch chart image from TradingView snapshot link or image URL
  const handleFetchUrlSnapshot = async (urlToFetch: string) => {
    const trimmed = urlToFetch.trim();
    if (!trimmed) return;
    setIsCapturing(true);
    try {
      const res = await fetch('/api/fetch-chart-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: trimmed }),
      });
      const data = await res.json();
      if (data && data.success && data.dataUrl) {
        const targetSlot = getTargetSlotIndex();
        const targetLabel = `Slot ${targetSlot + 1}`;
        onInsertImageToSlot(data.dataUrl, targetSlot);
        showToast(
          language === 'cs'
            ? `✓ Snímek z odkazu byl úspěšně vložen do ${targetLabel}!`
            : `✓ Chart snapshot fetched and inserted into ${targetLabel}!`,
          'success'
        );
        scrollToSlot(targetSlot);
      } else {
        showToast(
          data?.error || (language === 'cs' ? 'Nepodařilo se stáhnout snímek z odkazu.' : 'Failed to fetch snapshot from link.'),
          'warning'
        );
      }
    } catch {
      showToast(
        language === 'cs' ? 'Chyba při stahování snímku.' : 'Error fetching snapshot.',
        'warning'
      );
    } finally {
      setIsCapturing(false);
    }
  };

  // 1-Click Unified Snapshot Function: Captures current chart and places directly into next free slot
  const handleCaptureCurrentChart = async () => {
    if (isCapturing) return;
    setIsCapturing(true);

    const activeSymbol = symbolRef.current || symbol;
    const activeInterval = intervalRef.current || interval;
    const targetSlot = getTargetSlotIndex();
    const targetLabel = `Slot ${targetSlot + 1}`;
    const cleanSymbolName = activeSymbol.replace(/^[A-Z0-9]+:/, '');

    try {
      // 1. PRIMARY ENGINE: Real-time candlestick data fetch + high-def chart snapshot rendering (1280x720)
      try {
        const res = await fetch('/api/chart-candles', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol: activeSymbol, timeframe: activeInterval }),
        });
        if (res.ok) {
          const chartData = await res.json();
          if (chartData && chartData.success && Array.isArray(chartData.candles) && chartData.candles.length > 0) {
            const displayTf = formatTimeframeLabel(chartData.timeframe || activeInterval);
            const dataUrl = renderTradingViewChartSnapshot({
              symbol: chartData.canonicalSymbol || chartData.symbol || cleanSymbolName,
              timeframe: displayTf,
              displayName: chartData.displayName || cleanSymbolName,
              candles: chartData.candles,
              precision: chartData.precision ?? 2,
              currentPrice: chartData.currentPrice,
              priceChangePercent: chartData.priceChangePercent,
              theme: isLightTheme ? 'light' : 'dark',
              width: 1280,
              height: 720,
            });
            onInsertImageToSlot(dataUrl, targetSlot);
            showToast(
              language === 'cs'
                ? `✓ Graf ${cleanSymbolName} (${displayTf}) byl úspěšně vyfocen a vložen do ${targetLabel}!`
                : `✓ Chart ${cleanSymbolName} (${displayTf}) captured and inserted into ${targetLabel}!`,
              'success'
            );
            scrollToSlot(targetSlot);
            setIsCapturing(false);
            return;
          }
        }
      } catch (candleErr) {
        console.warn('Candle snapshot fallback error:', candleErr);
      }

      // 3. Try browser screen capture cropped to the exact chart container (desktop)
      if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getDisplayMedia === 'function') {
        try {
          const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
              displaySurface: 'browser',
            } as any,
            preferCurrentTab: true,
          } as any);

          const video = document.createElement('video');
          video.srcObject = stream;
          video.muted = true;
          await video.play();

          // Wait brief tick for frame to render
          await new Promise((r) => setTimeout(r, 200));

          const container = chartFrameContainerRef.current;
          if (container) {
            const rect = container.getBoundingClientRect();
            const videoTrack = stream.getVideoTracks()[0];
            const settings = videoTrack?.getSettings() || {};
            const vWidth = video.videoWidth || settings.width || window.innerWidth;
            const vHeight = video.videoHeight || settings.height || window.innerHeight;

            const scaleX = vWidth / window.innerWidth;
            const scaleY = vHeight / window.innerHeight;

            const sx = Math.max(0, rect.left * scaleX);
            const sy = Math.max(0, rect.top * scaleY);
            const sWidth = Math.min(vWidth - sx, rect.width * scaleX);
            const sHeight = Math.min(vHeight - sy, rect.height * scaleY);

            if (sWidth > 50 && sHeight > 50) {
              const canvas = document.createElement('canvas');
              canvas.width = sWidth;
              canvas.height = sHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(video, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);
                const dataUrl = canvas.toDataURL('image/jpeg', 0.95);
                stream.getTracks().forEach((t) => t.stop());

                onInsertImageToSlot(dataUrl, targetSlot);
                showToast(
                  language === 'cs'
                    ? `✓ Graf byl úspěšně vyfocen a vložen do ${targetLabel}!`
                    : `✓ Chart captured and inserted into ${targetLabel}!`,
                  'success'
                );
                scrollToSlot(targetSlot);
                setIsCapturing(false);
                return;
              }
            }
          }
          stream.getTracks().forEach((t) => t.stop());
        } catch {
          // If user cancelled screen capture dialog, continue smoothly
        }
      }

      // 4. Check system clipboard for image
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.read) {
        try {
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
                return;
              }
            }
          }
        } catch {
          // Clipboard read not permitted or empty
        }
      }

      // 5. Check clipboard text for TradingView snapshot link (https://www.tradingview.com/x/...)
      if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.readText) {
        try {
          const text = (await navigator.clipboard.readText()).trim();
          if (text.startsWith('data:image/')) {
            onInsertImageToSlot(text, targetSlot);
            showToast(
              language === 'cs'
                ? `✓ Snímek grafu byl vložen do ${targetLabel}!`
                : `✓ Chart snapshot inserted into ${targetLabel}!`,
              'success'
            );
            scrollToSlot(targetSlot);
            setIsCapturing(false);
            return;
          } else if (text.includes('tradingview.com/x/') || text.match(/\.(png|jpe?g|webp)$/i)) {
            const res = await fetch('/api/fetch-chart-image', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ url: text }),
            });
            const data = await res.json();
            if (data && data.success && data.dataUrl) {
              onInsertImageToSlot(data.dataUrl, targetSlot);
              showToast(
                language === 'cs'
                  ? `✓ Snímek z TradingView byl vložen do ${targetLabel}!`
                  : `✓ TradingView snapshot inserted into ${targetLabel}!`,
                'success'
              );
              scrollToSlot(targetSlot);
              setIsCapturing(false);
              return;
            }
          }
        } catch {
          // Proceed
        }
      }

      // 6. Final fallback: Generate clean dynamic snapshot matching current symbol
      const fallbackDisplayTf = formatTimeframeLabel(interval);
      const fallbackUrl = renderTradingViewChartSnapshot({
        symbol: cleanSymbolName,
        timeframe: fallbackDisplayTf,
        displayName: cleanSymbolName,
        theme: isLightTheme ? 'light' : 'dark',
        width: 1280,
        height: 720,
      });
      onInsertImageToSlot(fallbackUrl, targetSlot);
      showToast(
        language === 'cs'
          ? `✓ Snímek grafu (${cleanSymbolName}) byl vložen do ${targetLabel}!`
          : `✓ Chart snapshot (${cleanSymbolName}) inserted into ${targetLabel}!`,
        'success'
      );
      scrollToSlot(targetSlot);
    } finally {
      setIsCapturing(false);
    }
  };

  // Handle file selected from native picker
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const targetSlot = targetSlotRef.current;
    const targetLabel = `Slot ${targetSlot + 1}`;

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

  // Handle Drag & Drop directly onto the snapshot button
  const handleDropOnSnapshot = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const targetSlot = getTargetSlotIndex();
    const targetLabel = `Slot ${targetSlot + 1}`;
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      try {
        const dataUrl = await fileToDataUrl(file);
        onInsertImageToSlot(dataUrl, targetSlot);
        showToast(
          language === 'cs'
            ? `✓ Snímek byl přetažen a vložen do ${targetLabel}!`
            : `✓ Snapshot dropped into ${targetLabel}!`,
          'success'
        );
        scrollToSlot(targetSlot);
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
      className={`border rounded-2xl sm:rounded-3xl shadow-2xl transition-all duration-500 relative overflow-hidden rr-block rr-ignore scroll-mt-20 sm:scroll-mt-24 ${
        isLight
          ? 'bg-[#f1f5f9] border-slate-300/80 shadow-slate-300/30'
          : 'bg-[#121216] border-white/[0.08]'
      } ${
        isHighlighted
          ? 'border-emerald-500 shadow-2xl shadow-emerald-500/30 ring-4 ring-emerald-500/40'
          : ''
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
      <div className={`p-3 sm:p-4 border-b flex flex-wrap items-center justify-between gap-3 ${
        isLight
          ? 'bg-slate-200/90 border-slate-300/90'
          : 'bg-[#15151c]/90 border-white/[0.08]'
      }`}>
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-500 shadow-sm">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h2 className={`text-xs sm:text-sm font-extrabold tracking-wide ${isLight ? 'text-slate-900' : 'text-white'}`}>
                {t.tvLiveChartTitle || 'Živý TradingView Graf & Snímkovací Stanice'}
              </h2>
              <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold ${
                isLight
                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
              }`}>
                LIVE
              </span>
            </div>
            <p className={`text-[10px] sm:text-[11px] ${isLight ? 'text-slate-600 font-medium' : 'text-[#86868b]'}`}>
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
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg border text-xs transition cursor-pointer flex items-center space-x-1.5 ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300 shadow-xs'
                : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#a1a1a6] hover:text-white border-white/[0.06]'
            }`}
            title={t.tvOpenTradingViewTooltip || 'Otevřít na TradingView.com'}
          >
            <ExternalLink className={`w-3.5 h-3.5 ${isLight ? 'text-slate-600' : 'text-[#86868b]'}`} />
            <span className="hidden md:inline text-[11px] font-medium">TradingView</span>
          </a>

          {/* Chart Height Toggle */}
          <button
            type="button"
            onClick={() => setChartHeight((prev) => (prev === 'standard' ? 'tall' : 'standard'))}
            className={`p-1.5 sm:px-2.5 sm:py-1 rounded-lg border text-xs transition cursor-pointer flex items-center space-x-1 ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300 shadow-xs'
                : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#a1a1a6] hover:text-white border-white/[0.06]'
            }`}
            title={chartHeight === 'standard' ? (t.tvHeightLargerTooltip || 'Zvětšit výšku grafu') : (t.tvHeightCompactTooltip || 'Standardní výška')}
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span className="hidden sm:inline text-[11px] font-medium">
              {chartHeight === 'standard' ? (t.tvHeightLarger || 'Větší') : (t.tvHeightCompact || 'Kompaktní')}
            </span>
          </button>

          {/* Minimize / Expand Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className={`p-1.5 rounded-lg border text-xs transition cursor-pointer ${
              isLight
                ? 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border-slate-300 shadow-xs'
                : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#a1a1a6] hover:text-white border-white/[0.06]'
            }`}
            title={isExpanded ? (t.tvCollapseChart || 'Sbalit graf') : (t.tvExpandChart || 'Rozbalit graf')}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* 2. Quick Instrument Selector & Timeframe Toolbar */}
      {isExpanded && (
        <div className={`p-2.5 sm:p-3 border-b flex flex-wrap items-center justify-between gap-2.5 ${
          isLight
            ? 'bg-slate-100/95 border-slate-300/80'
            : 'bg-[#0d0d11] border-white/[0.06]'
        }`}>
          {/* Presets Bar */}
          <div
            onWheel={(e) => {
              if (e.deltaY) e.currentTarget.scrollLeft += e.deltaY;
            }}
            className="flex items-center space-x-1 overflow-x-auto py-0.5 max-w-full scrollbar-none"
          >
            {MARKET_PRESETS.map((preset) => {
              const isSelected = (symbolRef.current || symbol) === preset.symbol;
              const label = preset.id === 'gold'
                ? (t.tvPresetGold || 'Zlato')
                : preset.id === 'oil'
                ? (t.tvPresetOil || 'Ropa')
                : preset.name.split(' ')[0];

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => updateSymbol(preset.symbol, true)}
                  className={`px-2 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition cursor-pointer flex items-center space-x-1.5 border ${
                    isSelected
                      ? isLight
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs font-bold'
                        : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm'
                      : isLight
                      ? 'bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-950 border-slate-200/90 shadow-xs'
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
                className={`border rounded-lg px-2.5 py-1 text-xs focus:outline-none w-36 sm:w-44 uppercase font-mono ${
                  isLight
                    ? 'bg-white border-slate-300 focus:border-emerald-500 text-slate-900 placeholder-slate-400 shadow-xs'
                    : 'bg-black/40 border-white/10 focus:border-emerald-400 text-white placeholder-[#636366]'
                }`}
              />
            </div>
            <button
              type="submit"
              disabled={!customSymbolInput.trim()}
              className={`p-1.5 rounded-lg text-xs transition cursor-pointer disabled:opacity-40 ${
                isLight
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                  : 'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30'
              }`}
              title={t.tvSetSymbolBtn || 'Nastavit symbol'}
            >
              <Search className="w-3.5 h-3.5" />
            </button>
          </form>

          {/* Timeframe Selectors + Dedicated Multi-Slot Insertion Buttons */}
          <div className={`flex flex-wrap items-center justify-between w-full pt-2 border-t gap-2 ${
            isLight ? 'border-slate-300/60' : 'border-white/[0.04]'
          }`}>
            {/* Timeframe Quick Switcher */}
            <div className="flex items-center space-x-1">
              <span className={`text-[11px] font-semibold mr-1 hidden sm:inline ${
                isLight ? 'text-slate-700' : 'text-[#86868b]'
              }`}>
                {t.tvTimeframeLabel || 'Timeframe:'}
              </span>
              {TIMEFRAMES.map((tf) => {
                const currentActiveInterval = intervalRef.current || interval;
                const isTfSelected = normalizeIncomingInterval(currentActiveInterval) === normalizeIncomingInterval(tf.value);
                return (
                  <button
                    key={tf.value}
                    type="button"
                    onClick={() => handleSetIntervalFromTopBar(tf.value)}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold font-mono transition cursor-pointer ${
                      isTfSelected
                        ? isLight
                          ? 'bg-emerald-600 text-white shadow-xs'
                          : 'bg-emerald-500 text-black shadow-sm'
                        : isLight
                        ? 'bg-white hover:bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-300 shadow-xs'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] text-[#a1a1a6] hover:text-white border border-white/[0.04]'
                    }`}
                  >
                    <span>{tf.label}</span>
                    <span className="text-[9px] font-normal opacity-75 ml-1 hidden md:inline">({tf.role})</span>
                  </button>
                );
              })}
            </div>

            {/* Snapshot Action Control - Exactly 1 Functional Button */}
            <div
              className="inline-flex items-center"
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={handleDropOnSnapshot}
            >
              {(() => {
                const currentSym = (symbolRef.current || symbol).replace(/^[A-Z0-9]+:/, '');
                const currentTf = formatTimeframeLabel(intervalRef.current || interval);
                return (
                  <button
                    type="button"
                    id="capture-live-chart-btn"
                    onClick={handleCaptureCurrentChart}
                    disabled={isCapturing}
                    className="px-4 sm:px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs sm:text-sm transition-all duration-200 cursor-pointer flex items-center space-x-2.5 shadow-md shadow-emerald-500/25 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed tracking-wide"
                    title={
                      language === 'cs'
                        ? `Vyfotit aktuální graf ${currentSym} (${currentTf}) a vložit do volného pole (Slot ${getTargetSlotIndex() + 1})`
                        : `Capture current chart ${currentSym} (${currentTf}) and insert into available slot (Slot ${getTargetSlotIndex() + 1})`
                    }
                  >
                    {isCapturing && (
                      <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin shrink-0" />
                    )}
                    <span>
                      {isCapturing
                        ? (language === 'cs' ? 'Fotografuji graf...' : 'Capturing chart...')
                        : (language === 'cs'
                            ? `Vyfotit ${currentSym} (${currentTf}) do Slotu ${getTargetSlotIndex() + 1}`
                            : `Capture ${currentSym} (${currentTf}) to Slot ${getTargetSlotIndex() + 1}`)}
                    </span>
                  </button>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* 3. TradingView Embed Container */}
      {isExpanded && (
        <div
          ref={chartFrameContainerRef}
          className={`w-full relative transition-all duration-200 rr-block rr-ignore ${
            isLight ? 'bg-slate-100' : 'bg-[#0d0d11]'
          } ${getContainerHeightClass()}`}
          data-rr-block="true"
        >
          <div
            id={tvContainerId}
            className="w-full h-full relative"
          />
        </div>
      )}

      {/* 4. Snapshot Info Footer */}
      {isExpanded && (
        <div className={`p-3 sm:p-4 border-t text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
          isLight
            ? 'bg-slate-200/80 border-slate-300 text-slate-700'
            : 'bg-[#0a0a0d] border-white/[0.06] text-[#a1a1a6]'
        }`}>
          <div className="flex items-center space-x-2.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
            <span className={`text-[11px] sm:text-xs ${isLight ? 'text-slate-700 font-medium' : 'text-[#86868b]'}`}>
              {language === 'cs'
                ? 'Klikněte na zelené tlačítko „Vyfotit aktuální graf“ výše pro okamžité uložení grafu do analýzy.'
                : 'Click the green "Capture Current Chart" button above to instantly save chart into analysis.'}
            </span>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <span className={`text-[11px] font-mono font-bold px-2.5 py-1 rounded-md border ${
              isLight
                ? 'bg-emerald-100 text-emerald-950 border-emerald-300 shadow-2xs font-extrabold'
                : 'text-emerald-200 bg-emerald-500/20 border-emerald-500/40'
            }`}>
              {language === 'cs' ? 'Rychlé vložení: Ctrl + V' : 'Quick paste: Ctrl + V'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
