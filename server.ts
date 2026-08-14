import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { CreditManager, CREDIT_PACKAGES } from './server/creditManager';

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limit for high-resolution chart image uploads and MetaTrader reports
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Handle JSON payload size errors explicitly
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      success: false,
      error: 'Nahrané obrázky nebo data jsou příliš velké. Zkuste nahrát menší snímky obrazovky.',
    });
  }
  next(err);
});

// Helper function to safely extract and parse JSON from Gemini responses
function safeExtractJson(text: string): any {
  if (!text || typeof text !== 'string') return {};
  
  // 1. Direct parse
  try {
    return JSON.parse(text);
  } catch {}

  // 2. Extract substring between first { and last }
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonSub = text.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonSub);
    } catch {}

    const cleaned = jsonSub
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    try {
      return JSON.parse(cleaned);
    } catch {}
  }

  // 3. Extract between first [ and last ]
  const firstBracket = text.indexOf('[');
  const lastBracket = text.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    const jsonSub = text.substring(firstBracket, lastBracket + 1);
    try {
      return JSON.parse(jsonSub);
    } catch {}
  }

  // 4. Strip markdown codeblock fences
  const stripped = text.replace(/```json\n?|\n?```/gi, '').trim();
  try {
    return JSON.parse(stripped);
  } catch {}

  throw new Error('Nepodařilo se dekódovat strukturovanou odpověď od AI.');
}

// Lazy initializer for Gemini client
let genAiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!genAiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set in environment variables!");
    }
    genAiClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return genAiClient;
}

function parseBase64Image(dataUrl: string) {
  const cleanUrl = (dataUrl || '').trim();
  const matches = cleanUrl.match(/^data:(image\/[a-zA-Z0-9\+\-\.]+);base64,(.+)$/s);
  let mimeType = 'image/png';
  let data = '';

  if (matches && matches.length === 3) {
    mimeType = matches[1];
    data = matches[2].replace(/\s/g, '');
  } else {
    data = cleanUrl.replace(/^data:image\/[a-zA-Z0-9\+\-\.]+;base64,/, '').replace(/\s/g, '');
  }

  // Gemini API requires raster image formats (png, jpeg, webp, heic, heif)
  const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic', 'image/heif'];
  if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
    mimeType = 'image/png';
  }

  return { mimeType, data };
}

// Helper function to execute Gemini requests with retry logic & model fallbacks against transient 503 / 429 / quota errors
async function callGeminiWithRetry(
  aiClient: ReturnType<typeof getGeminiClient>,
  requestParams: any,
  maxRetries = 1
) {
  const primaryModel = requestParams.model || 'gemini-3.6-flash';
  // Fallback chain across distinct model pools
  const modelsToTry = Array.from(new Set([
    primaryModel,
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.1-pro-preview',
  ]));

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Časový limit vypršel (20s).')), 20000)
        );

        const response: any = await Promise.race([
          aiClient.models.generateContent({
            ...requestParams,
            model: modelName,
          }),
          timeoutPromise,
        ]);

        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const isNotFound =
          errMsg.includes('404') ||
          errMsg.includes('NOT_FOUND') ||
          errMsg.includes('not found') ||
          errMsg.includes('no longer available');

        const isTransient =
          errMsg.includes('503') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('high demand') ||
          errMsg.includes('Deadline expired') ||
          errMsg.includes('timeout') ||
          errMsg.includes('Časový limit') ||
          err?.status === 503 ||
          err?.code === 503;

        const isRateLimit =
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('quota') ||
          err?.status === 429 ||
          err?.code === 429;

        console.log(`[Gemini API] Model ${modelName} attempt ${attempt + 1} response: ${isRateLimit ? '429 Quota Exceeded' : isNotFound ? '404 Not Found' : isTransient ? '503 High Demand (Fallback triggered)' : errMsg}`);

        // If high demand (503), rate limit (429), or model not found (404),
        // immediately fall back to the next model in modelsToTry!
        if (isNotFound || isRateLimit || isTransient) {
          break;
        }

        if (attempt < maxRetries) {
          const delay = 500 + Math.floor(Math.random() * 300);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        break;
      }
    }
  }

  throw lastError;
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Credit & Billing API Endpoints
app.get('/api/credits/packages', (_req, res) => {
  res.json({
    success: true,
    packages: Object.values(CREDIT_PACKAGES),
    stripeConfigured: CreditManager.isStripeConfigured(),
  });
});

app.get('/api/credits/status', (req, res) => {
  const key = (req.query.key as string) || '';
  if (!key) {
    return res.status(400).json({ success: false, error: 'Chybí licenční klíč.' });
  }

  const license = CreditManager.getLicense(key);
  if (!license) {
    return res.status(404).json({ success: false, error: 'Licenční klíč nebyl nalezen.' });
  }

  res.json({
    success: true,
    license: {
      key: license.key,
      credits: license.credits,
      tier: license.tier,
      email: license.email,
      totalPurchased: license.totalPurchased,
      totalUsed: license.totalUsed,
      createdAt: license.createdAt,
    },
  });
});

