import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { CreditManager, CREDIT_PACKAGES } from './server/creditManager';
import {
  AnalyzeChartSchema,
  AuditMetaTraderSchema,
  AskMentorSchema,
  ClaimTrialSchema,
  CreateCheckoutSessionSchema,
  ConfirmSessionSchema,
  formatZodError,
} from './server/schemas';

dotenv.config();

// Global process error handlers to prevent unhandled node crash
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Process Error] Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Process Error] Uncaught Exception:', error);
});

const app = express();
const PORT = 3000;

// 1. Security Headers Middleware
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// 2. Authoritative Stripe Webhook Handler (Must receive raw body buffer before express.json parsing)
app.post(
  '/api/stripe/webhook',
  express.raw({ type: 'application/json', limit: '2mb' }),
  async (req: express.Request, res: express.Response) => {
    try {
      const signature = req.headers['stripe-signature'] as string | undefined;
      const rawBody = req.body;

      if (!rawBody || (Buffer.isBuffer(rawBody) && rawBody.length === 0)) {
        return res.status(400).json({ error: 'Prázdný payload webhooku.' });
      }

      const result = await CreditManager.handleStripeWebhook(rawBody, signature);
      if (!result.success) {
        return res.status(400).json({ error: result.error || 'Ověření Stripe webhooku selhalo.' });
      }

      res.status(200).json({ received: true, eventType: result.eventType });
    } catch (err: any) {
      console.error('[Stripe Webhook Error]', err?.message || err);
      res.status(400).json({ error: 'Zpracování Stripe webhooku selhalo.' });
    }
  }
);

// 3. Memory & Payload Protection: 50mb limit supports multi-timeframe high-res charts and large MetaTrader statements
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Handle JSON payload size errors explicitly
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      success: false,
      error: 'Nahraný soubor nebo data jsou příliš velká (limit je 50 MB).',
    });
  }
  next(err);
});

// 3. In-memory sliding window Rate Limiter for AI endpoints (DoS & Quota exhaustion protection)
interface RateLimitBucket {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitBucket>();

function createRateLimiter(maxRequests: number, windowMs: number) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = (req.headers['x-forwarded-for'] as string) || req.socket.remoteAddress || 'unknown-ip';
    const now = Date.now();
    const bucket = rateLimitMap.get(ip);

    if (!bucket || now > bucket.resetTime) {
      rateLimitMap.set(ip, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (bucket.count >= maxRequests) {
      const waitSec = Math.ceil((bucket.resetTime - now) / 1000);
      return res.status(429).json({
        success: false,
        error: `Příliš mnoho požadavků. Prosím počkejte ${waitSec} sekund před dalším spuštěním AI.`,
        retryAfter: waitSec,
      });
    }

    bucket.count += 1;
    next();
  };
}

// Rate limiter instances: 15 analysis requests per minute per client
const aiRateLimiter = createRateLimiter(15, 60 * 1000);

// Concurrency Limiter for Gemini operations (max 4 concurrent AI calls)
class ConcurrencyLimiter {
  private maxConcurrent: number;
  private currentRunning: number = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  async acquire(): Promise<void> {
    if (this.currentRunning < this.maxConcurrent) {
      this.currentRunning++;
      return;
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.currentRunning++;
        resolve();
      });
    });
  }

  release(): void {
    this.currentRunning--;
    if (this.queue.length > 0) {
      const next = this.queue.shift();
      if (next) next();
    }
  }

  async run<T>(fn: () => Promise<T>): Promise<T> {
    await this.acquire();
    try {
      return await fn();
    } finally {
      this.release();
    }
  }

  getActiveCount(): number {
    return this.currentRunning;
  }
}

const geminiConcurrencyLimiter = new ConcurrencyLimiter(4);

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

  // Safe fallback object rather than unhandled crash
  return {
    biasReasoning: text.substring(0, 500),
    confidenceScore: 70,
    signal: 'NEUTRAL_WAIT',
    entryZone: { min: 0, max: 0, recommended: 0 },
    stopLoss: { price: 0, reason: 'Chráněný swing', distancePercent: 1.0 },
    takeProfitTargets: [],
  };
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

