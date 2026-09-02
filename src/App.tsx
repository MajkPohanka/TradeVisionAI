import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { ChartUploader } from './components/ChartUploader';
import { StrategyPreferencesModal } from './components/StrategyPreferencesModal';
import { AnalysisResultView } from './components/AnalysisResultView';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PasswordGate } from './components/PasswordGate';
import { AnalysisResult, StrategySettings, LicenseStatus } from './types';
import { getTranslation } from './utils/translations';
import { AlertTriangle, Scale, RefreshCw } from 'lucide-react';

// Code-split heavy secondary components to ensure lightning-fast initial mobile render
const MetaTraderAuditView = lazy(() => import('./components/MetaTraderAuditView').then(m => ({ default: m.MetaTraderAuditView })));
const EconomicCalendarWidget = lazy(() => import('./components/EconomicCalendarWidget').then(m => ({ default: m.EconomicCalendarWidget })));
const TradeJournal = lazy(() => import('./components/TradeJournal').then(m => ({ default: m.TradeJournal })));
const MentorChatDrawer = lazy(() => import('./components/MentorChatDrawer').then(m => ({ default: m.MentorChatDrawer })));
const CreditsModal = lazy(() => import('./components/CreditsModal').then(m => ({ default: m.CreditsModal })));
const TermsModal = lazy(() => import('./components/TermsModal').then(m => ({ default: m.TermsModal })));

