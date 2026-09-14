import React, { useState } from 'react';
import {
  X,
  Zap,
  Check,
  ShieldCheck,
  CreditCard,
  Key,
  Copy,
  Sparkles,
  ExternalLink,
  RefreshCw,
  AlertCircle,
  HelpCircle
} from 'lucide-react';
import { CreditPackage, LicenseStatus, LanguageOption } from '../types';
import { getTranslation } from '../utils/translations';

interface CreditsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: LanguageOption;
  currentLicense: LicenseStatus | null;
  onLicenseUpdated: (license: LicenseStatus) => void;
  isTriggeredByPaywall?: boolean;
  onOpenTermsModal?: () => void;
  theme?: 'dark' | 'light';
}

export const CreditsModal: React.FC<CreditsModalProps> = ({
  isOpen,
  onClose,
  language,
  currentLicense,
  onLicenseUpdated,
  isTriggeredByPaywall = false,
  onOpenTermsModal,
  theme = 'dark',
}) => {
  const isLight = theme === 'light';
  const t = getTranslation(language);

  const [packages, setPackages] = useState<CreditPackage[]>([
    {
      id: 'starter',
      name: t.starterPackTitle || 'Starter (Zkušební)',
      priceUsd: 1,
      credits: 1,
      bonusCredits: 0,
      description: language === 'en'
        ? '1 full institutional AI chart analysis'
        : language === 'es'
        ? '1 análisis técnico institucional de IA'
        : '1 kompletní AI analýza grafu s detailním plánem',
    },
    {
      id: 'pro',
      name: t.proPackTitle || 'Pro Trader',
      priceUsd: 10,
      credits: 12,
      bonusCredits: 2,
      popular: true,
      tag: '+2 BONUS',
      description: language === 'en'
        ? '12 analyses (10 + 2 free) for active traders'
        : language === 'es'
        ? '12 análisis (10 + 2 gratis) para traders activos'
        : '12 analýz (10 + 2 zdarma) pro aktivní tradery',
    },
    {
      id: 'institutional',
      name: t.institutionalPackTitle || 'Institutional Master',
      priceUsd: 25,
      credits: 35,
      bonusCredits: 10,
      tag: '+10 BONUS ZDARMA',
      description: language === 'en'
        ? '35 analyses for prop-firm & multi-chart analysis'
        : language === 'es'
        ? '35 análisis para prop-firms y trading diario'
        : '35 analýz pro prop-firm & multitimeframe trading',
    },
  ]);

  const [selectedPkgId, setSelectedPkgId] = useState<string>('pro');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [inputKey, setInputKey] = useState<string>('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifySuccess, setVerifySuccess] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showKeyInput, setShowKeyInput] = useState<boolean>(false);

  if (!isOpen) return null;

  const remaining = currentLicense ? currentLicense.credits : 0;

  // Handle Checkout creation
  const handleProceedToCheckout = async (pkgId = selectedPkgId) => {
    setIsProcessing(true);
    setVerifyError(null);
    try {
      const res = await fetch('/api/credits/create-checkout-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          packageId: pkgId,
          existingKey: currentLicense?.key || undefined,
          appUrl: window.location.origin,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Nepodařilo se inicializovat platbu.');
      }

      if (data.mode === 'live' && data.checkoutUrl) {
        // Redirect to real Stripe checkout
        window.location.href = data.checkoutUrl;
      } else {
        // Sandbox simulator - automatically confirm and apply credits
        const confirmRes = await fetch('/api/credits/confirm-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sessionId: data.sessionId }),
        });
        const confirmData = await confirmRes.json();
        if (confirmData.success && confirmData.license) {
          onLicenseUpdated(confirmData.license);
          setVerifySuccess(
            language === 'en'
              ? `Payment successful! Added credits. Your active key: ${confirmData.license.key}`
              : language === 'es'
              ? `¡Pago exitoso! Créditos añadidos. Tu clave activa: ${confirmData.license.key}`
              : `Platba úspěšná! Kredity byly připsány. Váš licenční klíč: ${confirmData.license.key}`
          );
        }
      }
    } catch (err: any) {
      console.error(err);
      setVerifyError(err.message || 'Chyba při inicializaci platby.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Handle manual license key or email lookup
  const handleVerifyKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputKey.trim()) return;

    setIsVerifying(true);
    setVerifyError(null);
    setVerifySuccess(null);

    try {
      const isEmail = inputKey.includes('@');
      const payload = isEmail ? { email: inputKey.trim() } : { key: inputKey.trim() };

      const res = await fetch('/api/credits/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success || !data.license) {
        throw new Error(data.error || t.keyInvalid);
      }

      onLicenseUpdated(data.license);
      setVerifySuccess(`${t.keySavedSuccess} (${data.license.credits} ${t.creditsBadge.toLowerCase()})`);
      setInputKey('');
      setShowKeyInput(false);
    } catch (err: any) {
      setVerifyError(err.message || t.keyInvalid);
    } finally {
      setIsVerifying(false);
    }
  };

  const handleCopyKey = () => {
    if (currentLicense?.key) {
      navigator.clipboard.writeText(currentLicense.key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div
      id="credits-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="credits-modal-container"
        className={`relative w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden my-auto border transition-colors ${
          isLight
            ? 'bg-slate-50 border-slate-300 text-slate-900'
            : 'bg-[#121216] border-white/[0.12]'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className={`relative px-6 py-5 border-b flex items-center justify-between transition-colors ${
          isLight ? 'bg-white border-slate-200' : 'bg-black/40 border-white/[0.08]'
        }`}>
          <div className="flex items-center space-x-3.5">
            <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-sm ${
              isLight
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-600'
                : 'bg-white/[0.08] border border-white/[0.12] text-emerald-400'
            }`}>
              <Zap className={`w-5 h-5 stroke-[2.5] ${isLight ? 'fill-emerald-600 text-emerald-600' : 'fill-emerald-400 text-emerald-400'}`} />
            </div>
            <div>
              <h2 className={`text-base sm:text-lg font-bold tracking-tight flex items-center gap-2 ${
                isLight ? 'text-slate-900' : 'text-white'
              }`}>
                {t.creditsTitle}
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 font-semibold">
                  {t.creditPricePerAnalysis}
                </span>
              </h2>
              <p className={`text-xs mt-0.5 ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>
                {t.creditsSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-full transition cursor-pointer ${
              isLight
                ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100'
                : 'text-[#86868b] hover:text-white hover:bg-white/10'
            }`}
            aria-label="Zavřít"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 sm:p-7 space-y-6 max-h-[80vh] overflow-y-auto no-scrollbar">
          {/* Paywall Alert Banner (if triggered by 0 credits attempt) */}
          {isTriggeredByPaywall && remaining <= 0 && (
            <div className={`p-4 rounded-2xl flex items-start space-x-3 ${
              isLight
                ? 'bg-amber-50 border border-amber-200 text-amber-800'
                : 'bg-amber-500/10 border border-amber-500/25 text-amber-200'
            }`}>
              <AlertCircle className={`w-5 h-5 shrink-0 mt-0.5 ${isLight ? 'text-amber-600' : 'text-amber-400'}`} />
              <div className="text-xs sm:text-sm">
                <p className={`font-semibold ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>{t.insufficientCreditsTitle}</p>
                <p className={`mt-0.5 text-xs ${isLight ? 'text-amber-700' : 'text-[#a1a1a6]'}`}>{t.insufficientCreditsDesc}</p>
              </div>
            </div>
          )}

          {/* Current Status Box */}
          <div className={`flex flex-col sm:flex-row items-center justify-between p-4.5 rounded-2xl border gap-3 ${
            isLight
              ? 'bg-white border-slate-200 shadow-xs'
              : 'bg-black/40 border-white/[0.08]'
          }`}>
            <div className="flex items-center space-x-3.5 w-full sm:w-auto">
              <div className={`w-10 h-10 rounded-2xl flex items-center justify-center border ${
                isLight
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-600'
                  : 'bg-white/[0.06] border-white/[0.08] text-emerald-400'
              }`}>
                <Key className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className={`text-xs font-medium ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>{t.remainingCredits}</div>
                <div className={`text-xl font-extrabold flex items-center gap-2 ${isLight ? 'text-slate-900' : 'text-white'}`}>
                  <span className={remaining > 0 ? (isLight ? 'text-emerald-600 font-bold' : 'text-emerald-400') : (isLight ? 'text-rose-600 font-bold' : 'text-rose-400')}>
                    {remaining >= 9999 ? t.vipUnlimitedAccount : remaining}
                  </span>
                  <span className={`text-xs font-normal ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>
                    {remaining >= 9999
                      ? t.vipTraderAccountBadge
                      : t.analysesAvailable}
                  </span>
                </div>
              </div>
            </div>

            {currentLicense?.key && (
              <div className={`flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-end px-3.5 py-1.5 rounded-full border text-xs ${
                isLight
                  ? 'bg-slate-100 border-slate-200'
                  : 'bg-black/60 border-white/[0.08]'
              }`}>
                <span className={`font-mono font-semibold select-all ${isLight ? 'text-slate-900' : 'text-[#f5f5f7]'}`}>
                  {currentLicense.key}
                </span>
                <button
                  onClick={handleCopyKey}
                  className={`p-1 rounded transition cursor-pointer ${
                    isLight ? 'text-slate-500 hover:text-slate-800' : 'text-[#86868b] hover:text-white'
                  }`}
                  title={t.copyKeyBtn}
                >
                  {copied ? <Check className={`w-3.5 h-3.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} /> : <Copy className="w-3.5 h-3.5" />}
                </button>
                <button
                  onClick={() => {
                    localStorage.removeItem('tradeoy_license_key');
                    localStorage.removeItem('tradeoy_credits');
                    localStorage.removeItem('aiautotrader_license_key');
                    localStorage.removeItem('aiautotrader_credits');
                    onLicenseUpdated({
                      key: '',
                      credits: 0,
                      tier: 'standard',
                    });
                    setVerifySuccess(
                      language === 'cs'
                        ? 'Klíč odhlášen. Zůstatek nastaven na 0 kreditů.'
                        : 'License removed. Balance reset to 0 credits.'
                    );
                  }}
                  className="px-2 py-0.5 ml-1 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-500 dark:text-red-400 text-[10px] font-semibold border border-red-500/20 transition cursor-pointer"
                  title="Odhlásit / Odstranit klíč"
                >
                  {language === 'cs' ? 'Odhlásit' : 'Disconnect'}
                </button>
              </div>
            )}
          </div>

          {/* Messages */}
          {verifySuccess && (
            <div className={`p-3.5 border rounded-2xl text-xs flex items-center space-x-2 ${
              isLight
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                : 'bg-emerald-500/15 border-emerald-500/30 text-emerald-300'
            }`}>
              <Check className="w-4 h-4 shrink-0" />
              <span>{verifySuccess}</span>
            </div>
          )}

          {verifyError && (
            <div className={`p-3.5 border rounded-2xl text-xs flex items-center space-x-2 ${
              isLight
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{verifyError}</span>
            </div>
          )}

          {/* Package Selection Cards */}
          <div>
            <div className={`text-xs font-semibold uppercase tracking-wider mb-3 ${
              isLight ? 'text-slate-600' : 'text-[#86868b]'
            }`}>
              {t.selectCreditPackage}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              {packages.map((pkg) => {
                const isSelected = selectedPkgId === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPkgId(pkg.id)}
                    className={`relative p-5 rounded-2xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? (isLight
                            ? 'bg-emerald-50/70 border-emerald-500 shadow-md ring-2 ring-emerald-500/20 scale-[1.02]'
                            : 'bg-white/[0.08] border-white/40 shadow-lg scale-[1.02]')
                        : (isLight
                            ? 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/80 shadow-xs'
                            : 'bg-black/30 border-white/[0.08] hover:border-white/[0.18] hover:bg-black/50')
                    }`}
                  >
                    {pkg.popular && (
                      <div className={`absolute -top-2.5 right-3 px-2.5 py-0.5 rounded-full text-[10px] font-extrabold tracking-wider shadow ${
                        isLight ? 'bg-emerald-600 text-white' : 'bg-white text-black'
                      }`}>
                        {t.popularTag}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between">
                        <span className={`text-sm font-bold ${isLight ? 'text-slate-900' : 'text-white'}`}>{pkg.name}</span>
                        {isSelected && (
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                            isLight ? 'bg-emerald-600 text-white' : 'bg-white text-black'
                          }`}>
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <div className="mt-2.5 flex items-baseline gap-1">
                        <span className={`text-2xl font-extrabold ${isLight ? 'text-slate-900' : 'text-white'}`}>${pkg.priceUsd}</span>
                        <span className={`text-xs ${isLight ? 'text-slate-500' : 'text-[#86868b]'}`}>USD</span>
                      </div>

                      <div className="mt-1 flex items-center gap-1.5">
                        <span className={`text-xs font-semibold ${isLight ? 'text-emerald-700' : 'text-emerald-400'}`}>
                          {pkg.credits} {t.creditsBadge.toLowerCase()}
                        </span>
                        {pkg.tag && (
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                            isLight
                              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                              : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
                          }`}>
                            {pkg.tag}
                          </span>
                        )}
                      </div>

                      <p className={`mt-2.5 text-[11px] leading-relaxed ${isLight ? 'text-slate-600' : 'text-[#86868b]'}`}>
                        {pkg.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Primary Checkout Button - Green in light mode as requested by user */}
          <button
            id="proceed-checkout-btn"
            disabled={isProcessing}
            onClick={() => handleProceedToCheckout()}
            className={`w-full py-4 px-5 rounded-full font-bold text-sm sm:text-base flex items-center justify-center space-x-2 shadow-xl transition cursor-pointer active:scale-[0.99] disabled:opacity-50 ${
              isLight
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/25'
                : 'bg-white text-black hover:bg-[#f5f5f7]'
            }`}
          >
            {isProcessing ? (
              <>
                <RefreshCw className={`w-5 h-5 animate-spin ${isLight ? 'text-white' : 'text-black'}`} />
                <span>{t.processingPayment}</span>
              </>
            ) : (
              <>
                <CreditCard className={`w-5 h-5 stroke-[2.5] ${isLight ? 'text-white' : 'text-black'}`} />
                <span>{t.checkoutWithStripe}</span>
              </>
            )}
          </button>

          {/* License Key & Restore Section */}
          <div className={`pt-3 border-t ${isLight ? 'border-slate-200' : 'border-white/[0.08]'}`}>
            {!showKeyInput ? (
              <button
                onClick={() => setShowKeyInput(true)}
                className={`text-xs transition flex items-center space-x-1.5 mx-auto cursor-pointer ${
                  isLight ? 'text-slate-600 hover:text-slate-900' : 'text-[#86868b] hover:text-white'
                }`}
              >
                <Key className={`w-3.5 h-3.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                <span>{t.enterKeyBtn} {t.orRestoreViaEmail}</span>
              </button>
            ) : (
              <form onSubmit={handleVerifyKey} className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className={`text-xs font-semibold flex items-center gap-1.5 ${isLight ? 'text-slate-600' : 'text-[#86868b]'}`}>
                    <Key className={`w-3.5 h-3.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                    {t.licenseKeyLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowKeyInput(false)}
                    className={`text-[11px] cursor-pointer ${isLight ? 'text-slate-500 hover:text-slate-800' : 'text-[#86868b] hover:text-white'}`}
                  >
                    {t.hide}
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    placeholder={t.licenseKeyPlaceholder}
                    className={`flex-1 px-4 py-2.5 rounded-full text-xs transition focus:outline-none ${
                      isLight
                        ? 'bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-500'
                        : 'bg-black/40 border border-white/[0.08] text-white placeholder-[#86868b]/60 focus:border-white/30'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={isVerifying || !inputKey.trim()}
                    className={`px-5 py-2.5 rounded-full text-xs font-semibold transition cursor-pointer disabled:opacity-50 active:scale-95 ${
                      isLight
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
                        : 'bg-white/[0.08] hover:bg-white/[0.15] text-white border border-white/[0.08]'
                    }`}
                  >
                    {isVerifying ? t.verifying : t.verifyKeyBtn}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Trust Notice */}
          <div className={`p-3.5 rounded-2xl text-[11px] flex flex-col gap-2 border ${
            isLight
              ? 'bg-slate-100 border-slate-200 text-slate-600'
              : 'bg-black/30 border-white/[0.06] text-[#86868b]'
          }`}>
            <div className="flex items-start space-x-2.5">
              <ShieldCheck className={`w-4 h-4 shrink-0 mt-0.5 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
              <p className="leading-relaxed">{t.magicLinkNotice}</p>
            </div>
            {onOpenTermsModal && (
              <div className={`pt-2 border-t text-center ${isLight ? 'border-slate-200' : 'border-white/[0.04]'}`}>
                <button
                  type="button"
                  onClick={onOpenTermsModal}
                  className={`text-[11px] underline transition cursor-pointer ${
                    isLight ? 'text-slate-600 hover:text-slate-900' : 'text-[#86868b] hover:text-white'
                  }`}
                >
                  {t.termsAndDisclaimerTitle}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