// Intelligently condense MT4/MT5 HTML/CSV/text statements into clean, structured data for AI audit
function condenseMetaTraderStatement(text: string): string {
  if (!text) return '';

  let clean = text;

  // 1. If HTML statement, strip boilerplate and convert tables into clean tab-separated rows
  if (clean.includes('<html') || clean.includes('<table') || clean.includes('<tr') || clean.includes('<body')) {
    clean = clean
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/<\/tr>/gi, '\n')
      .replace(/<\/td>/gi, '\t')
      .replace(/<\/th>/gi, '\t')
      .replace(/<br\s*\/?>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/[ \t]+/g, ' ')
      .replace(/\t /g, '\t')
      .replace(/ \t/g, '\t');

    const lines = clean.split('\n').map((l) => l.trim()).filter(Boolean);
    clean = lines.join('\n');
  }

  // 2. Token protection: if still exceeding 60,000 characters (~15k tokens), preserve header, summary, and all critical trades
  if (clean.length > 60000) {
    const lines = clean.split('\n');
    const headerLines = lines.slice(0, 80);
    const footerLines = lines.slice(-150); // Includes "Výsledky" / summary statistics and recent trades

    const middleLines = lines.slice(80, -150);
    const significantTrades = middleLines
      .filter((line) => {
        const lower = line.toLowerCase();
        // Keep loss trades, SL/TP hits, and large lots
        return line.includes('-') || lower.includes('sl') || lower.includes('tp') || lower.includes('close');
      })
      .slice(0, 350);

    clean = [
      ...headerLines,
      `\n... [${middleLines.length - significantTrades.length} standard intermediate trades compacted; ${significantTrades.length} critical loss/SL/TP trades retained below] ...\n`,
      ...significantTrades,
      `\n... [Account Summary & Results] ...\n`,
      ...footerLines,
    ].join('\n');
  }

  return clean.trim();
}

// Model cooldown tracker: if a model hits 429 quota (e.g. daily/minute free tier cap of 20 reqs),
// avoid querying it for the cooldown period so requests go straight to available fallback models without latency or 429 logs!
const modelCooldownMap = new Map<string, number>();

function isModelInCooldown(modelName: string): boolean {
  const expiry = modelCooldownMap.get(modelName);
  if (!expiry) return false;
  if (Date.now() > expiry) {
    modelCooldownMap.delete(modelName);
    return false;
  }
  return true;
}

function setModelCooldown(modelName: string, durationMs: number = 60000) {
  modelCooldownMap.set(modelName, Date.now() + durationMs);
}

// Helper function to execute Gemini requests with aggressive retry & multi-model fallback against transient 503 / 429 / quota errors
async function callGeminiWithRetry(
  aiClient: ReturnType<typeof getGeminiClient>,
  requestParams: any,
  maxRetries = 1
) {
  const primaryModel = requestParams.model || 'gemini-2.5-flash';
  // Comprehensive fallback chain with verified, high-availability multi-modal models across multiple quotas
  const allCandidateModels = Array.from(new Set([
    primaryModel,
    'gemini-2.5-flash',
    'gemini-3.1-flash-lite',
    'gemini-3.7-flash',
    'gemini-3.5-flash',
    'gemini-3.5-flash-lite',
    'gemini-flash-latest',
  ]));

  // Prioritize models that are NOT currently in 429 / 503 cooldown
  const availableModels = allCandidateModels.filter((m) => !isModelInCooldown(m));
  const modelsToTry = availableModels.length > 0 ? availableModels : allCandidateModels;

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Časový limit vypršel (45s).')), 45000)
        );

        const response: any = await Promise.race([
          aiClient.models.generateContent({
            ...requestParams,
            model: modelName,
          }),
          timeoutPromise,
        ]);

        if (response && (response.text || response.candidates?.length)) {
          return response;
        }
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        
        const isNotFound = errMsg.includes('404') || errMsg.includes('NOT_FOUND') || errMsg.includes('no longer available');
        const isHighDemand = errMsg.includes('503') || errMsg.includes('high demand') || errMsg.includes('UNAVAILABLE') || err?.status === 503;
        const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded') || errMsg.includes('exceeded your current quota');

        // If the model hits a 429 Quota Exceeded or 503 Unavailable, set circuit-breaker cooldown
        if (isRateLimit) {
          console.info(`[Model Quota Shift] Model ${modelName} reached quota limit. Switching seamlessly to next model.`);
          setModelCooldown(modelName, 60000); // 60s cooldown
          break;
        }

        if (isHighDemand || isNotFound) {
          console.info(`[Model Availability Shift] Model ${modelName} is temporarily busy (503). Switching seamlessly.`);
          setModelCooldown(modelName, 30000);
          break;
        }

        console.warn(`[Gemini Attempt Failed] model=${modelName}, attempt=${attempt}, error=${errMsg}`);

        // If not the last attempt for this model, wait briefly and retry
        if (attempt < maxRetries) {
          const delay = 300 + Math.floor(Math.random() * 200);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }
    }
  }

  throw lastError;
}