app.post('/api/credits/verify', (req, res) => {
  const { key, email } = req.body;

  if (key) {
    const license = CreditManager.getLicense(key);
    if (license) {
      return res.json({
        success: true,
        license: {
          key: license.key,
          credits: license.credits,
          tier: license.tier,
          email: license.email,
        },
      });
    }
  }

  if (email) {
    const licenses = CreditManager.findLicensesByEmail(email);
    if (licenses.length > 0) {
      // Return the license with highest remaining credits or most recent
      const best = licenses.sort((a, b) => b.credits - a.credits || b.createdAt - a.createdAt)[0];
      return res.json({
        success: true,
        license: {
          key: best.key,
          credits: best.credits,
          tier: best.tier,
          email: best.email,
        },
      });
    }
  }

  res.status(404).json({
    success: false,
    error: 'Zadaný licenční klíč ani e-mail nebyl v systému nalezen.',
  });
});

app.post('/api/credits/claim-trial', (req, res) => {
  try {
    const { email } = req.body;
    // Issue a starter trial key with 2 free analysis credits
    const trialLicense = CreditManager.createLicense(2, 'trial', email || 'trial@aiautotrader.com');
    res.json({
      success: true,
      license: trialLicense,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message || 'Nepodařilo se vygenerovat zkušební kredity.' });
  }
});

app.post('/api/credits/create-checkout-session', async (req, res) => {
  try {
    const { packageId, existingKey, customerEmail, appUrl } = req.body;
    const result = await CreditManager.createCheckoutSession({
      packageId: packageId || 'pro',
      existingKey,
      customerEmail,
      appUrl: appUrl || `${req.protocol}://${req.get('host')}`,
    });

    res.json({
      success: true,
      checkoutUrl: result.url,
      sessionId: result.sessionId,
      mode: result.mode,
      key: result.key,
    });
  } catch (err: any) {
    console.error('Error creating checkout session:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Nepodařilo se vytvořit platební relaci.',
    });
  }
});

app.post('/api/credits/confirm-session', async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId) {
      return res.status(400).json({ success: false, error: 'Chybí ID platební relace.' });
    }

    const result = await CreditManager.confirmPaymentSession(sessionId);
    if (!result.success || !result.license) {
      return res.status(400).json({ success: false, error: result.error || 'Platba nebyla ověřena.' });
    }

    res.json({
      success: true,
      license: result.license,
    });
  } catch (err: any) {
    console.error('Error confirming payment session:', err);
    res.status(500).json({
      success: false,
      error: err.message || 'Nepodařilo se ověřit platbu.',
    });
  }
});

