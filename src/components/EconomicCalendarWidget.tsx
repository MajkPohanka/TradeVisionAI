import React, { useState, useEffect } from 'react';
import { Calendar, AlertTriangle, Filter, ShieldAlert, RefreshCw, Search, Zap } from 'lucide-react';
import { EconomicCalendarEvent, LanguageOption } from '../types';
import { getTranslation } from '../utils/translations';

interface EconomicCalendarWidgetProps {
  symbol?: string;
  language?: LanguageOption;
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

export const EconomicCalendarWidget: React.FC<EconomicCalendarWidgetProps> = ({ symbol, language = 'cs' }) => {
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
    <div className="bg-[#121216] border border-white/[0.08] rounded-3xl p-5 sm:p-7 shadow-xl space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/[0.08] pb-5">
        <div className="flex items-center space-x-3.5">
          <div className="p-3 rounded-2xl bg-amber-500/15 text-amber-400 border border-amber-500/25 shadow-sm">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <span>{t.calendarWidgetTitle}</span>
              <span className="px-2.5 py-0.5 rounded-full bg-red-500/20 text-red-400 text-[10px] font-bold border border-red-500/30 flex items-center gap-1">
                <ShieldAlert className="w-3 h-3" /> {t.liveFeedBadge}
              </span>
            </h3>
            <p className="text-xs text-[#86868b] mt-0.5">
              {t.calendarWidgetSubtitle} ({selectedDate})
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setFilterImpact((prev) => (prev === 'HIGH' ? 'ALL' : 'HIGH'))}
            className={`px-3.5 py-1.5 rounded-full text-xs font-semibold border transition-all cursor-pointer flex items-center space-x-1.5 active:scale-95 ${
              filterImpact === 'HIGH'
                ? 'bg-red-500/20 border-red-500/40 text-red-300 shadow-sm'
                : 'bg-white/[0.06] border-white/[0.08] text-white hover:bg-white/[0.12]'
            }`}
          >
            <Filter className="w-3.5 h-3.5" />
            <span>{filterImpact === 'HIGH' ? t.onlyHighImpact : t.allNews}</span>
          </button>
        </div>
      </div>

      {/* Date Selector & Presets Bar */}
      <div className="bg-black/40 p-4 rounded-2xl border border-white/[0.08] flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3.5">
        <form onSubmit={handleDateSubmit} className="flex flex-wrap items-center gap-2 flex-1">
          <label className="text-xs font-semibold text-[#86868b] whitespace-nowrap">{t.selectDate}</label>
          <input
            type="text"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            placeholder="20.8.2026"
            className="bg-black/60 border border-white/[0.08] rounded-full px-3.5 py-1.5 text-xs text-white placeholder-[#86868b]/60 focus:outline-none focus:border-white/30 w-32 sm:w-44 font-mono transition"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-4 py-1.5 rounded-full bg-white text-black hover:bg-[#f5f5f7] text-xs font-bold flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50 active:scale-95 shadow-sm"
          >
            {isLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin text-black" /> : <Search className="w-3.5 h-3.5 text-black" />}
            <span>{t.loadCalendar}</span>
          </button>
        </form>

        <div className="flex items-center space-x-2 overflow-x-auto no-scrollbar pt-1 sm:pt-0">
          <span className="text-[10px] text-[#86868b] uppercase font-bold whitespace-nowrap">{t.quickSelects}</span>
          <button
            type="button"
            onClick={() => {
              const todayStr = getTodayFormatted();
              setSelectedDate(todayStr);
              fetchCalendarData(todayStr);
            }}
            className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
              selectedDate === getTodayFormatted()
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                : 'bg-white/[0.06] text-[#86868b] border-white/[0.08] hover:text-white hover:bg-white/[0.12]'
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
            className={`px-3 py-1 rounded-full text-[11px] font-semibold border transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
              selectedDate === getTomorrowFormatted()
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 shadow-xs'
                : 'bg-white/[0.06] text-[#86868b] border-white/[0.08] hover:text-white hover:bg-white/[0.12]'
            }`}
          >
            🔮 {t.tomorrow} ({getTomorrowFormatted()})
          </button>
        </div>
      </div>

      {marketAdvice && (
        <div className="p-4 rounded-2xl bg-amber-950/30 border border-amber-500/25 text-amber-200 text-xs flex items-start space-x-3">
          <Zap className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-amber-300 mb-0.5">{t.mentorDateAdvice} {selectedDate}:</div>
            <p className="text-[#a1a1a6] leading-relaxed">{marketAdvice}</p>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-2xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs">
          {error}
        </div>
      )}

      {/* Events Grid */}
      {isLoading ? (
        <div className="py-14 text-center text-[#86868b] space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-amber-400" />
          <p className="text-xs font-semibold text-white">{t.loadingCalendarData}</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-[#86868b] text-xs font-medium">
          {t.noEventsFoundForDate}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filtered.map((event) => (
            <div
              key={event.id}
              className={`p-4 rounded-2xl border transition-all ${
                event.impact === 'HIGH'
                  ? 'bg-black/40 border-red-500/25 hover:border-red-500/50'
                  : 'bg-black/40 border-white/[0.08] hover:border-white/[0.15]'
              }`}
            >
              <div className="flex items-center justify-between mb-2.5">
                <div className="flex items-center space-x-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                      event.currency === 'USD'
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                        : event.currency === 'EUR'
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    }`}
                  >
                    {event.currency}
                  </span>
                  <span className="text-xs font-bold text-[#f5f5f7]">{event.date}</span>
                </div>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500 text-black flex items-center gap-1">
                  🔴 HIGH
                </span>
              </div>

              <div className="text-xs font-semibold text-white mb-2">{event.title}</div>

              {(event.forecast || event.previous) && (
                <div className="flex items-center space-x-4 text-[10px] text-[#86868b] border-t border-white/[0.06] pt-2 mb-2">
                  <div>
                    {t.forecastLabel}: <span className="font-bold text-white">{event.forecast || '-'}</span>
                  </div>
                  <div>
                    {t.previousLabel}: <span className="font-bold text-white">{event.previous || '-'}</span>
                  </div>
                </div>
              )}

              {event.warningText && (
                <div className="p-2.5 rounded-xl bg-red-950/40 border border-red-500/25 text-[10px] text-red-300 flex items-start space-x-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 flex-shrink-0 mt-0.5" />
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