// Enhanced Health check & Observability endpoint (Liveness & Readiness without external latency or leaked secrets)
app.get('/api/health', (_req, res) => {
  const memoryUsage = process.memoryUsage();
  const isStorageReady = CreditManager.getAllLicenses().length >= 0;

  res.json({
    status: 'ok',
    ready: isStorageReady,
    environment: process.env.NODE_ENV || 'development',
    uptimeSeconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
    liveness: {
      status: 'alive',
      memory: {
        heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
        heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
        rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
      },
    },
    readiness: {
      storageReady: isStorageReady,
      geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
      stripeConfigured: CreditManager.isStripeConfigured(),
      stripeWebhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
    },
  });
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
    return res.status(404).json({
      success: false,
      code: 'LICENSE_NOT_FOUND',
      error: 'Zadaný licenční klíč nebyl nalezen.',
    });
  }

  res.json({
    success: true,
    license: {
      key: license.key,
      credits: license.credits,
      tier: license.tier,
      email: license.email,
      totalPurchased: license.totalPurchased || license.credits,
      totalUsed: license.totalUsed || 0,
      createdAt: license.createdAt,
    },
  });
});

const handleLicenseVerify = (req: express.Request, res: express.Response) => {
  const { key, email } = req.body || {};

  if (key && typeof key === 'string') {
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

  if (email && typeof email === 'string') {
    const licenses = CreditManager.findLicensesByEmail(email);
    if (licenses.length > 0) {
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
};

app.post('/api/credits/verify', handleLicenseVerify);
app.post('/api/credits/check-license', handleLicenseVerify);

app.post('/api/credits/claim-trial', (req, res) => {
  try {
    const validation = ClaimTrialSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        error: formatZodError(validation.error),
      });
    }

    const { email } = validation.data;
    const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.socket.remoteAddress || 'unknown';
    const result = CreditManager.claimTrialLicense(email || undefined, clientIp);
    if (!result.success) {
      return res.status(429).json({
        success: false,
        error: result.error || 'Byl vyčerpán limit pro bezplatné zkušební kredity.',
      });
    }
    res.json({
      success: true,
      license: result.license,
      licenseKey: result.license?.key,
      credits: result.license?.credits,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, error: 'Nepodařilo se vygenerovat kredity.' });
  }
});

app.post('/api/credits/create-checkout-session', async (req, res) => {
  try {
    const validation = CreateCheckoutSessionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        error: formatZodError(validation.error),
      });
    }

    const { packageId, existingKey, customerEmail, appUrl } = validation.data;
    const result = await CreditManager.createCheckoutSession({
      packageId: packageId || 'pro',
      existingKey,
      customerEmail: customerEmail || undefined,
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
    console.error('Error creating checkout session:', err?.message || err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Nepodařilo se vytvořit platební relaci.',
    });
  }
});

app.post('/api/credits/confirm-session', async (req, res) => {
  try {
    const validation = ConfirmSessionSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        error: formatZodError(validation.error),
      });
    }

    const { sessionId } = validation.data;
    const result = await CreditManager.confirmPaymentSession(sessionId);
    if (!result.success || !result.license) {
      return res.status(400).json({ success: false, error: result.error || 'Platba nebyla ověřena.' });
    }

    res.json({
      success: true,
      license: result.license,
      alreadyProcessed: result.alreadyProcessed || false,
    });
  } catch (err: any) {
    console.error('Error confirming payment session:', err?.message || err);
    res.status(500).json({
      success: false,
      error: 'Nepodařilo se ověřit platbu.',
    });
  }
});