export default function App() {
  // Password Protection Gate (Password: Trebic)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const sessionAuth = sessionStorage.getItem('tradeoy_auth_gate');
      const localAuth = localStorage.getItem('tradeoy_auth_gate');
      return sessionAuth === 'granted' || localAuth === 'granted';
    } catch {
      return false;
    }
  });

  const [images, setImages] = useState<string[]>([]);
  const [settings, setSettings] = useState<StrategySettings>(() => {
    try {
      const saved = localStorage.getItem('tradeoy_settings') || localStorage.getItem('aiautotrader_settings') || localStorage.getItem('autoaitrader_settings') || localStorage.getItem('tradedring_settings') || localStorage.getItem('tradevision_settings');
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
    };
  });

  const t = getTranslation(settings.language);

  // Sync settings to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('tradeoy_settings', JSON.stringify(settings));
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
      const saved = localStorage.getItem('tradeoy_journal') || localStorage.getItem('aiautotrader_journal') || localStorage.getItem('autoaitrader_journal') || localStorage.getItem('tradedring_journal') || localStorage.getItem('tradevision_journal');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // License & Credits State - Synchronized with server authoritative state
  const [currentLicense, setCurrentLicense] = useState<LicenseStatus | null>(() => {
    try {
      // Clear legacy hardcoded demo/test keys if they remained in localStorage
      const legacyKey = localStorage.getItem('tradeoy_license_key') || localStorage.getItem('aiautotrader_license_key');
      if (legacyKey && (legacyKey === 'TRADEOY-VIP-1000' || legacyKey === 'AIAUTO-DEMO-TEST-2026')) {
        localStorage.removeItem('tradeoy_license_key');
        localStorage.removeItem('tradeoy_credits');
        localStorage.removeItem('aiautotrader_license_key');
        localStorage.removeItem('aiautotrader_credits');
      }

      const savedKey = localStorage.getItem('tradeoy_license_key');
      const savedCredits = localStorage.getItem('tradeoy_credits');
      if (savedKey) {
        const isVip = ['TRADEOY-VIP-UNLIMITED-ALPHA', 'TRADEOY-VIP-FRIENDS-2026', 'TRADEOY-VIP-ELITE-MASTER', 'TRADEOY-VIP-FOUNDER-PASS', 'TRADEOY-VIP-PRO-TRADER'].includes(savedKey.trim().toUpperCase());
        return {
          key: savedKey,
          credits: isVip ? 999999 : (savedCredits !== null ? parseInt(savedCredits, 10) : 0),
          tier: isVip ? 'vip_unlimited' : 'standard',
          email: '',
        };
      }
    } catch (e) {
      console.error('Failed to load license from localStorage', e);
    }
    // Default: 0 credits for new users until purchased or activated
    return {
      key: '',
      credits: 0,
      tier: 'standard',
    };
  });
  const [isCreditsModalOpen, setIsCreditsModalOpen] = useState<boolean>(false);
  const [isPaywallTriggered, setIsPaywallTriggered] = useState<boolean>(false);

  // Update License callback
  const handleLicenseUpdated = useCallback((license: LicenseStatus) => {
    setCurrentLicense(license);
    try {
      localStorage.setItem('tradeoy_license_key', license.key);
      localStorage.setItem('tradeoy_credits', String(license.credits));
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
          const res = await fetch('/api/credits/check-license', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: activeKey }),
          });
          const data = await res.json();
          if (data.success && data.license) {
            handleLicenseUpdated(data.license);
          }
        }
      } catch (err) {
        console.error('License initial check error:', err);
      }
    };
    initCredits();
  }, []);

  // Sync journal to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('tradeoy_journal', JSON.stringify(journal));
    } catch (e) {
      console.error('Failed to save journal', e);
    }
  }, [journal]);

  const handleUpdateSettings = (newSettings: Partial<StrategySettings>) => {
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const handleResetAnalysis = () => {
    setImages([]);
    setAnalysisResult(null);
    setError(null);
  };

  // Helper to ensure all images uploaded to server maintain ultra-sharp resolution (1920px, high quality)
  // while keeping individual payload under ~500KB to ensure fast network transit
  const compressImageForAnalysis = (dataUrl: string, maxDim = 1920, quality = 0.88): Promise<string> => {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || !dataUrl || !dataUrl.startsWith('data:')) {
        resolve(dataUrl);
        return;
      }
      const img = new Image();
      img.onload = () => {
        try {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
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
            const compressed = canvas.toDataURL('image/jpeg', quality);
            canvas.width = 0;
            canvas.height = 0;
            resolve(compressed);
            return;
          }
        } catch (e) {
          console.warn('Image optimization fallback to original:', e);
        }
        resolve(dataUrl);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const handleAnalyzeChart = async () => {
    if (images.length === 0) {
      setError(
        settings.language === 'cs'
          ? 'Nahrajte prosím alespoň jeden snímek grafu.'
          : settings.language === 'es'
          ? 'Cargue al menos una captura de pantalla del gráfico.'
          : 'Please upload at least one chart screenshot.'
      );
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Pre-compress images on client to keep total payload strictly under ~1 MB
      const optimizedImages = await Promise.all(
        images.map((img) => compressImageForAnalysis(img))
      );

      const activeLicenseKey = currentLicense?.key || 'TRADEOY-VIP-1000';

      const response = await fetch('/api/analyze-chart', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          images: optimizedImages,
          settings: settings,
          licenseKey: activeLicenseKey,
        }),
      });

      let data: any = {};
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        throw new Error(
          settings.language === 'cs'
            ? 'Chyba při zpracování odpovědi z analytického serveru. Zkuste to prosím znovu.'
            : settings.language === 'es'
            ? 'Error al procesar la respuesta del servidor analítico. Inténtelo de nuevo.'
            : 'Error processing response from the analysis server. Please try again.'
        );
      }

      if (response.status === 402 || data.requiresCredits || data.code === 'INSUFFICIENT_CREDITS') {
        if (data.license) {
          handleLicenseUpdated(data.license);
        }
        setIsPaywallTriggered(true);
        setIsCreditsModalOpen(true);
        throw new Error(
          data.error ||
            (settings.language === 'cs'
              ? 'Pro spuštění AI analýzy nemáte dostatek kreditů. Zakupte si balíček pro pokračování.'
              : 'Insufficient credits for AI analysis. Please top up credits to continue.')
        );
      }

      if (!response.ok || !data.success) {
        throw new Error(
          data.error ||
            data.details ||
            (settings.language === 'cs'
              ? 'Analýza selhala. Zkontrolujte prosím kvalitu grafu a zkuste to znovu.'
              : 'Analysis failed. Please check chart image quality and retry.')
        );
      }

      if (data.remainingCredits !== undefined && currentLicense) {
        handleLicenseUpdated({
          ...currentLicense,
          credits: data.remainingCredits,
        });
      }

      const fullResult: AnalysisResult = {
        ...data.data,
        id: data.data.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
        timestamp: data.data.timestamp || Date.now(),
        uploadedImages: (data.data.uploadedImages && data.data.uploadedImages.length > 0) ? data.data.uploadedImages : optimizedImages,
      };

      setAnalysisResult(fullResult);

      setTimeout(() => {
        const resultEl = document.getElementById('analysis-result-section');
        if (resultEl) {
          resultEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 150);
    } catch (err: any) {
      console.error('Analysis error:', err);
      const rawMsg = err?.message || String(err);
      
      // Translate Safari WebKit 'Load failed' or Chrome 'Failed to fetch' into user-friendly message
      if (rawMsg === 'Load failed' || rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError') || err.name === 'TypeError') {
        setError(
          settings.language === 'cs'
            ? 'Spojení se serverem bylo přerušeno nebo nahrávání vypršelo. Klikněte na „Zkusit znovu analýzu“ níže.'
            : settings.language === 'es'
            ? 'La conexión con el servidor se interrumpió. Haga clic en "Reintentar análisis" a continuación.'
            : 'Connection to the server was interrupted or timed out. Please click "Retry analysis" below.'
        );
      } else {
        setError(rawMsg);
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveToJournal = (result: AnalysisResult) => {
    if (!journal.some((j) => j.id === result.id)) {
      setJournal((prev) => [result, ...prev]);
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

  // If locked, render the password gate
  if (!isAuthenticated) {
    return (
      <PasswordGate
        language={settings.language}
        onAuthenticated={() => setIsAuthenticated(true)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0c] bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,rgba(16,185,129,0.05),transparent_70%)] text-[#f5f5f7] flex flex-col font-sans selection:bg-emerald-500 selection:text-black relative">
      {/* Header Bar */}
      <Header
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        savedCount={journal.length}
        creditsCount={currentLicense?.credits ?? 0}
        onOpenCreditsModal={() => {
          setIsPaywallTriggered(false);
          setIsCreditsModalOpen(true);
        }}
        onOpenTermsModal={() => setIsTermsOpen(true)}
        onGoHome={() => {
          setActiveTab('analyzer');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6 relative z-10">
        <ErrorBoundary fallbackTitle="Chyba v modulu analýzy / Chart Analyzer Module Error">
          {activeTab === 'analyzer' && (
            <div className="space-y-8">
              {/* Primary Workflow: Dedicated 3-Slot Timeframe Uploader */}
              <ChartUploader
                images={images}
                onImagesChange={setImages}
                onAnalyze={handleAnalyzeChart}
                isLoading={isLoading}
                onResetAnalysis={handleResetAnalysis}
                hasAnalysisResult={Boolean(analysisResult)}
                language={settings.language}
                holdingPeriod={settings.holdingPeriod}
                onOpenSettings={() => setIsSettingsModalOpen(true)}
              />

              {/* Prominent Legal & Educational Disclaimer Banner - Placed below Chart Uploader */}
              <div className="bg-[#121216]/90 border border-amber-500/30 rounded-2xl p-3.5 sm:p-4 text-xs flex items-start space-x-3.5 shadow-lg shadow-black/40">
                <Scale className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <span className="font-bold text-amber-300 block text-[11px] sm:text-xs uppercase tracking-wider">
                    {t.topDisclaimerTitle}
                  </span>
                  <p className="text-[11px] sm:text-xs text-[#a1a1a6] leading-relaxed">
                    {t.topDisclaimerText}
                  </p>
                </div>
              </div>

              {/* Error Banner */}
              {error && (
                <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                  <div className="flex items-center space-x-3">
                    <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                    <span className="font-medium">{error}</span>
                  </div>
                  {images.length > 0 && (
                    <button
                      onClick={handleAnalyzeChart}
                      disabled={isLoading}
                      className="px-4 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-semibold transition border border-red-500/30 cursor-pointer disabled:opacity-50 shrink-0 active:scale-95"
                    >
                      <span>Zkusit znovu analýzu</span>
                    </button>
                  )}
                </div>
              )}

              {/* Analysis Results View */}
              {analysisResult && (
                <div id="analysis-result-section" className="pt-4 border-t border-white/[0.08]">
                  <AnalysisResultView
                    result={analysisResult}
                    onSaveToJournal={handleSaveToJournal}
                    isSaved={isCurrentSaved}
                    onOpenChat={() => setIsChatOpen(true)}
                    language={settings.language}
                  />
                </div>
              )}
            </div>
          )}
        </ErrorBoundary>

        <ErrorBoundary fallbackTitle="Chyba v modulu auditu / MetaTrader Audit Module Error">
          {activeTab === 'audit' && (
            <Suspense fallback={<div className="py-20 text-center text-slate-400 flex items-center justify-center space-x-3"><RefreshCw className="w-5 h-5 animate-spin text-emerald-500" /><span>Načítám modul MetaTrader Audit...</span></div>}>
              <MetaTraderAuditView
                settings={settings}
                currentLicense={currentLicense}
                onLicenseUpdated={handleLicenseUpdated}
                onOpenCreditsModal={() => {
                  setIsPaywallTriggered(true);
                  setIsCreditsModalOpen(true);
                }}
              />
            </Suspense>
          )}
        </ErrorBoundary>

        <ErrorBoundary fallbackTitle="Chyba v modulu kalendáře / Macro Calendar Module Error">
          {activeTab === 'calendar' && (
            <Suspense fallback={<div className="py-20 text-center text-slate-400 flex items-center justify-center space-x-3"><RefreshCw className="w-5 h-5 animate-spin text-emerald-500" /><span>Načítám ekonomický kalendář...</span></div>}>
              <EconomicCalendarWidget symbol={analysisResult?.symbol} language={settings.language} />
            </Suspense>
          )}
        </ErrorBoundary>

        <ErrorBoundary fallbackTitle="Chyba v modulu deníku / Trade Journal Module Error">
          {activeTab === 'journal' && (
            <Suspense fallback={<div className="py-20 text-center text-slate-400 flex items-center justify-center space-x-3"><RefreshCw className="w-5 h-5 animate-spin text-emerald-500" /><span>Načítám obchodní deník...</span></div>}>
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
            </Suspense>
          )}
        </ErrorBoundary>
      </main>

      {/* Advanced Strategy & AI Mentor Settings Modal */}
      <StrategyPreferencesModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
      />

      {/* Interactive AI Mentor Chat Drawer */}
      <Suspense fallback={null}>
        <MentorChatDrawer
          isOpen={isChatOpen}
          onClose={() => setIsChatOpen(false)}
          currentAnalysis={analysisResult}
          settings={settings}
          language={settings.language}
          currentLicense={currentLicense}
          onOpenCreditsModal={() => {
            setIsPaywallTriggered(false);
            setIsCreditsModalOpen(true);
          }}
        />
      </Suspense>

      {/* Credits / License Top-up Modal */}
      <Suspense fallback={null}>
        <CreditsModal
          isOpen={isCreditsModalOpen}
          onClose={() => setIsCreditsModalOpen(false)}
          language={settings.language}
          currentLicense={currentLicense}
          onLicenseUpdated={handleLicenseUpdated}
          isTriggeredByPaywall={isPaywallTriggered}
          onOpenTermsModal={() => {
            setIsCreditsModalOpen(false);
            setIsTermsOpen(true);
          }}
        />
      </Suspense>

      {/* Legal & Educational Disclaimer Modal */}
      <Suspense fallback={null}>
        <TermsModal
          isOpen={isTermsOpen}
          onClose={() => setIsTermsOpen(false)}
          language={settings.language}
        />
      </Suspense>

      {/* Clean, Refined Footer */}
      <footer className="mt-auto border-t border-white/[0.08] bg-[#0c0c0e] py-6 text-xs text-[#86868b] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-white tracking-tight">TRADEOY<span className="text-emerald-400">.com</span></span>
            <span className="text-[#6e6e73]">© {new Date().getFullYear()}</span>
            <span className="text-[#6e6e73]">•</span>
            <span>Výukový a analytický AI nástroj pro tradery</span>
          </div>

          <div className="flex items-center space-x-4">
            <button
              onClick={() => setIsTermsOpen(true)}
              className="text-[#86868b] hover:text-white transition cursor-pointer flex items-center gap-1.5"
            >
              <Scale className="w-3.5 h-3.5 text-amber-400/80" />
              <span>Podmínky & Právní doložka</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
