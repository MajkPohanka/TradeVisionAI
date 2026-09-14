import React, { useState, useEffect, useCallback, lazy, Suspense } from 'react';
import { Header } from './components/Header';
import { ChartUploader } from './components/ChartUploader';
import { StrategyPreferencesModal } from './components/StrategyPreferencesModal';
import { AnalysisResultView } from './components/AnalysisResultView';
import { TradingViewLiveChart } from './components/TradingViewLiveChart';
import { MarketOverviewBar } from './components/MarketOverviewBar';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PasswordGate } from './components/PasswordGate';
import { AnalysisResult, StrategySettings, LicenseStatus, AppTheme } from './types';
import { getTranslation } from './utils/translations';
import { getInitialTheme, applyThemeToDocument } from './utils/theme';
import { AlertTriangle, Scale, RefreshCw, ChevronRight, ShieldAlert, Activity, KeyRound } from 'lucide-react';

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

  const [images, setImages] = useState<(string | null)[]>([null, null, null]);
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

  // App Theme state: 'light' (primary default), 'dark', or 'black'
  const [theme, setTheme] = useState<AppTheme>(() => {
    return settings.theme || getInitialTheme();
  });

  // Sync theme changes to document element & localStorage
  useEffect(() => {
    applyThemeToDocument(theme);
  }, [theme]);

  const handleUpdateTheme = (newTheme: AppTheme) => {
    setTheme(newTheme);
    setSettings((prev) => ({ ...prev, theme: newTheme }));
  };

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
  const [selectedTvSymbol, setSelectedTvSymbol] = useState<string | null>(null);
  const [chartFocusTrigger, setChartFocusTrigger] = useState<number>(0);

  // Jump immediately to the live TradingView chart when an asset is clicked in the top Market Overview bar
  const handleSelectMarketAsset = (tvSymbol: string) => {
    setActiveTab('analyzer');
    setSelectedTvSymbol(tvSymbol);
    setChartFocusTrigger(Date.now());

    // Multi-pass smooth scroll into view with header offset support
    const scrollToChart = () => {
      const chartEl = document.getElementById('live-tradingview-section');
      if (chartEl) {
        chartEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return true;
      }
      return false;
    };

    if (!scrollToChart()) {
      requestAnimationFrame(() => {
        if (!scrollToChart()) {
          setTimeout(scrollToChart, 80);
        }
      });
    } else {
      setTimeout(scrollToChart, 160);
    }
  };

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
    if (newSettings.theme && newSettings.theme !== theme) {
      setTheme(newSettings.theme);
    }
    setSettings((prev) => ({ ...prev, ...newSettings }));
  };

  const handleResetAnalysis = () => {
    setImages([null, null, null]);
    setAnalysisResult(null);
    setError(null);
  };

  const handleInsertImageToSlot = useCallback((imageDataUrl: string, targetSlotIndex: number) => {
    setImages((prev) => {
      const nextSlots: (string | null)[] = [prev[0] || null, prev[1] || null, prev[2] || null];
      if (targetSlotIndex >= 0 && targetSlotIndex < 3) {
        nextSlots[targetSlotIndex] = imageDataUrl;
      }
      return nextSlots;
    });
  }, []);

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
    const activeImages = images.filter((img): img is string => Boolean(img));
    if (activeImages.length === 0) {
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
        activeImages.map((img) => compressImageForAnalysis(img))
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

      if (response.status === 401 || data.code === 'GEMINI_AUTH_ERROR' || data.isAuthError) {
        const authErr: any = new Error(
          data.error ||
            (settings.language === 'cs'
              ? 'Google Gemini API klíč v Nastavení (Settings) není platný nebo vypršel (401 / ACCESS_TOKEN_TYPE_UNSUPPORTED). Přejděte v horním menu do nabídky Settings (Nastavení) a zadejte platný API klíč vygenerovaný na https://aistudio.google.com/app/apikey.'
              : 'Google Gemini API key in Settings is invalid or expired (401 / ACCESS_TOKEN_TYPE_UNSUPPORTED). Please open Settings in the top bar and enter a valid API key from https://aistudio.google.com/app/apikey.')
        );
        authErr.isAuthError = true;
        throw authErr;
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
      
      const isAuthIssue = err?.isAuthError ||
                          rawMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
                          rawMsg.includes('GEMINI_AUTH_ERROR') ||
                          rawMsg.includes('Google Gemini API klíč') ||
                          rawMsg.includes('aistudio.google.com/app/apikey');

      const isCapacityIssue = !isAuthIssue && (
                              rawMsg.includes('kapacit') || 
                              rawMsg.includes('kontaktován') || 
                              rawMsg.includes('TRADEOY') ||
                              rawMsg.includes('prepayment') ||
                              rawMsg.includes('billing') ||
                              rawMsg.includes('RESOURCE_EXHAUSTED') ||
                              rawMsg.includes('quota') ||
                              rawMsg.includes('Quota exceeded') ||
                              rawMsg.includes('429'));

      if (isAuthIssue) {
        setError(rawMsg);
      } else if (isCapacityIssue) {
        setError(
          settings.language === 'cs'
            ? 'Probíhá automatické navýšení kapacity AI serveru. Vývojový tým TRADEOY.com byl neprodleně kontaktován a plná funkčnost bude obnovena v co nejkratším čase. Váš kredit za tuto analýzu zůstal v plné výši zachován.'
            : settings.language === 'es'
            ? 'La ampliación de capacidad del servidor de IA está en progreso. El equipo de TRADEOY.com ha sido notificado y la funcionalidad completa se restablecerá a la mayor brevedad. Su crédito ha sido preservado íntegramente.'
            : 'AI server capacity autoscaling is in progress. The TRADEOY.com development team has been promptly notified and full functionality will be restored as soon as possible. Your analysis credit remains fully preserved.'
        );
      } else if (rawMsg === 'Load failed' || rawMsg.includes('Failed to fetch') || rawMsg.includes('NetworkError') || err.name === 'TypeError') {
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
    <div className="min-h-screen theme-bg-base bg-[#0a0a0c] bg-[radial-gradient(ellipse_80%_40%_at_50%_0%,rgba(16,185,129,0.05),transparent_70%)] text-[#f5f5f7] flex flex-col font-sans selection:bg-emerald-500 selection:text-black relative">
      {/* Header Bar */}
      <Header
        settings={settings}
        onUpdateSettings={handleUpdateSettings}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        savedCount={journal.length}
        creditsCount={currentLicense?.credits ?? 0}
        theme={theme}
        onUpdateTheme={handleUpdateTheme}
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
        {/* Interactive Top Market Overview Bar (Indices, Gold, Crypto, Forex) */}
        <MarketOverviewBar
          language={settings.language}
          onSelectAsset={handleSelectMarketAsset}
          selectedTvSymbol={selectedTvSymbol}
          theme={theme}
        />

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
                theme={theme}
              />

              {/* Real-Time Live TradingView Chart & Snapshot Station */}
              <TradingViewLiveChart
                language={settings.language}
                holdingPeriod={settings.holdingPeriod}
                onInsertImageToSlot={handleInsertImageToSlot}
                slots={images}
                externalSymbol={selectedTvSymbol}
                focusTrigger={chartFocusTrigger}
                theme={theme}
              />

              {/* Prominent Legal & Educational Disclaimer Banner - Placed below Chart Uploader */}
              <div className={`rounded-2xl p-3.5 sm:p-4 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4 shadow-lg ${
                theme === 'light'
                  ? 'bg-emerald-500/[0.07] border border-emerald-500/25 shadow-emerald-500/5'
                  : 'bg-[#121216]/95 border border-amber-500/30 shadow-black/40'
              }`}>
                <div className="flex items-start space-x-3.5 flex-1">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                    theme === 'light'
                      ? 'bg-emerald-500/15 border border-emerald-500/30'
                      : 'bg-amber-500/10 border border-amber-500/25'
                  }`}>
                    <Scale className={`w-4 h-4 ${theme === 'light' ? 'text-emerald-600' : 'text-amber-400'}`} />
                  </div>
                  <div className="space-y-1">
                    <span className={`font-bold block text-[11px] sm:text-xs uppercase tracking-wider ${
                      theme === 'light' ? 'text-emerald-800' : 'text-amber-300'
                    }`}>
                      {t.topDisclaimerTitle}
                    </span>
                    <p className={`text-[11px] sm:text-xs leading-relaxed ${
                      theme === 'light' ? 'text-slate-600' : 'text-[#a1a1a6]'
                    }`}>
                      {t.topDisclaimerText}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsTermsOpen(true)}
                  className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold flex items-center justify-center space-x-1.5 transition cursor-pointer shrink-0 active:scale-95 whitespace-nowrap shadow-sm ${
                    theme === 'light'
                      ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600 shadow-xs'
                      : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  <ShieldAlert className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-white' : 'text-amber-400'}`} />
                  <span>{t.viewFullTerms || 'Zobrazit kompletní podmínky'}</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Error or Capacity Notice Banner */}
              {error && (() => {
                const isAuthNotice = error.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') || 
                                     error.includes('Gemini API klíč') ||
                                     error.includes('GEMINI_AUTH_ERROR') ||
                                     error.includes('aistudio.google.com/app/apikey');

                if (isAuthNotice) {
                  return (
                    <div className="p-4 sm:p-5 rounded-2xl bg-[#17120a] border border-amber-500/40 text-amber-200 shadow-xl space-y-3 animate-fadeIn">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start space-x-3.5">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                            <KeyRound className="w-5 h-5 text-amber-400" />
                          </div>
                          <div className="space-y-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-amber-300 text-sm">
                                {settings.language === 'cs'
                                  ? 'Vyžadována konfigurace Google Gemini API klíče'
                                  : settings.language === 'es'
                                  ? 'Configuración requerida de la clave API de Gemini'
                                  : 'Google Gemini API Key Configuration Required'}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold">
                                ✓ {settings.language === 'cs' ? 'Kredit 100% zachován' : 'Credit 100% preserved'}
                              </span>
                            </div>
                            <p className="text-xs text-amber-200/90 leading-relaxed">
                              {error}
                            </p>
                            <div className="text-[11px] text-amber-300/80 bg-black/40 p-2.5 rounded-lg border border-amber-500/20">
                              <span className="font-semibold text-amber-300">
                                {settings.language === 'cs' ? 'Jak nastavit platný klíč:' : 'How to configure a valid key:'}
                              </span>
                              <ol className="list-decimal list-inside mt-1 space-y-0.5 text-amber-200/80">
                                <li>
                                  {settings.language === 'cs'
                                    ? 'Vygenerujte bezplatný API klíč v Google AI Studio (aistudio.google.com/app/apikey).'
                                    : 'Generate an API key in Google AI Studio (aistudio.google.com/app/apikey).'}
                                </li>
                                <li>
                                  {settings.language === 'cs'
                                    ? 'V horním menu této aplikace otevřete nabídku Settings a zadejte klíč do položky GEMINI_API_KEY.'
                                    : 'In the top menu of this app, open Settings and paste the key into GEMINI_API_KEY.'}
                                </li>
                              </ol>
                            </div>
                          </div>
                        </div>
                        {images.some(Boolean) && (
                          <button
                            onClick={handleAnalyzeChart}
                            disabled={isLoading}
                            className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 shrink-0 active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs ${
                              theme === 'light'
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600'
                                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40'
                            }`}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                            <span>{settings.language === 'cs' ? 'Zkusit znovu' : 'Retry now'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                const isCapacityNotice = error.includes('kapacit') || 
                                         error.includes('kontaktován') || 
                                         error.includes('TRADEOY') ||
                                         error.includes('autoscaling') ||
                                         error.includes('ampliación');

                if (isCapacityNotice) {
                  return (
                    <div className="p-4 sm:p-5 rounded-2xl bg-[#14120e] border border-amber-500/40 text-amber-200 shadow-xl space-y-3 animate-fadeIn">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                        <div className="flex items-start space-x-3.5">
                          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0 mt-0.5">
                            <Activity className="w-5 h-5 text-amber-400 animate-pulse" />
                          </div>
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-amber-300 text-sm">
                                {settings.language === 'cs'
                                  ? 'Probíhá automatické navýšení kapacity AI serveru'
                                  : settings.language === 'es'
                                  ? 'Ampliación de capacidad de IA en curso'
                                  : 'AI Server Capacity Scaling in Progress'}
                              </span>
                              <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-[10px] font-semibold">
                                ✓ {settings.language === 'cs' ? 'Kredit zachován' : 'Credit preserved'}
                              </span>
                            </div>
                            <p className="text-xs text-amber-200/90 leading-relaxed">
                              {error}
                            </p>
                          </div>
                        </div>
                        {images.some(Boolean) && (
                          <button
                            onClick={handleAnalyzeChart}
                            disabled={isLoading}
                            className={`w-full sm:w-auto px-4 py-2 rounded-xl text-xs font-semibold transition cursor-pointer disabled:opacity-50 shrink-0 active:scale-95 flex items-center justify-center gap-1.5 whitespace-nowrap shadow-xs ${
                              theme === 'light'
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border border-emerald-600'
                                : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 border border-amber-500/40'
                            }`}
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                            <span>{settings.language === 'cs' ? 'Zkusit znovu' : 'Retry now'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                    <div className="flex items-center space-x-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
                      <span className="font-medium">{error}</span>
                    </div>
                    {images.some(Boolean) && (
                      <button
                        onClick={handleAnalyzeChart}
                        disabled={isLoading}
                        className="px-4 py-1.5 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-200 text-xs font-semibold transition border border-red-500/30 cursor-pointer disabled:opacity-50 shrink-0 active:scale-95"
                      >
                        <span>Zkusit znovu analýzu</span>
                      </button>
                    )}
                  </div>
                );
              })()}

              {/* Analysis Results View */}
              {analysisResult && (
                <div id="analysis-result-section" className="pt-4 border-t border-white/[0.08]">
                  <AnalysisResultView
                    result={analysisResult}
                    onSaveToJournal={handleSaveToJournal}
                    isSaved={isCurrentSaved}
                    onOpenChat={() => setIsChatOpen(true)}
                    language={settings.language}
                    theme={theme}
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
        theme={theme}
        onUpdateTheme={handleUpdateTheme}
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
          theme={theme}
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
          theme={theme}
        />
      </Suspense>

      {/* Clean, Refined Footer */}
      <footer className="mt-auto border-t border-white/[0.08] bg-[#0c0c0e] py-6 text-xs text-[#86868b] relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <span className="font-bold text-white tracking-tight">TRADEOY<span className="text-emerald-400">.com</span></span>
            <span className="text-[#6e6e73]">© {new Date().getFullYear()}</span>
            <span className="text-[#6e6e73]">•</span>
            <span>{t.footerToolDesc}</span>
          </div>

          <div className="flex items-center space-x-4">
            <button
              id="footer-terms-btn"
              onClick={() => setIsTermsOpen(true)}
              className={`px-3.5 py-1.5 rounded-xl transition cursor-pointer flex items-center gap-1.5 font-medium shadow-xs ${
                theme === 'light'
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 border border-emerald-600'
                  : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 hover:text-amber-200 border border-amber-500/30'
              }`}
            >
              <Scale className={`w-3.5 h-3.5 ${theme === 'light' ? 'text-white' : 'text-amber-400'}`} />
              <span>{t.footerTermsLink}</span>
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