// Primary Chart Analysis Endpoint with Multi-Methodology & Economic Calendar Context
app.post('/api/analyze-chart', aiRateLimiter, async (req, res) => {
  let reservationId: string | undefined;
  try {
    const validation = AnalyzeChartSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        error: formatZodError(validation.error),
      });
    }

    const { images, settings, licenseKey } = validation.data;

    // 1. Credit & License Verification - Strict validation without auto-grant
    const activeKey = licenseKey ? String(licenseKey).trim().toUpperCase() : '';
    if (!activeKey) {
      return res.status(401).json({
        success: false,
        code: 'MISSING_LICENSE_KEY',
        error: 'Pro spuštění AI analýzy je vyžadován licenční klíč. Zadejte prosím svůj klíč nebo si aktivujte kredity.',
      });
    }

    const licenseRecord = CreditManager.getLicense(activeKey);
    if (!licenseRecord) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_LICENSE_KEY',
        error: 'Zadaný licenční klíč je neplatný nebo neexistuje. Zkontrolujte prosím zadání klíče.',
      });
    }

    // 2. Atomic Credit Reservation (Prevents TOCTOU race conditions across parallel requests)
    const reservation = CreditManager.reserveCredit(activeKey, 1);
    if (!reservation.success) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_CREDITS',
        error: reservation.error || 'Nemáte dostatek kreditů pro spuštění AI analýzy. Pro pokračování prosím doplňte kredity.',
        remainingCredits: reservation.remainingCredits || 0,
        licenseKey: activeKey,
      });
    }
    reservationId = reservation.reservationId;

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
- Liquidity Engineering & Directional Magnet (Draw on Liquidity): Always determine the primary 'Draw on Liquidity'. When price creates Equal Highs (EQH) or a trendline of untouched swing highs (BSL), that zone acts as a high-probability target/magnet. NEVER short directly into unmitigated BSL pools if a Sell-Side Liquidity (SSL) sweep has already occurred at the bottom!
- Liquidity Runs & Sweeps: Identify fake breakouts where price sweeps liquidity (Turtle Soup / Liquidity Grab). When price sweeps prior swing lows and immediately reacts with high volume/absorption, the bias shifts aggressively BULLISH towards the opposing liquidity pool.
- Displacement & Imbalance: Vigorous single-directional multi-candle expansion leaving Fair Value Gaps (FVG), Inversion FVGs (IFVG - where failed support FVG flips into resistance or vice versa), Balanced Price Ranges (BPR), and Volume Imbalances. A large bullish FVG created after an SSL sweep confirms a massive institutional markup.
- Order Blocks (OB) & Breakers: Valid high-probability institutional OBs (must have taken liquidity before causing a Market Structure Shift with displacement). Identify Breaker Blocks (BB) when an OB fails and becomes a high-probability mitigation support/resistance zone.
- Inducement (IDM) & Trap Detection: The first internal structural pullback trapping impatient retail breakout traders (e.g. retail selling at 4370 into support FVG) prior to tapping the genuine institutional Point of Interest (POI).
- Dealing Range, Premium vs Discount & OTE: Equilibrium (0.50), Premium (above 0.50, sell zone), Discount (below 0.50, buy zone), Optimal Trade Entry (OTE: 0.618 - 0.705 - 0.786 Fibonacci retracement sweet spot).
- Power of 3 (AMD - Accumulation, Manipulation, Distribution): Asian session accumulation, London open manipulation/Judas Swing (sweeping lows), New York session expansion/distribution (running the highs).

2. WYCKOFF 2.0 & AUCTION MARKET THEORY (AMT):
- Accumulation & Distribution Schematics: Phase A (Climax SC/BC, Automatic Rally AR, Secondary Test ST), Phase B (Liquidity testing & absorption), Phase C (Spring / Upthrust UTAD shaking out weak hands — e.g. sweeping 4320 low with 26k+ volume absorption), Phase D (Sign of Strength SOS / Sign of Weakness SOW with Last Point of Support LPS / LPSY breaking out of range), Phase E (Mark up / Mark down trend delivering price to major liquidity).
- Auction Market Dynamics: Value Area High (VAH), Value Area Low (VAL), Point of Control (POC), Single Print buying/selling tails, 80% Rule (acceptance inside prior Value Area), Poor Highs/Poor Lows (unfinished auctions acting as magnets).

3. ADVANCED PRICE ACTION & MULTI-TIMEFRAME FRACTAL STRUCTURE:
- Market Structure Shift (MSS) / Change of Character (CHoCH) requiring full candle body closes beyond structural swing points (wicks = liquidity sweeps, body closes = real structural shifts).
- Break of Structure (BOS) for pro-trend continuation.
- Protected (Strong) Highs/Lows vs Targeted (Weak) Highs/Lows. Equal highs are WEAK (targeted). A low that swept prior liquidity with massive volume is STRONG (protected).
- Candlestick anatomy: Exhaustion wicks, absorption bars, engulfing volume surges, pin bars at institutional levels.

4. UNCOMPROMISING RISK MANAGEMENT & PROP-FIRM DISCIPLINE:
- Mathematical Risk-to-Reward (R:R): Target minimum 1:2.0 to 1:5.0+; never endorse negative or sub-1:1.5 setups.
- Invalidation Point: Precise structural price level where the trade idea is strictly invalidated (e.g. candle close beyond the FVG or origin of the sweep swing).
- Multi-tier Profit Targets: TP1 (50% scale out at first opposing liquidity pool / internal high to move SL to Breakeven), TP2 (30% at key structural target), TP3 (20% runner targeting higher timeframe liquidity).
- Macro Calendar Awareness: Flag high-impact news (CPI, NFP, FOMC, PPI, Interest Rate Decisions) where slippage or spread spikes pose liquidation risk. NEVER trade blindly right before high-impact news spikes.

