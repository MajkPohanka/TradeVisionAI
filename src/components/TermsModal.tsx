import React, { useState } from 'react';
import { ShieldAlert, X, Scale, FileText, CheckCircle2, Lock, AlertTriangle, CreditCard, ChevronRight } from 'lucide-react';
import { LanguageOption } from '../types';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: LanguageOption;
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose, language }) => {
  const [activeSection, setActiveSection] = useState<'disclaimer' | 'terms' | 'payments' | 'privacy'>('disclaimer');

  if (!isOpen) return null;

  const isCs = language === 'cs';
  const isEs = language === 'es';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto bg-black/80 animate-in fade-in duration-200">
      <div 
        className="relative w-full max-w-3xl bg-[#161618] border border-white/10 rounded-2xl sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] my-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-6 border-b border-white/[0.08] bg-[#1c1c1e] flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Scale className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                {isCs ? 'Podmínky používání & Právní doložka' : isEs ? 'Términos de Uso y Aviso Legal' : 'Terms of Service & Disclaimer'}
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-semibold">
                  TRADEOY.com
                </span>
              </h2>
              <p className="text-xs text-[#86868b]">
                {isCs ? 'Právní ochrana, výukový charakter a platební podmínky' : isEs ? 'Protección legal, carácter educativo y condiciones de pago' : 'Legal protection, educational scope, and payment terms'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-[#86868b] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
            aria-label="Zavřít"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Section Navigation Tabs */}
        <div className="flex border-b border-white/[0.08] bg-[#121214] overflow-x-auto no-scrollbar p-1.5 gap-1 text-xs font-medium">
          <button
            onClick={() => setActiveSection('disclaimer')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeSection === 'disclaimer'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold'
                : 'text-[#86868b] hover:text-white hover:bg-white/5'
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
            <span>{isCs ? '1. Vyloučení odpovědnosti' : isEs ? '1. Descargo de Responsabilidad' : '1. Risk Disclaimer'}</span>
          </button>

          <button
            onClick={() => setActiveSection('terms')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeSection === 'terms'
                ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold'
                : 'text-[#86868b] hover:text-white hover:bg-white/5'
            }`}
          >
            <FileText className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isCs ? '2. Podmínky & Výuka' : isEs ? '2. Uso Educativo' : '2. Educational Scope'}</span>
          </button>

          <button
            onClick={() => setActiveSection('payments')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeSection === 'payments'
                ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold'
                : 'text-[#86868b] hover:text-white hover:bg-white/5'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5 text-cyan-400" />
            <span>{isCs ? '3. Platby & Kredity' : isEs ? '3. Pagos y Créditos' : '3. Payments & Credits'}</span>
          </button>

          <button
            onClick={() => setActiveSection('privacy')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeSection === 'privacy'
                ? 'bg-purple-500/15 text-purple-300 border border-purple-500/30 font-semibold'
                : 'text-[#86868b] hover:text-white hover:bg-white/5'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-purple-400" />
            <span>{isCs ? '4. Ochrana soukromí' : isEs ? '4. Privacidad' : '4. Privacy'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-sm text-[#c7c7cc] leading-relaxed">
          {/* SECTION 1: DISCLAIMER */}
          {activeSection === 'disclaimer' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-200 flex items-start space-x-3">
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                <div className="text-xs sm:text-sm space-y-1">
                  <p className="font-bold text-amber-300">
                    {isCs ? 'KRITICKÉ UPOZORNĚNÍ NA VYSOKÉ FINANČNÍ RIZIKO' : isEs ? 'AVISO CRÍTICO SOBRE ALTO RIESGO FINANCIERO' : 'CRITICAL FINANCIAL RISK WARNING'}
                  </p>
                  <p className="text-amber-200/90">
                    {isCs 
                      ? 'Obchodování s finančními instrumenty (Forex, kryptoměny, indexy, komodity, CFD, akcie) zahrnuje vysokou míru rizika a může vést ke ztrátě veškerého vašeho investovaného kapitálu.'
                      : isEs
                      ? 'El trading de instrumentos financieros (Forex, criptomonedas, índices, materias primas, CFD) conlleva un alto nivel de riesgo y puede provocar la pérdida total de su capital.'
                      : 'Trading financial instruments (Forex, Crypto, Indices, Commodities, CFDs) involves substantial risk of capital loss and is not suitable for everyone.'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-base font-semibold text-white">
                  {isCs ? 'Absolutní zřeknutí se odpovědnosti za finanční ztráty' : isEs ? 'Exención total de responsabilidad por pérdidas' : 'Full Disclaimer of Financial Liability'}
                </h3>
                <p>
                  {isCs ? (
                    <>
                      Platforma <strong>TRADEOY.com</strong>, její provozovatelé, vývojáři, partneři ani spolupracující subjekty <strong>nenesou žádnou právní, finanční ani morální odpovědnost</strong> za jakékoliv přímé, nepřímé, náhodné či následné finanční ztráty, ušlý zisk nebo škody vzniklé na základě použití této aplikace, AI analýz, predikcí, kalkulací Stop Loss/Take Profit či komentářů AI Mentora.
                    </>
                  ) : isEs ? (
                    <>
                      La plataforma <strong>TRADEOY.com</strong> y sus operadores <strong>no asumen ninguna responsabilidad legal o financiera</strong> por pérdidas directas, indirectas o consecuentes derivadas del uso de los análisis, señales o mentoría de la IA.
                    </>
                  ) : (
                    <>
                      The platform <strong>TRADEOY.com</strong> and its developers/operators <strong>accept zero legal or financial liability</strong> for any capital loss, damages, or missed opportunities resulting from the use of the AI analyses, chart projections, Stop Loss / Take Profit metrics, or Mentor outputs.
                    </>
                  )}
                </p>

                <h3 className="text-base font-semibold text-white pt-2">
                  {isCs ? 'Nejsme investiční poradce ani broker' : isEs ? 'No somos asesores financieros ni intermediarios' : 'Not Financial Advice / Not a Broker'}
                </h3>
                <p>
                  {isCs ? (
                    <>
                      TRADEOY.com <strong>není licencovaným investičním poradcem, makléřem, brokerem ani správcem aktiv</strong> ve smyslu zákona o podnikání na kapitálovém trhu (ČNB, SEC, ESMA, FCA). Veškeré vygenerované signály (BUY / SELL / WAIT) jsou výhradně matematicko-statistickými modely pro studijní a výukové porovnání grafických formací. Každé investiční a obchodní rozhodnutí činí uživatel zcela samostatně a na vlastní riziko.
                    </>
                  ) : isEs ? (
                    <>
                      TRADEOY.com <strong>no es un asesor financiero ni corredor de bolsa regulado</strong>. Todas las señales generadas son modelos matemáticos para estudio y comparación formativa.
                    </>
                  ) : (
                    <>
                      TRADEOY.com <strong>is not a licensed financial advisor, broker, or asset manager</strong>. All generated signals (BUY/SELL/WAIT) represent automated mathematical pattern recognitions strictly for study and training purposes.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* SECTION 2: EDUCATIONAL PURPOSE */}
          {activeSection === 'terms' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <h3 className="text-base font-semibold text-white">
                {isCs ? 'Výhradně výukový a simulační charakter' : isEs ? 'Carácter exclusivamente educativo y de simulación' : 'Educational & Analytical Purpose Only'}
              </h3>
              <p>
                {isCs ? (
                  <>
                    Aplikace TRADEOY.com je softwarový nástroj pro technickou analýzu a studium metodik Price Action, SMC (Smart Money Concepts), Wyckoffovy metody a matematických poměrů Risk-to-Reward. Slouží k tréninku čtení grafů a zpětnému testování (backtestingu) v demo / simulovaném prostředí.
                  </>
                ) : isEs ? (
                  <>
                    La aplicación TRADEOY.com es una herramienta de software destinada a la educación técnica en Price Action, SMC, Wyckoff y gestión de riesgo en entornos simulados o demo.
                  </>
                ) : (
                  <>
                    TRADEOY.com is designed purely as an analytical study suite for learning Price Action, Smart Money Concepts (SMC), and market structure visualization in simulated/demo environments.
                  </>
                )}
              </p>

              <div className="p-4 rounded-2xl bg-[#1c1c1e] border border-white/[0.08] space-y-2">
                <div className="flex items-center space-x-2 text-white font-medium text-xs sm:text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{isCs ? 'Odpovědnost uživatele' : isEs ? 'Responsabilidad del usuario' : 'User Responsibility'}</span>
                </div>
                <p className="text-xs text-[#a1a1a6]">
                  {isCs 
                    ? 'Uživatel bere na vědomí, že minulá výkonnost trhu ani předchozí simulované analýzy nezaručují budoucí výsledky. Nikdy neobchodujte s penězi, jejichž případnou ztrátu si nemůžete dovolit.'
                    : isEs
                    ? 'El usuario reconoce que los rendimientos pasados no garantizan resultados futuros. Nunca opere con dinero que no pueda permitirse perder.'
                    : 'Past chart performance and backtested simulations do not guarantee future market outcomes. Never trade with funds you cannot afford to lose.'}
                </p>
              </div>

              <h3 className="text-base font-semibold text-white pt-2">
                {isCs ? 'Duševní vlastnictví' : isEs ? 'Propiedad Intelectual' : 'Intellectual Property'}
              </h3>
              <p className="text-xs text-[#a1a1a6]">
                {isCs 
                  ? 'Veškerý kód, algoritmy, designové prvky a vizuální rozhraní TRADEOY.com jsou chráněny autorským právem. Je zakázáno neoprávněné kopírování, reverzní inženýrství nebo zneužití pro nekalou soutěž.'
                  : isEs
                  ? 'Todo el software, algoritmos y diseño de TRADEOY.com están protegidos por derechos de autor.'
                  : 'All algorithms, interface assets, and software code of TRADEOY.com are protected by international copyright laws.'}
              </p>
            </div>
          )}

          {/* SECTION 3: PAYMENTS & CREDITS */}
          {activeSection === 'payments' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <h3 className="text-base font-semibold text-white">
                {isCs ? 'Platební podmínky, Kredity & Reklamace' : isEs ? 'Condiciones de Pago, Créditos y Reembolsos' : 'Payment Terms, Credits & Refund Policy'}
              </h3>
              <p>
                {isCs ? (
                  <>
                    Nákupem kreditních balíčků na TRADEOY.com uživatel získává virtuální přístupové jednotky (kredity) umožňující spouštění pokročilých výpočetních modelů neuronových sítí a analýz grafů.
                  </>
                ) : isEs ? (
                  <>
                    La compra de paquetes de créditos en TRADEOY.com otorga unidades virtuales para la ejecución de análisis computacionales de IA.
                  </>
                ) : (
                  <>
                    Purchasing credit bundles provides virtual computing units to run server-side neural network chart breakdowns.
                  </>
                )}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-[#1c1c1e] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center space-x-2 text-white font-medium text-xs">
                    <CreditCard className="w-4 h-4 text-cyan-400" />
                    <span>{isCs ? 'Zabezpečení plateb (Stripe)' : isEs ? 'Seguridad Stripe' : 'Secure Stripe Checkout'}</span>
                  </div>
                  <p className="text-[11px] text-[#86868b]">
                    {isCs 
                      ? 'Platby jsou zpracovávány prostřednictvím certifikované platební brány Stripe s 256-bitovým šifrováním. Naše servery neukládají čísla platebních karet.'
                      : isEs
                      ? 'Los pagos se procesan a través de Stripe con cifrado seguro de grado bancario.'
                      : 'All transactions are encrypted and processed by Stripe. We never store credit card numbers.'}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-[#1c1c1e] border border-white/[0.08] space-y-1.5">
                  <div className="flex items-center space-x-2 text-white font-medium text-xs">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>{isCs ? 'Politika nevratnosti (No Refunds)' : isEs ? 'Política de no reembolso' : 'Digital Content & No Refund Policy'}</span>
                  </div>
                  <p className="text-[11px] text-[#86868b]">
                    {isCs 
                      ? 'Vzhledem k povaze okamžitého digitálního plnění a alokace cloudového výpočetního výkonu jsou veškeré zakoupené kredity po doručení a spotřebování nevratné.'
                      : isEs
                      ? 'Debido a la naturaleza inmediata del contenido digital, los créditos consumidos no son reembolsables.'
                      : 'Due to the immediate provisioning of cloud compute resources, delivered and utilized credits are non-refundable.'}
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-300">
                💡 {isCs ? 'Kredity nemají expirační lhůtu a zůstávají na vašem účtu/licenčním klíči až do jejich využití.' : isEs ? 'Los créditos no caducan y permanecen disponibles en su licencia.' : 'Credits have no expiration date and remain tied to your license key until redeemed.'}
              </div>
            </div>
          )}

          {/* SECTION 4: PRIVACY */}
          {activeSection === 'privacy' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <h3 className="text-base font-semibold text-white">
                {isCs ? 'Zásady ochrany osobních údajů a screenshotů' : isEs ? 'Política de Privacidad y Capturas' : 'Privacy & Data Security Policy'}
              </h3>
              <p>
                {isCs ? (
                  <>
                    Respektujeme vaše soukromí. Nahrané screenshoty grafů jsou zpracovávány výhradně za účelem vygenerování technické analýzy a nejsou poskytovány třetím stranám k marketingovým účelům.
                  </>
                ) : isEs ? (
                  <>
                    Respetamos su privacidad. Los gráficos subidos se procesan únicamente para la generación de análisis técnico.
                  </>
                ) : (
                  <>
                    We respect your privacy. Uploaded chart images are processed strictly for technical pattern extraction and are never sold to advertisers.
                  </>
                )}
              </p>

              <div className="p-4 rounded-2xl bg-[#1c1c1e] border border-white/[0.08] space-y-2">
                <div className="text-xs font-semibold text-white">
                  {isCs ? 'Kontakt pro právní dotazy a podporu:' : isEs ? 'Contacto legal y soporte:' : 'Legal & Support Contact:'}
                </div>
                <div className="text-xs text-emerald-400 font-mono">
                  support@tradeoy.com
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="p-4 sm:p-5 border-t border-white/[0.08] bg-[#1c1c1e] flex items-center justify-between gap-3">
          <div className="text-[11px] text-[#86868b] flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>{isCs ? 'Platné od: 1. 1. 2026' : isEs ? 'Vigente desde: 1/1/2026' : 'Effective date: Jan 1, 2026'}</span>
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 text-black font-semibold text-xs sm:text-sm hover:from-emerald-400 hover:to-teal-400 transition-all cursor-pointer shadow-lg shadow-emerald-500/20 active:scale-95 flex items-center space-x-1.5"
          >
            <span>{isCs ? 'Rozumím a Souhlasím' : isEs ? 'Entendido y Acepto' : 'I Understand & Agree'}</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
