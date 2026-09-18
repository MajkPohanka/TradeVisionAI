import { HoldingPeriod } from '../types';

/**
 * Standard minute weights for financial chart timeframes
 * Used to sort multi-timeframe analysis top-down (HTF -> MTF -> LTF)
 */
const TIMEFRAME_WEIGHTS: Record<string, number> = {
  // Monthly / Weekly / Daily
  '1M_MONTH': 43200,
  MN: 43200,
  MONTHLY: 43200,
  '1W': 10080,
  W1: 10080,
  WEEKLY: 10080,
  '1D': 1440,
  D1: 1440,
  DAILY: 1440,
  D: 1440,

  // Hourly
  '4H': 240,
  H4: 240,
  '2H': 120,
  H2: 120,
  '1H': 60,
  H1: 60,

  // Minutes
  '30M': 30,
  M30: 30,
  '15M': 15,
  M15: 15,
  '5M': 5,
  M5: 5,
  '3M': 3,
  M3: 3,
  '1M': 1,
  M1: 1,
};

/**
 * Standardize timeframe token to clean, readable financial notation (e.g. H1, M15, M5, H4, D1)
 */
export function normalizeTimeframeToken(token: string): { label: string; minutes: number } {
  const clean = token.trim().toUpperCase().replace(/\s+/g, '');

  if (clean.includes('MONTH') || clean === 'MN') return { label: '1M', minutes: 43200 };
  if (clean.includes('WEEK') || clean === '1W' || clean === 'W1') return { label: 'W1', minutes: 10080 };
  if (clean.includes('DAY') || clean.includes('DAILY') || clean === '1D' || clean === 'D1' || clean === 'D') return { label: 'D1', minutes: 1440 };

  if (clean === '4H' || clean === 'H4' || clean === '240M' || clean === '240') return { label: 'H4', minutes: 240 };
  if (clean === '2H' || clean === 'H2' || clean === '120M' || clean === '120') return { label: 'H2', minutes: 120 };
  if (clean === '1H' || clean === 'H1' || clean === '60M' || clean === '60') return { label: 'H1', minutes: 60 };

  if (clean === '30M' || clean === 'M30' || clean === '30') return { label: 'M30', minutes: 30 };
  if (clean === '15M' || clean === 'M15' || clean === '15') return { label: 'M15', minutes: 15 };
  if (clean === '5M' || clean === 'M5' || clean === '5') return { label: 'M5', minutes: 5 };
  if (clean === '3M' || clean === 'M3' || clean === '3') return { label: 'M3', minutes: 3 };
  if (clean === '1M' || clean === 'M1' || clean === '1') return { label: 'M1', minutes: 1 };

  // Fallback pattern matching: e.g. "4HOURS", "15MIN"
  const hourMatch = clean.match(/^(\d+)H/);
  if (hourMatch) {
    const hours = parseInt(hourMatch[1], 10);
    return { label: `H${hours}`, minutes: hours * 60 };
  }

  const minMatch = clean.match(/^(\d+)M/);
  if (minMatch) {
    const mins = parseInt(minMatch[1], 10);
    return { label: `M${mins}`, minutes: mins };
  }

  return { label: token.trim(), minutes: TIMEFRAME_WEIGHTS[clean] || 0 };
}

/**
 * Sorts multi-timeframe strings strictly top-down (HTF -> MTF -> LTF)
 * Example: "M5 + M15" -> "M15 + M5"
 * Example: "M5 + H1 + M15" -> "H1 + M15 + M5"
 */
export function sortTimeframeSequence(timeframeStr?: string): string {
  if (!timeframeStr || typeof timeframeStr !== 'string') return '';
  const rawParts = timeframeStr.split(/[+,/&]/).map((p) => p.trim()).filter(Boolean);
  if (rawParts.length <= 1) {
    return normalizeTimeframeToken(timeframeStr).label;
  }

  const normalized = rawParts.map((part) => normalizeTimeframeToken(part));

  // Sort descending by timeframe duration in minutes (Top-Down: HTF -> MTF -> LTF)
  normalized.sort((a, b) => b.minutes - a.minutes);

  // De-duplicate adjacent identical timeframes
  const uniqueLabels: string[] = [];
  normalized.forEach((item) => {
    if (!uniqueLabels.includes(item.label)) {
      uniqueLabels.push(item.label);
    }
  });

  return uniqueLabels.join(' + ');
}

/**
 * Returns the exact sequential timeframe based on holding period and which upload slots have charts.
 * Maps 1:1 to the 3 upload slots in ChartUploader:
 * Slot 01: HTF (Higher Timeframe)
 * Slot 02: MTF (Market Structure)
 * Slot 03: LTF (Entry & Trigger)
 */
export function getSlotTimeframeSequence(
  holdingPeriod: HoldingPeriod = 'intraday',
  slots: (string | null | undefined)[] = []
): string {
  const slotMap: Record<HoldingPeriod, string[]> = {
    scalp: ['H1', 'M15', 'M5'],
    intraday: ['H4', 'M15', 'M5'],
    swing: ['D1', 'H4', 'H1'],
    position: ['W1', 'D1', 'H4'],
  };

  const defaultTfs = slotMap[holdingPeriod] || slotMap.intraday;

  // Filter timeframes corresponding to slots that actually contain uploaded images
  const activeTfs = slots
    .map((img, idx) => (img ? defaultTfs[idx] : null))
    .filter(Boolean) as string[];

  if (activeTfs.length > 0) {
    return activeTfs.join(' + ');
  }

  return defaultTfs.join(' + ');
}

/**
 * Extracts a valid single interval for TradingView widget embed or candle queries (e.g. "15", "60", "240", "D")
 */
export function getTradingViewInterval(timeframe?: string): string {
  if (!timeframe) return '15';
  let clean = timeframe.trim().toUpperCase();
  if (clean.includes('+')) {
    const parts = clean.split('+').map((p) => p.trim()).filter(Boolean);
    // Prefer execution/trigger timeframe (last part, e.g. M5 or M15) or first part
    clean = parts[parts.length - 1] || parts[0] || '15';
  }
  if (clean.includes('DAY') || clean === 'D' || clean === '1D' || clean === 'D1') return 'D';
  if (clean.includes('WEEK') || clean === 'W' || clean === '1W' || clean === 'W1') return 'W';
  if (clean.includes('MONTH') || clean === 'MN') return 'M';
  if (clean === '4H' || clean === 'H4' || clean === '240M' || clean === '240') return '240';
  if (clean === '2H' || clean === 'H2' || clean === '120M' || clean === '120') return '120';
  if (clean === '1H' || clean === 'H1' || clean === '60M' || clean === '60') return '60';
  if (clean === '30M' || clean === 'M30' || clean === '30') return '30';
  if (clean === '15M' || clean === 'M15' || clean === '15') return '15';
  if (clean === '5M' || clean === 'M5' || clean === '5') return '5';
  if (clean === '1M' || clean === 'M1' || clean === '1') return '1';
  return '15';
}