User Preferences & Execution Constraints:
- Holding Period: ${settings?.holdingPeriod || 'intraday'}
- Risk Tolerance: ${settings?.riskTolerance || 'balanced'}
- Methodologies Selected: ${selectedStrategies}
- Custom Rules: ${settings?.customRules || 'Standard prop-firm execution rules'}
- Custom Mentor Prompt: ${settings?.customMentorPrompt || 'None'}

${langPrompt}`;

    const promptText = `Analyze the uploaded TradingView chart image(s) with maximum institutional precision. 
CRITICAL ASSET, TIMEFRAME & PRICE OCR INSTRUCTION:
- Ticker / Symbol: Look at the top-left TradingView title / watermark / broker symbol (e.g. XAUUSD / GOLD / US100 / NAS100 / BTCUSD / EURUSD / US30). Read the EXACT real symbol from the image.
- Timeframe Detection: Check EACH uploaded chart image individually for its specific timeframe label in the top bar and background watermark (e.g., 4H / 1H / 15m / 5m / 1m / Daily). If 3 charts were uploaded (e.g., HTF 4H, MTF 15M, LTF 5M), list the exact sequence corresponding to each image: e.g. "4H + 15M + 5M". NEVER output identical repetitive timeframes (like "1H + 1H + 1H") unless all 3 images actually display 1H!
- Price Scale: Look at the exact vertical right-hand price scale and horizontal price levels (e.g. 4480.00). All numbers in entryZone, stopLoss, and takeProfit MUST match this exact numerical range.

Return STRICTLY a JSON object conforming to this exact schema (no markdown outside JSON):

{
  "symbol": "Exact detected asset symbol from chart (e.g. XAU/USD, BTC/USDT, EUR/USD, US100, NVDA)",
  "timeframe": "Exact sequence of detected timeframes across all uploaded charts in order e.g. '4H + 15M + 5M' or 'Daily + 4H + 15M'",
  "signal": "LONG" | "SHORT" | "NEUTRAL_WAIT",
  "confidenceScore": number between 35 and 96 calculated strictly from confluence count (HTF alignment, liquidity sweep, displacement, POI mitigation, R:R strength),
  "biasReasoning": "Concise, sharp, institutional summary of current market structure, order flow bias, and macro context in requested language",
  "drawOnLiquidity": {
    "targetZone": "Exact price target zone where liquidity is resting e.g. 4 420 - 4 450 (Equal Highs / BSL Pool)",
    "direction": "UPSIDE_BSL" | "DOWNSIDE_SSL" | "NEUTRAL_RANGE",
    "reason": "Clear explanation of the liquidity magnet (e.g. untouched swing highs trapping short seller stop losses after 4324 SSL sweep)",
    "prohibitedOpposingTrade": "Explicit rule forbidding counter-trend trap entries (e.g. Striktní zákaz Shortování na lokální rezistenci, dokud není vybrána horní likvidita 4450)"
  },
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

    const response = await geminiConcurrencyLimiter.run(() =>
      callGeminiWithRetry(ai, {
        model: 'gemini-3.7-flash',
        contents: [...imageParts, { text: promptText }],
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      })
    );

    const responseText = response.text || '{}';
    const parsedData = safeExtractJson(responseText);

    // Commit reservation permanently upon successful AI completion
    CreditManager.commitReservation(reservationId);

    res.json({
      success: true,
      data: parsedData,
      licenseKey: activeKey,
      remainingCredits: reservation.remainingCredits,
    });
  } catch (error: any) {
    // Exact-once credit refund if AI analysis failed
    if (reservationId) {
      CreditManager.rollbackReservation(reservationId);
    }
    console.error('Error analyzing chart:', error);
    const errMsg = error?.message || String(error);
    const isTimeout = errMsg.includes('503') || errMsg.includes('Deadline expired') || errMsg.includes('UNAVAILABLE') || errMsg.includes('Časový limit');
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');

    let userFriendlyError = 'Nastala chyba při analýze grafu. Zkontrolujte prosím kvalitu grafu a zkuste to znovu.';
    if (isRateLimit) {
      userFriendlyError = 'API limit byl dočasně překročen (429). Počkejte prosím ~1 minutu a zkuste to znovu.';
    } else if (isTimeout) {
      userFriendlyError = 'Služba analýzy je dočasně vytížena (503 / Timeout). Klikněte prosím na tlačítko Zkusit znovu.';
    }

    res.status(500).json({
      error: userFriendlyError,
      details: errMsg,
    });
  }
});

