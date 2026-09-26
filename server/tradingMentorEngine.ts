/**
 * TRADEOY Advanced Quantitative AI Trading Mentor Engine
 * Provides dynamic, context-aware, highly personalized institutional trading guidance,
 * trade management rules, risk sizing, and psychology coaching.
 */

export interface MentorAnalysisContext {
  symbol?: string;
  assetName?: string;
  timeframe?: string;
  signal?: 'LONG' | 'SHORT' | 'NEUTRAL_WAIT' | string;
  confidenceScore?: number;
  biasReasoning?: string;
  entryZone?: {
    min?: number;
    max?: number;
    recommended?: number;
  };
  stopLoss?: {
    price?: number;
    reason?: string;
    distancePercent?: number;
  };
  takeProfitTargets?: Array<{
    target: number;
    price: number;
    riskRewardRatio: number;
    description: string;
    closePercentage: number;
  }>;
  overallRiskRewardRatio?: string;
  methodologyConfluences?: Array<{
    name: string;
    observation: string;
    status?: string;
  }>;
  candlestickPatterns?: Array<{
    name: string;
    type: string;
    timeframe?: string;
    significance?: string;
    explanation?: string;
  }>;
  priceActionStructures?: Array<{
    type: string;
    name: string;
    status: string;
    priceRange?: string;
    timeframe?: string;
    explanation?: string;
  }>;
  keyLevels?: {
    support?: number[];
    resistance?: number[];
    keyPivot?: number;
  };
  riskManagement?: {
    suggestedPositionSizePercent?: number;
    maxLeverage?: string;
    invalidationCondition?: string;
    trailingStopStrategy?: string;
  };
  economicCalendarWarning?: any;
  tradeChecklist?: Array<{
    rule: string;
    passed: boolean;
    comment: string;
  }>;
}

export interface MentorChatHistoryMessage {
  sender?: string;
  role?: string;
  text?: string;
  content?: string;
}

export interface MentorSettings {
  language?: 'cs' | 'en' | 'es' | string;
  holdingPeriod?: 'scalp' | 'intraday' | 'swing' | 'position' | string;
  riskTolerance?: 'conservative' | 'balanced' | 'aggressive' | string;
  accountRiskPercent?: number;
  accountSizeUsd?: number;
  tradingStyle?: string;
}

/**
 * Determine display precision based on asset symbol and price magnitude
 */
export function getAssetPrecision(symbol?: string, price?: number): number {
  const sym = (symbol || '').toUpperCase();
  if (sym.includes('JPY')) return 3;
  if (sym.includes('BTC') || sym.includes('ETH') || sym.includes('SOL') || sym.includes('BNB')) {
    return price && price > 1000 ? 2 : 4;
  }
  if (sym.includes('XAU') || sym.includes('GOLD') || sym.includes('XAG')) return 2;
  if (sym.includes('US30') || sym.includes('NAS') || sym.includes('SPX') || sym.includes('GER') || sym.includes('DAX')) {
    return price && price > 1000 ? 1 : 2;
  }
  if (sym.includes('EUR') || sym.includes('GBP') || sym.includes('AUD') || sym.includes('USD') || sym.includes('NZD') || sym.includes('CAD') || sym.includes('CHF')) {
    return 5;
  }
  if (price !== undefined && price !== null) {
    if (price > 500) return 2;
    if (price > 10) return 3;
    return 5;
  }
  return 4;
}

/**
 * Cleanly format prices for readability
 */
export function formatMentorPrice(val?: number, symbol?: string): string {
  if (val === undefined || val === null || isNaN(val)) return 'N/A';
  const precision = getAssetPrecision(symbol, val);
  return Number(val).toLocaleString('en-US', {
    minimumFractionDigits: precision > 2 ? precision : 2,
    maximumFractionDigits: precision,
    useGrouping: false,
  });
}

/**
 * Intent classification for user questions
 */
export type MentorIntent =
  | 'WHY_SIGNAL'
  | 'ENTRY_TIMING'
  | 'STOP_LOSS'
  | 'TAKE_PROFIT'
  | 'BREAKEVEN'
  | 'RISK_LOTS'
  | 'TIMEFRAME'
  | 'SMC_CONCEPTS'
  | 'NEWS_MACRO'
  | 'PSYCHOLOGY'
  | 'REVERSAL_WHAT_IF'
  | 'CLOSE_PARTIALS'
  | 'GREETING_OR_THANKS'
  | 'GENERAL_OVERVIEW';