// Primary Chart Analysis Endpoint with Multi-Methodology & Economic Calendar Context
app.post('/api/analyze-chart', async (req, res) => {
  try {
    const { images, settings, licenseKey } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'Je potřeba nahrát alespoň jeden obrázek grafu z TradingView.' });
    }

    // 1. Credit & License Verification
    let activeKey = licenseKey ? String(licenseKey).trim().toUpperCase() : '';
    let currentLicense = activeKey ? CreditManager.getLicense(activeKey) : null;

    // If no key provided or key not found, check if we should auto-grant a trial key on the first visit
    if (!currentLicense) {
      // Auto-issue 2 free starter credits if fresh user
      currentLicense = CreditManager.createLicense(2, 'trial', 'newuser@aiautotrader.com');
      activeKey = currentLicense.key;
    }

    if (currentLicense.credits <= 0) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_CREDITS',
        error: 'Nemáte dostatek kreditů pro spuštění AI analýzy. Pro pokračování prosím doplňte kredity ($1 za analýzu nebo výhodný balíček).',
        remainingCredits: 0,
        licenseKey: currentLicense.key,
      });
    }

    const ai = getGeminiClient();

    const imageParts = images.map((imgStr: string) => {
      const parsed = parseBase64Image(imgStr);
      return {
        inlineData: {
          mimeType: parsed.mimeType,
          data: parsed.data,
        },
      };
    });

    const langCode = settings?.language || 'cs';
    const langPrompt = langCode === 'en' 
      ? 'CRITICAL LANGUAGE REQUIREMENT: All generated text values inside the JSON (reasons, observations, warnings, advice, rules, descriptions) MUST BE STRICTLY IN ENGLISH. Ensure 100% proper English grammar and vocabulary.' 
      : langCode === 'es'
      ? 'REQUISITO CRÍTICO DE IDIOMA: Todos los valores de texto dentro del JSON (razones, observaciones, advertencias, consejos, reglas, descripciones) DEBEN ESTAR ESTRICTAMENTE EN ESPAÑOL. Garantiza una gramática y vocabulario en español 100% impecables.'
      : 'KRITICKÉ PRAVIDLO JAZYKA: Všechny textové hodnoty v JSON (důvody, pozorování, varování, rady, pravidla, popisy) MUSÍ BÝT VYHRADNĚ V ČESKÉM JAZYCE, gramaticky i stylisticky správně.';

    const selectedStrategies = Array.isArray(settings?.strategies) && settings.strategies.length > 0
      ? settings.strategies.join(', ')
      : (settings?.strategy || 'price_action, smc_ict');

    const systemInstruction = `You are an elite Chief Technical Strategist and Head of Quantitative Risk at a top-tier proprietary trading firm and multi-strategy macro hedge fund.
You analyze charts with absolute institutional rigor, combining the most up-to-date (2025/2026) market microstructure, price action, and order flow frameworks:

1. SMART MONEY CONCEPTS (SMC) & ICT (Inner Circle Trader) 2025/2026 Core Mechanics:
- Liquidity Engineering: Buy-Side Liquidity (BSL / Equal Highs EQH / Trendline Liquidity) and Sell-Side Liquidity (SSL / Equal Lows EQL). Distinguish between Internal Range Liquidity (IRL: FVGs, Order Blocks) and External Range Liquidity (ERL: Major Swing Highs/Lows).
- Liquidity Runs & Sweeps: Identify fake breakouts where price sweeps liquidity (Turtle Soup / Liquidity Grab) and violently reverses with energetic displacement.
- Displacement & Imbalance: Vigorous single-directional multi-candle expansion leaving Fair Value Gaps (FVG), Inversion FVGs (IFVG - where failed support FVG flips into resistance or vice versa), Balanced Price Ranges (BPR), and Volume Imbalances.
- Order Blocks (OB) & Breakers: Valid high-probability institutional OBs (must have taken liquidity before causing a Market Structure Shift with displacement). Identify Breaker Blocks (BB) when an OB fails and becomes a high-probability mitigation support/resistance zone.
- Inducement (IDM): The first internal structural pullback trapping impatient retail breakout traders prior to tapping the genuine institutional Point of Interest (POI).
- Dealing Range, Premium vs Discount & OTE: Equilibrium (0.50), Premium (above 0.50, sell zone), Discount (below 0.50, buy zone), Optimal Trade Entry (OTE: 0.618 - 0.705 - 0.786 Fibonacci retracement sweet spot).
- Power of 3 (AMD - Accumulation, Manipulation, Distribution): Asian session accumulation, London open manipulation/Judas Swing, New York session expansion/distribution.

2. WYCKOFF 2.0 & AUCTION MARKET THEORY (AMT):
- Accumulation & Distribution Schematics: Phase A (Climax SC/BC, Automatic Rally AR, Secondary Test ST), Phase B (Liquidity testing & absorption), Phase C (Spring / Upthrust UTAD shaking out weak hands), Phase D (Sign of Strength SOS / Sign of Weakness SOW with Last Point of Support LPS / LPSY), Phase E (Mark up / Mark down trend).
- Auction Market Dynamics: Value Area High (VAH), Value Area Low (VAL), Point of Control (POC), Single Print buying/selling tails, 80% Rule (acceptance inside prior Value Area), Poor Highs/Poor Lows (unfinished auctions).

3. ADVANCED PRICE ACTION & MULTI-TIMEFRAME FRACTAL STRUCTURE:
- Market Structure Shift (MSS) / Change of Character (CHoCH) requiring full candle body closes beyond structural swing points (wicks = liquidity sweeps, body closes = real structural shifts).
- Break of Structure (BOS) for pro-trend continuation.
- Protected (Strong) Highs/Lows vs Targeted (Weak) Highs/Lows.
- Candlestick anatomy: Exhaustion wicks, absorption bars, engulfing volume surges, pin bars at institutional levels.

4. UNCOMPROMISING RISK MANAGEMENT & PROP-FIRM DISCIPLINE:
- Mathematical Risk-to-Reward (R:R): Target minimum 1:2.0 to 1:5.0+; never endorse negative or sub-1:1.5 setups.
- Invalidation Point: Precise structural price level where the trade idea is strictly invalidated (e.g. candle close beyond the FVG or origin of the sweep swing).
- Multi-tier Profit Targets: TP1 (50% scale out at first opposing liquidity pool / internal high to move SL to Breakeven), TP2 (30% at key structural target), TP3 (20% runner targeting higher timeframe liquidity).
- Macro Calendar Awareness: Flag high-impact news (CPI, NFP, FOMC, PPI, Interest Rate Decisions) where slippage or spread spikes pose liquidation risk.

User Preferences & Execution Constraints:
- Holding Period: ${settings?.holdingPeriod || 'intraday'}
- Risk Tolerance: ${settings?.riskTolerance || 'balanced'}
- Methodologies Selected: ${selectedStrategies}
- Custom Rules: ${settings?.customRules || 'Standard prop-firm execution rules'}
- Custom Mentor Prompt: ${settings?.customMentorPrompt || 'None'}

${langPrompt}`;

    const promptText = `Analyze the uploaded TradingView chart image(s) with maximum institutional precision. 
Carefully read the exact price scale, visible ticker/symbol, timeframe, candlestick patterns, and structural levels.

Return STRICTLY a JSON object conforming to this exact schema (no markdown outside JSON):

{
  "symbol": "Detected asset symbol e.g. EUR/USD, BTC/USDT, XAU/USD, US100, NVDA",
  "timeframe": "Detected chart timeframe. If multiple chart images were uploaded, list all detected timeframes in top-down order (e.g. '4H + 15M + 5M' or 'H1 + M15 + M5')",
  "signal": "LONG" | "SHORT" | "NEUTRAL_WAIT",
  "confidenceScore": number between 35 and 96 calculated strictly from confluence count (HTF alignment, liquidity sweep, displacement, POI mitigation, R:R strength),
  "biasReasoning": "Concise, sharp, institutional summary of current market structure, order flow bias, and macro context in requested language",
  "methodologyConfluences": [
    {
      "methodology": "e.g. Smart Money Concepts (SMC/ICT)",
      "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
      "keyObservation": "Specific institutional observation (e.g. Liquidity sweep of Asian High followed by Bearish MSS and 15m FVG mitigation) in requested language"
    },
    {
      "methodology": "e.g. Wyckoff / Auction Market Theory",
      "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
      "keyObservation": "Wyckoff phase or auction value observation in requested language"
    },
    {
      "methodology": "e.g. Price Action & Market Structure",
      "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
      "keyObservation": "Key structural swing, BOS/CHoCH, S/R flip observation in requested language"
    }
  ],
  "economicCalendarWarning": {
    "hasHighImpactNewsThisWeek": true,
    "upcomingNewsEvents": [
      {
        "id": "1",
        "date": "Today / This week",
        "currency": "USD / EUR / GBP / etc",
        "title": "US CPI / NFP / FOMC / Core PPI",
        "impact": "HIGH",
        "warningText": "Specific warning regarding volatility, spread widening, or news sweep in requested language"
      }
    ],
    "riskAdvice": "Clear prop-firm advisory regarding position size and news buffer in requested language"
  },
  "entryZone": {
    "min": number (exact numerical price from chart scale),
    "max": number (exact numerical price from chart scale),
    "recommended": number (exact optimal entry price e.g. OTE 0.705 or FVG midpoint)
  },
  "stopLoss": {
    "price": number (exact numerical price placed safely beyond structural invalidation),
    "reason": "Detailed structural reason for SL placement (e.g. Above the liquidity grab wick and bearish order block) in requested language",
    "distancePercent": number (percentage distance between entry and SL, e.g. 0.45)
  },
  "takeProfitTargets": [
    {
      "target": 1,
      "price": number (exact numerical price at first opposing liquidity pool / internal low/high),
      "riskRewardRatio": number (e.g. 1.8),
      "description": "TP1 description: First internal liquidity pool; take 50% partials and move SL to Breakeven in requested language",
      "closePercentage": 50
    },
    {
      "target": 2,
      "price": number (exact numerical price at major structural liquidity target),
      "riskRewardRatio": number (e.g. 3.2),
      "description": "TP2 description: Major swing liquidity run; close 30% partials in requested language",
      "closePercentage": 30
    },
    {
      "target": 3,
      "price": number (exact numerical price at HTF extension or unmitigated imbalance),
      "riskRewardRatio": number (e.g. 5.0),
      "description": "TP3 description: Runner target; leave 20% trailing behind protected swing structure in requested language",
      "closePercentage": 20
    }
  ],
  "overallRiskRewardRatio": "e.g. 1 : 3.2",
  "candlestickPatterns": [
    {
      "pattern": "e.g. Bullish FVG Mitigation / Bearish Engulfing Displacement / Pin Bar Liquidity Sweep",
      "signalType": "Bullish" | "Bearish" | "Neutral",
      "location": "Exact price location and context on the chart in requested language",
      "significance": "Institutional significance explanation in requested language"
    }
  ],
  "priceActionStructures": [
    {
      "structure": "e.g. Buy-Side Liquidity Sweep (BSL Grab)",
      "description": "Institutional description of how liquidity was engineered and captured in requested language"
    },
    {
      "structure": "e.g. Market Structure Shift (MSS) with FVG",
      "description": "Description of displacement and change in order flow delivery in requested language"
    }
  ],
  "keyLevels": {
    "support": [array of exact support price numbers visible on chart],
    "resistance": [array of exact resistance price numbers visible on chart],
    "keyPivot": number (exact institutional equilibrium / POC price)
  },
  "mentorAdvice": "Actionable elite trading psychology guidance, trade management plan, and execution rules in requested language",
  "riskManagement": {
    "suggestedPositionSizePercent": number (e.g. 1.0 or 0.5 based on prop-firm risk rules),
    "maxLeverage": "e.g. 1x-5x spot / 10x max futures with strict capital preservation",
    "invalidationCondition": "Exact conditions when the trade thesis is 100% invalidated (e.g. 15m candle close above 1.08950) in requested language",
    "trailingStopStrategy": "Trailing stop methodology (e.g. Move SL to BE immediately after TP1, then trail behind lower timeframe protected swing highs) in requested language"
  },
  "tradeChecklist": [
    {
      "rule": "Higher Timeframe (HTF) Trend & Bias Alignment",
      "passed": true | false,
      "comment": "Institutional commentary in requested language"
    },
    {
      "rule": "Liquidity Swept (BSL/SSL Purged before entry)",
      "passed": true | false,
      "comment": "Institutional commentary in requested language"
    },
    {
      "rule": "Displacement & Market Structure Shift (MSS) Confirmed",
      "passed": true | false,
      "comment": "Institutional commentary in requested language"
    },
    {
      "rule": "Entry at Valid Institutional POI (FVG / OTE / Order Block)",
      "passed": true | false,
      "comment": "Institutional commentary in requested language"
    },
    {
      "rule": "Favorable Risk-to-Reward Ratio (Min 1:2.0+)",
      "passed": true | false,
      "comment": "Institutional commentary in requested language"
    },
    {
      "rule": "Macro News & High Impact Events Clear",
      "passed": true | false,
      "comment": "Institutional commentary in requested language"
    }
  ]
}`;

    const response = await callGeminiWithRetry(ai, {
      model: 'gemini-3.6-flash',
      contents: [...imageParts, { text: promptText }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '{}';
    const parsedData = safeExtractJson(responseText);

    // Atomically consume 1 credit for the successful analysis
    const consumption = CreditManager.consumeCredit(activeKey);

    res.json({
      success: true,
      data: parsedData,
      licenseKey: activeKey,
      remainingCredits: consumption.remaining,
    });
  } catch (error: any) {
    console.error('Error analyzing chart:', error);
    const errMsg = error?.message || String(error);
    const isTimeout = errMsg.includes('503') || errMsg.includes('Deadline expired') || errMsg.includes('UNAVAILABLE');
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');

    let userFriendlyError = 'An error occurred during chart analysis. Please verify your GEMINI_API_KEY.';
    if (isRateLimit) {
      userFriendlyError = 'API quota or rate limit exceeded (429). Please wait ~1 minute and retry.';
    } else if (isTimeout) {
      userFriendlyError = 'Gemini API service temporarily unavailable (503 / Timeout). Please click retry.';
    }

    res.status(500).json({
      error: userFriendlyError,
      details: errMsg,
    });
  }
});