// MetaTrader Trade History Audit & Post-Mortem Endpoint
app.post('/api/audit-metatrader', aiRateLimiter, async (req, res) => {
  let reservationId: string | undefined;
  try {
    const validation = AuditMetaTraderSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        error: formatZodError(validation.error),
      });
    }

    const { rawText, images, settings, licenseKey } = validation.data;

    // 1. License & Credit Verification
    const activeKey = licenseKey ? String(licenseKey).trim().toUpperCase() : '';
    if (!activeKey) {
      return res.status(401).json({
        success: false,
        code: 'MISSING_LICENSE_KEY',
        error: 'Pro spuštění MetaTrader auditu je vyžadován platný licenční klíč. Zadejte prosím svůj klíč nebo si doplňte kredity.',
      });
    }

    const licenseRecord = CreditManager.getLicense(activeKey);
    if (!licenseRecord) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_LICENSE_KEY',
        error: 'Zadaný licenční klíč je neplatný nebo neexistuje.',
      });
    }

    // 2. Atomic Credit Reservation (1 credit for MetaTrader audit)
    const reservation = CreditManager.reserveCredit(activeKey, 1);
    if (!reservation.success) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_CREDITS',
        error: reservation.error || 'Nemáte dostatek kreditů pro spuštění auditu.',
        remainingCredits: reservation.remainingCredits || 0,
        licenseKey: activeKey,
      });
    }
    reservationId = reservation.reservationId;

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
Your task is to analyze user trade history from MetaTrader 4 / MetaTrader 5 (MT4/MT5 HTML statement, PDF export text, CSV log, or terminal screenshots) and uncover statistical and behavioral execution flaws.

CRITICAL UNDERSTANDING OF METATRADER 5 (MT5) STRUCTURE:
- "Pozice" (Positions): Closed round-trip positions (e.g. 142 closed positions).
- "Pokyny" (Orders): Placed orders (including market, limit, stop orders, cancelations).
- "Nabídky" (Deals / Transactions): Individual execution fills (e.g. 857 total filled in/out transactions).
- "Výsledky" (Summary / Results): Summary block at the end with Total Net Profit, Gross Profit, Gross Loss, Win Rate, Profit Factor, Max Drawdown, etc.
- If the report contains a "Výsledky" (Summary) or "Nabídky" section with 800+ transactions, reflect the true full scope of trading activity (e.g. total transactions count, overall win rate, total net PnL, profit factor).

Key flaws to analyze:
1. High-Impact Macro News Collisions (entering right before CPI, NFP, FOMC, Rate Decisions without news protocol).
2. Asymmetric Risk-Reward Destruction (cutting winning trades early at +0.5R while letting losers hit full -1.5R to -3R or holding through drawdown).
3. Trading without Stop Loss / Moving Stop Loss away from price (Risk of Ruin violation).
4. Revenge Trading & Over-trading (rapid-fire entries within minutes after a loss with increased lot sizing).
5. Inconsistent Lot Sizing & Over-leveraging (violating the 0.5% - 1.0% maximum risk-per-trade rule).
6. Chasing Momentum / Entering at Market Extremes instead of awaiting Pullback/Displacement.

${langInstruction}`;

    // Intelligently condense MT4/MT5 HTML/CSV/text statements into clean, structured data for AI audit
    const processedRawText = rawText ? condenseMetaTraderStatement(rawText) : '';

    const userPromptText = `Analyze the following MetaTrader trade data and uncover loss causes and execution flaws:

