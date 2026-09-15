import React, { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, Filter, ShieldAlert, RefreshCw, Search, Zap } from 'lucide-react';
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

export const EconomicCalendarWidget: React.FC<EconomicCalendarWidgetProps> = ({
  symbol,
  language = 'cs',
  theme = 'light',
}) => {
  const isLight = theme === 'light';
  const t = getTranslation(language as LanguageOption);
  const [selectedDate, setSelectedDate] = useState(() => getTodayFormatted());
  const [filterImpact, setFilterImpact] = useState<'ALL' | 'HIGH'>('HIGH');
  const [events, setEvents] = useState<EconomicCalendarEvent[]>([]);
  const [marketAdvice, setMarketAdvice] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

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
        throw new Error('Chyba při načítání makro kalendáře.');
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

  const filtered = filterImpact === 'HIGH' ? events.filter((e) => e.impact === 'HIGH') : events;

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

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setFilterImpact((prev) => (prev === 'HIGH' ? 'ALL' : 'HIGH'))}
            className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer flex items-center space-x-1.5 active:scale-95 shadow-xs ${
              filterImpact === 'HIGH'
                ? (isLight
                  ? 'bg-rose-600 border-rose-600 text-white shadow-md hover:bg-rose-700'
                  : 'bg-rose-500/30 border-rose-500/60 text-rose-200 shadow-sm hover:bg-rose-500/40')
                : (isLight
                  ? 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                  : 'bg-white/[0.06] border-white/[0.08] text-white hover:bg-white/[0.12]')
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{filterImpact === 'HIGH' ? t.onlyHighImpact : t.allNews}</span>
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
            placeholder="20.8.2026"
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
                  : 'bg-white/[0.06] text-[#86868b] border-white/[0.08] hover:text-white hover:bg-white/[0.12]')
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
                  : 'bg-white/[0.06] text-[#86868b] border-white/[0.08] hover:text-white hover:bg-white/[0.12]')
            }`}
          >
            🔮 {t.tomorrow} ({getTomorrowFormatted()})
          </button>
        </div>
      </div>

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

      {/* Events Grid */}
      {isLoading ? (
        <div className="py-14 text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-emerald-500" />
          <p className={`text-xs font-semibold ${isLight ? 'text-slate-800' : 'text-white'}`}>{t.loadingCalendarData}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className={`py-12 text-center text-xs font-medium ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>
          {t.noEventsFoundForDate}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filtered.map((event) => (
            <div
              key={event.id}
              className={`p-4 rounded-2xl border transition-all ${
                event.impact === 'HIGH'
                  ? (isLight
                    ? 'bg-white border-rose-300 shadow-sm hover:border-rose-400 hover:shadow-md'
                    : 'bg-black/40 border-rose-500/30 hover:border-rose-500/60')
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
                        : (isLight ? 'bg-emerald-100 text-emerald-800 border border-emerald-200' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30')
                    }`}
                  >
                    {event.currency}
                  </span>
                  <span className={`text-xs font-bold ${isLight ? 'text-slate-900' : 'text-[#f5f5f7]'}`}>{event.date}</span>
                </div>
                <span className="text-[10px] font-black px-2.5 py-0.5 rounded-full bg-rose-600 text-white shadow-xs tracking-wider flex items-center gap-1">
                  HIGH
                </span>
              </div>

              <div className={`text-xs font-bold mb-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>{event.title}</div>

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
                  isLight
                    ? 'bg-rose-50 border-rose-300 text-rose-950 font-semibold'
                    : 'bg-rose-950/40 border-rose-500/30 text-rose-200'
                }`}>
                  <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${isLight ? 'text-rose-700' : 'text-rose-400'}`} />
                  <span>{event.warningText}</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
