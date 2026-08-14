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
}

export const CreditsModal: React.FC<CreditsModalProps> = ({
  isOpen,
  onClose,
  language,
  currentLicense,
  onLicenseUpdated,
  isTriggeredByPaywall = false,
}) => {
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
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/85 backdrop-blur-md overflow-y-auto"
      onClick={onClose}
    >
      <div
        id="credits-modal-container"
        className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-2xl shadow-2xl shadow-emerald-500/10 overflow-hidden my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header Bar */}
        <div className="relative px-5 py-4 sm:px-6 sm:py-5 border-b border-slate-800 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-500 flex items-center justify-center shadow-md shadow-emerald-500/20 text-slate-950">
              <Zap className="w-5 h-5 fill-slate-950 stroke-[2.5]" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-tight flex items-center gap-2">
                {t.creditsTitle}
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold">
                  $1 / Analýza
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                {t.creditsSubtitle}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="Zavřít"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 sm:p-6 space-y-6 max-h-[80vh] overflow-y-auto no-scrollbar">
          {/* Paywall Alert Banner (if triggered by 0 credits attempt) */}
          {isTriggeredByPaywall && remaining <= 0 && (
            <div className="p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl flex items-start space-x-3 text-amber-200">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs sm:text-sm">
                <p className="font-semibold text-amber-300">{t.insufficientCreditsTitle}</p>
                <p className="text-slate-300 mt-0.5 text-xs">{t.insufficientCreditsDesc}</p>
              </div>
            </div>
          )}

          {/* Current Status Box */}
          <div className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-850 border border-slate-800 rounded-xl gap-3">
            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <div className="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center border border-slate-700 text-emerald-400">
                <Key className="w-4 h-4" />
              </div>
              <div className="text-left">
                <div className="text-xs text-slate-400">{t.remainingCredits}</div>
                <div className="text-xl font-extrabold text-white flex items-center gap-1.5">
                  <span className={remaining > 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {remaining}
                  </span>
                  <span className="text-xs text-slate-400 font-normal">
                    {language === 'en' ? 'analyses available' : language === 'es' ? 'análisis disponibles' : 'analýz k dispozici'}
                  </span>
                </div>
              </div>
            </div>

            {currentLicense?.key && (
              <div className="flex items-center space-x-2 w-full sm:w-auto justify-between sm:justify-end bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
                <span className="font-mono text-slate-300 font-semibold select-all">
                  {currentLicense.key}
                </span>
                <button
                  onClick={handleCopyKey}
                  className="p-1 rounded text-slate-400 hover:text-emerald-400 transition cursor-pointer"
                  title={t.copyKeyBtn}
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
            )}
          </div>

          {/* Messages */}
          {verifySuccess && (
            <div className="p-3 bg-emerald-500/15 border border-emerald-500/30 rounded-xl text-emerald-300 text-xs flex items-center space-x-2">
              <Check className="w-4 h-4 shrink-0" />
              <span>{verifySuccess}</span>
            </div>
          )}

          {verifyError && (
            <div className="p-3 bg-rose-500/15 border border-rose-500/30 rounded-xl text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{verifyError}</span>
            </div>
          )}

          {/* Package Selection Cards */}
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
              {language === 'en' ? 'Select Credit Package' : language === 'es' ? 'Seleccionar Paquete de Créditos' : 'Vyberte balíček kreditů'}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {packages.map((pkg) => {
                const isSelected = selectedPkgId === pkg.id;
                return (
                  <div
                    key={pkg.id}
                    onClick={() => setSelectedPkgId(pkg.id)}
                    className={`relative p-4 rounded-xl border transition-all cursor-pointer flex flex-col justify-between ${
                      isSelected
                        ? 'bg-emerald-950/30 border-emerald-500 shadow-md shadow-emerald-500/10 scale-[1.02]'
                        : 'bg-slate-850/80 border-slate-800 hover:border-slate-700 hover:bg-slate-800/80'
                    }`}
                  >
                    {pkg.popular && (
                      <div className="absolute -top-2.5 right-3 px-2 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-extrabold tracking-wider shadow">
                        {t.popularTag}
                      </div>
                    )}

                    <div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-bold text-white">{pkg.name}</span>
                        {isSelected && (
                          <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center text-slate-950">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        )}
                      </div>

                      <div className="mt-2 flex items-baseline gap-1">
                        <span className="text-2xl font-extrabold text-white">${pkg.priceUsd}</span>
                        <span className="text-xs text-slate-400">USD</span>
                      </div>

                      <div className="mt-1 flex items-center gap-1.5">
                        <span className="text-xs font-semibold text-emerald-400">
                          {pkg.credits} {t.creditsBadge.toLowerCase()}
                        </span>
                        {pkg.tag && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">
                            {pkg.tag}
                          </span>
                        )}
                      </div>

                      <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">
                        {pkg.description}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Primary Checkout Button */}
          <button
            id="proceed-checkout-btn"
            disabled={isProcessing}
            onClick={() => handleProceedToCheckout()}
            className="w-full py-3.5 px-4 rounded-xl bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-slate-950 font-bold text-sm sm:text-base flex items-center justify-center space-x-2 shadow-lg shadow-emerald-500/25 transition cursor-pointer active:scale-[0.99] disabled:opacity-50"
          >
            {isProcessing ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin text-slate-950" />
                <span>Zpracovávám platbu...</span>
              </>
            ) : (
              <>
                <CreditCard className="w-5 h-5 stroke-[2.5]" />
                <span>{t.checkoutWithStripe}</span>
              </>
            )}
          </button>

          {/* License Key & Restore Section */}
          <div className="pt-3 border-t border-slate-800">
            {!showKeyInput ? (
              <button
                onClick={() => setShowKeyInput(true)}
                className="text-xs text-slate-400 hover:text-emerald-400 transition flex items-center space-x-1.5 mx-auto cursor-pointer"
              >
                <Key className="w-3.5 h-3.5 text-emerald-400" />
                <span>{t.enterKeyBtn} (nebo obnovit ze zadaného e-mailu)</span>
              </button>
            ) : (
              <form onSubmit={handleVerifyKey} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-emerald-400" />
                    {t.licenseKeyLabel}
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowKeyInput(false)}
                    className="text-[11px] text-slate-500 hover:text-slate-300"
                  >
                    Skrýt
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inputKey}
                    onChange={(e) => setInputKey(e.target.value)}
                    placeholder={t.licenseKeyPlaceholder}
                    className="flex-1 px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="submit"
                    disabled={isVerifying || !inputKey.trim()}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-emerald-400 border border-slate-700 rounded-lg text-xs font-semibold transition cursor-pointer disabled:opacity-50"
                  >
                    {isVerifying ? 'Ověřuji...' : t.verifyKeyBtn}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Trust Notice */}
          <div className="p-3 bg-slate-950/60 border border-slate-800/80 rounded-xl text-[11px] text-slate-400 flex items-start space-x-2.5">
            <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">{t.magicLinkNotice}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
