import React, { useState } from 'react';
import { ShieldAlert, X, Scale, FileText, CheckCircle2, Lock, AlertTriangle, CreditCard, ChevronRight, UserCheck, Gavel, Cpu, Activity, Clock } from 'lucide-react';
import { LanguageOption } from '../types';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  language: LanguageOption;
}

export const TermsModal: React.FC<TermsModalProps> = ({ isOpen, onClose, language }) => {
  const [activeSection, setActiveSection] = useState<'disclaimer' | 'terms' | 'payments' | 'privacy' | 'jurisdiction'>('disclaimer');

  if (!isOpen) return null;

  const isCs = language === 'cs';
  const isEs = language === 'es';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 overflow-y-auto bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
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
                {isCs ? 'Právní ochrana, výukový charakter, limitace odpovědnosti a platební podmínky' : isEs ? 'Protección legal, carácter educativo, limitación de responsabilidad y condiciones' : 'Legal protection, educational scope, limitation of liability, and payment terms'}
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

          <button
            onClick={() => setActiveSection('jurisdiction')}
            className={`flex items-center space-x-1.5 px-3 py-2 rounded-xl transition-all whitespace-nowrap cursor-pointer ${
              activeSection === 'jurisdiction'
                ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold'
                : 'text-[#86868b] hover:text-white hover:bg-white/5'
            }`}
          >
            <Gavel className="w-3.5 h-3.5 text-amber-400" />
            <span>{isCs ? '5. Jurisdikce & Limitace' : isEs ? '5. Jurisdicción y Límites' : '5. Jurisdiction & Liability'}</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-sm text-[#c7c7cc] leading-relaxed custom-scrollbar">
          
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
                      ? 'Obchodování s finančními instrumenty (Forex, kryptoměny, indexy, komodity, CFD, akcie), zejména s využitím finanční páky, zahrnuje extrémní míru rizika a většinou vede ke ztrátě části nebo veškerého investovaného kapitálu (obvykle 70-85 % retailových obchodníků prodělává).'
                      : isEs
                      ? 'El trading de instrumentos financieros (Forex, criptomonedas, índices, materias primas, CFD) con apalancamiento conlleva un alto nivel de riesgo donde entre el 70% y el 85% de los inversores minoristas pierden dinero.'
                      : 'Trading financial instruments (Forex, Crypto, Indices, Commodities, CFDs) with leverage carries substantial risk of total capital loss. Between 70-85% of retail investor accounts lose money.'}
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
                      Platforma <strong>TRADEOY.com</strong>, její provozovatelé, vývojáři, partneři ani spolupracující subjekty <strong>nenesou žádnou právní, finanční ani morální odpovědnost</strong> za jakékoliv přímé, nepřímé, náhodné či následné finanční ztráty, ušlý zisk, margin cally ani neúspěch v prop-tradingových výzvách (evaluacích), vzniklé na základě použití této aplikace, AI analýz, predikcí, kalkulací Stop Loss/Take Profit či komentářů AI Mentora.
                    </>
                  ) : isEs ? (
                    <>
                      La plataforma <strong>TRADEOY.com</strong> y sus operadores <strong>no asumen ninguna responsabilidad legal o financiera</strong> por pérdidas directas, indirectas o consecuentes, lucro cesante o fallos en evaluaciones de prop trading derivados del uso de los análisis, señales o mentoría de la IA.
                    </>
                  ) : (
                    <>
                      The platform <strong>TRADEOY.com</strong> and its developers/operators <strong>accept zero legal or financial liability</strong> for any capital loss, damages, liquidation, prop-firm evaluation failures, or missed opportunities resulting from the use of the AI analyses, chart projections, Stop Loss / Take Profit metrics, or Mentor outputs.
                    </>
                  )}
                </p>

                <h3 className="text-base font-semibold text-white pt-2">
                  {isCs ? 'Nejsme investiční poradce ani broker (MiFID II / ZPKT)' : isEs ? 'No somos asesores financieros ni intermediarios (MiFID II)' : 'Not Financial Advice / Not a Broker (MiFID II)'}
                </h3>
                <p>
                  {isCs ? (
                    <>
                      TRADEOY.com <strong>není licencovaným investičním poradcem, makléřem, brokerem ani správcem aktiv</strong> ve smyslu zákona o podnikání na kapitálovém trhu č. 256/2004 Sb. (ČNB), evropské směrnice MiFID II (2014/65/EU) ani předpisů americké SEC a CFTC. Veškeré vygenerované signály (BUY / SELL / WAIT) jsou výhradně matematicko-statistickými modely pro studijní a výukové porovnání grafických formací. Každé investiční a obchodní rozhodnutí činí uživatel zcela samostatně a na vlastní riziko.
                    </>
                  ) : isEs ? (
                    <>
                      TRADEOY.com <strong>no es un asesor financiero ni corredor de bolsa regulado</strong> bajo la directiva europea MiFID II (2014/65/UE). Todas las señales generadas son modelos matemáticos para estudio y comparación formativa. Cada decisión es responsabilidad exclusiva del usuario.
                    </>
                  ) : (
                    <>
                      TRADEOY.com <strong>is not a licensed financial advisor, broker-dealer, or asset manager</strong> under EU MiFID II (2014/65/EU), Czech Capital Markets Act, or US SEC/CFTC rules. All generated signals (BUY/SELL/WAIT) represent automated mathematical pattern recognitions strictly for study and training purposes.
                    </>
                  )}
                </p>
              </div>
            </div>
          )}

          {/* SECTION 2: EDUCATIONAL PURPOSE & USER RESPONSIBILITY */}
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
                  <UserCheck className="w-4 h-4 text-cyan-400 shrink-0" />
                  <span>{isCs ? 'Nulová exekuce & Samostatný úsudek uživatele' : isEs ? 'Cero ejecución y juicio independiente' : 'Zero Execution & User Independence'}</span>
                </div>
                <p className="text-xs text-[#a1a1a6]">
                  {isCs 
                    ? 'Platforma nemá žádný přístup k vašim brokerským účtům ani možnost otevírat či uzavírat obchody. Všechny obchodní pokyny zadává uživatel výhradně osobně u svého brokera na základě vlastního nezávislého rozhodnutí.'
                    : isEs
                    ? 'La plataforma no tiene acceso a sus cuentas de corretaje ni capacidad para ejecutar órdenes. Todas las operaciones son introducidas directamente por el usuario bajo su exclusivo criterio.'
                    : 'The platform has zero access to your brokerage accounts and cannot execute trades. All trading actions are executed manually and independently by the user at their chosen broker.'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#1c1c1e] border border-white/[0.08] space-y-2">
                <div className="flex items-center space-x-2 text-white font-medium text-xs sm:text-sm">
                  <Cpu className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>{isCs ? 'AI technologie a algoritmické limity (Halucinace)' : isEs ? 'Limitaciones de IA y alucinaciones' : 'AI Limitations & Model Hallucinations'}</span>
                </div>
                <p className="text-xs text-[#a1a1a6]">
                  {isCs 
                    ? 'Analýzy jsou zpracovávány pokročilými neuronovými sítěmi (LLM). Uživatel bere na vědomí, že AI modely mohou generovat nepřesné, opožděné nebo chybné výstupy (halucinace). Výstupy AI nesmí být považovány za nezvratná fakta a musí být vždy kriticky ověřeny.'
                    : isEs
                    ? 'Los análisis son procesados por redes neuronales y modelos de lenguaje (LLM). La IA puede generar datos inexactos o alucinaciones. Las salidas de la IA no deben considerarse hechos absolutos.'
                    : 'Analyses are powered by deep learning LLMs which generate probabilistic models and may contain errors or hallucinations. AI outputs should never be treated as definitive financial truths.'}
                </p>
              </div>

              {/* SLA & Availability Disclaimer */}
              <div className="p-4 rounded-2xl bg-[#1c1c1e] border border-amber-500/20 space-y-2">
                <div className="flex items-center space-x-2 text-amber-300 font-medium text-xs sm:text-sm">
                  <Activity className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{isCs ? 'Dostupnost služby, technické odstávky a SLA (50 %)' : isEs ? 'Disponibilidad del Servicio y SLA (50%)' : 'Service Availability, Maintenance & SLA (50%)'}</span>
                </div>
                <p className="text-xs text-[#a1a1a6] leading-relaxed">
                  {isCs 
                    ? 'Provozovatel usiluje o maximální stabilitu rozhraní, avšak s ohledem na závislost na externích neuronových sítích (Google Gemini API), cloudových klastrech a internetových přenosech je služba poskytována striktně na bázi „JAK JE“ (AS IS) a „JAK JE DOSTUPNÁ“ (AS AVAILABLE). Provozovatel NEGARANTUJE nepřetržitou 100% dostupnost ani nulovou odezvu; smluvní cílová dostupnost (SLA) činí minimálně 50 % provozního času. Provozovatel si výslovně vyhrazuje právo na plánované i neplánované technické odstávky, navýšení výpočetních kapacit, bezpečnostní záplaty a dočasná pozastavení z důvodu limitů externích poskytovatelů bez vzniku nároku na jakoukoliv finanční kompenzaci či náhradu škody. Nespotřebované kredity zůstávají zachovány na licenčním klíči.'
                    : isEs
                    ? 'El servicio se suministra "TAL CUAL" y "SEGÚN DISPONIBILIDAD", sujeto a la disponibilidad de redes neuronales externas y servidores en la nube. No se garantiza una disponibilidad del 100%; el SLA objetivo es de al menos el 50%. El operador se reserva el derecho a interrupciones por mantenimiento, ampliación de capacidad o actualizaciones sin derecho a indemnización económica.'
                    : 'The service is provided strictly "AS IS" and "AS AVAILABLE", dependent on third-party neural network APIs, cloud compute infrastructure, and telecommunications. TRADEOY.com does NOT guarantee 100% uninterrupted uptime; target contractual availability (SLA) is 50%. The provider explicitly reserves the right to scheduled and emergency maintenance, capacity autoscaling, and temporary downtime without liability for damages or lost trading profits.'}
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
                💡 {isCs ? 'Kredity nemají expirační lhůtu a zůstávají na vašem účtu/licenčním klíči až do jejich využití. Provozovatel negarantuje žádný finanční zisk ani návratnost investic.' : isEs ? 'Los créditos no caducan. El operador no garantiza rentabilidad financiera alguna.' : 'Credits do not expire. The operator provides zero guarantees of monetary gain or ROI.'}
              </div>
            </div>
          )}

          {/* SECTION 4: PRIVACY */}
          {activeSection === 'privacy' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <h3 className="text-base font-semibold text-white">
                {isCs ? 'Zásady ochrany osobních údajů a screenshotů (GDPR)' : isEs ? 'Política de Privacidad y Capturas (RGPD)' : 'Privacy & Data Security Policy (GDPR)'}
              </h3>
              <p>
                {isCs ? (
                  <>
                    Respektujeme vaše soukromí v plném souladu s nařízením GDPR. Nahrané screenshoty grafů a anonymizované výpisy jsou zpracovávány výhradně v reálném čase za účelem vygenerování technické analýzy a nejsou poskytovány třetím stranám k marketingovým účelům.
                  </>
                ) : isEs ? (
                  <>
                    Respetamos su privacidad según el RGPD. Los gráficos subidos se procesan en tiempo real únicamente para la generación de análisis técnico.
                  </>
                ) : (
                  <>
                    We respect your privacy in compliance with GDPR. Uploaded chart images are processed in real time strictly for technical analysis and are never sold to advertisers.
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

          {/* SECTION 5: JURISDICTION & LIMITATION OF LIABILITY */}
          {activeSection === 'jurisdiction' && (
            <div className="space-y-4 animate-in fade-in duration-150">
              <h3 className="text-base font-semibold text-white flex items-center gap-2">
                <Scale className="w-4 h-4 text-amber-400" />
                {isCs ? 'Rozhodné právo, soudní příslušnost & limitace náhrady škody' : isEs ? 'Ley aplicable, jurisdicción y límite de indemnización' : 'Governing Law, Exclusive Jurisdiction & Limitation of Liability'}
              </h3>

              <div className="p-4 rounded-2xl bg-[#1c1c1e] border border-white/[0.08] space-y-2">
                <div className="text-xs font-semibold text-white flex items-center gap-2">
                  <Gavel className="w-4 h-4 text-amber-400" />
                  <span>{isCs ? 'Výlučná jurisdikce České republiky' : isEs ? 'Jurisdicción exclusiva de la República Checa' : 'Exclusive Jurisdiction of the Czech Republic'}</span>
                </div>
                <p className="text-xs text-[#a1a1a6] leading-relaxed">
                  {isCs 
                    ? 'Veškeré právní vztahy, smlouvy, spory a nároky vzniklé z používání platformy TRADEOY.com se řídí výlučně právním řádem České republiky (člen Evropské unie), s vyloučením kolizních norem a Úmluvy OSN o mezinárodní koupi zboží (CISG). K řešení jakýchkoliv sporů je věcně a místně příslušný výhradně obecný soud v České republice podle sídla provozovatele.'
                    : isEs
                    ? 'Todas las relaciones jurídicas y disputas derivadas del uso de TRADEOY.com se regirán exclusivamente por la legislación de la República Checa (Unión Europea). Cualquier litigio será resuelto exclusivamente por los tribunales competentes de la República Checa según el domicilio social del operador.'
                    : 'All legal relationships, claims, and disputes arising from the use of TRADEOY.com shall be governed exclusively by the laws of the Czech Republic (European Union), excluding conflict of law principles and the CISG. The courts of the Czech Republic at the operator’s registered seat have exclusive jurisdiction.'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/25 space-y-2">
                <div className="text-xs font-semibold text-amber-300 flex items-center gap-2">
                  <ShieldAlert className="w-4 h-4 text-amber-400" />
                  <span>{isCs ? 'Smluvní zastropování výše odpovědnosti (Limitation of Liability)' : isEs ? 'Límite máximo de indemnización' : 'Contractual Limitation of Liability'}</span>
                </div>
                <p className="text-xs text-amber-100/90 leading-relaxed">
                  {isCs 
                    ? 'Pokud by i přes veškerá vyloučení odpovědnosti byla soudem pravomocně shledána jakákoliv odpovědnost provozovatele, strany výslovně sjednávají, že celková maximální souhrnná výše jakékoliv náhrady škody je striktně omezena částkou, kterou uživatel prokazatelně uhradil provozovateli za přístup ke službě za bezprostředně předcházejících 30 kalendářních dnů, a v případě bezplatného užívání je limitována částkou 0 Kč (nula EUR).'
                    : isEs
                    ? 'Si un tribunal declarase alguna responsabilidad del operador, la indemnización total máxima estará contractualmente limitada a la cantidad abonada por el usuario en los 30 días previos, o 0 EUR en caso de uso gratuito.'
                    : 'If liability is established by a competent court, the aggregate liability of the operator shall be strictly capped at the amount paid by the user in the preceding 30 days, or 0 EUR/USD in the case of free usage.'}
                </p>
              </div>

              <div className="p-3 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-[#86868b]">
                {isCs 
                  ? 'Používáním platformy TRADEOY.com vyjadřuje uživatel bezvýhradný a informovaný souhlas s těmito podmínkami v plném rozsahu.'
                  : isEs
                  ? 'El uso de la plataforma implica la aceptación plena e incondicional de estos términos y condiciones.'
                  : 'Use of TRADEOY.com constitutes unconditional, informed acceptance of these terms in their entirety.'}
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