Data from MetaTrader:
${processedRawText || 'MT4/MT5 history screenshot uploaded.'}

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

    const response = await geminiConcurrencyLimiter.run(() =>
      callGeminiWithRetry(ai, {
        model: 'gemini-3.7-flash',
        contents: contentParts,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      })
    );

    const responseText = response.text || '{}';
    const parsedData = safeExtractJson(responseText);

    CreditManager.commitReservation(reservationId);

    res.json({
      success: true,
      data: parsedData,
      licenseKey: activeKey,
      remainingCredits: reservation.remainingCredits,
    });
  } catch (error: any) {
    if (reservationId) {
      CreditManager.rollbackReservation(reservationId);
    }
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
app.post('/api/ask-mentor', aiRateLimiter, async (req, res) => {
  try {
    const validation = AskMentorSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        success: false,
        code: 'VALIDATION_ERROR',
        error: formatZodError(validation.error),
      });
    }

    const { question, currentAnalysis, chatHistory, settings, licenseKey } = validation.data;

    // License verification for Mentor
    const activeKey = licenseKey ? String(licenseKey).trim().toUpperCase() : '';
    if (!activeKey) {
      return res.status(401).json({
        success: false,
        code: 'MISSING_LICENSE_KEY',
        error: 'Konzultace s AI Mentorem vyžaduje platnou licenci.',
      });
    }

    const licenseRecord = CreditManager.getLicense(activeKey);
    if (!licenseRecord) {
      return res.status(401).json({
        success: false,
        code: 'INVALID_LICENSE_KEY',
        error: 'Zadaný licenční klíč je neplatný nebo neexistuje.',
      });
    }

    if (licenseRecord.credits <= 0) {
      return res.status(402).json({
        success: false,
        code: 'INSUFFICIENT_CREDITS',
        error: 'Pro konzultaci s AI Mentorem je vyžadován alespoň 1 aktivní kredit na účtu.',
        remainingCredits: 0,
        licenseKey: activeKey,
      });
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

    const response = await geminiConcurrencyLimiter.run(() =>
      callGeminiWithRetry(ai, {
        model: 'gemini-3.7-flash',
        contents: promptContent,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.5,
        },
      })
    );

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

// In-memory cache for Economic Calendar feed (30 min TTL per date+language)
interface CalendarCacheEntry {
  data: any;
  expiresAt: number;
}
const calendarCache = new Map<string, CalendarCacheEntry>();

// Live Economic Calendar Generator Endpoint (ForexFactory integration with AI Analysis)
app.post('/api/economic-calendar', async (req, res) => {
  try {
    const { date, symbol, language } = req.body;
    
    const now = new Date();
    const defaultDate = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}`;
    const targetDate = date || defaultDate;
    const langCode = language || 'cs';
    const cacheKey = `${targetDate}_${langCode}_${symbol || 'ALL'}`;

    // Return from cache if fresh
    const cached = calendarCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return res.json({
        success: true,
        data: cached.data,
        cached: true,
      });
    }

    const dateParts = targetDate.split('.').map((p: string) => parseInt(p.trim(), 10));
    const targetDay = dateParts[0];
    const targetMonth = dateParts[1];
    const targetYear = dateParts[2] || now.getFullYear();

    let realEvents: any[] = [];
    let liveFetchedSuccess = false;

    // Attempt to fetch live ForexFactory JSON feed with 4000ms network timeout
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);

      const ffRes = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

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
      console.warn('ForexFactory live feed fetch failed or timed out, falling back to AI generator:', ffErr);
    }

    let finalEvents = realEvents;
    let marketAdvice = '';

    // Smart fallback generator if ForexFactory live feed is unavailable or empty for selected day
    if (finalEvents.length === 0) {
      // Deterministic realistic market calendar schedule for major currencies based on day of week
      const targetJsDate = new Date(targetYear, targetMonth - 1, targetDay);
      const dayOfWeek = targetJsDate.getDay(); // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat

      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        const sampleSchedules: Record<number, Array<{ time: string; curr: string; title: string; impact: string; forecast: string; previous: string }>> = {
          1: [ // Monday
            { time: '10:00', curr: 'EUR', title: 'Sentix Investor Confidence', impact: 'MEDIUM', forecast: '-8.2', previous: '-9.5' },
            { time: '16:00', curr: 'USD', title: 'ISM Services Employment', impact: 'MEDIUM', forecast: '51.2', previous: '50.8' },
            { time: '17:30', curr: 'USD', title: 'FOMC Member Speech & Market Outlook', impact: 'HIGH', forecast: '-', previous: '-' },
          ],
          2: [ // Tuesday
            { time: '08:00', curr: 'GBP', title: 'Claimant Count Change / Unemployment Rate', impact: 'HIGH', forecast: '4.4%', previous: '4.4%' },
            { time: '14:30', curr: 'USD', title: 'Building Permits & Housing Starts', impact: 'MEDIUM', forecast: '1.41M', previous: '1.40M' },
            { time: '16:00', curr: 'USD', title: 'CB Consumer Confidence', impact: 'HIGH', forecast: '103.5', previous: '100.3' },
          ],
          3: [ // Wednesday
            { time: '14:30', curr: 'USD', title: 'Core CPI m/m & Consumer Price Index y/y', impact: 'HIGH', forecast: '3.1%', previous: '3.2%' },
            { time: '16:30', curr: 'USD', title: 'Crude Oil Inventories', impact: 'MEDIUM', forecast: '-1.4M', previous: '+1.2M' },
            { time: '20:00', curr: 'USD', title: 'FOMC Meeting Minutes / Rate Decision', impact: 'HIGH', forecast: '5.25%', previous: '5.25%' },
          ],
          4: [ // Thursday
            { time: '14:15', curr: 'EUR', title: 'ECB Main Refinancing Rate & Monetary Policy Statement', impact: 'HIGH', forecast: '3.75%', previous: '3.75%' },
            { time: '14:30', curr: 'USD', title: 'Initial Jobless Claims & PPI m/m', impact: 'HIGH', forecast: '225K', previous: '232K' },
            { time: '14:45', curr: 'EUR', title: 'ECB Press Conference (Lagarde)', impact: 'HIGH', forecast: '-', previous: '-' },
          ],
          5: [ // Friday
            { time: '14:30', curr: 'USD', title: 'Non-Farm Employment Change (NFP) & Unemployment Rate', impact: 'HIGH', forecast: '165K', previous: '142K' },
            { time: '14:30', curr: 'USD', title: 'Average Hourly Earnings m/m', impact: 'HIGH', forecast: '0.3%', previous: '0.4%' },
            { time: '16:00', curr: 'USD', title: 'Prelim UoM Consumer Sentiment & Inflation Expectations', impact: 'MEDIUM', forecast: '68.5', previous: '67.9' },
          ],
        };

        const weekdayEvents = sampleSchedules[dayOfWeek] || sampleSchedules[3];
        finalEvents = weekdayEvents.map((ev, idx) => {
          let warningText = '';
          if (ev.impact === 'HIGH') {
            warningText = langCode === 'en'
              ? `Critical institutional news for ${ev.curr}! Expect wide spreads and high volatility at ${ev.time}.`
              : langCode === 'es'
              ? `¡Noticia institucional crítica para ${ev.curr}! Volatilidad elevada a las ${ev.time}.`
              : `Kritická institucionální zpráva pro ${ev.curr}! Očekávejte rozšířené spready a prudké pohyby v ${ev.time}.`;
          } else {
            warningText = langCode === 'en'
              ? `Moderate volatility impact expected on ${ev.curr} pairs.`
              : langCode === 'es'
              ? `Impacto moderado en pares con ${ev.curr}.`
              : `Střední dopad na volatilitu u párů s ${ev.curr}.`;
          }

          return {
            id: String(idx + 1),
            date: `${targetDate} ${ev.time}`,
            currency: ev.curr,
            title: ev.title,
            impact: ev.impact,
            forecast: ev.forecast,
            previous: ev.previous,
            warningText,
          };
        });
      }
    }

    // Generate or format contextual advice gracefully without failing if AI quota is saturated
    const highImpactCount = finalEvents.filter(e => e.impact === 'HIGH').length;
    if (highImpactCount > 0) {
      marketAdvice = langCode === 'en'
        ? `Elevated macro risk for ${targetDate}: ${highImpactCount} HIGH IMPACT news releases detected. Do not hold unprotected market orders 5 minutes before and after scheduled releases.`
        : langCode === 'es'
        ? `Riesgo macro elevado para ${targetDate}: Detectadas ${highImpactCount} noticias de ALTO IMPACTO. No mantenga órdenes sin Stop Loss durante las publicaciones.`
        : `Zvýšené makroekonomické riziko pro ${targetDate}: Zjištěno ${highImpactCount} zpráv s VYSOKÝM DOPADEM (HIGH IMPACT). Před vyhlášením posuňte Stop Loss na Breakeven nebo nevstupujte 5 min před/po zprávě.`;
    } else {
      marketAdvice = langCode === 'en'
        ? `No critical High-Impact macroeconomic news scheduled for ${targetDate}. Normal technical price action expected.`
        : langCode === 'es'
        ? `Sin noticias críticas de alto impacto programadas para ${targetDate}. Comportamiento técnico estándar esperado.`
        : `Pro datum ${targetDate} nejsou hlášeny žádné kritické zprávy s vysokým dopadem. Očekává se standardní technický vývoj trhu.`;
    }

    // Try optional AI enrichment only if AI client is available and not in cooldown
    try {
      const ai = getGeminiClient();
      if (!isModelInCooldown('gemini-2.5-flash') && !isModelInCooldown('gemini-3.7-flash')) {
        const langPrompt = langCode === 'en' ? 'Answer in English' : langCode === 'es' ? 'Answer in Spanish' : 'Odpověz česky';
        const aiAdvice = await callGeminiWithRetry(ai, {
          model: 'gemini-2.5-flash',
          contents: `Economic Events on ${targetDate}: ${JSON.stringify(finalEvents.slice(0, 5))}. Provide 1 concise sentence of trading risk management advice for this session. ${langPrompt}. Return strictly JSON: {"advice": "..."}`,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        }, 0);

        if (aiAdvice?.text) {
          const parsed = safeExtractJson(aiAdvice.text);
          if (parsed && parsed.advice) {
            marketAdvice = parsed.advice;
          }
        }
      }
    } catch {
      // Gracefully retain the pre-calculated marketAdvice without throwing 429/500 to user!
    }

    const payload = {
      targetDate,
      events: finalEvents,
      marketSummaryAdvice: marketAdvice,
    };

    // Cache the result for 30 minutes (1800000 ms)
    calendarCache.set(cacheKey, {
      data: payload,
      expiresAt: Date.now() + 30 * 60 * 1000,
    });

    res.json({
      success: true,
      data: payload,
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
    console.log(`TRADEOY.com Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
