import React, { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { ChartUploader } from './components/ChartUploader';
import { StrategyPreferences } from './components/StrategyPreferences';
import { AnalysisResultView } from './components/AnalysisResultView';
import { MetaTraderAuditView } from './components/MetaTraderAuditView';
import { EconomicCalendarWidget } from './components/EconomicCalendarWidget';
import { TradeJournal } from './components/TradeJournal';
import { MentorChatDrawer } from './components/MentorChatDrawer';
import { GitHubExportModal } from './components/GitHubExportModal';
import { CreditsModal } from './components/CreditsModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AnalysisResult, StrategySettings, LicenseStatus } from './types';
import { getSampleBTCChartDataUrl } from './utils/sampleChart';
import { getTranslation } from './utils/translations';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export default function App() {
  const [images, setImages] = useState<string[]>([]);
  const [settings, setSettings] = useState<StrategySettings>(() => {
    try {
      const saved = localStorage.getItem('aiautotrader_settings') || localStorage.getItem('autoaitrader_settings') || localStorage.getItem('tradedring_settings') || localStorage.getItem('tradevision_settings');
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error('Failed to load settings', e);
    }
    return {
      holdingPeriod: 'intraday',
      riskTolerance: 'balanced',
      strategies: ['price_action', 'smc_ict', 'wyckoff', 'trend_breakout', 'supply_demand'],
      strategy: 'price_action',
      customRules: '',
      customMentorPrompt: '',
      language: 'cs',
      accountRiskPercent: 1.0,
      presets: [
        {
          id: 'default_all_confluence',
          name: 'Multi-Methodology Master (PA + SMC + Wyckoff + S&D + Trend)',
          holdingPeriod: 'intraday',
          riskTolerance: 'balanced',
          strategies: ['price_action', 'smc_ict', 'wyckoff', 'trend_breakout', 'supply_demand'],
          strategy: 'price_action',
          customRules: '',
          customMentorPrompt: 'Hledej průsečík (konfluenci) mezi Price Action, SMC likviditou, Wyckoff fází a Supply/Demand zónami.',
          accountRiskPercent: 1.0,
        },
        {
          id: 'default_ict',
          name: 'ICT Silver Bullet',
          holdingPeriod: 'intraday',
          riskTolerance: 'balanced',
          strategies: ['smc_ict', 'price_action'],
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
      localStorage.setItem('aiautotrader_settings', JSON.stringify(settings));
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
      const saved = localStorage.getItem('aiautotrader_journal') || localStorage.getItem('autoaitrader_journal') || localStorage.getItem('tradedring_journal') || localStorage.getItem('tradevision_journal');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isGithubModalOpen, setIsGithubModalOpen] = useState(false);

  // License & Credits State
  const [currentLicense, setCurrentLicense] = useState<LicenseStatus | null>(() => {
    try {
      const savedKey = localStorage.getItem('aiautotrader_license_key');
      const savedCredits = localStorage.getItem('aiautotrader_credits');
      if (savedKey) {
        return {
          key: savedKey,
          credits: savedCredits !== null ? parseInt(savedCredits, 10) : 2,
        };
      }
    } catch (e) {
      console.error('Failed to load license from localStorage', e);
    }
    return null;
  });
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState<boolean>(false);
  const [isPaywallTriggered, setIsPaywallTriggered] = useState<boolean>(false);

  // Update License callback
  const handleLicenseUpdated = useCallback((license: LicenseStatus) => {
    setCurrentLicense(license);
    try {
      localStorage.setItem('aiautotrader_license_key', license.key);
      localStorage.setItem('aiautotrader_credits', String(license.credits));
    } catch (e) {
      console.error('Error saving license to localStorage:', e);
    }
  }, []);

  // Check URL parameters on mount (?key=... or ?session_id=...) & sync with server
  useEffect(() => {
    const initCredits = async () => {
      try {
        const urlParams = new URLSearchParams(window.location.search);
        const urlKey = urlParams.get('key');
        const sessionId = urlParams.get('session_id');

        if (sessionId) {
          // Confirm newly paid session
          const res = await fetch('/api/credits/confirm-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ sessionId }),
          });
          const data = await res.json();
          if (data.success && data.license) {
            handleLicenseUpdated(data.license);
            setIsCreditsModalOpen(true);
            // Clean URL query
            window.history.replaceState({}, document.title, window.location.pathname);
            return;
          }
        }

        const activeKey = urlKey || currentLicense?.key;
        if (activeKey) {
          const res = await fetch(`/api/credits/status?key=${encodeURIComponent(activeKey)}`);
          const data = await res.json();
          if (data.success && data.license) {
            handleLicenseUpdated(data.license);
          }
          if (urlKey) {
            window.history.replaceState({}, document.title, window.location.pathname);
          }
        } else {
          // Auto-claim starter trial (2 free credits) for fresh visitors
          const res = await fetch('/api/credits/claim-trial', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({}),
          });
          const data = await res.json();
          if (data.success && data.license) {
            handleLicenseUpdated(data.license);
          }
        }
      } catch (e) {
        console.error('Failed to initialize credits:', e);
      }
    };

    initCredits();
  }, [handleLicenseUpdated]);

  // Sync journal to local storage
  useEffect(() => {
    try {
      localStorage.setItem('aiautotrader_journal', JSON.stringify(journal));
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

    // Check client-side credits before call
    if (currentLicense && currentLicense.credits <= 0) {
      setIsPaywallTriggered(true);
      setIsCreditsModalOpen(true);
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
          licenseKey: currentLicense?.key || undefined,
        }),
      });

      const text = await res.text();
      let data: any = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        if (text.trim().startsWith('<')) {
          throw new Error('Časový limit AI analýzy vypršel nebo je služba dočasně vytížena. Zkuste to prosím znovu za okamžik.');
        }
        throw new Error(`Server vrátil neplatnou odpověď (HTTP ${res.status}). Zkuste to prosím znovu.`);
      }

      // Handle insufficient credits 402 code
      if (res.status === 402 || data.code === 'INSUFFICIENT_CREDITS') {
        if (data.licenseKey) {
          handleLicenseUpdated({
            key: data.licenseKey,
            credits: 0,
          });
        }
        setIsPaywallTriggered(true);
        setIsCreditsModalOpen(true);
        throw new Error(data.error || 'Vyčerpali jste všechny kredity. Doplňte prosím kredity pro pokračování.');
      }

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Při analýze grafu došlo k neznámé chybě.');
      }

      // Update remaining credits from authoritative server response
      if (typeof data.remainingCredits === 'number' && data.licenseKey) {
        handleLicenseUpdated({
          key: data.licenseKey,
          credits: data.remainingCredits,
        });
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
    <div className="min-h-screen bg-black text-[#f5f5f7] flex flex-col font-sans selection:bg-emerald-500 selection:text-black relative overflow-x-hidden">
      {/* Apple Subtle Ambient Lighting Meshes */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-[20%] left-1/2 -translate-x-1/2 w-[1000px] h-[600px] bg-gradient-to-b from-emerald-500/10 via-teal-500/5 to-transparent blur-[140px] rounded-full" />
        <div className="absolute top-[40%] right-[-10%] w-[600px] h-[600px] bg-gradient-to-br from-indigo-500/5 via-purple-500/5 to-transparent blur-[160px] rounded-full" />
      </div>

      {/* Header Bar */}
      <Header
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onOpenGithubModal={() => setIsGithubModalOpen(true)}
        savedCount={journal.length}
        creditsCount={currentLicense?.credits ?? 0}
        onOpenCreditsModal={() => {
          setIsPaywallTriggered(false);
          setIsCreditsModalOpen(true);
        }}
        onGoHome={() => {
          setActiveTab('analyzer');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 relative z-10">
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
                holdingPeriod={settings.holdingPeriod}
              />

              {/* Error Banner */}
              {error && (
                <div className="p-4 rounded-2xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-lg backdrop-blur-xl">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0" />
                    <span className="font-medium">{error}</span>
                  </div>
                  {images.length > 0 && (
                    <button
                      onClick={handleAnalyzeChart}
                      disabled={isLoading}
                      className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded-full bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-semibold transition border border-red-500/30 cursor-pointer disabled:opacity-50 flex-shrink-0 active:scale-95"
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

      {/* Apple Clean Footer */}
      <footer className="mt-auto border-t border-white/[0.08] bg-black/60 backdrop-blur-xl py-6 text-center text-xs text-[#86868b] relative z-10">
        <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span className="font-medium text-[#a1a1a6]">AIAUTOTRADER.com • {t.appSubtitle}</span>
          </div>
          <p className="text-[#86868b]">© {new Date().getFullYear()} AIAUTOTRADER.com. Všechna práva vyhrazena.</p>
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

      {/* Credits & Paywall Modal */}
      <CreditsModal
        isOpen={isCreditsModalOpen}
        onClose={() => setIsCreditsModalOpen(false)}
        language={settings.language}
        currentLicense={currentLicense}
        onLicenseUpdated={handleLicenseUpdated}
        isTriggeredByPaywall={isPaywallTriggered}
      />
    </div>
  );
}
