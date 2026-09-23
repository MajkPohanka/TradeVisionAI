import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, AlertTriangle, ShieldAlert, RefreshCw, Search, Zap, Info, Clock, ChevronDown, ChevronUp } from 'lucide-react';
import { EconomicCalendarEvent, LanguageOption, AppTheme } from '../types';
import { getTranslation } from '../utils/translations';

interface EconomicCalendarWidgetProps {
  symbol?: string;
  language?: LanguageOption;
  theme?: AppTheme;
}

const getTodayFormatted = () => {
  const d = new Date();
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};

const getTomorrowFormatted = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
};

// Preferred canonical currency order requested by user: EUR, GBP, AUD, USD, JPY, CAD, CHF, NZD
const PREFERRED_CURRENCY_ORDER = ['EUR', 'GBP', 'AUD', 'USD', 'JPY', 'CAD', 'CHF', 'NZD', 'CNY'];

interface CurrencyMeta {
  code: string;
  flag: string;
  nameCs: string;
  nameEn: string;
  nameEs: string;
}

const CURRENCY_METAS: Record<string, CurrencyMeta> = {
  EUR: { code: 'EUR', flag: '🇪🇺', nameCs: 'Eurozóna', nameEn: 'Eurozone', nameEs: 'Zona Euro' },
  GBP: { code: 'GBP', flag: '🇬🇧', nameCs: 'Velká Británie', nameEn: 'United Kingdom', nameEs: 'Reino Unido' },
  AUD: { code: 'AUD', flag: '🇦🇺', nameCs: 'Austrálie', nameEn: 'Australia', nameEs: 'Australia' },
  USD: { code: 'USD', flag: '🇺🇸', nameCs: 'Spojené státy', nameEn: 'United States', nameEs: 'Estados Unidos' },
  JPY: { code: 'JPY', flag: '🇯🇵', nameCs: 'Japonsko', nameEn: 'Japan', nameEs: 'Japón' },
  CAD: { code: 'CAD', flag: '🇨🇦', nameCs: 'Kanada', nameEn: 'Canada', nameEs: 'Canadá' },
  CHF: { code: 'CHF', flag: '🇨🇭', nameCs: 'Švýcarsko', nameEn: 'Switzerland', nameEs: 'Suiza' },
  NZD: { code: 'NZD', flag: '🇳🇿', nameCs: 'Nový Zéland', nameEn: 'New Zealand', nameEs: 'Nueva Zelanda' },
  CNY: { code: 'CNY', flag: '🇨🇳', nameCs: 'Čína', nameEn: 'China', nameEs: 'China' },
};

const getCurrencyPriority = (curr: string): number => {
  const c = (curr || '').toUpperCase().trim();
  const idx = PREFERRED_CURRENCY_ORDER.indexOf(c);
  return idx !== -1 ? idx : 99;
};

const extractTimeOnly = (dateStr: string): string => {
  const match = (dateStr || '').match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
  return match ? match[0] : '';
};

const getTimeMinutes = (dateStr: string): number => {
  const time = extractTimeOnly(dateStr);
  if (!time) return 9999;
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
};

