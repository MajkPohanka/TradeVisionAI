import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { ChartUploader } from './components/ChartUploader';
import { StrategyPreferences } from './components/StrategyPreferences';
import { AnalysisResultView } from './components/AnalysisResultView';
import { MetaTraderAuditView } from './components/MetaTraderAuditView';
import { EconomicCalendarWidget } from './components/EconomicCalendarWidget';
import { TradeJournal } from './components/TradeJournal';
import { MentorChatDrawer } from './components/MentorChatDrawer';
import { GitHubExportModal } from './components/GitHubExportModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AnalysisResult, StrategySettings } from './types';
import { getSampleBTCChartDataUrl } from './utils/sampleChart';
import { getTranslation } from './utils/translations';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export default function App() {
  const [images, setImages] = useState<string[]>([]);
  const [settings, setSettings] = useState<StrategySettings>(() => {
    try {
      const saved = localStorage.getItem('tradevision_settings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
    return {
      holdingPeriod: 'intraday',
      riskTolerance: 'balanced',
      strategy: 'price_action',
      customRules: '',
      customMentorPrompt: '',
      language: 'cs',
      accountRiskPercent: 1.0,
      presets: [
        {
          id: 'default_ict',
          name: 'ICT Silver Bullet',
          holdingPeriod: 'intraday',
          riskTolerance: 'balanced',
          strategy: 'smc_ict',
          customRules: 'Vyžaduj FVG + Order Block konfluenci na 15m. Stop Loss za Swing High/Low.',
          customMentorPrompt: 'Odpovídej jako ICT mentor se zaměřením na Killzones (NY / London session).',
          accountRiskPercent: 1.0,
        },
      ],
    };
  });

  const t = getTranslation(settings.language);

  // Sync settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('tradevision_settings', JSON.stringify(settings));
    } catch (e) {
      console.error('Failed to save settings', e);
    }
  }, [settings]);

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'analyzer' | 'audit' | 'calendar' | 'journal'>('analyzer');
  const [journal, setJournal] = useState<AnalysisResult[]>(() => {
    try {
      const saved = localStorage.getItem('tradevision_journal');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);

  // Sync journal to local storage
  useEffect(() => {
    try {
      localStorage.setItem('tradevision_journal', JSON.stringify(journal));
    } catch (e) {
      console.error('Failed to save journal to localStorage', e);
    }
  }, [journal]);

  const handleUpdateSettings = (newSettings: Partial<StrategySettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const handleLoadSampleChart = async () => {
    try {
      const sampleImg = await getSampleBTCChartDataUrl();
      setImages((prev) => [...prev, sampleImg]);
      setError(null);
    } catch (e) {
      console.error('Failed to load sample chart:', e);
    }
  };

  const handleAnalyzeChart = async () => {
    if (images.length === 0) {
      setError('Prosím nahrajte alespoň jeden obrázek grafu z TradingView.');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/analyze-chart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          images,
          settings,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Při analýze grafu došlo k neznámé chybě.');
      }

      const resultWithMetadata: AnalysisResult = {
        ...data.data,
        id: Date.now().toString(),
        timestamp: Date.now(),
        uploadedImages: images,
        tradeOutcome: 'PENDING',
      };

      setAnalysisResult(resultWithMetadata);
      // Auto scroll to results
      setTimeout(() => {
        document.getElementById('analysis-result-section')?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Chyba při komunikaci se serverem.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToJournal = (result: AnalysisResult) => {
    if (!journal.some((j) => j.id === result.id)) {
      setJournal([result, ...journal]);
    }
  };

  const handleUpdateOutcome = (id: string, outcome: 'WIN' | 'LOSS' | 'BREAKEVEN' | 'PENDING') => {
    setJournal((prev) =>
      prev.map((item) => (item.id === id ? { ...item, tradeOutcome: outcome } : item))
    );
  };

  const handleRemoveJournalEntry = (id: string) => {
    setJournal((prev) => prev.filter((item) => item.id !== id));
  };

  const isCurrentSaved = Boolean(
    analysisResult && journal.some((j) => j.id === analysisResult.id)
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-slate-950">
      {/* Header Bar */}
      <Header
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenGithubModal={() => setIsGithubModalOpen(true)}
        savedCount={journal.length}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
        <ErrorBoundary fallbackTitle="Chyba v modulu analýzy / Chart Analyzer Module Error">
          {activeTab === 'analyzer' && (
            <>
              {/* Strategy Customization Panel */}
              <StrategyPreferences
                settings={settings}
                onUpdateSettings={handleUpdateSettings}
              />

              {/* Chart Uploader Drag & Drop Area */}
              <ChartUploader
                images={images}
                onImagesChange={setImages}
                onAnalyze={handleAnalyzeChart}
                isLoading={isLoading}
                onLoadSampleChart={handleLoadSampleChart}
                language={settings.language}
              />

              {/* Error Banner */}
              {error && (
                <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <span className="font-medium">{error}</span>
                  </div>
                  {images.length > 0 && (
                    <button
                      onClick={handleAnalyzeChart}
                      disabled={isLoading}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-semibold transition border border-red-500/30 cursor-pointer disabled:opacity-50 flex-shrink-0"
                    >
                      <span>Zkusit znovu analýzu</span>
                    </button>
                  )}
                </div>
              )}

              {/* Analysis Results View */}
              {analysisResult && (
                <div id="analysis-result-section" className="pt-2">
                  <AnalysisResultView
                    result={analysisResult}
                    onSaveToJournal={handleSaveToJournal}
                    isSaved={isCurrentSaved}
                    onOpenChat={() => setIsChatOpen(true)}
                    language={settings.language}
                  />
                </div>
              )}
            </>
          )}
        </ErrorBoundary>

        <ErrorBoundary fallbackTitle="Chyba v modulu auditu / MetaTrader Audit Module Error">
          {activeTab === 'audit' && (
            <MetaTraderAuditView settings={settings} />
          )}
        </ErrorBoundary>

        <ErrorBoundary fallbackTitle="Chyba v modulu kalendáře / Macro Calendar Module Error">
          {activeTab === 'calendar' && (
            <EconomicCalendarWidget symbol={analysisResult?.symbol} language={settings.language} />
          )}
        </ErrorBoundary>

        <ErrorBoundary fallbackTitle="Chyba v modulu deníku / Trade Journal Module Error">
          {activeTab === 'journal' && (
            <TradeJournal
              journal={journal}
              onUpdateOutcome={handleUpdateOutcome}
              onRemoveEntry={handleRemoveJournalEntry}
              onSelectEntry={(entry) => {
                setAnalysisResult(entry);
                setActiveTab('analyzer');
              }}
              language={settings.language}
            />
          )}
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-6 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>TradeVision AI • {t.appSubtitle}</span>
          </div>
          <p>© {new Date().getFullYear()} TradeVision AI. Všechna práva vyhrazena.</p>
        </div>
      </footer>

      {/* Mentor AI Chat Drawer */}
      <MentorChatDrawer
        isOpen={isChatOpen}
        onClose={() => setIsChatOpen(false)}
        currentAnalysis={analysisResult}
        settings={settings}
        language={settings.language}
      />

      {/* GitHub & Deployment Modal */}
      <GitHubExportModal
        isOpen={isGithubModalOpen}
        onClose={() => setIsGithubModalOpen(false)}
        language={settings.language}
      />
    </div>
  );
}
