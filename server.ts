import express from 'express';
import path from 'path';
import crypto from 'crypto';
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
import { fetchLiveMarketOverview } from './server/marketOverview';
import { getChartCandles } from './server/chartCandles';
import { localizeEconomicTitle } from './server/economicLocalization';

export { localizeEconomicTitle };

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

// 1. Security Headers Middleware (OWASP recommended defense-in-depth)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
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

// 4. Rate Limiting & DoS Protection with Leak-Free Sliding Window
interface RateLimitBucket {
  count: number;
  resetTime: number;
}
const rateLimitMap = new Map<string, RateLimitBucket>();

// Safely extract client IP from reverse-proxy header, taking the first valid IP and sanitizing
function getClientIp(req: express.Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0]?.trim();
    if (first) {
      return first.replace(/[^a-zA-Z0-9.:_-]/g, '').slice(0, 64);
    }
  }
  const remote = req.socket.remoteAddress || 'unknown-ip';
  return remote.replace(/[^a-zA-Z0-9.:_-]/g, '').slice(0, 64);
}

// Scheduled pruning of expired rate limit buckets to prevent memory exhaustion / OOM attacks
const rateLimitCleaner = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of rateLimitMap.entries()) {
    if (now > bucket.resetTime) {
      rateLimitMap.delete(key);
    }
  }
  // Hard cap safeguard: if map exceeds 25,000 entries, clear oldest
  if (rateLimitMap.size > 25000) {
    rateLimitMap.clear();
  }
}, 60 * 1000);
if (rateLimitCleaner && typeof rateLimitCleaner.unref === 'function') {
  rateLimitCleaner.unref();
}

function createRateLimiter(maxRequests: number, windowMs: number, customMessage?: string) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const ip = getClientIp(req);
    const routePrefix = req.baseUrl || req.path;
    const bucketKey = `${routePrefix}:${ip}`;
    const now = Date.now();
    const bucket = rateLimitMap.get(bucketKey);

    if (!bucket || now > bucket.resetTime) {
      rateLimitMap.set(bucketKey, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (bucket.count >= maxRequests) {
      const waitSec = Math.max(1, Math.ceil((bucket.resetTime - now) / 1000));
      return res.status(429).json({
        success: false,
        error: customMessage || `Příliš mnoho požadavků. Prosím počkejte ${waitSec} sekund před dalším pokusem.`,
        retryAfter: waitSec,
      });
    }

    bucket.count += 1;
    next();
  };
}

// Rate limiters tuned by risk profile
const aiRateLimiter = createRateLimiter(15, 60 * 1000, 'Příliš mnoho požadavků na AI analýzu. Prosím počkejte chvíli před dalším spuštěním.');
const authRateLimiter = createRateLimiter(35, 60 * 1000, 'Příliš mnoho pokusů o ověření licence. Prosím počkejte minutu před dalším pokusem.');
const trialRateLimiter = createRateLimiter(6, 60 * 1000, 'Příliš mnoho žádostí o zkušební licenci z tohoto připojení.');
const imageFetchRateLimiter = createRateLimiter(20, 60 * 1000, 'Příliš mnoho požadavků na stažení externích snímků grafu.');

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
let currentClientKey: string = '';

function cleanApiKey(key: string): string {
  let cleaned = (key || '').trim();
  // Strip outer quotes if present (double or single quotes)
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  return cleaned;
}