export const EconomicCalendarWidget: React.FC<EconomicCalendarWidgetProps> = ({
  symbol,
  language = 'cs',
  theme = 'light',
}) => {
  const isLight = theme === 'light';
  const t = getTranslation(language as LanguageOption);
  const [selectedDate, setSelectedDate] = useState(() => getTodayFormatted());
  const [filterImpact, setFilterImpact] = useState<'ALL' | 'MEDIUM_HIGH' | 'HIGH'>('ALL');
  const [selectedCurrency, setSelectedCurrency] = useState<string>('ALL');
  const [events, setEvents] = useState<EconomicCalendarEvent[]>([]);
  const [marketAdvice, setMarketAdvice] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showImpactGuide, setShowImpactGuide] = useState<boolean>(false);

  const fetchCalendarData = async (targetDate: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/economic-calendar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          date: targetDate,
          symbol,
          language,
        }),
      });

      let data: any = {};
      try {
        const text = await res.text();
        data = JSON.parse(text);
      } catch (e) {
        throw new Error(t.loadingCalendarData || 'Chyba při načítání makro kalendáře.');
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to load economic calendar.');
      }

      if (data.data?.events) {
        setEvents(data.data.events);
      }
      if (data.data?.marketSummaryAdvice) {
        setMarketAdvice(data.data.marketSummaryAdvice);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || t.errorOccurred);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCalendarData(selectedDate);
  }, [language]);

  const handleDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    fetchCalendarData(selectedDate);
  };

  // Compute available currencies and counts from the current loaded events
  const currencyStats = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ev of events) {
      const c = (ev.currency || 'USD').toUpperCase().trim();
      counts[c] = (counts[c] || 0) + 1;
    }

    const available = Object.keys(counts).sort((a, b) => getCurrencyPriority(a) - getCurrencyPriority(b));
    return { counts, available };
  }, [events]);

  // Filter events according to impact and currency
  const filteredEvents = useMemo(() => {
    return events.filter((ev) => {
      // Currency filter
      if (selectedCurrency !== 'ALL' && (ev.currency || '').toUpperCase() !== selectedCurrency) {
        return false;
      }
      // Impact filter
      if (filterImpact === 'HIGH' && ev.impact !== 'HIGH') {
        return false;
      }
      if (filterImpact === 'MEDIUM_HIGH' && ev.impact !== 'HIGH' && ev.impact !== 'MEDIUM') {
        return false;
      }
      return true;
    });
  }, [events, selectedCurrency, filterImpact]);

  // Group events by currency in user's priority order: EUR -> GBP -> AUD -> USD -> others
  const groupedEvents = useMemo(() => {
    const groups: { currency: string; meta: CurrencyMeta; events: EconomicCalendarEvent[] }[] = [];
    const map = new Map<string, EconomicCalendarEvent[]>();

    for (const ev of filteredEvents) {
      const c = (ev.currency || 'USD').toUpperCase().trim();
      if (!map.has(c)) {
        map.set(c, []);
      }
      map.get(c)!.push(ev);
    }

    // Sort currencies by canonical priority
    const sortedCurrencies = Array.from(map.keys()).sort((a, b) => getCurrencyPriority(a) - getCurrencyPriority(b));

    for (const c of sortedCurrencies) {
      const groupEvents = map.get(c)!;
      // Sort events within group chronologically by time
      groupEvents.sort((a, b) => getTimeMinutes(a.date) - getTimeMinutes(b.date));

      const meta = CURRENCY_METAS[c] || {
        code: c,
        flag: '🌐',
        nameCs: c,
        nameEn: c,
        nameEs: c,
      };

      groups.push({
        currency: c,
        meta,
        events: groupEvents,
      });
    }

    return groups;
  }, [filteredEvents]);

  const getLocalizedCurrencyName = (meta: CurrencyMeta) => {
    if (language === 'en') return meta.nameEn;
    if (language === 'es') return meta.nameEs;
    return meta.nameCs;
  };

  return (
    <div className={`border rounded-3xl p-5 sm:p-7 shadow-xl space-y-6 animate-fadeIn transition-colors ${
      isLight
        ? 'bg-white border-slate-300 text-slate-900 shadow-md'
        : 'bg-[#121216] border-white/[0.08] text-[#f5f5f7]'
    }`}>
      {/* Header */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 border-b pb-5 ${
        isLight ? 'border-slate-200' : 'border-white/[0.08]'
      }`}>
        <div className="flex items-center space-x-3.5">
          <div className={`p-3 rounded-2xl border shadow-xs ${
            isLight
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-emerald-500/15 text-emerald-400 border-emerald-500/25'
          }`}>
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className={`text-base font-extrabold tracking-tight flex items-center flex-wrap gap-2 ${
              isLight ? 'text-slate-900' : 'text-white'
            }`}>
              <span>{t.calendarWidgetTitle}</span>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 uppercase tracking-wider ${
                isLight
                  ? 'bg-rose-100 text-rose-800 border-rose-300 shadow-xs'
                  : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
              }`}>
                <ShieldAlert className="w-3 h-3" /> {t.liveFeedBadge}
              </span>
            </h3>
            <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-600' : 'text-[#86868b]'}`}>
              {t.calendarWidgetSubtitle} ({selectedDate})
            </p>
          </div>
        </div>

        {/* Impact Filter Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setFilterImpact('ALL')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer shadow-xs ${
              filterImpact === 'ALL'
                ? (isLight
                  ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                  : 'bg-white border-white text-black shadow-sm font-extrabold')
                : (isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                  : 'bg-white/[0.06] border-white/15 text-slate-300 hover:text-white hover:bg-white/[0.12]')
            }`}
          >
            {t.impactAll || 'Všechny dopady'}
          </button>
          <button
            onClick={() => setFilterImpact('MEDIUM_HIGH')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer shadow-xs ${
              filterImpact === 'MEDIUM_HIGH'
                ? (isLight
                  ? 'bg-amber-600 border-amber-600 text-white shadow-sm'
                  : 'bg-amber-500/25 border-amber-500/60 text-amber-200 shadow-sm font-extrabold')
                : (isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                  : 'bg-white/[0.06] border-white/15 text-slate-300 hover:text-white hover:bg-white/[0.12]')
            }`}
          >
            {t.impactMediumHigh || '🟡 Medium & 🔴 High'}
          </button>
          <button
            onClick={() => setFilterImpact('HIGH')}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer shadow-xs ${
              filterImpact === 'HIGH'
                ? (isLight
                  ? 'bg-rose-600 border-rose-600 text-white shadow-sm'
                  : 'bg-rose-500/25 border-rose-500/60 text-rose-200 shadow-sm font-extrabold')
                : (isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                  : 'bg-white/[0.06] border-white/15 text-slate-300 hover:text-white hover:bg-white/[0.12]')
            }`}
          >
            {t.impactHighOnly || 'Pouze 🔴 High'}
          </button>
        </div>
      </div>

      {/* Date Selector & Presets Bar */}
      <div className={`p-4 rounded-2xl border flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5 ${
        isLight
          ? 'bg-slate-50/90 border-slate-200 text-slate-800'
          : 'bg-black/40 border-white/[0.08]'
      }`}>
        <form onSubmit={handleDateSubmit} className="flex flex-wrap items-center gap-2 flex-1">
          <label className={`text-xs font-bold whitespace-nowrap ${isLight ? 'text-slate-700' : 'text-[#86868b]'}`}>{t.selectDate}</label>
          <input
            type="text"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            placeholder="23.9.2026"
            className={`border rounded-full px-3.5 py-1.5 text-xs w-32 sm:w-44 font-mono transition focus:outline-none ${
              isLight
                ? 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500'
                : 'bg-black/60 border-white/[0.08] text-white placeholder-[#86868b]/60 focus:border-white/30'
            }`}
          />
          <button
            type="submit"
            disabled={isLoading}
            className={`px-4 py-1.5 rounded-full text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50 active:scale-95 shadow-sm ${
              isLight
                ? 'bg-slate-900 text-white hover:bg-black'
                : 'bg-white text-black hover:bg-[#f5f5f7]'
            }`}
          >
            {isLoading ? <RefreshCw className={`w-3.5 h-3.5 animate-spin ${isLight ? 'text-white' : 'text-black'}`} /> : <Search className={`w-3.5 h-3.5 ${isLight ? 'text-white' : 'text-black'}`} />}
            <span>{t.loadCalendar}</span>
          </button>
        </form>

        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pt-1 sm:pt-0">
          <span className={`text-[10px] uppercase font-bold whitespace-nowrap ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>{t.quickSelects}</span>
          <button
            type="button"
            onClick={() => {
              const todayStr = getTodayFormatted();
              setSelectedDate(todayStr);
              fetchCalendarData(todayStr);
            }}
            className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
              selectedDate === getTodayFormatted()
                ? (isLight
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-xs'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs')
                : (isLight
                  ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  : 'bg-white/[0.06] text-slate-300 border-white/15 hover:text-white hover:bg-white/[0.12]')
            }`}
          >
            📅 {t.today} ({getTodayFormatted()})
          </button>
          <button
            type="button"
            onClick={() => {
              const tomorrowStr = getTomorrowFormatted();
              setSelectedDate(tomorrowStr);
              fetchCalendarData(tomorrowStr);
            }}
            className={`px-3 py-1 rounded-full text-[11px] font-bold border transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
              selectedDate === getTomorrowFormatted()
                ? (isLight
                  ? 'bg-emerald-100 text-emerald-800 border-emerald-300 shadow-xs'
                  : 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-xs')
                : (isLight
                  ? 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                  : 'bg-white/[0.06] text-slate-300 border-white/15 hover:text-white hover:bg-white/[0.12]')
            }`}
          >
            🔮 {t.tomorrow} ({getTomorrowFormatted()})
          </button>
        </div>
      </div>

      {/* Currency Filter Bar: Ordered strictly by EU -> GBP -> AUD -> US -> others */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-bold ${isLight ? 'text-slate-800' : 'text-white'}`}>
              {t.filterCurrency || 'Filtr měny'}:
            </span>
            <span className={`text-[11px] ${isLight ? 'text-slate-500' : 'text-slate-400'}`}>
              {t.groupByCurrency || 'Řazení dle měn (EU, GBP, AUD, US...)'}
            </span>
          </div>

          <button
            onClick={() => setShowImpactGuide((prev) => !prev)}
            className={`text-[11px] font-semibold flex items-center space-x-1 cursor-pointer transition ${
              isLight ? 'text-slate-600 hover:text-slate-900' : 'text-slate-300 hover:text-white'
            }`}
          >
            <Info className="w-3.5 h-3.5 text-sky-400" />
            <span>{t.howImpactIsMeasured || 'Jak se měří dopad?'}</span>
            {showImpactGuide ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>

        {/* Currency Quick-Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
          <button
            onClick={() => setSelectedCurrency('ALL')}
            className={`px-3 py-1.5 rounded-xl text-xs font-extrabold border transition-all whitespace-nowrap cursor-pointer active:scale-95 shadow-xs flex items-center space-x-1.5 ${
              selectedCurrency === 'ALL'
                ? (isLight
                  ? 'bg-slate-900 border-slate-900 text-white shadow-sm'
                  : 'bg-white border-white text-black shadow-sm')
                : (isLight
                  ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                  : 'bg-white/[0.06] border-white/15 text-slate-300 hover:text-white hover:bg-white/[0.12]')
            }`}
          >
            <span>🌐 {t.allEvents || 'Všechny události'}</span>
            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
              selectedCurrency === 'ALL'
                ? (isLight ? 'bg-white/20 text-white' : 'bg-black/20 text-black')
                : (isLight ? 'bg-slate-100 text-slate-600' : 'bg-white/15 text-white/90')
            }`}>
              {events.length}
            </span>
          </button>

          {currencyStats.available.map((code) => {
            const meta = CURRENCY_METAS[code] || { code, flag: '🌐', nameCs: code, nameEn: code, nameEs: code };
            const count = currencyStats.counts[code] || 0;
            const isSelected = selectedCurrency === code;

            return (
              <button
                key={code}
                onClick={() => setSelectedCurrency(code)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-all whitespace-nowrap cursor-pointer active:scale-95 shadow-xs flex items-center space-x-1.5 ${
                  isSelected
                    ? (isLight
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                      : 'bg-emerald-500/25 border-emerald-500/60 text-emerald-200 shadow-sm font-extrabold')
                    : (isLight
                      ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-100'
                      : 'bg-white/[0.06] border-white/15 text-slate-300 hover:text-white hover:bg-white/[0.12]')
                }`}
              >
                <span>{meta.flag} {code}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                  isSelected
                    ? (isLight ? 'bg-white/20 text-white' : 'bg-emerald-500/30 text-emerald-100')
                    : (isLight ? 'bg-slate-100 text-slate-600' : 'bg-white/15 text-white/90')
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Explanatory banner: How impact is measured */}
      {showImpactGuide && (
        <div className={`p-4 rounded-2xl border text-xs space-y-2.5 animate-fadeIn ${
          isLight
            ? 'bg-sky-50/80 border-sky-200 text-sky-950'
            : 'bg-[#141d2b] border-sky-500/30 text-sky-200'
        }`}>
          <div className="flex items-center space-x-2 font-bold text-sky-600 dark:text-sky-400">
            <Info className="w-4 h-4 flex-shrink-0" />
            <span>{t.impactGuideTitle || 'Podle čeho se měří dopad zpráv?'}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-white border-rose-200 text-slate-800' : 'bg-black/40 border-rose-500/30 text-white'
            }`}>
              <div className="flex items-center space-x-1.5 font-extrabold text-rose-600 dark:text-rose-400 mb-1">
                <span>{t.impactGuideHighTitle || '🔴 HIGH (Vysoký dopad)'}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-[#a1a1a6]">
                {t.impactGuideHighDesc || 'Zprávy s přímým vlivem na úrokové sazby a inflaci (NFP, CPI, rozhodnutí FOMC/ECB). Vyvolávají masivní volatilitu, slippage a rozšíření spreadů.'}
              </p>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-white border-amber-200 text-slate-800' : 'bg-black/40 border-amber-500/30 text-white'
            }`}>
              <div className="flex items-center space-x-1.5 font-extrabold text-amber-600 dark:text-amber-400 mb-1">
                <span>{t.impactGuideMediumTitle || '🟡 MEDIUM (Střední dopad)'}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-[#a1a1a6]">
                {t.impactGuideMediumDesc || 'Indexy nákupních manažerů (PMI), maloobchodní tržby, zásoby ropy. Způsobují lokální cenové impulsy na párech s danou měnou.'}
              </p>
            </div>

            <div className={`p-3 rounded-xl border ${
              isLight ? 'bg-white border-slate-200 text-slate-800' : 'bg-black/40 border-white/[0.08] text-white'
            }`}>
              <div className="flex items-center space-x-1.5 font-extrabold text-slate-600 dark:text-slate-400 mb-1">
                <span>{t.impactGuideLowTitle || '⚪ LOW (Nízký dopad)'}</span>
              </div>
              <p className="text-[11px] leading-relaxed text-slate-600 dark:text-[#a1a1a6]">
                {t.impactGuideLowDesc || 'Běžné dílčí statistiky a aukce dluhopisů. Obvykle nemají žádný významný vliv na tržní strukturu.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {marketAdvice && (
        <div className={`p-4 rounded-2xl border text-xs flex items-start space-x-3 shadow-xs ${
          isLight
            ? 'bg-amber-50/90 border-amber-300 text-amber-950'
            : 'bg-amber-950/30 border-amber-500/25 text-amber-200'
        }`}>
          <Zap className={`w-4 h-4 flex-shrink-0 mt-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
          <div>
            <div className={`font-bold mb-1 ${isLight ? 'text-amber-900 font-extrabold' : 'text-amber-300'}`}>
              {t.mentorDateAdvice} {selectedDate}:
            </div>
            <p className={`leading-relaxed ${isLight ? 'text-slate-800 font-medium' : 'text-[#a1a1a6]'}`}>{marketAdvice}</p>
          </div>
        </div>
      )}

      {error && (
        <div className={`p-3.5 rounded-2xl border text-xs font-semibold ${
          isLight
            ? 'bg-rose-50 border-rose-200 text-rose-800'
            : 'bg-red-950/40 border-red-500/30 text-red-300'
        }`}>
          {error}
        </div>
      )}

      {/* Events Grouped by Currency Sections (EUR, GBP, AUD, USD, ...) */}
      {isLoading ? (
        <div className="py-14 text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-500" />
          <p className={`text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-white'}`}>{t.loadingCalendarData}</p>
        </div>
      ) : groupedEvents.length === 0 ? (
        <div className={`py-12 text-center text-xs font-medium ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>
          {t.noEventsFoundForDate}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedEvents.map((group) => {
            const hasHigh = group.events.some((e) => e.impact === 'HIGH');
            const hasMedium = group.events.some((e) => e.impact === 'MEDIUM');

            return (
              <div key={group.currency} className="space-y-3">
                {/* Currency Section Header */}
                <div className={`flex items-center justify-between pb-2 border-b ${
                  isLight ? 'border-slate-200' : 'border-white/[0.08]'
                }`}>
                  <div className="flex items-center space-x-2.5">
                    <span className="text-xl leading-none">{group.meta.flag}</span>
                    <div className="flex items-center space-x-2">
                      <span className={`text-sm font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>
                        {group.currency}
                      </span>
                      <span className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>
                        ({getLocalizedCurrencyName(group.meta)})
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    {hasHigh && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border flex items-center gap-1 ${
                        isLight
                          ? 'bg-rose-100 text-rose-800 border-rose-300'
                          : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                      }`}>
                        {t.highAlertBadge || '🔴 HIGH ALERT'}
                      </span>
                    )}
                    {!hasHigh && hasMedium && (
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex items-center gap-1 ${
                        isLight
                          ? 'bg-amber-100 text-amber-800 border-amber-300'
                          : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                      }`}>
                        {t.moderateBadge || '🟡 MODERATE'}
                      </span>
                    )}
                    <span className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-full border ${
                      isLight ? 'bg-slate-100 border-slate-200 text-slate-600' : 'bg-white/[0.06] border-white/[0.08] text-white/70'
                    }`}>
                      {group.events.length} {t.eventsCount || 'událostí'}
                    </span>
                  </div>
                </div>

                {/* Cards for this Currency */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                  {group.events.map((event) => {
                    const timeStr = extractTimeOnly(event.date);

                    return (
                      <div
                        key={event.id}
                        className={`p-4 rounded-2xl border transition-all ${
                          event.impact === 'HIGH'
                            ? (isLight
                              ? 'bg-white border-rose-300 shadow-sm hover:border-rose-400 hover:shadow-md'
                              : 'bg-black/40 border-rose-500/30 hover:border-rose-500/60')
                            : event.impact === 'MEDIUM'
                            ? (isLight
                              ? 'bg-white border-amber-200 shadow-xs hover:border-amber-300'
                              : 'bg-black/40 border-amber-500/25 hover:border-amber-500/40')
                            : (isLight
                              ? 'bg-white border-slate-200 shadow-xs hover:border-slate-300'
                              : 'bg-black/40 border-white/[0.08] hover:border-white/[0.15]')
                        }`}
                      >
                        <div className="flex items-center justify-between mb-2.5">
                          <div className="flex items-center space-x-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                event.currency === 'USD'
                                  ? (isLight ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'bg-blue-500/20 text-blue-300 border border-blue-500/30')
                                  : event.currency === 'EUR'
                                  ? (isLight ? 'bg-amber-100 text-amber-800 border border-amber-200' : 'bg-amber-500/20 text-amber-300 border border-amber-500/30')
                                  : event.currency === 'GBP'
                                  ? (isLight ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-purple-500/20 text-purple-300 border border-purple-500/30')
                                  : (isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30')
                              }`}
                            >
                              {group.meta.flag} {event.currency}
                            </span>
                            <span className={`text-xs font-mono font-bold flex items-center space-x-1 ${
                              isLight ? 'text-slate-900' : 'text-[#f5f5f7]'
                            }`}>
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{timeStr || event.date}</span>
                            </span>
                          </div>

                          {/* Dynamic Impact Badge: Real value instead of hardcoded HIGH */}
                          {event.impact === 'HIGH' ? (
                            <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-600 text-white shadow-xs tracking-wider flex items-center gap-1 border border-rose-500">
                              {t.highImpactBadge || '🔴 HIGH'}
                            </span>
                          ) : event.impact === 'MEDIUM' ? (
                            <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full border tracking-wider flex items-center gap-1 ${
                              isLight
                                ? 'bg-amber-100 text-amber-900 border-amber-300'
                                : 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                            }`}>
                              {t.mediumImpactBadge || '🟡 MEDIUM'}
                            </span>
                          ) : (
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border tracking-wider flex items-center gap-1 ${
                              isLight
                                ? 'bg-slate-100 text-slate-700 border-slate-300'
                                : 'bg-white/[0.08] text-white/70 border-white/15'
                            }`}>
                              {t.lowImpactBadge || '⚪ LOW'}
                            </span>
                          )}
                        </div>

                        <div className={`text-xs font-bold mb-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                          {event.title}
                        </div>

                        {(event.forecast || event.previous) && (
                          <div className={`flex items-center space-x-4 text-[10px] border-t pt-2 mb-2 ${
                            isLight ? 'border-slate-200 text-slate-600' : 'border-white/[0.06] text-[#86868b]'
                          }`}>
                            <div>
                              {t.forecastLabel}: <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{event.forecast || '-'}</span>
                            </div>
                            <div>
                              {t.previousLabel}: <span className={`font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{event.previous || '-'}</span>
                            </div>
                          </div>
                        )}

                        {event.warningText && (
                          <div className={`p-2.5 rounded-xl border flex items-start space-x-2 text-[11px] leading-snug font-medium ${
                            event.impact === 'HIGH'
                              ? (isLight
                                ? 'bg-rose-50 border-rose-300 text-rose-950 font-semibold'
                                : 'bg-rose-950/40 border-rose-500/30 text-rose-200')
                              : event.impact === 'MEDIUM'
                              ? (isLight
                                ? 'bg-amber-50 border-amber-200 text-amber-950 font-semibold'
                                : 'bg-amber-950/30 border-amber-500/20 text-amber-200')
                              : (isLight
                                ? 'bg-slate-50 border-slate-200 text-slate-700'
                                : 'bg-white/[0.04] border-white/[0.06] text-[#a1a1a6]')
                          }`}>
                            <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${
                              event.impact === 'HIGH'
                                ? (isLight ? 'text-rose-700' : 'text-rose-400')
                                : event.impact === 'MEDIUM'
                                ? (isLight ? 'text-amber-700' : 'text-amber-400')
                                : (isLight ? 'text-slate-500' : 'text-slate-400')
                            }`} />
                            <span>{event.warningText}</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
