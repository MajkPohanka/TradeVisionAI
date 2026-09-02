import React, { useState } from 'react';
import { Lock, ShieldAlert, KeyRound, ArrowRight, Eye, EyeOff, CheckCircle2 } from 'lucide-react';

interface PasswordGateProps {
  onAuthenticated: () => void;
  language: 'cs' | 'en' | 'es';
}

export const PasswordGate: React.FC<PasswordGateProps> = ({ onAuthenticated, language }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    setTimeout(() => {
      // The master access password requested by the user
      if (password.trim() === 'Trebic') {
        sessionStorage.setItem('tradeoy_auth_gate', 'granted');
        localStorage.setItem('tradeoy_auth_gate', 'granted');
        onAuthenticated();
      } else {
        setError(
          language === 'cs'
            ? 'Neplatné heslo. Zadejte prosím správné přístupové heslo.'
            : language === 'es'
            ? 'Contraseña incorrecta. Por favor ingrese la clave de acceso.'
            : 'Invalid password. Please enter the correct access key.'
        );
        setIsLoading(false);
      }
    }, 200);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#070709] bg-[radial-gradient(ellipse_80%_60%_at_50%_20%,rgba(16,185,129,0.08),transparent_80%)] flex items-center justify-center p-4">
      {/* Decorative background grid effect */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] pointer-events-none" />

      <div className="relative w-full max-w-md bg-[#121216]/95 border border-white/10 rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/80 backdrop-blur-xl animate-in fade-in zoom-in-95 duration-200">
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto shadow-inner shadow-emerald-500/20">
            <Lock className="w-7 h-7 text-emerald-400" />
          </div>

          <div className="space-y-1">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
              <span>TRADEOY.com</span>
              <span className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-400 border border-amber-500/30 uppercase tracking-wider font-semibold">
                Private Beta
              </span>
            </h1>
            <p className="text-xs sm:text-sm text-[#8e8e93]">
              {language === 'cs'
                ? 'Platforma je v neveřejném režimu. Pro vstup zadejte heslo.'
                : language === 'es'
                ? 'Plataforma en fase privada. Ingrese la contraseña de acceso.'
                : 'The platform is in private testing. Please enter access password.'}
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <label className="text-[11px] font-semibold text-[#a1a1a6] uppercase tracking-wider block">
              {language === 'cs' ? 'Přístupové heslo' : language === 'es' ? 'Contraseña de acceso' : 'Access Password'}
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-[#8e8e93] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(null);
                }}
                placeholder={language === 'cs' ? 'Zadejte heslo...' : 'Enter password...'}
                autoFocus
                required
                className="w-full bg-[#18181f] border border-white/10 rounded-xl pl-10 pr-11 py-3 text-sm text-white placeholder-[#5e5e66] focus:outline-none focus:border-emerald-500/60 focus:ring-2 focus:ring-emerald-500/20 transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8e8e93] hover:text-white p-1 transition"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center space-x-2 animate-in fade-in">
              <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password.trim()}
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 text-black font-bold text-sm flex items-center justify-center space-x-2 transition shadow-lg shadow-emerald-500/20 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          >
            <span>{language === 'cs' ? 'Odemknout přístup' : language === 'es' ? 'Desbloquear acceso' : 'Unlock Access'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="mt-6 pt-4 border-t border-white/5 text-center">
          <div className="inline-flex items-center space-x-1.5 text-[11px] text-[#8e8e93]">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>256-bit Encrypted Private Gateway</span>
          </div>
        </div>
      </div>
    </div>
  );
};