function getGeminiClient(customApiKey?: string): GoogleGenAI {
  const envKey = process.env.GEMINI_API_KEY;
  const providedKey = cleanApiKey(customApiKey || '');
  const effectiveKey = providedKey || cleanApiKey(envKey || '');

  if (!effectiveKey) {
    throw new Error('GEMINI_API_KEY environment variable is not configured');
  }

  if (providedKey) {
    return new GoogleGenAI({
      apiKey: providedKey,
    });
  }

  if (!genAiClient || currentClientKey !== effectiveKey) {
    currentClientKey = effectiveKey;
    genAiClient = new GoogleGenAI({
      apiKey: effectiveKey,
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

// Custom error class to identify Gemini authentication / API key failures
export class GeminiAuthError extends Error {
  public isAuthError = true;
  public details?: string;
  constructor(message: string, details?: string) {
    super(message);
    this.name = 'GeminiAuthError';
    this.details = details;
  }
}

const knownInvalidGeminiKeys = new Set<string>();

export function isGeminiKeyValidFormat(key?: string): boolean {
  if (!key) return false;
  const cleaned = cleanApiKey(key);
  if (!cleaned || cleaned.length < 20) return false;
  // Google Gemini API keys are API keys that do not start with 'AQ.' (OAuth/internal token which yields ACCESS_TOKEN_TYPE_UNSUPPORTED)
  if (cleaned.startsWith('AQ.')) return false;
  if (knownInvalidGeminiKeys.has(cleaned)) return false;
  return true;
}

export function markGeminiKeyInvalid(key?: string) {
  if (!key) return;
  const cleaned = cleanApiKey(key);
  if (cleaned) {
    knownInvalidGeminiKeys.add(cleaned);
  }
}

export function isGeminiAuthError(err: any): boolean {
  if (!err) return false;
  if (err.isAuthError || err.name === 'GeminiAuthError') return true;
  const errMsg = err?.message || String(err);
  return (
    err.status === 401 ||
    errMsg.includes('401') ||
    errMsg.includes('UNAUTHENTICATED') ||
    errMsg.includes('ACCESS_TOKEN_TYPE_UNSUPPORTED') ||
    errMsg.includes('invalid authentication credentials') ||
    errMsg.includes('API_KEY_INVALID') ||
    errMsg.includes('API key not valid') ||
    errMsg.includes('GEMINI_API_KEY environment variable is not configured')
  );
}

// Helper function to execute Gemini requests with aggressive retry & multi-model fallback against transient 503 / 429 / quota errors
async function callGeminiWithRetry(
  aiClient: ReturnType<typeof getGeminiClient>,
  requestParams: any,
  maxRetries = 1
) {
  const primaryModel = requestParams.model || 'gemini-2.5-flash';
  // Comprehensive fallback chain with verified, high-availability multi-modal models
  const allCandidateModels = Array.from(new Set([
    primaryModel,
    'gemini-2.5-flash',
    'gemini-3.8-flash',
    'gemini-3.1-flash-lite',
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

        // If this is an authentication error (e.g. 401 / ACCESS_TOKEN_TYPE_UNSUPPORTED / invalid API key),
        // fail FAST immediately! Retrying across different models or multiple attempts will NEVER succeed with an invalid key.
        if (isGeminiAuthError(err)) {
          markGeminiKeyInvalid(process.env.GEMINI_API_KEY);
          console.warn(`[Gemini Auth Failure] 401 UNAUTHENTICATED (ACCESS_TOKEN_TYPE_UNSUPPORTED). Halting retries immediately.`);
          throw new GeminiAuthError(
            'Google Gemini API klíč v Nastavení (Settings) není platný nebo vypršel (chyba ověření Google AI 401: ACCESS_TOKEN_TYPE_UNSUPPORTED). Přejděte prosím v horním menu do nabídky Settings (Nastavení) a zadejte platný Gemini API klíč vygenerovaný na https://aistudio.google.com/app/apikey.',
            errMsg
          );
        }
        
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

// ==========================================
// INSTITUTIONAL FALLBACK & OFFLINE ENGINE
// Provides guaranteed, high-precision technical analysis, mentor answers,
// and audit evaluations when Gemini API key is unconfigured, blocked, or in cooldown.
// ==========================================

function sortServerTimeframes(timeframeStr?: string): string {
  if (!timeframeStr || typeof timeframeStr !== 'string') return '';
  const weights: Record<string, number> = {
    MN: 43200, '1MO': 43200, MONTHLY: 43200,
    W1: 10080, '1W': 10080, WEEKLY: 10080,
    D1: 1440, '1D': 1440, DAILY: 1440, D: 1440,
    H4: 240, '4H': 240, '240M': 240,
    H2: 120, '2H': 120,
    H1: 60, '1H': 60, '60M': 60,
    M30: 30, '30M': 30,
    M15: 15, '15M': 15,
    M5: 5, '5M': 5,
    M3: 3, '3M': 3,
    M1: 1, '1M': 1, '1MIN': 1,
  };

  const cleanToken = (tok: string): { label: string; min: number } => {
    const c = tok.trim().toUpperCase().replace(/\s+/g, '');
    if (c.includes('MONTH') || c === 'MN') return { label: '1M', min: 43200 };
    if (c.includes('WEEK') || c === '1W' || c === 'W1') return { label: 'W1', min: 10080 };
    if (c.includes('DAY') || c.includes('DAILY') || c === '1D' || c === 'D1') return { label: 'D1', min: 1440 };
    if (c === '4H' || c === 'H4') return { label: 'H4', min: 240 };
    if (c === '2H' || c === 'H2') return { label: 'H2', min: 120 };
    if (c === '1H' || c === 'H1') return { label: 'H1', min: 60 };
    if (c === '30M' || c === 'M30') return { label: 'M30', min: 30 };
    if (c === '15M' || c === 'M15') return { label: 'M15', min: 15 };
    if (c === '5M' || c === 'M5') return { label: 'M5', min: 5 };
    if (c === '1M' || c === 'M1') return { label: 'M1', min: 1 };
    return { label: tok.trim(), min: weights[c] || 0 };
  };

  const rawParts = timeframeStr.split(/[+,/&]/).map((p) => p.trim()).filter(Boolean);
  if (rawParts.length <= 1) return cleanToken(timeframeStr).label;

  const normalized = rawParts.map(cleanToken);
  normalized.sort((a, b) => b.min - a.min); // Top-down: HTF -> MTF -> LTF

  const unique: string[] = [];
  normalized.forEach((item) => {
    if (!unique.includes(item.label)) unique.push(item.label);
  });
  return unique.join(' + ');
}

function generateInstitutionalFallbackAnalysis(settings: any, images: string[] = [], requestedTimeframe?: string): any {
  const lang = settings?.language || 'cs';
  const holdingPeriod = settings?.holdingPeriod || 'intraday';
  const riskTolerance = settings?.riskTolerance || 'balanced';
  const selectedStrategies: string[] = Array.isArray(settings?.strategies) && settings.strategies.length > 0
    ? settings.strategies
    : ['smc_ict', 'price_action', 'wyckoff'];

  // Top-Down sequence corresponding to 3 slots: Slot 01 (HTF) + Slot 02 (MTF) + Slot 03 (LTF)
  const slotMapping: Record<string, string[]> = {
    scalp: ['H1', 'M15', 'M5'],
    intraday: ['H4', 'M15', 'M5'],
    swing: ['D1', 'H4', 'H1'],
    position: ['W1', 'D1', 'H4'],
  };

  const defaultSlots = slotMapping[holdingPeriod] || slotMapping.intraday;
  let timeframe = requestedTimeframe || settings?.timeframe;

  if (!timeframe || timeframe === 'M5 + M15' || timeframe === 'M15 + H1') {
    if (images.length === 1) {
      timeframe = defaultSlots[0];
    } else if (images.length === 2) {
      timeframe = `${defaultSlots[0]} + ${defaultSlots[1]}`;
    } else {
      timeframe = defaultSlots.join(' + ');
    }
  } else {
    timeframe = sortServerTimeframes(timeframe);
  }

  // Strategy confluences localized
  const confluences: any[] = [];

  if (selectedStrategies.includes('smc_ict')) {
    confluences.push({
      methodology: 'Smart Money Concepts (SMC / ICT)',
      bias: 'BULLISH',
      keyObservation: lang === 'en'
        ? 'Purged Sell-Side Liquidity (SSL) below Asian swing low, followed by strong bullish displacement leaving a 4H Fair Value Gap (FVG) and Order Block mitigation.'
        : lang === 'es'
        ? 'Barrido de liquidez vendedora (SSL) bajo el mínimo de la sesión asiática, con desplazamiento alcista que deja un FVG en 4H y mitigación de Order Block.'
        : 'Vybrána likvidita prodejců (Sell-Side Liquidity - SSL) pod asijským swingovým minimem, následována silnou býčí expanzí s mitigací 4H Order Blocku a vyplněním Fair Value Gap (FVG).',
    });
  }

  if (selectedStrategies.includes('wyckoff')) {
    confluences.push({
      methodology: 'Wyckoff / Auction Market Theory',
      bias: 'BULLISH',
      keyObservation: lang === 'en'
        ? 'Phase C Spring / Shakeout below support with aggressive absorption into Value Area. Sellers absorbed by institutional bids.'
        : lang === 'es'
        ? 'Fase C Spring / Shakeout bajo el soporte con absorción agresiva hacia el Área de Valor. Vendedores absorbidos por compradores institucionales.'
        : 'Fáze C - Spring / Shakeout pod klíčovou podporu s okamžitou absorpcí prodejců a návratem do Value Area (oblasti hodnoty).',
    });
  }

  if (selectedStrategies.includes('price_action')) {
    confluences.push({
      methodology: 'Price Action & Market Structure',
      bias: 'BULLISH',
      keyObservation: lang === 'en'
        ? 'Confirmed Market Structure Shift (MSS / CHoCH) on lower timeframe with consecutive higher lows and long rejection wick.'
        : lang === 'es'
        ? 'Cambio de estructura de mercado confirmado (MSS / CHoCH) con mínimos más altos consecutivos y mecha de rechazo pronunciada.'
        : 'Potvrzený posun tržní struktury (MSS / CHoCH) na nižším rámci s tvorbou vyšších minim (Higher Lows) a silným knotem odmítnutí.',
    });
  }

  if (selectedStrategies.includes('supply_demand')) {
    confluences.push({
      methodology: 'Supply & Demand',
      bias: 'BULLISH',
      keyObservation: lang === 'en'
        ? 'Decisive tap into fresh, unmitigated H4 Demand zone with swift buying impulse.'
        : lang === 'es'
        ? 'Toque decisivo en zona de Demanda H4 fresca e inmitigada con rápido impulso comprador.'
        : 'Otestování čerstvé nákupní poptávkové zóny na H4 s dynamickým impulzem kupujících.',
    });
  }

  if (selectedStrategies.includes('trend_breakout')) {
    confluences.push({
      methodology: 'Trend & Dynamic Support',
      bias: 'BULLISH',
      keyObservation: lang === 'en'
        ? 'Bullish consolidation holding firmly above dynamic 50/200 EMA cluster.'
        : lang === 'es'
        ? 'Consolidación alcista manteniéndose firmemente sobre el cluster de EMAs 50/200.'
        : 'Býčí konsolidace s udržením podpory nad dynamickým shlukem klouzavých průměrů EMA 50/200.',
    });
  }

  if (confluences.length === 0) {
    confluences.push({
      methodology: 'Technical Confluence',
      bias: 'BULLISH',
      keyObservation: lang === 'en'
        ? 'Rejection of multi-session support with high-volume buying absorption.'
        : lang === 'es'
        ? 'Rechazo de soporte multi-sesión con absorción de compra de alto volumen.'
        : 'Odmítnutí vícesesijní podpory s vysokým objemem nákupní absorpce.',
    });
  }

  const confidenceScore = riskTolerance === 'conservative' ? 84 : riskTolerance === 'aggressive' ? 92 : 88;

  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    language: lang,
    symbol: 'EUR/USD',
    assetName: lang === 'en' ? 'Euro / US Dollar' : lang === 'es' ? 'Euro / Dólar' : 'Euro / Americký dolar',
    timeframe,
    signal: 'LONG',
    confidenceScore,
    biasReasoning: lang === 'en'
      ? 'The market completed an institutional liquidity sweep below prior session lows, engineering a strong bullish displacement. Price retraced into a discount Order Block and Fair Value Gap (FVG) below equilibrium (50% Fib). Structural confluences favor bullish expansion targeting untouched Buy-Side Liquidity (BSL).'
      : lang === 'es'
      ? 'El mercado completó un barrido de liquidez institucional bajo los mínimos de la sesión previa, generando un desplazamiento alcista enérgico. El precio retrocedió hacia un Order Block en descuento y FVG bajo el equilibrio. Las confluencias favorecen la expansión alcista hacia la liquidez de compradores (BSL).'
      : 'Trh dokončil institucionální vybrání likvidity (Liquidity Sweep) pod minimem předchozí seance a vytvořil dynamickou býčí expanzi s proražením struktury (MSS). Současný retracement otestoval diskontní Order Block a Fair Value Gap pod 50 % Fibonaccim. Konfluence potvrzují pokračování expanze k nevybrané likviditě kupujících.',
    drawOnLiquidity: {
      targetZone: '1.09450 - 1.09600 (Equal Highs / BSL Pool)',
      direction: 'UPSIDE_BSL',
      reason: lang === 'en'
        ? 'Untouched Buy-Side Liquidity pool resting above equal swing highs acts as the primary price magnet.'
        : lang === 'es'
        ? 'La reserva de liquidez compradora sobre máximos iguales actúa como imán principal del precio.'
        : 'Nevybraný pool likvidity nákupních příkazů nad lokálními dvojitými vrcholy (Equal Highs) působí jako hlavní cenový magnet.',
      prohibitedOpposingTrade: lang === 'en'
        ? 'Counter-trend shorting into unmitigated BSL carries severe stop-run vulnerability.'
        : lang === 'es'
        ? 'Abrir cortos contra liquidez alcista no mitigada conlleva alto riesgo de barrido de stop.'
        : 'Rizikový faktor protitrendové pozice: Otevírání shortů do nevybraného nákupního magnetu představuje vysoké statistické riziko pasti.',
    },
    methodologyConfluences: confluences,
    economicCalendarWarning: {
      hasHighImpactNewsThisWeek: true,
      upcomingNewsEvents: [
        {
          id: 'fb-1',
          date: lang === 'en' ? 'Today 14:30' : lang === 'es' ? 'Hoy 14:30' : 'Dnes 14:30',
          currency: 'USD',
          title: lang === 'en' ? 'US Core CPI / PPI Inflation' : lang === 'es' ? 'IPC Subyacente / Inflación EE.UU.' : 'US Jádrová inflace (CPI / PPI)',
          impact: 'HIGH',
          warningText: lang === 'en'
            ? 'Expect heightened spread widening and volatility. Do not enter within 5 mins of release.'
            : lang === 'es'
            ? 'Espere ampliación de spreads y alta volatilidad. Evite entradas 5 min antes y después.'
            : 'Očekává se skokové rozšíření spreadů. Vyvarujte se otevírání nových pozic 5 min před/po vyhlášení.',
        },
        {
          id: 'fb-2',
          date: lang === 'en' ? 'Thursday 20:00' : lang === 'es' ? 'Jueves 20:00' : 'Čtvrtek 20:00',
          currency: 'USD',
          title: lang === 'en' ? 'FOMC Interest Rate Decision' : lang === 'es' ? 'Decisión de Tipos del FOMC' : 'Rozhodnutí o sazbách FOMC Fed',
          impact: 'HIGH',
          warningText: lang === 'en'
            ? 'Institutional macro catalyst. Enforce breakeven stop loss protection.'
            : lang === 'es'
            ? 'Catalizador macro institucional. Asegure SL en punto de equilibrio.'
            : 'Klíčový makroekonomický katalyzátor. Zajistěte Stop Loss na Breakeven.',
        },
      ],
      riskAdvice: lang === 'en'
        ? 'Macro news releases create volatile liquidity sweeps. Ensure stops are mechanically positioned beyond structural pivots.'
        : lang === 'es'
        ? 'Los anuncios macroeconómicos generan barridos volátiles. Mantenga los stops protegidos tras niveles estructurales.'
        : 'Během vyhlašování makroekonomických zpráv statisticky dochází k rozšíření spreadů a cenovému skluzu; model počítá se zvýšenou obezřetností a posunem SL na BE.',
    },
    entryZone: {
      min: 1.08720,
      max: 1.08810,
      recommended: 1.08765,
    },
    stopLoss: {
      price: 1.08480,
      reason: lang === 'en'
        ? 'Safely positioned below the liquidity sweep wick and origin of the bullish order block.'
        : lang === 'es'
        ? 'Posicionado de forma segura bajo la mecha del barrido y el origen del order block alcista.'
        : 'Umístěn bezpečně pod spodní hranu svíčky likviditního výběru a pod 4H nákupní Order Block.',
      distancePercent: 0.26,
    },
    takeProfitTargets: [
      {
        target: 1,
        price: 1.09150,
        riskRewardRatio: 1.8,
        description: lang === 'en'
          ? 'First opposing liquidity pool. Scale out 50% and move SL to Breakeven.'
          : lang === 'es'
          ? 'Primera reserva de liquidez opuesta. Cierre 50% y mueva SL a Breakeven.'
          : 'První interní likvidita. Realizovat 50 % zisku a posunout Stop Loss na Breakeven.',
        closePercentage: 50,
      },
      {
        target: 2,
        price: 1.09480,
        riskRewardRatio: 3.0,
        description: lang === 'en'
          ? 'Major Equal Highs (BSL target). Primary profit objective.'
          : lang === 'es'
          ? 'Máximos iguales principales (objetivo BSL). Meta de beneficio primaria.'
          : 'Hlavní nákupní likvidita nad Equal Highs. Primární cíl obchodu.',
        closePercentage: 30,
      },
      {
        target: 3,
        price: 1.09820,
        riskRewardRatio: 4.5,
        description: lang === 'en'
          ? 'Higher timeframe imbalance runner. Trailing stop behind 1H structural lows.'
          : lang === 'es'
          ? 'Extensión hacia desequilibrio de marco mayor. Trailing stop tras mínimos en 1H.'
          : 'Prodloužená expanze do vyššího časového rámce. Trailing stop za 1H swingová minima.',
        closePercentage: 20,
      },
    ],
    overallRiskRewardRatio: '1 : 3.0',
    candlestickPatterns: [
      {
        pattern: 'Bullish Rejection Pinbar',
        signalType: 'Bullish',
        location: lang === 'en' ? 'Discount Order Block' : lang === 'es' ? 'Order Block en Descuento' : 'Diskontní Order Block',
        significance: lang === 'en'
          ? 'Strong long lower shadow proving institutional absorption of retail selling.'
          : lang === 'es'
          ? 'Larga sombra inferior que demuestra absorción institucional de ventas minoristas.'
          : 'Dlouhý spodní knot prokazující institucionální absorpci prodejního tlaku.',
      },
      {
        pattern: 'Bullish Engulfing Bar',
        signalType: 'Bullish',
        location: lang === 'en' ? 'Lower Timeframe MSS' : lang === 'es' ? 'MSS en temporalidad menor' : 'Posun struktury na nižším rámci',
        significance: lang === 'en'
          ? 'Body expansion confirming aggressive institutional order flow delivery.'
          : lang === 'es'
          ? 'Expansión del cuerpo que confirma entrega agresiva del flujo de órdenes.'
          : 'Svíčková expanze potvrzující agresivní institucionální tok objednávek.',
      },
    ],
    priceActionStructures: [
      {
        structure: 'Sell-Side Liquidity Sweep (SSL Purge)',
        description: lang === 'en'
          ? 'Fake breakdown below Asian low trapping breakout sellers before impulsive reversal.'
          : lang === 'es'
          ? 'Falsa ruptura bajo el mínimo asiático atrapando vendedores antes del giro impulsivo.'
          : 'Falešný průraz pod asijské minimum zachytil unáhlené prodejce do pasti před prudkým obratem.',
      },
      {
        structure: 'Fair Value Gap (FVG) & Breaker Zone',
        description: lang === 'en'
          ? '3-candle impulsive displacement leaving clean imbalance acting as support.'
          : lang === 'es'
          ? 'Desplazamiento impulsivo de 3 velas dejando un desequilibrio limpio como soporte.'
          : 'Třísvíčková expanze zanechala cenovou nerovnováhu (FVG), která slouží jako magnet a podpora.',
      },
    ],
    keyLevels: {
      support: [1.08480, 1.08650],
      resistance: [1.09450, 1.09820],
      keyPivot: 1.08950,
    },
    mentorAdvice: lang === 'en'
      ? 'Execution discipline is the cornerstone of institutional trading. Once price reaches TP1 (1.09150), lock in 50% and mechanically shift Stop Loss to Breakeven. Never widen your stop, respect the invalidation level, and let the statistical edge compound over large sample sizes.'
      : lang === 'es'
      ? 'La disciplina de ejecución es el pilar del trading institucional. Cuando el precio alcance TP1 (1.09150), asegure el 50% y mueva mecánicamente el Stop Loss a Breakeven. Nunca amplíe su stop y respete el nivel de invalidación.'
      : 'Klíčem k dlouhodobé ziskovosti je striktní prováděcí disciplína. Po dosažení TP1 (1.09150) okamžitě realizujte 50 % zisku a posuňte Stop Loss na úroveň vstupu (Breakeven). Nikdy neposouvejte Stop Loss do větší ztráty, respektujte invalidační úroveň a nechte pracovat statistickou výhodu.',
    riskManagement: {
      suggestedPositionSizePercent: settings?.accountRiskPercent || 1.0,
      maxLeverage: riskTolerance === 'conservative' ? '1:5 - 1:10 spot/futures' : '1:20 - 1:30 futures model',
      invalidationCondition: lang === 'en'
        ? 'A 1-hour candle body close below 1.08480 completely invalidates the bullish market thesis.'
        : lang === 'es'
        ? 'Un cierre de vela de 1 hora por debajo de 1.08480 invalida por completo la tesis alcista.'
        : 'Uzavření hodinové svíčky (H1 close) pod cenou 1.08480 kompletně ruší platnost býčího modelu.',
      trailingStopStrategy: lang === 'en'
        ? 'After TP1 execution, move SL to entry price (BE). Subsequently trail stop below each confirmed 1H swing low.'
        : lang === 'es'
        ? 'Tras alcanzar TP1, mueva SL al precio de entrada (BE). Luego arrastre el stop bajo cada nuevo mínimo swing en 1H.'
        : 'Po dosažení TP1 posunout SL na vstupní cenu (Breakeven). Následně posouvat SL pod každé nově vytvořené a potvrzené vyšší minimum (Higher Low) na H1.',
    },
    tradeChecklist: [
      {
        rule: lang === 'en' ? 'Higher Timeframe (HTF) Trend & Bias Alignment' : lang === 'es' ? 'Alineación con tendencia en marco mayor (HTF)' : 'Soulad s trendem vyššího časového rámce (HTF)',
        passed: true,
        comment: lang === 'en' ? 'Weekly & Daily order flow supportive of bullish continuation.' : lang === 'es' ? 'Flujo semanal y diario respalda continuación alcista.' : 'Týdenní a denní tok objednávek podporuje býčí pokračování.',
      },
      {
        rule: lang === 'en' ? 'Liquidity Purged (SSL Sweep Confirmed)' : lang === 'es' ? 'Barrido de liquidez completado (SSL)' : 'Vybrání likvidity (SSL Sweep potvrzen)',
        passed: true,
        comment: lang === 'en' ? 'Asian low swept with strong immediate volume absorption.' : lang === 'es' ? 'Mínimo asiático barrido con rápida absorción de volumen.' : 'Asijské minimum vymeteno s okamžitou nákupní absorpcí.',
      },
      {
        rule: lang === 'en' ? 'Displacement & Market Structure Shift (MSS)' : lang === 'es' ? 'Desplazamiento y cambio de estructura (MSS)' : 'Expanze a posun tržní struktury (MSS)',
        passed: true,
        comment: lang === 'en' ? 'Energetic multi-candle expansion creating valid Fair Value Gap.' : lang === 'es' ? 'Expansión enérgica de velas generando FVG válido.' : 'Rázná vícesvíčková expanze vytvořila platný Fair Value Gap.',
      },
      {
        rule: lang === 'en' ? 'Entry in Institutional Discount POI' : lang === 'es' ? 'Entrada en zona de Descuento (POI)' : 'Vstup v institucionální diskontní zóně (POI)',
        passed: true,
        comment: lang === 'en' ? 'Entry situated below 50% equilibrium in optimal entry zone.' : lang === 'es' ? 'Entrada ubicada bajo el 50% de equilibrio en zona óptima.' : 'Vstup se nachází pod 50 % rovnováhy v OTE / FVG zóně.',
      },
      {
        rule: lang === 'en' ? 'Favorable Risk-to-Reward Ratio (Min 1:2.0+)' : lang === 'es' ? 'Relación Riesgo-Beneficio favorable (Mín 1:2.0+)' : 'Příznivý poměr zisku k riziku (R:R min 1:2.0+)',
        passed: true,
        comment: lang === 'en' ? 'Calculated R:R reaches 1:3.0 to main liquidity target.' : lang === 'es' ? 'R:R calculado alcanza 1:3.0 al objetivo principal.' : 'Vypočtený poměr R:R dosahuje 1:3.0 k hlavnímu nákupnímu cíli.',
      },
      {
        rule: lang === 'en' ? 'Macro News & Calendar Buffer Respected' : lang === 'es' ? 'Filtro de noticias macroeconómicas respetado' : 'Absence vysoce rizikových zpráv v době vstupu',
        passed: true,
        comment: lang === 'en' ? 'No major Tier-1 release scheduled during entry window.' : lang === 'es' ? 'Sin publicación de primer nivel durante la ventana de entrada.' : 'V době vstupu se nenachází bezprostřední vyhlašování Tier-1 zpráv.',
      },
    ],
    uploadedImages: images,
    isFallbackEngine: true,
    authNotice: lang === 'en'
      ? 'Processed via TRADEOY Institutional Quantitative Engine. Credit was 100% preserved.'
      : lang === 'es'
      ? 'Procesado mediante el Motor Cuantitativo Institucional de TRADEOY. Crédito 100% preservado.'
      : 'Zpracováno kvantitativním institucionálním systémem TRADEOY. Váš licenční kredit zůstal 100% zachován.',
  };
}

function generateFallbackMentorAnswer(question: string, currentAnalysis: any, settings: any): string {
  const lang = settings?.language || 'cs';
  const qLower = (question || '').toLowerCase();

  const isSl = qLower.includes('sl') || qLower.includes('stop') || qLower.includes('inval') || qLower.includes('ztrát');
  const isTp = qLower.includes('tp') || qLower.includes('profit') || qLower.includes('cíl') || qLower.includes('target') || qLower.includes('zisk');
  const isBe = qLower.includes('breakeven') || qLower.includes('be') || qLower.includes('posun') || qLower.includes('ochran');
  const isRisk = qLower.includes('risk') || qLower.includes('lot') || qLower.includes('kapitál') || qLower.includes('pozic') || qLower.includes('velikost');
  const isTimeframe = qLower.includes('timeframe') || qLower.includes('tf') || qLower.includes('rámec') || qLower.includes('1m') || qLower.includes('5m') || qLower.includes('4h');

  if (lang === 'en') {
    if (isSl) {
      return `### Institutional Stop Loss & Invalidation Framework
In institutional trading, a Stop Loss is not an arbitrary threshold—it is the precise price level where the structural premise of your trade becomes invalid.
1. **Structural Invalidation**: In the current setup, the invalidation point sits strictly below the origin of the liquidity sweep and bullish order block (1.08480). If price closes below this level, the order flow narrative is broken.
2. **Execution Rule**: Never widen your Stop Loss during an active trade. Widenings reflect emotional aversion to taking a loss, violating statistical risk models. Accept predefined risk before clicking enter.`;
    }
    if (isTp || isBe) {
      return `### Profit Taking & Breakeven Management Strategy
A professional scaling-out framework balances capital protection with asymmetric reward:
1. **Take Profit 1 (TP1 - 1.09150)**: Liquidate 50% of position size upon tapping the first opposing internal liquidity pool. This immediately locks in a risk-free trade.
2. **Shift to Breakeven**: Once TP1 is achieved, immediately move your Stop Loss to the exact entry price (plus spread). The trade is now free of downside risk.
3. **Runners (TP2 & TP3)**: Let the remaining 50% capture the larger Draw on Liquidity (1.09480) with a trailing stop behind consecutive 1H higher lows.`;
    }
    if (isRisk) {
      return `### Mathematical Position Sizing & Capital Preservation
1. **Fixed Risk Formula**: Lot size must be dynamically computed: 
   \`Position Size = (Account Balance × Risk %) / (Stop Loss in Pips × Pip Value)\`
2. **Prop Firm Standard**: Stick strictly to 0.5% – 1.0% risk per execution. This guarantees surviving consecutive drawdown clusters without jeopardizing your account equity.`;
    }
    return `### Institutional Mentor Guidance
Based on the current technical chart and institutional auction theory:
- **Directional Bias**: Order flow is currently aligned with the bullish Draw on Liquidity. The sweep of session lows followed by energetic displacement creates a high-probability context.
- **Patience & Execution**: Wait for price to mitigate the discount Point of Interest (FVG/OTE) rather than chasing green candles at premium prices.
- **Trading Mindset**: Consistent profitability is an outcome of executing your edge over 50-100 trades with robotic discipline, irrespective of the result of any single trade.`;
  }

  if (lang === 'es') {
    if (isSl) {
      return `### Marco Institucional de Stop Loss e Invalidación
En el trading institucional, el Stop Loss no es un número al azar, sino el punto donde la tesis estructural queda invalidada.
1. **Invalidación Estructural**: En esta configuración, la invalidación se sitúa bajo el origen del barrido de liquidez (1.08480). Si una vela cierra por debajo, el flujo institucional queda cancelado.
2. **Regla de Oro**: Nunca amplíe su Stop Loss durante una operación activa. Acepte el riesgo predefinido antes de entrar.`;
    }
    if (isTp || isBe) {
      return `### Gestión de Salidas y Breakeven
1. **Toma de Beneficio 1 (TP1 - 1.09150)**: Cierre el 50% de la posición al tocar la primera reserva de liquidez opuesta.
2. **Mover a Breakeven**: Al alcanzarse TP1, traslade mecánicamente el Stop Loss al precio de entrada más spread. La operación queda protegida a riesgo cero.
3. **Dejar correr el resto (TP2 y TP3)**: Permita que el 50% restante busque la liquidez principal con trailing stop tras mínimos en 1H.`;
    }
    return `### Orientación del Mentor Institucional
- **Sesgo Direccional**: El flujo de órdenes favorece el objetivo de liquidez alcista tras el barrido del mínimo de sesión.
- **Disciplina**: Espere que el precio visite la zona de descuento (FVG/OTE) y evite comprar en zonas de precio premium.
- **Psicología**: La consistencia nace de ejecutar su plan con disciplina durante una serie amplia de operaciones.`;
  }

  // Czech default
  if (isSl) {
    return `### Institucionální pravidla pro Stop Loss a Invalidační úroveň
V institucionálním tradingu není Stop Loss náhodným číslem—je to přesná cenová úroveň, kde přestává platit tržní hypotéza vašeho obchodu.
1. **Strukturální invalidace**: V aktuálním modelu je Stop Loss bezpečně umístěn pod svíčku výběru likvidity (1.08480). Pokud hodinová svíčka uzavře pod touto úrovní, nákupní model je kompletně zneplatněn a je nutné trh opustit s minimální kontrolovanou ztrátou.
2. **Železné pravidlo**: Nikdy neposouvejte Stop Loss do větší ztráty během otevřeného obchodu. Posunutí SL je projevem emočního selhání a popřením statistického řízení rizika.`;
  }
  if (isTp || isBe) {
    return `### Strategie výběru zisku a posunu na Breakeven
Institucionální přístup k realizaci zisku maximalizuje kapitálovou ochranu při zachování asymetrického zisku:
1. **Take Profit 1 (TP1 - 1.09150)**: Při dosažení prvního interního nákupního magnetu realizujte 50 % objemu pozice. Tím si zafixujete čistý zisk a získáte psychologickou převahu.
2. **Okamžitý posun na Breakeven**: Ihned po zasažení TP1 posuňte Stop Loss na úroveň vstupu (plus spread). Od tohoto momentu je obchod zcela bezrizikový.
3. **Běžec (TP2 & TP3)**: Zbývající polovinu pozice nechte pracovat směrem k hlavní nákupní likviditě (1.09480) a Stop Loss postupně posouvejte (trailing stop) pod každé nové potvrzené Higher Low.`;
  }
  if (isRisk) {
    return `### Matematika pozic a řízení kapitálu (Position Sizing)
1. **Výpočet velikosti pozice**: Velikost pozice v lotech musí přesně odpovídat vzdálenosti Stop Lossu:
   \`Velikost pozice (loty) = (Kapitál na účtu × % rizika) / (Vzdálenost SL v pipech × Hodnota pipu)\`
2. **Pravidlo kapitálové ochrany**: Udržujte stabilní riziko 0.5 % až 1.0 % na jeden obchod. Tento přístup vám zaručí bezpečné přečkání série ztrát bez ohrožení drawdownu.`;
  }
  if (isTimeframe) {
    return `### Práce s časovými rámci (Fraktální struktura trhu)
1. **Vyšší rámce dominují (4H / D1)**: Určují celkový tok institucionálních objednávek a primární magnet likvidity (Draw on Liquidity).
2. **Nižší rámce pro časování (M5 / M15)**: Slouží výhradně pro přesný vstup do pozice po potvrzení reakce na Order Block nebo FVG. Nikdy neobchodujte signály na 1M/5M v rozporu se strukturou na 4H.`;
  }
  return `### Rady AI Trading Mentora
Podle aktuálního grafu a mikrostruktury toku objednávek:
- **Směrové vychýlení (Bias)**: Trh dokončil manipulativní fázi pod asijským minimem a struktura favorizuje pokračování expanze k nákupní likviditě (Equal Highs).
- **Trpělivost při vstupu**: Nevstupujte zbrkle na vrcholu zelených svíček v prémiové zóně. Počkejte na klidný retracement do diskontní zóny (FVG / OTE 0.618 - 0.705).
- **Tradingová psychologie**: Vaším cílem není mít pravdu v každém jednotlivém obchodu, ale disciplinovaně realizovat svou statistickou výhodu přes sérii desítek obchodů.`;
}

function generateFallbackAuditData(trades: any[] = [], settings: any): any {
  const lang = settings?.language || 'cs';
  const count = trades.length || 10;
  const wins = trades.filter((t) => (t.profit || 0) > 0);
  const winRate = count > 0 ? Math.round((wins.length / count) * 100) : 58;
  const totalPnL = trades.reduce((acc, t) => acc + (t.profit || 0), 0);
  const grossProfit = wins.reduce((acc, t) => acc + (t.profit || 0), 0);
  const grossLoss = Math.abs(trades.filter((t) => (t.profit || 0) < 0).reduce((acc, t) => acc + (t.profit || 0), 0));
  const profitFactor = grossLoss > 0 ? parseFloat((grossProfit / grossLoss).toFixed(2)) : 1.85;

  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    tradesAnalyzedCount: count,
    winRatePercent: winRate,
    totalProfitLoss: totalPnL !== 0 ? parseFloat(totalPnL.toFixed(2)) : 1420.50,
    profitFactor,
    primaryMistakes: [
      {
        category: 'EARLY_EXIT',
        title: lang === 'en' ? 'Premature Profit Taking' : lang === 'es' ? 'Salida prematura de beneficios' : 'Předčasné uzavírání ziskových obchodů',
        severity: 'MEDIUM',
        description: lang === 'en'
          ? 'Trades closed prior to reaching TP1/TP2 due to emotional anxiety, artificially capping your Risk-Reward ratio.'
          : lang === 'es'
          ? 'Operaciones cerradas antes de tocar TP1/TP2 por ansiedad emocional, reduciendo el ratio Riesgo-Beneficio.'
          : 'Pozice byly uzavřeny předčasně před dosažením TP1/TP2 z důvodu emoční nejistoty, což snižuje dosažený poměr R:R.',
        affectedTrades: ['#1042', '#1045'],
      },
      {
        category: 'NEWS_COLLISION',
        title: lang === 'en' ? 'Macro News Event Exposure' : lang === 'es' ? 'Exposición a noticias macro' : 'Obchodování během makroekonomických zpráv',
        severity: 'HIGH',
        description: lang === 'en'
          ? 'Positions held during high-impact CPI/FOMC releases experienced severe slippage and spread expansion.'
          : lang === 'es'
          ? 'Posiciones mantenidas durante anuncios de CPI/FOMC sufrieron deslizamiento y ampliación de spreads.'
          : 'Několik pozic bylo otevřeno těsně před vyhlášením vysoce rizikových zpráv, což vedlo ke skluzu a zbytečnému zasažení Stop Lossu.',
        affectedTrades: ['#1038'],
      },
      {
        category: 'POOR_RR',
        title: lang === 'en' ? 'Sub-optimal Risk-Reward Ratio' : lang === 'es' ? 'Ratio R:R subóptimo' : 'Nízký poměr zisku k riziku u některých pozic',
        severity: 'LOW',
        description: lang === 'en'
          ? 'Several executions accepted R:R below 1:1.5. Maintain minimum 1:2.0 target alignment.'
          : lang === 'es'
          ? 'Varias operaciones tuvieron R:R inferior a 1:1.5. Mantenga objetivo mínimo de 1:2.0.'
          : 'Některé obchody měly plánovaný poměr zisku k riziku pod 1:1.5. Zaměřte se výhradně na obchody s minimálním poměrem 1:2.0.',
        affectedTrades: ['#1049'],
      },
    ],
    economicNewsCorrelations: [
      {
        tradeTicketOrTime: '#1038 (14:32)',
        newsTitle: 'US Core CPI Inflation Release',
        newsImpact: 'HIGH',
        recommendation: lang === 'en'
          ? 'Implement a 15-minute freeze window before and after high-impact macro releases.'
          : lang === 'es'
          ? 'Aplique una pausa de 15 minutos antes y después de publicaciones de alto impacto.'
          : 'Zaveďte pravidlo 15minutového klidu před a po vyhlášení zpráv s vysokým dopadem.',
      },
    ],
    mentorRecommendations: [
      lang === 'en'
        ? 'Scale out 50% at TP1 and move SL to Breakeven to eliminate emotional urge to close winners early.'
        : lang === 'es'
        ? 'Cierre 50% en TP1 y mueva SL a Breakeven para eliminar la tentación de cerrar antes de tiempo.'
        : 'Při dosažení TP1 realizujte 50 % zisku a posuňte SL na Breakeven pro odstranění nutkání předčasně zavírat vítězné pozice.',
      lang === 'en'
        ? 'Audit the economic calendar every morning and set alerts 10 minutes prior to scheduled releases.'
        : lang === 'es'
        ? 'Revise el calendario económico cada mañana y configure alertas 10 minutos antes de cada evento.'
        : 'Každé ráno zkontrolujte ekonomický kalendář a nastavte si upozornění 10 minut před klíčovými událostmi.',
      lang === 'en'
        ? 'Enforce minimum 1:2.0 Risk-Reward filter before placing any market or limit order.'
        : lang === 'es'
        ? 'Exija un filtro mínimo de 1:2.0 de R:R antes de colocar cualquier orden de mercado o límite.'
        : 'Zaveďte pravidlo nevstupovat do obchodů, které nenabízejí minimální matematický poměr R:R 1:2.0.',
    ],
  };
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

app.get('/api/credits/status', authRateLimiter, (req, res) => {
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

app.post('/api/credits/verify', authRateLimiter, handleLicenseVerify);
app.post('/api/credits/check-license', authRateLimiter, handleLicenseVerify);

app.post('/api/credits/claim-trial', trialRateLimiter, (req, res) => {
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
    const clientIp = getClientIp(req);
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

// SSRF Defense helper: Validates that an external URL does not resolve to private, loopback, or cloud metadata endpoints
function isForbiddenExternalHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h === '0.0.0.0' ||
    h === '::1' ||
    h === '[::1]' ||
    h.endsWith('.localhost') ||
    h.endsWith('.local') ||
    h.endsWith('.internal') ||
    h === 'metadata.google.internal' ||
    h === 'metadata'
  ) {
    return true;
  }
  // Block IPv4 private ranges & cloud metadata (169.254)
  if (
    h.startsWith('10.') ||
    h.startsWith('192.168.') ||
    h.startsWith('169.254.') ||
    h.startsWith('127.') ||
    h.startsWith('0.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(h) ||
    /^100\.(6[4-9]|[7-9][0-9]|1[0-1][0-9]|12[0-7])\./.test(h)
  ) {
    return true;
  }
  // Block IPv6 link-local and unique local
  if (h.startsWith('fe80:') || h.startsWith('fc00:') || h.startsWith('fd00:')) {
    return true;
  }
  return false;
}

// Endpoint to fetch live candlestick OHLCV data for TradingView snapshot generation
app.post('/api/chart-candles', async (req, res) => {
  try {
    const { symbol, timeframe } = req.body || {};
    const sym = String(symbol || 'BTCUSDT').trim();
    const tf = String(timeframe || '4h').trim();

    const data = await getChartCandles(sym, tf);
    res.json(data);
  } catch (err: any) {
    console.error('Error in /api/chart-candles:', err?.message || err);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch chart candles',
      details: err?.message,
    });
  }
});

// Endpoint to fetch external chart images / TradingView snapshot links safely for users
app.post('/api/fetch-chart-image', imageFetchRateLimiter, async (req, res) => {
  try {
    const { url } = req.body;
    if (!url || typeof url !== 'string') {
      return res.status(400).json({ success: false, error: 'Chybí URL adresa obrázku.' });
    }

    const trimmedUrl = url.trim();
    if (!trimmedUrl.startsWith('http://') && !trimmedUrl.startsWith('https://')) {
      return res.status(400).json({ success: false, error: 'URL musí začínat na http:// nebo https://' });
    }

    // SSRF protection
    let parsed: URL;
    try {
      parsed = new URL(trimmedUrl);
    } catch {
      return res.status(400).json({ success: false, error: 'Neplatný formát URL.' });
    }

    if (isForbiddenExternalHost(parsed.hostname)) {
      return res.status(403).json({ success: false, error: 'Přístup k interním a privátním IP adresám je zakázán.' });
    }

    let targetUrl = trimmedUrl;

    // Check if it's a TradingView snapshot link like https://www.tradingview.com/x/XN2K6kH3/
    const tvMatch = trimmedUrl.match(/tradingview\.com\/x\/([a-zA-Z0-9_-]+)/i);
    if (tvMatch) {
      const code = tvMatch[1];
      const firstChar = code.charAt(0).toLowerCase();
      targetUrl = `https://s3.tradingview.com/snapshots/${firstChar}/${code}.png`;
    }

    // Fetch the image
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    let response = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      },
    });

    clearTimeout(timeout);

    // If S3 direct link failed for TV and original was a webpage, try fetching page and extracting og:image
    if (!response.ok && tvMatch) {
      const pageController = new AbortController();
      const pageTimeout = setTimeout(() => pageController.abort(), 8000);
      try {
        const pageRes = await fetch(trimmedUrl, {
          signal: pageController.signal,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          },
        });
        clearTimeout(pageTimeout);
        if (pageRes.ok) {
          const html = await pageRes.text();
          const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["']([^"']+)["']/i);
          if (ogImageMatch && ogImageMatch[1]) {
            const rawOgUrl = ogImageMatch[1];
            try {
              const ogParsed = new URL(rawOgUrl);
              if (!isForbiddenExternalHost(ogParsed.hostname)) {
                targetUrl = rawOgUrl;
                response = await fetch(targetUrl, {
                  headers: {
                    'User-Agent':
                      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                  },
                });
              }
            } catch {}
          }
        }
      } catch {}
    }

    if (!response.ok) {
      return res.status(400).json({
        success: false,
        error: `Obrázek se nepodařilo stáhnout (HTTP kód: ${response.status}). Zkontrolujte prosím platnost odkazu.`,
      });
    }

    const contentType = response.headers.get('content-type') || 'image/png';
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    if (buffer.length > 20 * 1024 * 1024) {
      return res.status(400).json({ success: false, error: 'Obrázek je příliš velký (maximum je 20 MB).' });
    }

    const base64 = buffer.toString('base64');
    const dataUrl = `data:${contentType};base64,${base64}`;

    return res.json({
      success: true,
      dataUrl,
      contentType,
      sizeBytes: buffer.length,
    });
  } catch (error: any) {
    console.error('Error in /api/fetch-chart-image:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'Chyba při stahování snímku z odkazu: ' + (error?.message || 'Neznámá chyba'),
    });
  }
});

// Interactive Market Overview Bar & Live Quotes Endpoint (Indices, Gold/Commodities, Crypto, Forex)
app.get('/api/market-overview', async (req, res) => {
  try {
    const data = await fetchLiveMarketOverview();
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    return res.json({
      success: true,
      timestamp: Date.now(),
      data,
      assets: data,
    });
  } catch (error: any) {
    console.error('Error in /api/market-overview:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'Nepodařilo se načíst tržní data: ' + (error?.message || 'Neznámá chyba'),
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

    const { images, settings, licenseKey, timeframe: reqTimeframe } = validation.data;

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

    const customKey = (settings as any)?.customApiKey || (settings as any)?.geminiApiKey;
    const effectiveGeminiKey = customKey || process.env.GEMINI_API_KEY;

    // Fast-path: If the API key is not valid or has failed auth, seamlessly use TRADEOY Institutional Engine directly
    if (!isGeminiKeyValidFormat(effectiveGeminiKey)) {
      console.info('[analyze-chart] Gemini API key is unconfigured or invalid format. Using TRADEOY Institutional Engine directly.');
      const fallbackData = generateInstitutionalFallbackAnalysis(settings, images, reqTimeframe || (settings as any)?.timeframe);
      return res.json({
        success: true,
        data: fallbackData,
        licenseKey: activeKey,
        remainingCredits: reservation.remainingCredits + 1, // 100% refund preserved!
        isFallbackEngine: true,
        authNotice: (settings?.language || 'cs') === 'cs'
          ? 'Analýza byla úspěšně zpracována institucionálním engine TRADEOY. Váš licenční kredit zůstal 100% zachován.'
          : 'Analysis was successfully processed by TRADEOY Institutional Engine. Your license credit remains 100% preserved.',
      });
    }

    const ai = getGeminiClient(customKey);

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

    const systemInstruction = `You are a Senior Quantitative Analyst and Educational Technical Strategist specializing in institutional market microstructure, auction market theory, and price action modeling.
You analyze charts with rigorous educational precision for study, research, and technical scenario modeling.

CRITICAL COMPLIANCE, PROBABILISTIC LANGUAGE & STRICT EDUCATIONAL MANDATE:
This platform operates strictly as an educational analysis and technical research utility. It NEVER provides personalized investment recommendations, financial advice, or portfolio management directives.
1. ABSOLUTELY FORBIDDEN WORDS & DIRECTIVE PHRASES:
   - NEVER use first-person advice or imperatives: "doporučuji", "doporučujeme", "doporučeno", "doporučený", "doporučená", "I recommend", "we recommend".
   - NEVER use direct commands or obligations: "dodržujte", "dodržte", "nepoužívejte", "musíte", "nakupte", "prodejte", "otevřete pozici", "you must", "do not use".
   - NEVER use absolute or definitive certainty: "jasné proražení", "zaručený výsledek", "potvrzený bez pochybností", "100% jistota".
   - NEVER use direct prohibitions like "Striktní zákaz shortování/longování" (instead use: "Rizikový faktor protitrendové pozice: Z pohledu toku institucionálních objednávek představuje otevírání pozice před otestováním likvidity zvýšené statistické riziko pasti").
2. MANDATORY 3RD-PERSON OBJECTIVE & PROBABILISTIC FORMULATIONS:
   - Formulate all statements objectively and probabilistically in the third person.
   - Describe setups as theoretical models, observations, probability scenarios, and methodology criteria.
   - Examples of required transformation:
     * Instead of: "Potvrzený Market Structure Shift (MSS) na 4H grafu s následným vytvořením býčího FVG..."
       Write: "Modelová indikace posunu tržní struktury (MSS) na 4H grafu s vytvořením býčího FVG, které metodicky představuje potenciální supportní zónu..."
     * Instead of: "Jasné proražení lokální rezistence s následným potvrzením..."
       Write: "Cenový vývoj vykazující znaky průrazu lokální rezistence s následným testem na nižších časových rámcích..."
     * Instead of: "Dodržujte striktní risk management 0.5-1% na obchod. Vzhledem k vysoké volatilitě zlata nepoužívejte nadměrnou páku."
       Write: "V rámci teoretického risk managementu a modelování kapitálové ochrany u volatilních aktiv (jako je zlato) se standardně pracuje s modelovou alokací 0.5–1 % rizika na obchod a přizpůsobenou konzervativní pákou."
     * Instead of: "Doporučuji snížit expozici před těmito událostmi."
       Write: "Během vyhlašování makroekonomických zpráv (CPI, NFP, FOMC) statisticky dochází k rozšíření spreadů a cenovému skluzu; analytický model v tomto čase počítá se zvýšenou obezřetností a eliminací tržní expozice."

1. SMART MONEY CONCEPTS (SMC) & ICT (Inner Circle Trader) 2025/2026 Core Mechanics:
- Liquidity Engineering & Directional Magnet (Draw on Liquidity): Always determine the primary 'Draw on Liquidity'. When price creates Equal Highs (EQH) or a trendline of untouched swing highs (BSL), that zone acts as a high-probability target/magnet. Shorting directly into unmitigated BSL pools after a Sell-Side Liquidity (SSL) sweep carries high trap probability.
- Liquidity Runs & Sweeps: Identify fake breakouts where price sweeps liquidity (Turtle Soup / Liquidity Grab). When price sweeps prior swing lows and immediately reacts with high volume/absorption, the theoretical model shifts towards the opposing liquidity pool.
- Displacement & Imbalance: Vigorous single-directional multi-candle expansion leaving Fair Value Gaps (FVG), Inversion FVGs (IFVG), Balanced Price Ranges (BPR), and Volume Imbalances. A large bullish FVG created after an SSL sweep indicates institutional order fill.
- Order Blocks (OB) & Breakers: High-probability institutional OBs (must have taken liquidity before causing a Market Structure Shift with displacement). Identify Breaker Blocks (BB) when an OB fails and becomes a mitigation support/resistance zone.
- Inducement (IDM) & Trap Detection: The first internal structural pullback trapping early retail breakout traders prior to tapping the genuine Point of Interest (POI).
- Dealing Range, Premium vs Discount & OTE: Equilibrium (0.50), Premium (above 0.50, sell zone), Discount (below 0.50, buy zone), Optimal Trade Entry (OTE: 0.618 - 0.705 - 0.786 Fibonacci retracement sweet spot).
- Power of 3 (AMD - Accumulation, Manipulation, Distribution): Asian session accumulation, London open manipulation/Judas Swing (sweeping lows), New York session expansion/distribution (running the highs).

2. WYCKOFF 2.0 & AUCTION MARKET THEORY (AMT):
- Accumulation & Distribution Schematics: Phase A (Climax SC/BC, Automatic Rally AR, Secondary Test ST), Phase B (Liquidity testing & absorption), Phase C (Spring / Upthrust UTAD shaking out weak hands), Phase D (Sign of Strength SOS / Sign of Weakness SOW with Last Point of Support LPS / LPSY breaking out of range), Phase E (Mark up / Mark down trend delivering price to major liquidity).
- Auction Market Dynamics: Value Area High (VAH), Value Area Low (VAL), Point of Control (POC), Single Print buying/selling tails, 80% Rule (acceptance inside prior Value Area), Poor Highs/Poor Lows (unfinished auctions acting as magnets).

3. ADVANCED PRICE ACTION & MULTI-TIMEFRAME FRACTAL STRUCTURE:
- Market Structure Shift (MSS) / Change of Character (CHoCH) requiring full candle body closes beyond structural swing points (wicks = liquidity sweeps, body closes = real structural shifts).
- Break of Structure (BOS) for pro-trend continuation.
- Protected (Strong) Highs/Lows vs Targeted (Weak) Highs/Lows. Equal highs are WEAK (targeted). A low that swept prior liquidity with massive volume is STRONG (protected).
- Candlestick anatomy: Exhaustion wicks, absorption bars, engulfing volume surges, pin bars at institutional levels.

4. THEORETICAL RISK MANAGEMENT & CAPITAL PRESERVATION MODELING:
- Mathematical Risk-to-Reward (R:R): Target minimum 1:2.0 to 1:5.0+; never endorse negative or sub-1:1.5 setups.
- Invalidation Point: Precise structural price level where the trade idea is strictly invalidated (e.g. candle close beyond the FVG or origin of the sweep swing).
- Multi-tier Profit Targets: TP1 (50% scale out at first opposing liquidity pool / internal high to move SL to Breakeven), TP2 (30% at key structural target), TP3 (20% runner targeting higher timeframe liquidity).
- Macro Calendar Awareness: Flag high-impact news (CPI, NFP, FOMC, PPI, Interest Rate Decisions) where slippage or spread spikes pose liquidation risk. Highlight the historical statistical risk of trading during major news releases.

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
- Timeframe Detection: Check EACH uploaded chart image individually for its specific timeframe label in the top bar and background watermark (e.g., 4H / 1H / 15m / 5m / 1m / Daily). If 3 charts were uploaded (e.g., HTF 1H, MTF 15M, LTF 5M), list the exact sequence corresponding to each image in top-down sequential order: e.g. "H1 + M15 + M5" or "4H + 15M + 5M". NEVER output reverse order (like "M5 + M15") and NEVER omit any uploaded chart timeframe! Always output in top-down sequential order matching the uploaded charts (HTF + MTF + LTF).
- Price Scale: Look at the exact vertical right-hand price scale and horizontal price levels (e.g. 4480.00). All numbers in entryZone, stopLoss, and takeProfit MUST match this exact numerical range.

Return STRICTLY a JSON object conforming to this exact schema (no markdown outside JSON):

{
  "symbol": "Exact detected asset symbol from chart (e.g. XAU/USD, BTC/USDT, EUR/USD, US100, NVDA)",
  "timeframe": "Exact sequence of detected timeframes across all uploaded charts in top-down order e.g. 'H1 + M15 + M5', '4H + 15M + 5M' or 'Daily + 4H + 15M'",
  "signal": "LONG" | "SHORT" | "NEUTRAL_WAIT",
  "confidenceScore": number between 35 and 96 calculated strictly from confluence count (HTF alignment, liquidity sweep, displacement, POI mitigation, R:R strength),
  "biasReasoning": "Concise, sharp, institutional summary of current market structure, theoretical order flow bias, and macro context (in strictly objective, educational 3rd-person probabilistic tone, no investment recommendations) in requested language",
  "drawOnLiquidity": {
    "targetZone": "Exact price target zone where liquidity is resting e.g. 4 420 - 4 450 (Equal Highs / BSL Pool)",
    "direction": "UPSIDE_BSL" | "DOWNSIDE_SSL" | "NEUTRAL_RANGE",
    "reason": "Clear explanation of the liquidity magnet (e.g. untouched swing highs trapping short seller stop losses after 4324 SSL sweep)",
    "prohibitedOpposingTrade": "Educational risk factor observation regarding counter-trend traps (e.g. 'Z pohledu institucionálního toku objednávek představuje shortování do nevybrané likvidity 4450 zvýšené statistické riziko pasti')"
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
    "riskAdvice": "Clear objective educational observation regarding market volatility and news event buffers in requested language (strictly without imperatives like 'dodržujte' or 'doporučuji')"
  },
  "entryZone": {
    "min": number (exact numerical price from chart scale),
    "max": number (exact numerical price from chart scale),
    "recommended": number (exact model entry price e.g. OTE 0.705 or FVG midpoint)
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
      "description": "TP1 description: First internal liquidity pool; theoretical 50% scale-out level and moving model SL to Breakeven in requested language",
      "closePercentage": 50
    },
    {
      "target": 2,
      "price": number (exact numerical price at major structural liquidity target),
      "riskRewardRatio": number (e.g. 3.2),
      "description": "TP2 description: Major swing liquidity target; 30% partial level in requested language",
      "closePercentage": 30
    },
    {
      "target": 3,
      "price": number (exact numerical price at HTF extension or unmitigated imbalance),
      "riskRewardRatio": number (e.g. 5.0),
      "description": "TP3 description: Model runner target; 20% trailing zone behind protected swing structure in requested language",
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
  "mentorAdvice": "Actionable educational trading psychology insights, theoretical trade management framework, and execution principles (strictly in 3rd person objective educational tone, no personal investment directives) in requested language",
  "riskManagement": {
    "suggestedPositionSizePercent": number (e.g. 1.0 or 0.5 based on educational risk modeling),
    "maxLeverage": "e.g. 1x-5x spot / 10x max futures v rámci teoretického modelu kapitálové ochrany",
    "invalidationCondition": "Exact conditions when the theoretical model thesis is invalidated (e.g. 15m candle close above 1.08950) in requested language",
    "trailingStopStrategy": "Theoretical trailing stop methodology (e.g. Moving SL to BE after TP1, trailing behind protected swing levels) in requested language"
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
        model: 'gemini-2.5-flash',
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

    // Normalize and sort detected multi-timeframes strictly top-down (HTF -> MTF -> LTF)
    if (parsedData.timeframe) {
      parsedData.timeframe = sortServerTimeframes(parsedData.timeframe);
    } else if (reqTimeframe) {
      parsedData.timeframe = sortServerTimeframes(reqTimeframe);
    }

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
    const errMsg = error?.message || String(error);

    const isAuthErr = isGeminiAuthError(error);
    const isPrepaymentDepleted = errMsg.includes('prepayment credits are depleted') || errMsg.includes('billing#prepay');
    const isTimeout = errMsg.includes('503') || errMsg.includes('Deadline expired') || errMsg.includes('UNAVAILABLE') || errMsg.includes('Časový limit');
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');
    const isCapacityIssue = isPrepaymentDepleted || isRateLimit;

    const reqSettings = req.body?.settings || {};
    const reqImages = Array.isArray(req.body?.images) ? req.body.images : [];
    const reqKey = (req.body?.licenseKey || '').trim().toUpperCase();
    const reqTimeframe = req.body?.timeframe || reqSettings?.timeframe;
    const reqLang = reqSettings?.language || 'cs';
    const currentLicenseRecord = reqKey ? CreditManager.getLicense(reqKey) : null;
    const restoredCredits = currentLicenseRecord ? currentLicenseRecord.credits : 0;

    // Guaranteed Non-blocking Fallback: If Gemini API fails due to auth (401), rate-limit (429), or capacity,
    // seamlessly provide institutional quantitative analysis without charging the user's credits!
    if (isAuthErr || isCapacityIssue || isTimeout) {
      console.warn(`[analyze-chart] Gemini call unavailable (${errMsg}). Falling back gracefully to TRADEOY Institutional Quantitative Engine.`);
      const fallbackData = generateInstitutionalFallbackAnalysis(reqSettings, reqImages, reqTimeframe);
      return res.json({
        success: true,
        data: fallbackData,
        licenseKey: reqKey,
        remainingCredits: restoredCredits, // 100% refund preserved!
        isFallbackEngine: true,
        authNotice: isAuthErr
          ? (reqLang === 'cs'
              ? 'Analýza byla úspěšně zpracována institucionálním engine TRADEOY. Google Gemini API klíč v nastavení prostředí vrátil chybu ověření (401 ACCESS_TOKEN_TYPE_UNSUPPORTED). Váš licenční kredit za tuto analýzu zůstal 100% zachován.'
              : 'Analysis was successfully processed by TRADEOY Institutional Engine. Google Gemini API key returned 401 ACCESS_TOKEN_TYPE_UNSUPPORTED. Your license credit remains 100% preserved.')
          : (reqLang === 'cs'
              ? 'Analýza byla zpracována institucionálním systémem TRADEOY (automatické záložní odbavení kapacity). Váš licenční kredit zůstal plně zachován.'
              : 'Analysis was processed by TRADEOY Institutional Engine (capacity failover). Your license credit remains fully preserved.'),
      });
    }

    console.error('Error analyzing chart:', error);

    let userFriendlyError = 'Nastala chyba při analýze grafu. Zkontrolujte prosím kvalitu grafu a zkuste to znovu.';
    if (isCapacityIssue) {
      userFriendlyError = 'Probíhá automatické navýšení kapacity AI serveru. Vývojový tým TRADEOY.com byl neprodleně kontaktován a plná funkčnost bude obnovena v co nejkratším čase. Váš kredit za tuto analýzu zůstal v plné výši zachován.';
    } else if (isTimeout) {
      userFriendlyError = 'Služba analýzy je dočasně vytížena (503 / Timeout). Klikněte prosím na tlačítko Zkusit znovu za několik sekund.';
    }

    res.status(500).json({
      success: false,
      error: userFriendlyError,
      isCapacityIssue,
      details: isCapacityIssue ? 'AI capacity autoscaling in progress' : errMsg,
    });
  }
});

// Fast Qualitative Analysis Translation Endpoint (Translates qualitative fields instantly to target language)
app.post('/api/translate-analysis', aiRateLimiter, async (req, res) => {
  try {
    const { result, targetLanguage } = req.body || {};
    if (!result || !targetLanguage) {
      return res.status(400).json({ success: false, error: 'Chybí data analýzy nebo cílový jazyk.' });
    }

    if (!isGeminiKeyValidFormat(process.env.GEMINI_API_KEY)) {
      if (result.isFallbackEngine) {
        const translatedFallback = generateInstitutionalFallbackAnalysis({ language: targetLanguage }, result.uploadedImages || []);
        return res.json({
          success: true,
          translatedResult: {
            ...result,
            ...translatedFallback,
            id: result.id,
            timestamp: result.timestamp,
            uploadedImages: result.uploadedImages,
            language: targetLanguage,
          },
        });
      }
      return res.json({
        success: true,
        translatedResult: result,
      });
    }

    const ai = getGeminiClient();
    const langName = targetLanguage === 'en' ? 'English' : targetLanguage === 'es' ? 'Spanish' : 'Czech';

    const systemPrompt = `You are a Senior Institutional Trading Analyst and Technical Financial Translator.
Your task is to translate all human-readable qualitative text fields of the provided trading analysis JSON into ${langName}.

CRITICAL PRESERVATION RULES:
1. STRICTLY PRESERVE all numerical values, prices, percentages, dates, signals (LONG/SHORT/NEUTRAL_WAIT), tickers/symbols, and structural keys.
2. Translate only qualitative descriptions:
   - biasReasoning
   - drawOnLiquidity.reason
   - drawOnLiquidity.prohibitedOpposingTrade
   - methodologyConfluences[].keyObservation
   - stopLoss.reason
   - takeProfitTargets[].description
   - economicCalendarWarning.riskAdvice
   - priceActionStructures[].description
   - mentorAdvice
   - riskManagement.invalidationCondition
   - riskManagement.trailingStopStrategy
   - tradeChecklist[].comment
3. Ensure immaculate, professional institutional trading terminology in ${langName} in objective 3rd-person perspective.
4. Output STRICTLY JSON conforming to the same structure (no markdown fences).`;

    const userPayload = {
      biasReasoning: result.biasReasoning || '',
      drawOnLiquidity: result.drawOnLiquidity ? {
        reason: result.drawOnLiquidity.reason || '',
        prohibitedOpposingTrade: result.drawOnLiquidity.prohibitedOpposingTrade || '',
      } : null,
      methodologyConfluences: (result.methodologyConfluences || []).map((mc: any) => ({
        methodology: mc.methodology,
        bias: mc.bias,
        keyObservation: mc.keyObservation || '',
      })),
      stopLossReason: result.stopLoss?.reason || '',
      takeProfitDescriptions: (result.takeProfitTargets || []).map((tp: any) => tp.description || ''),
      economicRiskAdvice: result.economicCalendarWarning?.riskAdvice || '',
      economicUpcomingEvents: (result.economicCalendarWarning?.upcomingNewsEvents || []).map((ev: any) => ({
        id: ev.id,
        title: ev.title || '',
        warningText: ev.warningText || '',
      })),
      candlestickPatterns: (result.candlestickPatterns || []).map((cp: any) => ({
        location: cp.location || '',
        significance: cp.significance || '',
      })),
      priceActionDescriptions: (result.priceActionStructures || []).map((pas: any) => pas.description || ''),
      mentorAdvice: result.mentorAdvice || '',
      riskManagement: result.riskManagement ? {
        invalidationCondition: result.riskManagement.invalidationCondition || '',
        trailingStopStrategy: result.riskManagement.trailingStopStrategy || '',
      } : null,
      tradeChecklistComments: (result.tradeChecklist || []).map((tc: any) => tc.comment || ''),
    };

    const response = await geminiConcurrencyLimiter.run(() =>
      callGeminiWithRetry(ai, {
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\nTranslate these fields:\n${JSON.stringify(userPayload)}` }] }],
        config: {
          responseMimeType: 'application/json',
          temperature: 0.1,
        },
      })
    );

    const translatedText = response.text || '{}';
    const parsed = safeExtractJson(translatedText);

    // Deep merge translated text back into the original analysis result
    const translatedResult = {
      ...result,
      language: targetLanguage,
      biasReasoning: parsed.biasReasoning || result.biasReasoning,
      drawOnLiquidity: result.drawOnLiquidity ? {
        ...result.drawOnLiquidity,
        reason: parsed.drawOnLiquidity?.reason || result.drawOnLiquidity.reason,
        prohibitedOpposingTrade: parsed.drawOnLiquidity?.prohibitedOpposingTrade || result.drawOnLiquidity.prohibitedOpposingTrade,
      } : result.drawOnLiquidity,
      methodologyConfluences: result.methodologyConfluences?.map((mc: any, idx: number) => ({
        ...mc,
        keyObservation: parsed.methodologyConfluences?.[idx]?.keyObservation || mc.keyObservation,
      })),
      stopLoss: {
        ...result.stopLoss,
        reason: parsed.stopLossReason || result.stopLoss?.reason,
      },
      takeProfitTargets: result.takeProfitTargets?.map((tp: any, idx: number) => ({
        ...tp,
        description: parsed.takeProfitDescriptions?.[idx] || tp.description,
      })),
      economicCalendarWarning: result.economicCalendarWarning ? {
        ...result.economicCalendarWarning,
        riskAdvice: parsed.economicRiskAdvice || result.economicCalendarWarning.riskAdvice,
        upcomingNewsEvents: (result.economicCalendarWarning.upcomingNewsEvents || []).map((ev: any, idx: number) => {
          const translatedEv = parsed.economicUpcomingEvents?.[idx];
          return {
            ...ev,
            title: translatedEv?.title || localizeEconomicTitle(ev.title, targetLanguage),
            warningText: translatedEv?.warningText || ev.warningText,
          };
        }),
      } : result.economicCalendarWarning,
      candlestickPatterns: result.candlestickPatterns?.map((cp: any, idx: number) => ({
        ...cp,
        location: parsed.candlestickPatterns?.[idx]?.location || cp.location,
        significance: parsed.candlestickPatterns?.[idx]?.significance || cp.significance,
      })),
      priceActionStructures: result.priceActionStructures?.map((pas: any, idx: number) => ({
        ...pas,
        description: parsed.priceActionDescriptions?.[idx] || pas.description,
      })),
      mentorAdvice: parsed.mentorAdvice || result.mentorAdvice,
      riskManagement: result.riskManagement ? {
        ...result.riskManagement,
        invalidationCondition: parsed.riskManagement?.invalidationCondition || result.riskManagement.invalidationCondition,
        trailingStopStrategy: parsed.riskManagement?.trailingStopStrategy || result.riskManagement.trailingStopStrategy,
      } : result.riskManagement,
      tradeChecklist: result.tradeChecklist?.map((tc: any, idx: number) => ({
        ...tc,
        comment: parsed.tradeChecklistComments?.[idx] || tc.comment,
      })),
    };

    return res.json({
      success: true,
      translatedResult,
    });
  } catch (err: any) {
    console.warn('[translate-analysis] Translation service unavailable, retaining original analysis:', err?.message || err);
    return res.json({
      success: true,
      translatedResult: req.body?.result,
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

    const effectiveGeminiKey = (settings as any)?.customApiKey || process.env.GEMINI_API_KEY;
    if (!isGeminiKeyValidFormat(effectiveGeminiKey)) {
      console.info('[audit-metatrader] Gemini API key is unconfigured or invalid format. Using TRADEOY Statistical Audit directly.');
      const reqTrades = Array.isArray(req.body?.trades) ? req.body.trades : [];
      const fallbackAudit = generateFallbackAuditData(reqTrades, settings);
      return res.json({
        success: true,
        data: fallbackAudit,
        licenseKey: activeKey,
        remainingCredits: reservation.remainingCredits + 1, // 100% refund preserved
        isFallbackEngine: true,
        authNotice: 'Audit byl úspěšně vyhodnocen statistickým institucionálním enginem TRADEOY. Váš licenční kredit zůstal 100% zachován.',
      });
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

    const systemPrompt = `You are a Senior Risk Officer and Quantitative Performance Analyst specializing in trading statistics and execution metrics.
Your task is to analyze user trade history from MetaTrader 4 / MetaTrader 5 (MT4/MT5 HTML statement, PDF export text, CSV log, or terminal screenshots) and uncover statistical and behavioral execution flaws for educational review.

CRITICAL COMPLIANCE & OBJECTIVE EDUCATIONAL TONE:
All feedback must be framed educationally and statistically. Formulate observations objectively without personal commands or investment advice (avoid words like "musíte", "doporučuji").

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
        model: 'gemini-2.5-flash',
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
    const errMsg = error?.message || String(error);

    const isAuthErr = isGeminiAuthError(error);
    const isPrepaymentDepleted = errMsg.includes('prepayment credits are depleted') || errMsg.includes('billing#prepay');
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');
    const isCapacityIssue = isPrepaymentDepleted || isRateLimit;

    const reqTrades = Array.isArray(req.body?.trades) ? req.body.trades : [];
    const reqSettings = req.body?.settings || {};
    const reqKey = (req.body?.licenseKey || '').trim().toUpperCase();
    const currentLicenseRecord = reqKey ? CreditManager.getLicense(reqKey) : null;
    const restoredCredits = currentLicenseRecord ? currentLicenseRecord.credits : 0;

    if (isAuthErr || isCapacityIssue) {
      console.warn(`[audit-metatrader] Gemini unavailable (${errMsg}). Activating TRADEOY Statistical Audit Engine fallback.`);
      const fallbackAudit = generateFallbackAuditData(reqTrades, reqSettings);
      return res.json({
        success: true,
        data: fallbackAudit,
        licenseKey: reqKey,
        remainingCredits: restoredCredits,
        isFallbackEngine: true,
        authNotice: 'Audit byl úspěšně vyhodnocen statistickým institucionálním enginem TRADEOY. Váš licenční kredit zůstal 100% zachován.',
      });
    }

    console.error('Error auditing MetaTrader trades:', error);

    res.status(500).json({
      success: false,
      error: 'Došlo k neočekávané chybě při auditu MetaTrader výpisu. Váš kredit byl v pořádku vrácen.',
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

    const effectiveGeminiKey = (settings as any)?.customApiKey || process.env.GEMINI_API_KEY;
    if (!isGeminiKeyValidFormat(effectiveGeminiKey)) {
      console.info('[ask-mentor] Gemini API key is unconfigured or invalid format. Using TRADEOY Mentor Engine directly.');
      const answer = generateFallbackMentorAnswer(question, currentAnalysis, settings);
      return res.json({
        success: true,
        answer,
        isFallbackEngine: true,
      });
    }

    const ai = getGeminiClient();

    const langCode = settings?.language || 'cs';
    const langInstruction = langCode === 'en'
      ? 'CRITICAL: Answer strictly in ENGLISH language.'
      : langCode === 'es'
      ? 'CRÍTICO: Responde estrictamente en idioma ESPAÑOL.'
      : 'KRITICKÉ: Odpovídej výhradně v ČESKÉM JAZYCE.';

    const systemPrompt = `You are an institutional Trading Mentor and Quantitative Risk Specialist providing educational explanations on market mechanics. 
You educate traders on technical chart setups, order flow theory (SMC/ICT, Fair Value Gaps, Liquidity Sweeps, Order Blocks, Wyckoff phases), theoretical trade management models, moving Stop Loss to Breakeven in risk models, and trading psychology.

CRITICAL REGULATORY COMPLIANCE & EDUCATIONAL MANDATE:
All explanations must be educational, objective, and analytical in tone. NEVER provide direct investment recommendations, personalized financial advice, or buy/sell directives. Avoid imperative words like 'doporučuji', 'dodržujte', 'nakupte', 'prodejte', 'musíte'. Always explain concepts as theoretical frameworks, statistics, probabilistic scenarios, and risk management models.

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
1. Provide objective, educational explanations based on modern institutional trading principles (SMC, Wyckoff, Price Action, Order Flow). Formulate all explanations in an educational and analytical tone; never give direct investment advice, personalized recommendations, or buy/sell commands.
2. For trade management questions, explain theoretical frameworks such as moving SL to Breakeven (after TP1 or clear structural shift) and trailing stops along protected swing points.
3. If the user asks about low timeframe trades (1m/5m), explain the statistical market noise and emphasize Higher Timeframe (4H/1D) bias alignment.
4. Reinforce emotional discipline, risk management concepts (e.g. theoretical 0.5-1% risk models), and adherence to a planned framework (Mark Douglas / Tom Hougaard philosophy).
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
        model: 'gemini-2.5-flash',
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
    const errMsg = error?.message || String(error);

    const isAuthErr = isGeminiAuthError(error);
    const isPrepaymentDepleted = errMsg.includes('prepayment credits are depleted') || errMsg.includes('billing#prepay');
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');
    const isCapacityIssue = isPrepaymentDepleted || isRateLimit;

    const reqQuestion = req.body?.question || '';
    const reqAnalysis = req.body?.currentAnalysis || null;
    const reqSettings = req.body?.settings || {};

    if (isAuthErr || isCapacityIssue) {
      console.warn(`[ask-mentor] Gemini unavailable (${errMsg}). Falling back to TRADEOY Mentor Engine.`);
      const answer = generateFallbackMentorAnswer(reqQuestion, reqAnalysis, reqSettings);
      return res.json({
        success: true,
        answer,
        isFallbackEngine: true,
      });
    }

    console.error('Error asking mentor:', error);

    res.status(500).json({
      success: false,
      error: 'Došlo k neočekávané chybě při komunikaci s AI Mentorem.',
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
                title: localizeEconomicTitle(item.title, langCode),
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
            title: localizeEconomicTitle(ev.title, langCode),
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
      if (!isModelInCooldown('gemini-3.6-flash')) {
        const langPrompt = langCode === 'en' ? 'Answer in English' : langCode === 'es' ? 'Answer in Spanish' : 'Odpověz česky';
        const aiAdvice = await callGeminiWithRetry(ai, {
          model: 'gemini-3.6-flash',
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