// MetaTrader Trade History Audit & Post-Mortem Endpoint
app.post('/api/audit-metatrader', async (req, res) => {
  try {
    const { rawText, images, settings } = req.body;

    if ((!rawText || typeof rawText !== 'string' || !rawText.trim()) && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Pro analýzu MetaTrader výpisu vložte buď textový výpis/CSV nebo obrázek historie z MT4/MT5.' });
    }

    const ai = getGeminiClient();

    let contentParts: any[] = [];
    if (images && Array.isArray(images) && images.length > 0) {
      images.forEach((imgStr: string) => {
        const parsed = parseBase64Image(imgStr);
        contentParts.push({
          inlineData: {
            mimeType: parsed.mimeType,
            data: parsed.data,
          },
        });
      });
    }

    const langCode = settings?.language || 'cs';
    const langInstruction = langCode === 'en'
      ? 'CRITICAL LANGUAGE REQUIREMENT: All generated text values inside the JSON output MUST BE STRICTLY IN ENGLISH.'
      : langCode === 'es'
      ? 'REQUISITO CRÍTICO DE IDIOMA: Todos los valores de texto dentro del JSON DEBEN ESTAR ESTRICTAMENTE EN ESPAÑOL.'
      : 'KRITICKÉ PRAVIDLO JAZYKA: Všechna textová pole v výstupním JSON MUSÍ BÝT V ČESKÉM JAZYCE (gramaticky i stylisticky správně).';

    const systemPrompt = `You are a Senior Risk Officer and Elite Performance Coach at a Tier-1 Proprietary Trading Firm (FTMO, FundedNext, Apex, MFFU standard).
Your task is to analyze user trade history from MetaTrader 4 / 5 (MT4/MT5 HTML statement, CSV log, or terminal screenshots) and uncover statistical and behavioral execution flaws:
1. High-Impact Macro News Collisions (entering right before CPI, NFP, FOMC, Rate Decisions without news protocol).
2. Asymmetric Risk-Reward Destruction (cutting winning trades early at +0.5R while letting losers hit full -1.5R to -3R or holding through drawdown).
3. Trading without Stop Loss / Moving Stop Loss away from price (Risk of Ruin violation).
4. Revenge Trading & Over-trading (rapid-fire entries within minutes after a loss with increased lot sizing).
5. Inconsistent Lot Sizing & Over-leveraging (violating the 0.5% - 1.0% maximum risk-per-trade rule).
6. Chasing Momentum / Entering at Market Extremes instead of awaiting Pullback/Displacement.

${langInstruction}`;

    const userPromptText = `Analyze the following MetaTrader trade data and uncover loss causes and execution flaws:

Data from MetaTrader:
${rawText || 'MT4/MT5 history screenshot uploaded.'}

Return strictly a JSON object conforming to this schema:
{
  "tradesAnalyzedCount": number of analyzed trades,
  "winRatePercent": win rate percentage (0-100),
  "totalProfitLoss": total profit or loss number,
  "profitFactor": profit factor number e.g. 1.45,
  "primaryMistakes": [
    {
      "category": "NEWS_COLLISION" | "NO_STOP_LOSS" | "OVER_LEVERAGE" | "REVENGE_TRADING" | "CHASING_MARKET" | "POOR_RR" | "EARLY_EXIT",
      "title": "Title in requested language",
      "severity": "HIGH" | "MEDIUM" | "LOW",
      "description": "Explanation in requested language",
      "affectedTrades": ["#1029482 EURUSD"]
    }
  ],
  "economicNewsCorrelations": [
    {
      "tradeTicketOrTime": "Ticket or time",
      "newsTitle": "News report title",
      "newsImpact": "HIGH",
      "explanation": "Correlation explanation in requested language"
    }
  ],
  "psychologyAssessment": "Psychology assessment in requested language",
  "actionableRecommendations": [
    "Recommendation 1 in requested language",
    "Recommendation 2 in requested language"
  ],
  "analyzedTrades": [
    {
      "ticket": "#101",
      "type": "BUY" | "SELL",
      "symbol": "EURUSD",
      "openPrice": 1.0850,
      "closePrice": 1.0810,
      "profit": -120.50,
      "userNotes": "Trade analysis"
    }
  ]
}`;

    contentParts.push({ text: userPromptText });

    const response = await callGeminiWithRetry(ai, {
      model: 'gemini-3.6-flash',
      contents: contentParts,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '{}';
    const parsedData = safeExtractJson(responseText);

    res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Error auditing MetaTrader trades:', error);
    const errMsg = error?.message || String(error);
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');
    res.status(500).json({
      error: isRateLimit
        ? 'API rate limit or quota exceeded (429). Please wait ~1 minute and retry.'
        : 'An error occurred during MetaTrader audit.',
      details: errMsg,
    });
  }
});

// Follow-up Chat endpoint with AI Trading Mentor
app.post('/api/ask-mentor', async (req, res) => {
  try {
    const { question, currentAnalysis, chatHistory, settings } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Dotaz je povinný a musí být text.' });
    }

    const ai = getGeminiClient();

    const langCode = settings?.language || 'cs';
    const langInstruction = langCode === 'en'
      ? 'CRITICAL: Answer strictly in ENGLISH language.'
      : langCode === 'es'
      ? 'CRÍTICO: Responde estrictamente en idioma ESPAÑOL.'
      : 'KRITICKÉ: Odpovídej výhradně v ČESKÉM JAZYCE.';

    const systemPrompt = `You are a world-class Quantitative Trading Mentor and Chief Risk Officer at a premier proprietary trading firm. 
You advise professional traders on chart setups, order flow execution (SMC/ICT 2025/2026, Fair Value Gaps, Liquidity Sweeps, Order Blocks, Wyckoff phases), precise trade management, moving Stop Loss to Breakeven, trailing behind structural pivots, scaling out partials, and high-performance trading psychology.

${currentAnalysis ? `CURRENTLY ANALYZED CHART CONTEXT:
- Symbol: ${currentAnalysis.symbol || 'Unknown'}
- Timeframe: ${currentAnalysis.timeframe || 'Unknown'}
- Signal: ${currentAnalysis.signal || 'NEUTRAL_WAIT'}
- Confidence: ${currentAnalysis.confidenceScore}%
- Entry Zone: ${currentAnalysis.entryZone?.recommended || 'N/A'} (Range: ${currentAnalysis.entryZone?.min} - ${currentAnalysis.entryZone?.max})
- Stop Loss: ${currentAnalysis.stopLoss?.price || 'N/A'} (${currentAnalysis.stopLoss?.reason || 'Structural invalidation'})
- TP Targets: ${JSON.stringify(currentAnalysis.takeProfitTargets || [])}
- Bias Reasoning: ${JSON.stringify(currentAnalysis.biasReasoning || '')}
- Methodology Observations: ${JSON.stringify(currentAnalysis.methodologyConfluences || [])}` : 'No active chart analysis at the moment.'}

Rules for mentor response:
1. Provide direct, razor-sharp, actionable advice based on modern institutional trading principles (SMC, Wyckoff, Price Action, Order Flow).
2. For trade management questions, clearly advise on moving SL to Breakeven (only after TP1 is hit or clear Market Structure Shift occurs) and trailing along protected swing points.
3. If the user asks about low timeframe trades (1m/5m), caution regarding market noise and emphasize Higher Timeframe (4H/1D) bias alignment.
4. Reinforce emotional discipline, strict 1% risk per trade limits, and adherence to trading plans (Mark Douglas / Tom Hougaard philosophy).
5. ${langInstruction}`;

    let promptContent = '';
    if (Array.isArray(chatHistory) && chatHistory.length > 0) {
      const formattedHistory = chatHistory
        .filter((m: any) => m && m.text && typeof m.text === 'string')
        .map((m: any) => `${m.sender === 'user' ? 'User' : 'Mentor'}: ${m.text}`)
        .join('\n');
      if (formattedHistory.trim()) {
        promptContent += `Chat History:\n${formattedHistory}\n\n`;
      }
    }

    promptContent += `User Question: ${question.trim()}`;

    const response = await callGeminiWithRetry(ai, {
      model: 'gemini-3.6-flash',
      contents: promptContent,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.5,
      },
    });

    const answer = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) {
      throw new Error('Gemini returned no response text.');
    }

    res.json({
      success: true,
      answer: answer.trim(),
    });
  } catch (error: any) {
    console.error('Error asking mentor:', error);
    const errMsg = error?.message || String(error);
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');
    res.status(500).json({
      error: isRateLimit
        ? 'API rate limit or quota exceeded (429). Please wait ~1 minute and retry.'
        : 'Error communicating with AI Mentor.',
      details: errMsg,
    });
  }
});