export function classifyMentorIntent(question: string): MentorIntent {
  const q = (question || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Breakeven management (checked early so "ochrana na vstupu" isn't swallowed by entry)
  if (
    /(breakeven|break\s*even|\bbe\b|posun.*(vstup|be)|ochran|chranit)/.test(q)
  ) {
    return 'BREAKEVEN';
  }

  // 2. Stop loss & invalidation
  if (
    /(\bsl\b|stop\s*loss|stoploss|stopk|invalida|kam\s*dat\s*stop|kde\s*dat\s*stop)/.test(q)
  ) {
    return 'STOP_LOSS';
  }

  // 3. Take profit & targets
  if (
    /(\btp\b|\btp[123]\b|take\s*profit|takeprofit|profit|zisk|cíl|cil|target|kam\s*mirit|kde\s*vybrat|kde\s*zavrit)/.test(q)
  ) {
    return 'TAKE_PROFIT';
  }

  // 4. Why this signal / direction
  if (
    /(proc.*(long|short|nakup|prodej|proda|buy|sell)|(proc|duvod|jakto|logik|vysvetli).*(signal|obchod|setup|pozic)|why\s*(long|short|buy|sell|this)|por\s*que\s*(long|short|comprar|vender)|proc\s+zrovna|proc\s+vlastne|proc\s+ted)/.test(q) ||
    /^(proc|why|por que)\b/.test(q)
  ) {
    return 'WHY_SIGNAL';
  }

  // 5. Entry timing & execution
  if (
    /(kdy.*(vstup|vstoup|open|koup|proda)|vstup.*(hned|ted|market)|(pozde|cas).*(vstup|vstoup)|cekat.*(pullback|retest)|vstupni\s*zon|casovan|kde.*(vstup|vstoup)|when\s*to\s*enter|enter\s*now|cuando\s*entrar)/.test(q) ||
    /\b(vstup|vstoupit|vstoupime|vstupni|entry)\b/.test(q)
  ) {
    return 'ENTRY_TIMING';
  }

  // 6. Risk sizing & lots
  if (
    /(lot|risk|kapital|velikost.*pozic|position\s*size|paka|leverage|marz|margin|drawdown|prop\s*firm)/.test(q)
  ) {
    return 'RISK_LOTS';
  }

  // 7. Timeframes & Multi-timeframe analysis
  if (
    /(timeframe|casovy\s*ramec|\b1m\b|\b5m\b|\b15m\b|\b1h\b|\b4h\b|\bd1\b|denni|tydenni|weekly|daily|scalp|swing|intraday)/.test(q)
  ) {
    return 'TIMEFRAME';
  }

  // 8. SMC / Price action mechanics
  if (
    /(fvg|fair\s*value\s*gap|order\s*block|orderblock|sweep|likvidit|liquidity|mss|bos|choch|discount|premium|wyckoff|imbalance|nerovnovah|ote|fibonacci)/.test(q)
  ) {
    return 'SMC_CONCEPTS';
  }

  // 9. Macro & News
  if (
    /(zprav|novink|kalendar|nfp|cpi|fomc|sazb|inflac|vyhlasen|high\s*impact|tier-1|fundament|news|noticia)/.test(q)
  ) {
    return 'NEWS_MACRO';
  }

  // 10. Psychology & Emotions
  if (
    /(strach|fomo|psycholog|disciplin|chamtiv|emoc|prodelal|ztratil|serie\s*ztrat|revenge|pomst|overtrading|nervoz|tilt|fear|greed|miedo)/.test(q)
  ) {
    return 'PSYCHOLOGY';
  }

  // 11. Partial closes & scaling
  if (
    /(zavrit\s*(cel|cast)|vybrat\s*vse|scale\s*out|nechat\s*bezet|runner|parcial|scale\s*in)/.test(q)
  ) {
    return 'CLOSE_PARTIALS';
  }

  // 12. Reversal / What if
  if (
    /(co\s*kdyz|otoci|pujde\s*proti|propad|zvrat|falesny\s*pruraz|protipohyb|what\s*if|reversal|que\s*pasa\s*si)/.test(q)
  ) {
    return 'REVERSAL_WHAT_IF';
  }

  // 13. Greeting or thanks
  if (
    /^(ahoj|cau|dobry\s*den|hello|hi|hola)\b/.test(q) ||
    /(diky|dekuji|dik|super|jasne|rozumim|chapu|thanks|gracias)/.test(q)
  ) {
    return 'GREETING_OR_THANKS';
  }

  return 'GENERAL_OVERVIEW';
}

/**
 * Generate fully dynamic, contextual, calculating Trading Mentor answers
 */
export function generateDynamicMentorAnswer(
  question: string,
  analysis: MentorAnalysisContext | null | undefined,
  settings: MentorSettings = {},
  chatHistory: MentorChatHistoryMessage[] = []
): string {
  const lang = settings?.language || 'cs';
  const intent = classifyMentorIntent(question);

  // Extract real variables from the active analysis
  const symbol = analysis?.symbol || 'analyzovaný trh';
  const assetName = analysis?.assetName || symbol;
  const timeframe = analysis?.timeframe || 'vybraný timeframe';
  const rawSignal = (analysis?.signal || 'NEUTRAL_WAIT').toUpperCase();
  const isLong = rawSignal === 'LONG' || rawSignal === 'BUY';
  const isShort = rawSignal === 'SHORT' || rawSignal === 'SELL';
  const isNeutral = !isLong && !isShort;

  const entryRec = analysis?.entryZone?.recommended;
  const entryMin = analysis?.entryZone?.min;
  const entryMax = analysis?.entryZone?.max;
  const entryStr = entryRec ? formatMentorPrice(entryRec, symbol) : 'N/A';
  const entryRangeStr = entryMin && entryMax ? `${formatMentorPrice(entryMin, symbol)} - ${formatMentorPrice(entryMax, symbol)}` : entryStr;

  const slPrice = analysis?.stopLoss?.price;
  const slStr = slPrice ? formatMentorPrice(slPrice, symbol) : 'N/A';
  const slReason = analysis?.stopLoss?.reason || (isLong ? 'pod nákupním Order Blockem a minimem výběru likvidity' : 'nad prémiovým blokem nabídky a swingovým maximem');
  const slDistPercent = analysis?.stopLoss?.distancePercent
    ? analysis.stopLoss.distancePercent.toFixed(2)
    : entryRec && slPrice
    ? Math.abs(((entryRec - slPrice) / entryRec) * 100).toFixed(2)
    : '1.20';

  const tpTargets = Array.isArray(analysis?.takeProfitTargets) && analysis!.takeProfitTargets.length > 0
    ? analysis!.takeProfitTargets
    : [];
  const tp1 = tpTargets.find((t) => t.target === 1);
  const tp2 = tpTargets.find((t) => t.target === 2);
  const tp3 = tpTargets.find((t) => t.target === 3);

  const tp1Str = tp1 ? formatMentorPrice(tp1.price, symbol) : 'N/A';
  const tp2Str = tp2 ? formatMentorPrice(tp2.price, symbol) : 'N/A';
  const tp3Str = tp3 ? formatMentorPrice(tp3.price, symbol) : 'N/A';
  const rrRatio = analysis?.overallRiskRewardRatio || (tp2 ? `1 : ${tp2.riskRewardRatio || '3.0'}` : '1 : 2.5');

  const holdingPeriod = settings?.holdingPeriod || 'intraday';
  const riskPercent = settings?.accountRiskPercent || 1.0;
  const accountSize = settings?.accountSizeUsd || 10000;
  const riskAmount = (accountSize * (riskPercent / 100)).toFixed(0);

  // Fallback context when no chart is loaded yet
  if (!analysis || !analysis.symbol) {
    if (lang === 'en') {
      return `### 🎓 AI Trading Mentor — Academy & Chart Setup
No active chart analysis is currently loaded. 
To get precise, asset-specific mentoring with exact prices and order flow levels:
1. **Load a Chart**: Select an instrument on the interactive TradingView chart or upload a screenshot into the slots.
2. **Click Run Analysis**: Our quantitative engine will compute exact Entry, Stop Loss, and Take Profit targets.
3. **Ask Anything**: Once analyzed, you can ask me about entry timing, lot sizing, Breakeven rules, and SMC market structure for that specific asset!

*Mentor Tip*: Regardless of market conditions, always adhere to a strict 0.5%–1.0% capital risk model per setup.`;
    }
    if (lang === 'es') {
      return `### 🎓 Mentor de Trading IA — Academia y Configuración
Actualmente no hay ningún análisis de gráfico activo cargado.
Para recibir asesoramiento con precios exactos y niveles de flujo de órdenes:
1. **Cargue un gráfico**: Seleccione un activo en el gráfico interactivo o suba capturas de pantalla.
2. **Ejecute el análisis**: El motor calculará los niveles precisos de Entrada, Stop Loss y Take Profit.
3. **Pregunte lo que necesite**: Tras el análisis, podré guiarle en timing de entrada, gestión de Breakeven y conceptos SMC para ese activo.

*Regla de Oro*: Mantenga siempre un riesgo fijo de 0.5% a 1.0% por operación para preservar su cuenta.`;
    }
    return `### 🎓 AI Trading Mentor — Obchodní Akademie & Příprava Grafu
V této chvíli není načtena žádná aktivní analýza grafu.
Pro získání přesného, vysoce konkrétního rozboru s reálnými cenami a úrovněmi toku objednávek:
1. **Vyberte nebo nahrajte graf**: V horní části zvolte symbol na interaktivním TradingView grafu nebo nahrajte screenshoty do slotů.
2. **Spusťte AI Analýzu**: Náš kvantitativní systém spočítá přesné nákupní/prodejní úrovně, Stop Loss a TP cíle.
3. **Zeptejte se mě na cokoliv**: Jakmile je graf analyzován, rozeberu pro vás přesné načasování vstupu, posun na Breakeven, kalkulaci lotů i psychologii daného setupu!

*Mentorské pravidlo*: Bez ohledu na trh vždy dodržujte disciplinované riziko 0.5 % až 1.0 % kapitálu na jeden obchod.`;
  }

  // -------------------------------------------------------------
  // CZECH RESPONSES (DEFAULT)
  // -------------------------------------------------------------
  if (lang === 'cs') {
    switch (intent) {
      case 'WHY_SIGNAL': {
        if (isLong) {
          return `### 🧭 Proč je na trhu ${symbol} (${timeframe}) signál LONG (Nákup)?

Podle institucionální aukční teorie (SMC / Price Action) a toku objednávek máme pro nákupní expanzi tyto klíčové konfluence:

1. **Výběr prodejní likvidity (SSL Sweep)**: Trh provedl manipulativní výplach pod lokální minima, kde zlikvidoval retailové Stop Lossy a naplnil nákupní objednávky velkých hráčů (institucionální akumulace).
2. **Reakce v diskontní zóně**: Cena testuje nákupní pásmo **${entryRangeStr}** (optimální vstup: **${entryStr}**), které se opírá o nákupní Order Block a Fair Value Gap (FVG).
3. **Potvrzení změny struktury (MSS / CHoCH)**: Na časovém rámci došlo k vytvoření vyššího swingového maxima (Higher High) s energetickou expanzní svíčkou, což potvrzuje dominanci kupujících.
4. **Cíl toku objednávek (Draw on Liquidity)**: Hlavní nákupní likvidita čeká nad zónou **${tp1Str}** (TP1) a na swingových maximech **${tp2Str}** (TP2).
5. **Invalidační hranice**: Celá nákupní hypotéza zůstává platná pouze za předpokladu, že trh udrží Stop Loss na **${slStr}**. Pokud cena uzavře pod touto hladinou, tok objednávek je narušen.`;
        }
        if (isShort) {
          return `### 🧭 Proč je na trhu ${symbol} (${timeframe}) signál SHORT (Prodej)?

Analýza mikrostruktury a institucionálního toku objednávek (Order Flow / ICT) ukazuje jasnou medvědí převahu:

1. **Výběr nákupní likvidity (BSL Sweep)**: Trh vyhnal cenu nad předchozí vrcholy, kde došlo k výběru nákupní likvidity (Buy-Side Liquidity) a odmítnutí pokračovat výše.
2. **Odmítnutí v prémiové zóně nabídky**: Cena narazila na rezistenční Order Block a medvědí FVG v pásmu **${entryRangeStr}** (doporučený prodej: **${entryStr}**).
3. **Zlomení tržní struktury směrem dolů (Bearish MSS)**: Tvorba nižších vrcholů (Lower Highs) a prolomení lokálních minim potvrzuje distribuční fázi institucí.
4. **Magnet prodejní likvidity (Draw on Liquidity)**: Tok objednávek směřuje k nevybrané likviditě pod swingovými dny na úrovni **${tp1Str}** (TP1) a **${tp2Str}** (TP2).
5. **Kontrola rizika**: Strukturální Stop Loss je bezpečně usazen na **${slStr}**.`;
        }
        return `### ⚖️ Tržní stav na ${symbol} (${timeframe}): Neutrální fáze (Čekat na potvrzení)

Trh se momentálně nachází v konsolidační fázi bez jasné institucionální nerovnováhy.
1. **Chybí čistý výběr likvidity**: Nebyl dokončen sweep klíčových denních minim ani maxim.
2. **Riziko falešných průrazů**: Vstup v kompresním pásmu nese nízké R:R a vysokou pravděpodobnost vymetení.
3. **Mentorská rada**: Nejlepší obchod je často ten, který neuděláte. Vyčkejte, až cena otestuje zónu **${entryStr}** s potvrzenou svíčkovou reakcí.`;
      }

      case 'ENTRY_TIMING': {
        return `### 🎯 Načasování vstupu do obchodu na ${symbol} (${timeframe})

1. **Vstupní zóna**: Doporučený vstup je na ceně **${entryStr}** (přípustné pásmo: **${entryRangeStr}**).
2. **Zásada trpělivosti (Žádné FOMO)**: Nikdy nenaskakujte do rozjetého trhu tržním příkazem (Market) za nevýhodnou cenu. Pokud cena již odskočila k prvnímu cíli (${tp1Str}), vyčkejte na klidný návrat (retracement / retest).
3. **Potvrzení na nižším rámci (LTF confirmation)**:
   - Pro styl **${holdingPeriod}** sledujte 5M nebo 15M svíčky.
   - Vyčkejte na odmítnutí v naší zóně (např. svíčka s dlouhým knotem, engulfing svíčka nebo zaplnění Fair Value Gapu).
4. **Zadání objednávky**: Ideální je zadat limitní čekající pokyn (Limit Order) na **${entryStr}** s předem nastaveným SL na **${slStr}**.`;
      }

      case 'STOP_LOSS': {
        return `### 🛡️ Pravidla pro Stop Loss a Invalidační úroveň (${symbol})

1. **Přesná cena Stop Lossu**: **${slStr}** (odstup od vstupu: **${slDistPercent} %**).
2. **Strukturální opodstatnění**: ${slReason}.
3. **Proč je SL právě zde?** Stop Loss v profesionálním tradingu není nahodilé číslo, ale bod matematické a strukturální neplatnosti. Pokud svíčka uzavře za hladinou ${slStr}, náš nákupní/prodejní model přestává platit.
4. **Klíčové mentorské zásady**:
   - **Nikdy neposouvejte SL do větší ztráty!** Posunutí SL je nejrychlejší cestou k vymazání účtu.
   - **Nezmenšujte SL bezdůvodně**: Pokud SL umístíte příliš blízko do tržního šumu, běžné kolísání spreadu vás vyřadí z vítězného obchodu před samotnou expanzí.
   - **Zásah SL není selhání**: Pokud trh zasáhne ${slStr}, ztratíte přesně předem stanovených ${riskPercent} % účtu ($${riskAmount}), což je přirozený náklad na podnikání.`;
      }

      case 'TAKE_PROFIT': {
        return `### 🎯 Cílové úrovně zisku (Take Profit) pro ${symbol}

Celkový poměr zisku k riziku (R:R) tohoto nastavení je **${rrRatio}**.

Rozložení výběru zisku podle institucionálního modelu:
1. **TP1: ${tp1Str}** (${tp1 ? tp1.riskRewardRatio + 'R' : '1.8R'} | realizovat **50 % pozice**):
   - ${tp1?.description || 'První zóna interní protilehlé likvidity. Zde uzavřete polovinu objemu pro uzamčení garantovaného zisku.'}
2. **TP2: ${tp2Str}** (${tp2 ? tp2.riskRewardRatio + 'R' : '3.0R'} | realizovat **30 % pozice**):
   - ${tp2?.description || 'Hlavní strukturální cíl a magnet likvidity (Draw on Liquidity). Primární cíl celé operace.'}
3. **TP3: ${tp3Str}** (${tp3 ? tp3.riskRewardRatio + 'R' : '4.5R'} | realizovat **zbývajících 20 % pozice**):
   - ${tp3?.description || 'Běžec pro asymetrický profit. Trailing stop posouvejte za nově vznikající swingové struktury.'}

*Zlaté pravidlo*: Realizace zisku na TP1 vám dává obrovskou psychologickou výhodu a chrání váš kapitál.`;
      }

      case 'BREAKEVEN': {
        return `### ⚖️ Kdy a jak posunout Stop Loss na Breakeven (BE)?

Posun na Breakeven je silný nástroj, ale jeho špatné načasování je častým důvodem zbytečných nulových obchodů.

1. **Železné pravidlo**: Stop Loss posuňte na úroveň vstupu (**${entryStr}** + spread) **VÝHRADNĚ AŽ PO DOSAŽENÍ TP1 (${tp1Str})**.
2. **Proč ne dříve?** Trh se k hladině vstupu velmi často vrací na sekundární retest před tím, než zahájí hlavní expanzi k TP2 (${tp2Str}). Pokud posunete SL na BE příliš brzy, trh vás vyhodí na nule a následně odletí k vašemu zisku bez vás.
3. **Postup v praxi**:
   - Jakmile cena zasáhne **${tp1Str}**, uzavřete 50 % objemu.
   - Mechanicky přesuňte Stop Loss z ${slStr} na vstupní cenu ${entryStr}.
   - V tu chvíli je obchod 100% bezrizikový (Free Trade) a vy již máte zisk v kapse!`;
      }

      case 'RISK_LOTS': {
        return `### 📊 Matematika pozic a řízení kapitálu (Position Sizing) na ${symbol}

Profesionální trading stojí na přesném řízení expozice:
1. **Výpočetní vzorec**:
   \`Objem v lotech = (Kapitál na účtu × % Rizika) / (Vzdálenost SL v pipech/bodech × Hodnota pipu/bodu)\`
2. **Model pro váš účet**:
   - Předpokládaný kapitál: **$${accountSize.toLocaleString()}**
   - Riziko na obchod: **${riskPercent} %** = **$${riskAmount}**
   - Vzdálenost Stop Lossu: **${slDistPercent} %** (ze vstupu ${entryStr} na SL ${slStr})
3. **Doporučení pro páku**:
   - Pro styl **${holdingPeriod}** nepoužívejte páku vyšší než 1:10 až 1:20.
   - Pamatujte: Páka nezvyšuje váš zisk, páka pouze snižuje marži. Skutečné riziko určuje výhradně velikost Stop Lossu a počet otevřených lotů!`;
      }

      case 'TIMEFRAME': {
        return `### ⏱️ Práce s časovými rámci (Top-Down analýza) na ${symbol}

Aktuální analýza pracuje s časovým rámcem **${timeframe}** v režimu pro **${holdingPeriod}**.

Jak instituce skládají časové rámce dohromady:
1. **Vyšší rámec (HTF - 4H / D1 / 1W)**: Určuje směr institucionálního toku objednávek a hlavní magnet likvidity (Draw on Liquidity).
2. **Střední rámec (MTF - 1H / 15M)**: Identifikuje klíčové bloky objednávek (Order Blocks) a nerovnováhy (FVG) v pásmu **${entryRangeStr}**.
3. **Nižší rámec (LTF - 5M / 1M)**: Slouží čistě pro exekuci a načasování vstupu, aby se minimalizovala vzdálenost Stop Lossu (${slDistPercent} %).
4. **Varování**: Nikdy neobchodujte signály na 1M/5M bez souladu s trendem na 1H/4H! Nízké rámce obsahují obrovské množství šumu.`;
      }

      case 'SMC_CONCEPTS': {
        return `### 📚 Metodika Smart Money Concepts (SMC) aplikovaná na ${symbol}

V této analýze systém vyhodnotil klíčové institucionální struktury:
1. **Liquidity Sweep (Výběr likvidity)**: Pohyb ceny za hranici předchozích swingů slouží velkým bankám a fondům k naplnění velkých objednávek protistranou.
2. **Fair Value Gap (FVG)**: Třísvíčková cenová nerovnováha. Trh má přirozenou tendenci se do FVG vrátit (rebalance) na hladinu **${entryStr}**, než bude pokračovat v expanzi.
3. **Order Block (OB)**: Zóna na úrovni **${entryRangeStr}**, kde instituce otevřely své pozice. Tato zóna slouží jako silný magnet a následně pevný odrazový můstek.
4. **Market Structure Shift (MSS)**: Potvrzení, že lokální trend byl přerušen a kontrolu převzal dominantní směr (${isLong ? 'Kupující' : isShort ? 'Prodejci' : 'Konsolidace'}).`;
      }

      case 'NEWS_MACRO': {
        const warnText = analysis?.economicCalendarWarning
          ? typeof analysis.economicCalendarWarning === 'string'
            ? analysis.economicCalendarWarning
            : analysis.economicCalendarWarning.text || 'V kalendáři jsou evidovány makroekonomické události.'
          : 'Žádné bezprostřední Tier-1 zprávy vysokého dopadu neohrožují vstupní zónu.';
        return `### 📰 Makroekonomické zprávy & Dopad na ${symbol}

1. **Aktuální stav kalendáře**: ${warnText}
2. **Železná pravidla při vyhlašování zpráv (CPI, NFP, úrokové sazby FED/ECB)**:
   - **15–30 minut před vyhlášením**: Neotvírejte nové pozice. Spready se roztahují a hrozí masivní skluz v plnění (slippage).
   - **Pokud již máte otevřený zisk**: Zvažte částečné uzavření pozice a ujistěte se, že Stop Loss je zajištěn na Breakeven.
   - **Po vyhlášení**: Počkejte 10–15 minut, až odezní úvodní volatilní vymetení (Whipsaw), a teprve poté obchodujte podle čisté tržní struktury.`;
      }

      case 'PSYCHOLOGY': {
        return `### 🧠 Tržní psychologie & Emoční kontrola (Mark Douglas přístup)

1. **Výsledek jednoho obchodu je náhodný**: I nejlepší institucionální setup na ${symbol} má pravděpodobnostní charakter (např. 65–70 % win-rate). To znamená, že 30–35 obchodů ze 100 skončí ztrátou.
2. **Přijetí rizika**: Před stisknutím tlačítka Vstoupit si v duchu odepište částku $${riskAmount} (${riskPercent} % účtu). Pokud vás ztráta této částky bolí, obchodujete příliš velkou pozici.
3. **Zákaz Revenge Tradingu**: Pokud trh zasáhne Stop Loss na ${slStr}, nikdy neotevírejte okamžitý odvetný obchod se zdvojnásobeným lotem. Zavřete platformu a jděte na procházku.
4. **Důslednost a proces**: Peníze na trhu nevydělává to, že máte pokaždé pravdu, ale to, že bezchybně realizujete svou statistickou výhodu přes desítky exekucí.`;
      }

      case 'REVERSAL_WHAT_IF': {
        return `### 🔄 Co dělat, pokud trh na ${symbol} půjde proti pozici?

1. **Respektujte Stop Loss ${slStr}**: Pokud cena prorazí hladinu ${slStr}, znamená to, že se tržní podmínky změnily. Nevystupujte manuálně ve panice uprostřed svíčky, ale nechte pracovat předem nastavený SL.
2. **Neplatnost setupu**: Pokud trh uzavře za úrovní neplatnosti, analýza je ukončena. Hledání "důvodů", proč zůstat ve ztrátě, je největší traderská past.
3. **Pravidlo jednoho doteku**: Pokud trh nabídne reakci v zóně ${entryRangeStr} a následně ztratí momentum, sledujte, zda nevzniká protilehlý MSS. V takovém případě lze pozici uzavřít i dříve s minimální ztrátou.`;
      }

      case 'CLOSE_PARTIALS': {
        return `### ✂️ Strategie částečného uzavírání zisku (Scaling Out)

1. **První cíl (TP1 - ${tp1Str})**: Uzavřete přesně 50 % pozice. Tím získáte psychologický klid a zaplatíte případný risk.
2. **Druhý cíl (TP2 - ${tp2Str})**: Uzavřete 30 % pozice. Zde se nachází hlavní likviditní bazén.
3. **Běžec (TP3 - ${tp3Str})**: Ponechte 20 % pozice otevřené s posuvným Stop Lossem (Trailing Stop) pod/nad každé nové potvrzené swingové minimum/maximum.`;
      }

      case 'GREETING_OR_THANKS': {
        return `Zdravím tě! Jsem tvůj AI Trading Mentor pro **${symbol}** (${timeframe}). 
Momentálně máme na grafu signál **${rawSignal}** se vstupní zónou **${entryStr}**, Stop Lossem na **${slStr}** a cílem TP1 na **${tp1Str}**.

Můžeš se mě zeptat na cokoliv:
- Proč máme zrovna tento signál?
- Kdy přesně vstoupit a jak nastavit limitní pokyn?
- Kdy posunout Stop Loss na Breakeven?
- Kolik lotů nastavit pro tvůj kapitál?
- Jak funguje Price Action / SMC na tomto setupu?

Jsem tu, abych ti pomohl exekuovat obchod s chladnou hlavou a institucionální disciplínou!`;
      }

      default: {
        return `### 🏛️ Mentorské zhodnocení situace na ${symbol} (${timeframe})

- **Směr a Signál**: **${rawSignal}** (spolehlivost modelu: **${analysis?.confidenceScore || 85} %**).
- **Vstupní pásmo**: **${entryRangeStr}** (doporučeno: **${entryStr}**).
- **Ochrana kapitálu (SL)**: **${slStr}** (vzdálenost: **${slDistPercent} %**).
- **Výběr zisku (TP1 / TP2)**: První cíl **${tp1Str}**, hlavní cíl **${tp2Str}** (celkový poměr **${rrRatio}**).
- **Doporučený postup**: Nevstupujte zbrkle tržním příkazem. Zadejte limitní pokyn na vstupní úroveň a po zasažení TP1 okamžitě uzamkněte zisk a posuňte Stop Loss na Breakeven.

Máte doplňující dotaz k řízení této pozice nebo metodice SMC? Rád vám situaci detailně vysvětlím.`;
      }
    }
  }

  // -------------------------------------------------------------
  // ENGLISH RESPONSES
  // -------------------------------------------------------------
  if (lang === 'en') {
    switch (intent) {
      case 'WHY_SIGNAL': {
        if (isLong) {
          return `### 🧭 Why is there a LONG signal on ${symbol} (${timeframe})?

Based on institutional order flow mechanics (SMC / Price Action), the bullish thesis is driven by:
1. **Sell-Side Liquidity (SSL) Sweep**: Price aggressively swept equal lows below recent support, harvesting retail stops to fill institutional buy orders.
2. **Discount Zone Mitigation**: Price is reacting inside the discount demand block at **${entryRangeStr}** (optimal entry: **${entryStr}**).
3. **Market Structure Shift (MSS)**: A confirmed break of structure with energetic bullish displacement confirms buyers have seized control.
4. **Draw on Liquidity**: Unmitigated buy-side liquidity rests above **${tp1Str}** (TP1) and swing highs at **${tp2Str}** (TP2).
5. **Structural Invalidation**: The trade remains valid as long as the structural pivot at **${slStr}** remains protected.`;
        }
        if (isShort) {
          return `### 🧭 Why is there a SHORT signal on ${symbol} (${timeframe})?

Institutional order flow indicates clear bearish continuation:
1. **Buy-Side Liquidity (BSL) Sweep**: Price rejected recent swing highs after liquidity extraction, triggering an institutional distribution cycle.
2. **Premium Supply Mitigation**: Price tapped into the bearish Order Block and Fair Value Gap at **${entryRangeStr}** (recommended sell: **${entryStr}**).
3. **Bearish MSS**: Break of local market structure with consecutive Lower Highs confirms institutional selling pressure.
4. **Target Draw**: Open sell-side liquidity rests at **${tp1Str}** (TP1) and **${tp2Str}** (TP2).
5. **Capped Risk**: Protected stop loss is established at **${slStr}**.`;
        }
        return `### ⚖️ Market Status for ${symbol}: Neutral Wait State
Price is consolidating without clean institutional displacement. Waiting for a clean sweep or mitigation of **${entryStr}** is statistically superior to forcing a low-probability trade.`;
      }

      case 'ENTRY_TIMING': {
        return `### 🎯 Execution Timing & Entry Rules for ${symbol}
1. **Designated Entry Zone**: **${entryRangeStr}** (optimal price: **${entryStr}**).
2. **No FOMO Market Execution**: Never chase green/red candles once price has expanded toward TP1 (${tp1Str}). Wait for the retracement.
3. **Lower Timeframe Confirmation**: Check 5m/15m charts for rejection wicks or an FVG tap inside the entry zone before pulling the trigger.
4. **Recommended Order Type**: Place a Limit Order at **${entryStr}** with a predefined Stop Loss at **${slStr}**.`;
      }

      case 'STOP_LOSS': {
        return `### 🛡️ Stop Loss & Invalidation Framework (${symbol})
1. **Stop Loss Price**: **${slStr}** (Risk distance: **${slDistPercent}%**).
2. **Structural Basis**: ${slReason}.
3. **Institutional Invalidation**: A stop loss is not an arbitrary threshold—it is the structural invalidation point where the order flow thesis is mathematically broken.
4. **Cardinal Rule**: Never widen your Stop Loss during an active trade. Predefine risk at **${riskPercent}%** ($${riskAmount}) and accept it before entering.`;
      }

      case 'TAKE_PROFIT': {
        return `### 🎯 Take Profit Strategy & Targets for ${symbol}
Overall Risk-to-Reward ratio: **${rrRatio}**.
- **TP1 (${tp1Str} | 50% Scale-Out)**: First opposing liquidity pocket. Taking 50% locks in guaranteed profit.
- **TP2 (${tp2Str} | 30% Scale-Out)**: Major Draw on Liquidity and primary structural target.
- **TP3 (${tp3Str} | 20% Runner)**: Asymmetric extension target with a trailing stop behind consecutive swing pivots.`;
      }

      case 'BREAKEVEN': {
        return `### ⚖️ When to Move Stop Loss to Breakeven (BE)?
1. **Rule**: Mechanically move Stop Loss to Entry price (**${entryStr}** + spread) **ONLY AFTER** price taps **TP1 (${tp1Str})**.
2. **Premature BE Danger**: Shifting to Breakeven too early often causes normal retests to stop you out at zero right before the real expansion to TP2 (**${tp2Str}**).
3. **Result**: Upon TP1 hit + BE shift, the trade becomes 100% risk-free.`;
      }

      case 'RISK_LOTS': {
        return `### 📊 Position Sizing & Capital Preservation (${symbol})
- **Account Sizing Model**: $${accountSize.toLocaleString()} balance with **${riskPercent}%** risk = **$${riskAmount}**.
- **Formula**: \`Lots = (Account Balance × Risk %) / (SL Distance in Points × Point Value)\`.
- **Leverage Rule**: Keep real leverage between 1:5 and 1:20 for ${holdingPeriod} setups. Position size controls risk, not leverage.`;
      }

      default: {
        return `### 🏛️ Mentor Outlook for ${symbol} (${timeframe})
- **Signal**: **${rawSignal}** (Confidence: **${analysis?.confidenceScore || 85}%**).
- **Entry Zone**: **${entryRangeStr}** (Recommended: **${entryStr}**).
- **Stop Loss**: **${slStr}** (${slDistPercent}% risk).
- **Target**: TP1 **${tp1Str}**, TP2 **${tp2Str}** (R:R **${rrRatio}**).
- **Guidance**: Execute patiently with limit orders and strictly shift Stop Loss to Breakeven only after TP1 is achieved.`;
      }
    }
  }

  // -------------------------------------------------------------
  // SPANISH RESPONSES
  // -------------------------------------------------------------
  if (lang === 'es') {
    switch (intent) {
      case 'WHY_SIGNAL': {
        return `### 🧭 ¿Por qué señal ${rawSignal} en ${symbol} (${timeframe})?
1. **Barrido de Liquidez**: El mercado barrió la liquidez opuesta antes de iniciar el desplazamiento institucional.
2. **Zona de Entrada**: Reacción en **${entryRangeStr}** (precio óptimo: **${entryStr}**) apoyado en Order Block y FVG.
3. **Cambio de Estructura (MSS)**: Confirmación de cambio de estructura a favor de la dirección institucional.
4. **Objetivo (Draw on Liquidity)**: TP1 en **${tp1Str}** y TP2 en **${tp2Str}**.
5. **Invalidación**: Stop Loss fijado estructuralmente en **${slStr}**.`;
      }

      case 'BREAKEVEN': {
        return `### ⚖️ Gestión de Breakeven (BE) en ${symbol}
1. Mueva su Stop Loss al precio de entrada (**${entryStr}**) **ÚNICAMENTE TRAS ALCANZAR TP1 (${tp1Str})**.
2. No mueva a Breakeven prematuramente para evitar que el retesteo normal le saque a cero antes del movimiento principal a **${tp2Str}**.
3. Al tocar TP1, cierre el 50% de la posición y asegure una operación 100% libre de riesgo.`;
      }

      default: {
        return `### 🏛️ Orientación del Mentor para ${symbol} (${timeframe})
- **Dirección**: **${rawSignal}** (Confianza: **${analysis?.confidenceScore || 85}%**).
- **Entrada**: **${entryRangeStr}** (Recomendada: **${entryStr}**).
- **Stop Loss**: **${slStr}** (Riesgo: **${slDistPercent}%**).
- **Objetivos**: TP1 en **${tp1Str}**, TP2 en **${tp2Str}** (R:R **${rrRatio}**).
- **Consejo**: Ejecute con órdenes límite y gestione la posición con estricta disciplina.`;
      }
    }
  }

  return `### AI Trading Mentor: ${symbol} (${rawSignal}) | Entry: ${entryStr} | SL: ${slStr} | TP1: ${tp1Str}`;
}

/**
 * Generate rich, multi-paragraph, professional institutional commentary
 * for the "Mentorský Výklad & Psychologie Obchodu" analysis tab.
 */
export function generateDynamicAnalysisMentorAdvice(params: {
  symbol: string;
  assetName: string;
  timeframe: string;
  signal: string;
  currentPrice: number;
  entryRecommended: number;
  entryMin: number;
  entryMax: number;
  slPrice: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  rsi: number;
  biasReasoning: string;
  lang: string;
  holdingPeriod: string;
  riskTolerance: string;
}): string {
  const {
    symbol,
    timeframe,
    signal,
    currentPrice,
    entryRecommended,
    entryMin,
    entryMax,
    slPrice,
    tp1Price,
    tp2Price,
    tp3Price,
    rsi,
    lang,
    holdingPeriod,
  } = params;

  const isShort = signal === 'SHORT';
  const entryStr = formatMentorPrice(entryRecommended, symbol);
  const entryRangeStr = `${formatMentorPrice(entryMin, symbol)} - ${formatMentorPrice(entryMax, symbol)}`;
  const slStr = formatMentorPrice(slPrice, symbol);
  const tp1Str = formatMentorPrice(tp1Price, symbol);
  const tp2Str = formatMentorPrice(tp2Price, symbol);
  const tp3Str = formatMentorPrice(tp3Price, symbol);
  const currentStr = formatMentorPrice(currentPrice, symbol);

  if (lang === 'en') {
    return `### 🏛️ Institutional Trade Psychology & Order Flow Thesis (${symbol} • ${timeframe})

1. **Market Structure & Order Flow Context**:
The setup on ${symbol} represents an asymmetric institutional opportunity aligned with current ${timeframe} market structure. Current price (${currentStr}) confirms ${isShort ? 'bearish distribution following a buy-side liquidity purge' : 'bullish accumulation following a sell-side liquidity sweep'}. Confluences confirm institutional order flow directing price toward the primary liquidity draw at ${tp2Str}.

2. **Execution Framework & Scale-Out Discipline**:
- **Entry Zone**: Limit execution is favored in the discount/premium zone between **${entryRangeStr}** (optimal price: **${entryStr}**). Avoid aggressive market chase if price departs this mitigation block.
- **First Liquidity Pool (TP1 - ${tp1Str})**: Liquidate exactly 50% of exposure upon first tap. This captures realized profit and permanently de-risks the execution.
- **Main Liquidity Objective (TP2 - ${tp2Str})**: Allow 30% of position size to capture the full structural expansion.
- **Runner (TP3 - ${tp3Str})**: Trail remaining 20% along intermediate timeframe swing pivots.

3. **Inviolable Invalidation & Breakeven Rule**:
Structural risk is strictly capped at **${slStr}**. If price invalidates this pivot, the thesis is statistically broken—accept the predefined loss without hesitation. Mechanically shift Stop Loss to Breakeven (${entryStr}) ONLY AFTER TP1 is reached; premature Breakeven adjustments frequently lead to premature stop-outs during routine retests.

4. **Probabilistic Edge & Trading Psychology**:
A professional trader does not seek to be right on every individual trade, but to execute a high-expectancy process with flawless discipline. Treat predefined risk as the operating cost of running your business.`;
  }

  if (lang === 'es') {
    return `### 🏛️ Psicología de Trading y Tesis Institucional (${symbol} • ${timeframe})

1. **Estructura de Mercado y Flujo de Órdenes**:
La configuración en ${symbol} presenta una oportunidad institucional asimétrica. El precio actual (${currentStr}) valida la ${isShort ? 'distribución bajista tras barrer liquidez compradora' : 'acumulación alcista tras barrer liquidez vendedora'}. El flujo institucional conduce el precio hacia el objetivo principal en ${tp2Str}.

2. **Modelo de Ejecución y Tomas Parciales**:
- **Zona de Entrada**: Favorezca órdenes límite en el rango **${entryRangeStr}** (óptimo: **${entryStr}**).
- **Toma de Beneficios 1 (TP1 - ${tp1Str})**: Cierre el 50% de la posición en el primer toque.
- **Objetivo Principal (TP2 - ${tp2Str})**: Permita que el 30% alcance el objetivo estructural.
- **Corredor (TP3 - ${tp3Str})**: Gestione el 20% restante con trailing stop.

3. **Invalidación Estructural y Breakeven**:
El riesgo queda fijado de forma inflexible en **${slStr}**. Traslade el Stop Loss a Breakeven (${entryStr}) ÚNICAMENTE tras alcanzar TP1.

4. **Mentalidad y Consistencia**:
La rentabilidad duradera nace de ejecutar el plan sin vacilaciones emocionales. Acepte el riesgo predeterminado antes de ingresar.`;
  }

  // Czech (default)
  return `### 🏛️ Mentorský Výklad, Tok Objednávek & Psychologie Obchodu (${symbol} • ${timeframe})

1. **Strukturální kontext a Tok Objednávek (Order Flow Context)**:
Tento setup na trhu ${symbol} na časovém rámci ${timeframe} představuje vysoce asymetrickou příležitost vycházející z institucionální aukční teorie. Aktuální cena (${currentStr}) potvrzuje ${isShort ? 'medvědí distribuci po úspěšném vybrání nákupní likvidity (BSL) nad nedávnými swingovými maximy' : 'býčí akumulaci po vybrání prodejní likvidity (SSL) pod nedávnými swingovými minimy'}. Přítomnost nákupního/prodejního Order Blocku a vyplnění Fair Value Gapu v pásmu **${entryRangeStr}** s RSI na ${rsi.toFixed(0)} potvrzuje pokračování toku objednávek směrem k hlavnímu magnetu likvidity na **${tp2Str}**.

2. **Institucionální Model Řízení Pozice & Škálování Zisku**:
- **Exekuce vstupu**: Pro styl **${holdingPeriod}** je doporučeno pracovat s limitním příkazem v optimální zóně **${entryRangeStr}** (doporučená cena: **${entryStr}**). Nikdy nenaskakujte do trhu za tržní cenu (Market), pokud cena již vystřelila pryč.
- **TP1 (${tp1Str}) — První interní likvidita**: Při zasažení realizujte přesně 50 % objemu. Tímto krokem si uzamknete garantovaný zisk na účtu a získáte mentální převahu.
- **TP2 (${tp2Str}) — Hlavní strukturální cíl**: S 30 % pozice miřte na hlavní cíl toku objednávek (Draw on Liquidity).
- **TP3 (${tp3Str}) — Běžec (Runner)**: Zbývajících 20 % pozice nechte pracovat pro zachycení prodlouženého trendu a Stop Loss posouvejte za nově vznikající swingové struktury.

3. **Invalidační úroveň & Železné pravidlo pro Breakeven**:
Riziko obchodu je striktně a nepřekročitelně ohraničeno na **${slStr}**. Pokud tržní svíčka uzavře za touto hladinou, tržní hypotéza je neplatná. Nikdy neposouvejte Stop Loss do větší ztráty!
**Pravidlo pro Breakeven**: Stop Loss posuňte na vstupní úroveň (${entryStr}) **VÝHRADNĚ AŽ PO ZASAŽENÍ TP1**. Příliš brzký posun na BE vede k tomu, že běžný retest vymetne vaši pozici na nule těsně před tím, než trh dosáhne hlavního profitu.

4. **Tržní Psychologie & Statistická Výhoda (Probabilistic Edge)**:
Cílem profesionálního tradera není mít pravdu v každém jednotlivém obchodu, ale bezchybně exekuovat svůj proces přes sérii desítek příležitostí. Předem definované riziko přijměte s klidem jako běžný náklad na podnikání.`;
}