// Live Economic Calendar Generator Endpoint (ForexFactory integration with AI Analysis)
app.post('/api/economic-calendar', async (req, res) => {
  try {
    const { date, symbol, language } = req.body;
    
    const now = new Date();
    const defaultDate = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}`;
    const targetDate = date || defaultDate;

    const dateParts = targetDate.split('.').map((p: string) => parseInt(p.trim(), 10));
    const targetDay = dateParts[0];
    const targetMonth = dateParts[1];
    const targetYear = dateParts[2] || now.getFullYear();

    const langCode = language || 'cs';

    let realEvents: any[] = [];
    let liveFetchedSuccess = false;

    // Attempt to fetch live ForexFactory JSON feed
    try {
      const ffRes = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      if (ffRes.ok) {
        const ffData = await ffRes.json();
        if (Array.isArray(ffData)) {
          const matchingFF = ffData.filter((item: any) => {
            if (!item.date) return false;
            const itemDate = new Date(item.date);
            return (
              itemDate.getDate() === targetDay &&
              itemDate.getMonth() + 1 === targetMonth &&
              itemDate.getFullYear() === targetYear
            );
          });

          if (matchingFF.length > 0) {
            liveFetchedSuccess = true;
            realEvents = matchingFF.map((item: any, idx: number) => {
              const itemDate = new Date(item.date);
              const hoursStr = String(itemDate.getHours()).padStart(2, '0');
              const minsStr = String(itemDate.getMinutes()).padStart(2, '0');
              const timeFormatted = `${hoursStr}:${minsStr}`;
              const impactUpper = (item.impact || 'LOW').toUpperCase();
              const curr = item.country || 'USD';

              let warningText = '';
              if (impactUpper === 'HIGH') {
                warningText = langCode === 'en'
                  ? `Critical news release for ${curr}! Expect elevated volatility and wide spreads at ${timeFormatted}.`
                  : langCode === 'es'
                  ? `¡Noticia crítica para ${curr}! Se espera alta volatilidad y spreads amplios a las ${timeFormatted}.`
                  : `Kritická zpráva pro ${curr}! Očekávejte zvýšenou volatilitu a rozšířené spready v ${timeFormatted}.`;
              } else if (impactUpper === 'MEDIUM') {
                warningText = langCode === 'en'
                  ? `Moderate impact on ${curr} currency pairs.`
                  : langCode === 'es'
                  ? `Impacto moderado en pares con ${curr}.`
                  : `Střední vliv na měnové páry s ${curr}.`;
              }

              return {
                id: String(idx + 1),
                date: `${targetDate} ${timeFormatted}`,
                currency: curr,
                title: item.title,
                impact: impactUpper === 'HIGH' ? 'HIGH' : impactUpper === 'MEDIUM' ? 'MEDIUM' : 'LOW',
                forecast: item.forecast || 'N/A',
                previous: item.previous || 'N/A',
                warningText,
              };
            });
          }
        }
      }
    } catch (ffErr) {
      console.warn('ForexFactory live feed fetch failed, falling back to AI generator:', ffErr);
    }

    const ai = getGeminiClient();

    let finalEvents = realEvents;
    let marketAdvice = '';

    if (liveFetchedSuccess && realEvents.length > 0) {
      const highImpactList = realEvents.filter(e => e.impact === 'HIGH').map(e => `${e.currency} - ${e.title} at ${e.date}`).join(', ');
      
      const langPrompt = langCode === 'en'
        ? 'Provide concise, highly professional advice in ENGLISH.'
        : langCode === 'es'
        ? 'Proporciona consejos concisos y muy profesionales en ESPAÑOL.'
        : 'Poskytni stručné, vysoce profesionální doporučení pro tradery v ČEŠTINĚ.';

      const advicePrompt = `Based on REAL news events from ForexFactory for ${targetDate}:
Events: ${JSON.stringify(realEvents)}

${langPrompt}

Return JSON:
{
  "marketSummaryAdvice": "Your advice string in requested language..."
}`;

      try {
        const response = await callGeminiWithRetry(ai, {
          model: 'gemini-3.6-flash',
          contents: advicePrompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });
        const parsed = JSON.parse(response.text || '{}');
        marketAdvice = parsed.marketSummaryAdvice || '';
      } catch (adviceErr) {
        marketAdvice = highImpactList
          ? `Key events (${targetDate}): ${highImpactList}. Use extra caution during release.`
          : `No critical HIGH IMPACT news recorded for USD on ${targetDate}.`;
      }
    } else {
      const langInstruction = langCode === 'en'
        ? 'CRITICAL: Return JSON report in ENGLISH.'
        : langCode === 'es'
        ? 'CRÍTICO: Devuelve informe JSON en ESPAÑOL.'
        : 'KRITICKÉ: Vrať strukturovaný JSON report v ČEŠTINĚ.';

      const systemPrompt = `You are a professional macroeconomic calendar analyst. Provide an accurate news schedule for ${targetDate}. ${langInstruction}`;

      const userPrompt = `Generate economic calendar for date: ${targetDate} ${symbol ? `for symbol ${symbol}` : ''}.
Return JSON:
{
  "targetDate": "${targetDate}",
  "events": [
    {
      "id": "1",
      "date": "${targetDate} 06:30",
      "currency": "AUD",
      "title": "RBA Cash Rate Statement",
      "impact": "HIGH",
      "forecast": "4.35%",
      "previous": "4.35%",
      "warningText": "Warning in requested language"
    }
  ],
  "marketSummaryAdvice": "Advice in requested language for date ${targetDate}"
}`;

      const response = await callGeminiWithRetry(ai, {
        model: 'gemini-3.6-flash',
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const responseText = response.text || '{}';
      const parsedData: any = safeExtractJson(responseText);

      finalEvents = parsedData.events || [];
      marketAdvice = parsedData.marketSummaryAdvice || '';
    }

    res.json({
      success: true,
      data: {
        targetDate,
        events: finalEvents,
        marketSummaryAdvice: marketAdvice,
      },
    });
  } catch (error: any) {
    console.error('Error fetching economic calendar:', error);
    const errMsg = error?.message || String(error);
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');
    res.status(500).json({
      error: isRateLimit
        ? 'API rate limit or quota exceeded (429). Please wait ~1 minute and retry.'
        : 'An error occurred fetching economic calendar.',
      details: errMsg,
    });
  }
});

// Catch-all route for unhandled API requests - guarantees JSON response instead of HTML SPA fallback
app.all('/api/*', (_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Požadovaný API endpoint nebyl nalezen.',
  });
});

// Global Express error handling middleware to catch unhandled errors gracefully
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('Unhandled server error:', err);
  if (!res.headersSent) {
    res.status(500).json({
      success: false,
      error: 'An internal server error occurred. Please try again.',
      details: err?.message || String(err),
    });
  }
});

// Start Express server & Vite middleware
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`AIAUTOTRADER.com Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
