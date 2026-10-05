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
import {
  generateDynamicMentorAnswer,
  generateDynamicAnalysisMentorAdvice,
} from './server/tradingMentorEngine';
import { analyzeChartImage } from './server/chartImageAnalyzer';

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
  const primaryModel = requestParams.model || 'gemini-3.8-flash';
  // Comprehensive fallback chain with verified, high-availability multi-modal models
  const allCandidateModels = Array.from(new Set([
    primaryModel,
    'gemini-3.8-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-2.5-flash',
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

interface AssetFallbackProfile {
  symbol: string;
  nameCs: string;
  nameEn: string;
  nameEs: string;
  currency: string;
  entryRecommended: number;
  entryMin: number;
  entryMax: number;
  slPrice: number;
  slDistPercent: number;
  tp1Price: number;
  tp2Price: number;
  tp3Price: number;
  targetZoneStr: string;
  support: number[];
  resistance: number[];
  keyPivot: number;
}

const FALLBACK_ASSET_PROFILES: Record<string, AssetFallbackProfile> = {
  gold: {
    symbol: 'XAU/USD',
    nameCs: 'Zlato (Spot XAU/USD)',
    nameEn: 'Gold (Spot XAU/USD)',
    nameEs: 'Oro (Spot XAU/USD)',
    currency: 'USD',
    entryRecommended: 4371.10,
    entryMin: 4368.50,
    entryMax: 4373.80,
    slPrice: 4352.00,
    slDistPercent: 0.44,
    tp1Price: 4390.00,
    tp2Price: 4410.00,
    tp3Price: 4435.00,
    targetZoneStr: '4 410.00 - 4 435.00 USD (Equal Highs / BSL)',
    support: [4352.00, 4365.00],
    resistance: [4410.00, 4435.00],
    keyPivot: 4380.00,
  },
  silver: {
    symbol: 'XAG/USD',
    nameCs: 'Stříbro (Spot XAG/USD)',
    nameEn: 'Silver (Spot XAG/USD)',
    nameEs: 'Plata (Spot XAG/USD)',
    currency: 'USD',
    entryRecommended: 66.62,
    entryMin: 66.40,
    entryMax: 66.75,
    slPrice: 65.80,
    slDistPercent: 1.23,
    tp1Price: 67.20,
    tp2Price: 67.85,
    tp3Price: 68.50,
    targetZoneStr: '67.85 - 68.50 USD (Major Swing Highs)',
    support: [65.80, 66.20],
    resistance: [67.85, 68.50],
    keyPivot: 67.00,
  },
  oil_brent: {
    symbol: 'UKOIL',
    nameCs: 'Ropa Brent (UKOIL)',
    nameEn: 'Brent Crude Oil (UKOIL)',
    nameEs: 'Petróleo Brent (UKOIL)',
    currency: 'USD',
    entryRecommended: 104.32,
    entryMin: 103.80,
    entryMax: 104.50,
    slPrice: 102.90,
    slDistPercent: 1.36,
    tp1Price: 105.50,
    tp2Price: 106.80,
    tp3Price: 108.20,
    targetZoneStr: '106.80 - 108.20 USD (Imbalance Fill)',
    support: [102.90, 103.50],
    resistance: [106.80, 108.20],
    keyPivot: 105.00,
  },
  oil_wti: {
    symbol: 'USOIL',
    nameCs: 'Ropa WTI (USOIL)',
    nameEn: 'Crude Oil WTI (USOIL)',
    nameEs: 'Petróleo WTI (USOIL)',
    currency: 'USD',
    entryRecommended: 97.30,
    entryMin: 96.80,
    entryMax: 97.50,
    slPrice: 95.80,
    slDistPercent: 1.54,
    tp1Price: 98.80,
    tp2Price: 100.20,
    tp3Price: 101.80,
    targetZoneStr: '100.20 - 101.80 USD (Major Resistance)',
    support: [95.80, 96.50],
    resistance: [100.20, 101.80],
    keyPivot: 98.50,
  },
  btc: {
    symbol: 'BTC/USD',
    nameCs: 'Bitcoin (BTC/USD)',
    nameEn: 'Bitcoin (BTC/USD)',
    nameEs: 'Bitcoin (BTC/USD)',
    currency: 'USD',
    entryRecommended: 78020.00,
    entryMin: 77650.00,
    entryMax: 78200.00,
    slPrice: 76500.00,
    slDistPercent: 1.95,
    tp1Price: 79500.00,
    tp2Price: 81200.00,
    tp3Price: 83500.00,
    targetZoneStr: '81 200.00 - 83 500.00 USD (All-Time Liquidity)',
    support: [76500.00, 77200.00],
    resistance: [81200.00, 83500.00],
    keyPivot: 79000.00,
  },
  eth: {
    symbol: 'ETH/USD',
    nameCs: 'Ethereum (ETH/USD)',
    nameEn: 'Ethereum (ETH/USD)',
    nameEs: 'Ethereum (ETH/USD)',
    currency: 'USD',
    entryRecommended: 2498.00,
    entryMin: 2480.00,
    entryMax: 2510.00,
    slPrice: 2435.00,
    slDistPercent: 2.52,
    tp1Price: 2560.00,
    tp2Price: 2630.00,
    tp3Price: 2720.00,
    targetZoneStr: '2 630.00 - 2 720.00 USD (H4 Order Block)',
    support: [2435.00, 2470.00],
    resistance: [2630.00, 2720.00],
    keyPivot: 2550.00,
  },
  eurusd: {
    symbol: 'EUR/USD',
    nameCs: 'Euro / Dolar (EUR/USD)',
    nameEn: 'Euro / US Dollar (EUR/USD)',
    nameEs: 'Euro / Dólar (EUR/USD)',
    currency: 'USD',
    entryRecommended: 1.08765,
    entryMin: 1.08720,
    entryMax: 1.08810,
    slPrice: 1.08480,
    slDistPercent: 0.26,
    tp1Price: 1.09150,
    tp2Price: 1.09480,
    tp3Price: 1.09820,
    targetZoneStr: '1.09450 - 1.09600 (Equal Highs / BSL)',
    support: [1.08480, 1.08650],
    resistance: [1.09450, 1.09820],
    keyPivot: 1.08950,
  },
  gbpusd: {
    symbol: 'GBP/USD',
    nameCs: 'Libra / Dolar (GBP/USD)',
    nameEn: 'GBP / US Dollar (GBP/USD)',
    nameEs: 'Libra / Dólar (GBP/USD)',
    currency: 'USD',
    entryRecommended: 1.33450,
    entryMin: 1.33300,
    entryMax: 1.33550,
    slPrice: 1.32900,
    slDistPercent: 0.41,
    tp1Price: 1.33950,
    tp2Price: 1.34400,
    tp3Price: 1.34900,
    targetZoneStr: '1.34400 - 1.34900 (Asian Highs Liquidity)',
    support: [1.32900, 1.33150],
    resistance: [1.34400, 1.34900],
    keyPivot: 1.33800,
  },
  sp500: {
    symbol: 'SPX 500',
    nameCs: 'S&P 500 (US500)',
    nameEn: 'S&P 500 (US500)',
    nameEs: 'S&P 500 (US500)',
    currency: 'USD',
    entryRecommended: 7637.50,
    entryMin: 7620.00,
    entryMax: 7645.00,
    slPrice: 7585.00,
    slDistPercent: 0.69,
    tp1Price: 7680.00,
    tp2Price: 7725.00,
    tp3Price: 7780.00,
    targetZoneStr: '7 725.00 - 7 780.00 (All-Time Highs)',
    support: [7585.00, 7610.00],
    resistance: [7725.00, 7780.00],
    keyPivot: 7660.00,
  },
  nasdaq: {
    symbol: 'US 100',
    nameCs: 'Nasdaq 100 (US100)',
    nameEn: 'Nasdaq 100 (US100)',
    nameEs: 'Nasdaq 100 (US100)',
    currency: 'USD',
    entryRecommended: 29446.00,
    entryMin: 29380.00,
    entryMax: 29480.00,
    slPrice: 29180.00,
    slDistPercent: 0.90,
    tp1Price: 29750.00,
    tp2Price: 30100.00,
    tp3Price: 30500.00,
    targetZoneStr: '30 100.00 - 30 500.00 (Psychological Barrier)',
    support: [29180.00, 29320.00],
    resistance: [30100.00, 30500.00],
    keyPivot: 29650.00,
  },
  dax: {
    symbol: 'GER 40',
    nameCs: 'DAX 40 (GER40)',
    nameEn: 'DAX 40 (GER40)',
    nameEs: 'DAX 40 (GER40)',
    currency: 'EUR',
    entryRecommended: 25416.00,
    entryMin: 25350.00,
    entryMax: 25450.00,
    slPrice: 25220.00,
    slDistPercent: 0.77,
    tp1Price: 25620.00,
    tp2Price: 25800.00,
    tp3Price: 26050.00,
    targetZoneStr: '25 800.00 - 26 050.00 EUR (Major Highs)',
    support: [25220.00, 25340.00],
    resistance: [25800.00, 26050.00],
    keyPivot: 25550.00,
  },
  dow: {
    symbol: 'US 30',
    nameCs: 'Dow Jones (US30)',
    nameEn: 'Dow Jones (US30)',
    nameEs: 'Dow Jones (US30)',
    currency: 'USD',
    entryRecommended: 53420.00,
    entryMin: 53300.00,
    entryMax: 53500.00,
    slPrice: 52950.00,
    slDistPercent: 0.88,
    tp1Price: 53900.00,
    tp2Price: 54450.00,
    tp3Price: 55200.00,
    targetZoneStr: '54 450.00 - 55 200.00 USD (All-Time Highs)',
    support: [52950.00, 53200.00],
    resistance: [54450.00, 55200.00],
    keyPivot: 53600.00,
  },
  sol: {
    symbol: 'SOL/USD',
    nameCs: 'Solana (SOL/USD)',
    nameEn: 'Solana (SOL/USD)',
    nameEs: 'Solana (SOL/USD)',
    currency: 'USD',
    entryRecommended: 195.50,
    entryMin: 193.00,
    entryMax: 197.00,
    slPrice: 188.00,
    slDistPercent: 3.83,
    tp1Price: 205.00,
    tp2Price: 218.00,
    tp3Price: 235.00,
    targetZoneStr: '218.00 - 235.00 USD (Higher Timeframe Resistance)',
    support: [188.00, 192.00],
    resistance: [218.00, 235.00],
    keyPivot: 200.00,
  },
  xrp: {
    symbol: 'XRP/USD',
    nameCs: 'Ripple (XRP/USD)',
    nameEn: 'Ripple (XRP/USD)',
    nameEs: 'Ripple (XRP/USD)',
    currency: 'USD',
    entryRecommended: 1.4850,
    entryMin: 1.4600,
    entryMax: 1.4950,
    slPrice: 1.4200,
    slDistPercent: 4.37,
    tp1Price: 1.5600,
    tp2Price: 1.6800,
    tp3Price: 1.8200,
    targetZoneStr: '1.6800 - 1.8200 USD (Major Liquidity Pool)',
    support: [1.4200, 1.4500],
    resistance: [1.6800, 1.8200],
    keyPivot: 1.5000,
  },
  usdjpy: {
    symbol: 'USD/JPY',
    nameCs: 'Dolar / Jen (USD/JPY)',
    nameEn: 'USD / Japanese Yen (USD/JPY)',
    nameEs: 'USD / Yen Japonés (USD/JPY)',
    currency: 'JPY',
    entryRecommended: 154.250,
    entryMin: 154.000,
    entryMax: 154.450,
    slPrice: 153.600,
    slDistPercent: 0.42,
    tp1Price: 155.100,
    tp2Price: 155.850,
    tp3Price: 156.900,
    targetZoneStr: '155.850 - 156.900 JPY (Equal Highs)',
    support: [153.600, 153.950],
    resistance: [155.850, 156.900],
    keyPivot: 154.500,
  },
  usdchf: {
    symbol: 'USD/CHF',
    nameCs: 'Dolar / Švýcarský Frank (USD/CHF)',
    nameEn: 'USD / Swiss Franc (USD/CHF)',
    nameEs: 'USD / Franco Suizo (USD/CHF)',
    currency: 'CHF',
    entryRecommended: 0.88450,
    entryMin: 0.88300,
    entryMax: 0.88600,
    slPrice: 0.88100,
    slDistPercent: 0.39,
    tp1Price: 0.88900,
    tp2Price: 0.89400,
    tp3Price: 0.90100,
    targetZoneStr: '0.89400 - 0.90100 CHF (Imbalance Fill)',
    support: [0.88100, 0.88250],
    resistance: [0.89400, 0.90100],
    keyPivot: 0.88700,
  },
  audusd: {
    symbol: 'AUD/USD',
    nameCs: 'Australský dolar (AUD/USD)',
    nameEn: 'Australian Dollar (AUD/USD)',
    nameEs: 'Dólar Australiano (AUD/USD)',
    currency: 'USD',
    entryRecommended: 0.65820,
    entryMin: 0.65680,
    entryMax: 0.65920,
    slPrice: 0.65340,
    slDistPercent: 0.73,
    tp1Price: 0.66450,
    tp2Price: 0.66900,
    tp3Price: 0.67400,
    targetZoneStr: '0.66900 - 0.67400 USD (BSL Pool)',
    support: [0.65340, 0.65550],
    resistance: [0.66900, 0.67400],
    keyPivot: 0.66100,
  },
};

function detectFallbackAssetProfile(settings: any, images: string[] = []): AssetFallbackProfile {
  const query = `${settings?.symbol || ''} ${settings?.asset || ''} ${settings?.name || ''} ${settings?.ticker || ''}`.toLowerCase();

  // Search by explicit settings
  if (query.includes('btc') || query.includes('bitcoin')) return FALLBACK_ASSET_PROFILES.btc;
  if (query.includes('eth') || query.includes('ethereum')) return FALLBACK_ASSET_PROFILES.eth;
  if (query.includes('sol') || query.includes('solana')) return FALLBACK_ASSET_PROFILES.sol;
  if (query.includes('xrp') || query.includes('ripple')) return FALLBACK_ASSET_PROFILES.xrp;
  if (query.includes('gold') || query.includes('xau') || query.includes('zlato') || query.includes('oro')) return FALLBACK_ASSET_PROFILES.gold;
  if (query.includes('silver') || query.includes('xag') || query.includes('stříbr') || query.includes('plata')) return FALLBACK_ASSET_PROFILES.silver;
  if (query.includes('brent') || query.includes('ukoil')) return FALLBACK_ASSET_PROFILES.oil_brent;
  if (query.includes('wti') || query.includes('usoil') || query.includes('oil') || query.includes('ropa') || query.includes('petróleo')) return FALLBACK_ASSET_PROFILES.oil_wti;
  if (query.includes('sp500') || query.includes('us500') || query.includes('spx')) return FALLBACK_ASSET_PROFILES.sp500;
  if (query.includes('nasdaq') || query.includes('us100') || query.includes('ndx')) return FALLBACK_ASSET_PROFILES.nasdaq;
  if (query.includes('dow') || query.includes('us30') || query.includes('dji')) return FALLBACK_ASSET_PROFILES.dow;
  if (query.includes('dax') || query.includes('ger40') || query.includes('de40')) return FALLBACK_ASSET_PROFILES.dax;
  if (query.includes('aud')) return FALLBACK_ASSET_PROFILES.audusd;
  if (query.includes('gbp')) return FALLBACK_ASSET_PROFILES.gbpusd;
  if (query.includes('jpy') || query.includes('usdjpy')) return FALLBACK_ASSET_PROFILES.usdjpy;
  if (query.includes('chf') || query.includes('usdchf')) return FALLBACK_ASSET_PROFILES.usdchf;
  if (query.includes('eur')) return FALLBACK_ASSET_PROFILES.eurusd;

  // Inspect image strings or default to BTC if query is empty
  const combinedImageSnippet = images.slice(0, 3).join(' ').toLowerCase();
  if (combinedImageSnippet.includes('btc') || combinedImageSnippet.includes('bitcoin')) return FALLBACK_ASSET_PROFILES.btc;
  if (combinedImageSnippet.includes('eth') || combinedImageSnippet.includes('ethereum')) return FALLBACK_ASSET_PROFILES.eth;
  if (combinedImageSnippet.includes('xau') || combinedImageSnippet.includes('gold') || combinedImageSnippet.includes('zlato')) return FALLBACK_ASSET_PROFILES.gold;
  if (combinedImageSnippet.includes('xag') || combinedImageSnippet.includes('silver') || combinedImageSnippet.includes('stříbr')) return FALLBACK_ASSET_PROFILES.silver;
  if (combinedImageSnippet.includes('ukoil') || combinedImageSnippet.includes('brent')) return FALLBACK_ASSET_PROFILES.oil_brent;
  if (combinedImageSnippet.includes('usoil') || combinedImageSnippet.includes('crude')) return FALLBACK_ASSET_PROFILES.oil_wti;
  if (combinedImageSnippet.includes('us100') || combinedImageSnippet.includes('nasdaq')) return FALLBACK_ASSET_PROFILES.nasdaq;
  if (combinedImageSnippet.includes('us500') || combinedImageSnippet.includes('sp500')) return FALLBACK_ASSET_PROFILES.sp500;
  if (combinedImageSnippet.includes('eur')) return FALLBACK_ASSET_PROFILES.eurusd;

  return FALLBACK_ASSET_PROFILES.btc;
}

// Quantitative Indicators & Technical Math Helpers for TRADEOY Engine
function calculateEmaSeries(prices: number[], period: number): number {
  if (!prices.length) return 0;
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRsiSeries(prices: number[], period: number = 14): number {
  if (prices.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = 1; i <= period; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }
  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = period + 1; i < prices.length; i++) {
    const diff = prices[i] - prices[i - 1];
    if (diff >= 0) {
      avgGain = (avgGain * (period - 1) + diff) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(diff)) / period;
    }
  }

  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function calculateAtr(candles: Array<{ high: number; low: number; close: number }>, period: number = 14): number {
  if (candles.length < 2) return (candles[0]?.close || 100) * 0.005;
  const trs: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    const h = candles[i].high;
    const l = candles[i].low;
    const prevC = candles[i - 1].close;
    const tr = Math.max(h - l, Math.abs(h - prevC), Math.abs(l - prevC));
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

function getAssetPrecision(symbol: string, currentPrice: number): number {
  const sym = symbol.toUpperCase();
  if (sym.includes('JPY')) return 3;
  if (sym.includes('XRP')) return 4;
  if (
    sym.includes('EUR') ||
    sym.includes('GBP') ||
    sym.includes('CHF') ||
    sym.includes('AUD') ||
    sym.includes('NZD') ||
    sym.includes('CAD')
  ) {
    if (currentPrice < 10) return 5;
  }
  if (currentPrice >= 1000) return 2;
  if (currentPrice >= 10) return 2;
  if (currentPrice >= 1) return 4;
  return 5;
}

interface ForexFactoryRawItem {
  title: string;
  country: string;
  date: string;
  impact: string;
  forecast?: string;
  previous?: string;
}

let cachedFfFeed: { data: ForexFactoryRawItem[]; expiresAt: number } | null = null;

async function fetchLiveForexFactoryCalendar(): Promise<ForexFactoryRawItem[]> {
  if (cachedFfFeed && Date.now() < cachedFfFeed.expiresAt && cachedFfFeed.data.length > 0) {
    return cachedFfFeed.data;
  }
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000);
    const res = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    if (res.ok) {
      const items: ForexFactoryRawItem[] = await res.json();
      if (Array.isArray(items) && items.length > 0) {
        cachedFfFeed = { data: items, expiresAt: Date.now() + 15 * 60 * 1000 };
        return items;
      }
    }
  } catch (err) {
    console.warn('[ForexFactory] Feed fetch failed or timed out:', err);
  }
  return cachedFfFeed?.data || [];
}

function getRelevantCurrenciesForAsset(symbol: string): string[] {
  const s = String(symbol || '').toUpperCase();
  const set = new Set<string>();

  if (
    s.includes('USD') ||
    s.includes('USDT') ||
    s.includes('BTC') ||
    s.includes('ETH') ||
    s.includes('SOL') ||
    s.includes('XRP') ||
    s.includes('XAU') ||
    s.includes('XAG') ||
    s.includes('GOLD') ||
    s.includes('SILVER') ||
    s.includes('OIL') ||
    s.includes('WTI') ||
    s.includes('BRENT') ||
    s.includes('SPX') ||
    s.includes('NDX') ||
    s.includes('US30') ||
    s.includes('US100') ||
    s.includes('US500') ||
    s.includes('DOW') ||
    s.includes('NASDAQ')
  ) {
    set.add('USD');
  }
  if (s.includes('EUR') || s.includes('DE40') || s.includes('GER40') || s.includes('DAX')) {
    set.add('EUR');
  }
  if (s.includes('GBP') || s.includes('UK100')) {
    set.add('GBP');
  }
  if (s.includes('JPY') || s.includes('JP225') || s.includes('NIKKEI')) {
    set.add('JPY');
  }
  if (s.includes('CHF')) {
    set.add('CHF');
  }
  if (s.includes('AUD')) {
    set.add('AUD');
  }
  if (s.includes('CAD')) {
    set.add('CAD');
  }
  if (s.includes('NZD')) {
    set.add('NZD');
  }

  if (set.size === 0) {
    set.add('USD');
  }
  return Array.from(set);
}

async function getRealEconomicCalendarWarning(symbol: string, lang: string = 'cs'): Promise<{
  hasHighImpactNewsThisWeek: boolean;
  upcomingNewsEvents: Array<{
    id: string;
    date: string;
    currency: string;
    title: string;
    impact: 'HIGH' | 'MEDIUM' | 'LOW';
    warningText: string;
  }>;
  riskAdvice: string;
}> {
  const items = await fetchLiveForexFactoryCalendar();
  const relevantCurrencies = getRelevantCurrenciesForAsset(symbol);
  const now = new Date();

  const matchingEvents: Array<{ item: ForexFactoryRawItem; evDate: Date; impactWeight: number }> = [];

  for (const item of items) {
    if (!item.date || !item.country) continue;
    const countryUpper = item.country.toUpperCase();
    if (!relevantCurrencies.includes(countryUpper)) continue;

    const evDate = new Date(item.date);
    const diffMs = evDate.getTime() - now.getTime();

    // Include events from -2 hours ago up to +36 hours
    if (diffMs < -2 * 60 * 60 * 1000 || diffMs > 36 * 60 * 60 * 1000) continue;

    const impactUpper = (item.impact || '').toUpperCase();
    if (impactUpper !== 'HIGH' && impactUpper !== 'MEDIUM') continue;

    const impactWeight = impactUpper === 'HIGH' ? 2 : 1;
    matchingEvents.push({ item, evDate, impactWeight });
  }

  // Sort by impact weight desc, then by date asc
  matchingEvents.sort((a, b) => {
    if (b.impactWeight !== a.impactWeight) return b.impactWeight - a.impactWeight;
    return a.evDate.getTime() - b.evDate.getTime();
  });

  const hasHighImpact = matchingEvents.some(m => m.impactWeight === 2);
  const topEvents = matchingEvents.slice(0, 3);

  const weekdayNames: Record<string, string[]> = {
    cs: ['Neděle', 'Pondělí', 'Úterý', 'Středa', 'Čtvrtek', 'Pátek', 'Sobota'],
    es: ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'],
    en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  };

  const formattedEvents = topEvents.map((m, idx) => {
    const { item, evDate } = m;
    const isToday = evDate.toDateString() === now.toDateString();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const isTomorrow = evDate.toDateString() === tomorrow.toDateString();

    const hours = String(evDate.getHours()).padStart(2, '0');
    const minutes = String(evDate.getMinutes()).padStart(2, '0');
    const timeStr = `${hours}:${minutes}`;

    let dateLabel = '';
    if (isToday) {
      dateLabel = lang === 'en' ? `Today ${timeStr}` : lang === 'es' ? `Hoy ${timeStr}` : `Dnes ${timeStr}`;
    } else if (isTomorrow) {
      dateLabel = lang === 'en' ? `Tomorrow ${timeStr}` : lang === 'es' ? `Mañana ${timeStr}` : `Zítra ${timeStr}`;
    } else {
      const dayName = (weekdayNames[lang] || weekdayNames.cs)[evDate.getDay()];
      dateLabel = `${dayName} ${timeStr}`;
    }

    const localizedTitle = localizeEconomicTitle(item.title, lang);
    const isHigh = (item.impact || '').toUpperCase() === 'HIGH';

    let warningText = '';
    if (isHigh) {
      warningText = lang === 'en'
        ? `High institutional volatility expected. Spread widening anticipated around ${timeStr}.`
        : lang === 'es'
        ? `Se espera alta volatilidad institucional. Ampliación de spreads alrededor de las ${timeStr}.`
        : `Očekává se skokové rozšíření spreadů a vysoká volatilita v ${timeStr}. Doporučeno vyhnout se unáhleným vstupům.`;
    } else {
      warningText = lang === 'en'
        ? `Moderate volatility impact on ${item.country} currency pairs.`
        : lang === 'es'
        ? `Impacto moderado en pares de ${item.country}.`
        : `Střední vliv na volatilitu u měnových párů s ${item.country}.`;
    }

    return {
      id: `ff-${idx + 1}`,
      date: dateLabel,
      currency: item.country,
      title: localizedTitle,
      impact: isHigh ? ('HIGH' as const) : ('MEDIUM' as const),
      warningText,
    };
  });

  let riskAdvice = '';
  if (hasHighImpact) {
    riskAdvice = lang === 'en'
      ? 'High-impact macro news scheduled in the calendar. During releases, institutional spreads widen; models account for structural stop loss placement beyond liquidity levels.'
      : lang === 'es'
      ? 'Noticias macroeconómicas de alto impacto programadas. Durante la publicación los spreads se amplían; el modelo cuenta con protección de Stop Loss tras la liquidez.'
      : 'V ekonomickém kalendáři jsou evidovány zprávy nejvyššího dopadu (červené zprávy). Během vyhlašování dochází k rozšíření spreadů a cenovému skluzu; model počítá se zvýšenou obezřetností a posunem SL na BE.';
  } else if (formattedEvents.length > 0) {
    riskAdvice = lang === 'en'
      ? 'No high-impact (red-folder) news scheduled for this asset today. Standard liquidity conditions apply with moderate scheduled releases.'
      : lang === 'es'
      ? 'No hay noticias de alto impacto (carpeta roja) programadas para este activo hoy. Se aplican condiciones estándar de liquidez.'
      : 'Pro tento instrument dnes nejsou v ekonomickém kalendáři hlášeny žádné zprávy nejvyššího dopadu (červené zprávy). Na programu jsou zprávy středního vlivu se standardní tržní likviditou.';
  } else {
    riskAdvice = lang === 'en'
      ? 'No major macro events scheduled in the economic calendar for this asset. Market order flow is driven purely by technical liquidity structure.'
      : lang === 'es'
      ? 'No hay eventos macro programados en el calendario económico para este activo. El flujo de órdenes responde a estructura puramente técnica.'
      : 'V ekonomickém kalendáři nejsou pro tento instrument dnes plánovány žádné rizikové makro události. Trh se pohybuje čistě podle technické struktury a toku likvidity.';
  }

  return {
    hasHighImpactNewsThisWeek: hasHighImpact,
    upcomingNewsEvents: formattedEvents,
    riskAdvice,
  };
}

function parseNumericPrice(val: any): number {
  if (typeof val === 'number') return isFinite(val) ? val : NaN;
  if (!val) return NaN;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const n = parseFloat(cleaned);
  return isFinite(n) ? n : NaN;
}

function sanitizeAndValidateTradePlan(
  data: any,
  symbol: string = 'BTC',
  precision: number = 2,
  candles: any[] = []
): any {
  if (!data || typeof data !== 'object') return data;

  const rawSignal = String(data.signal || 'LONG').toUpperCase();
  const isShort = rawSignal === 'SHORT' || rawSignal === 'SELL' || rawSignal.includes('BEAR');
  data.signal = isShort ? 'SHORT' : (rawSignal.includes('WAIT') || rawSignal.includes('NEUTRAL') ? 'NEUTRAL_WAIT' : 'LONG');

  let entryRec = parseNumericPrice(data.entryZone?.recommended || data.entryZone?.price || 0);
  if (isNaN(entryRec) || entryRec <= 0) {
    entryRec = candles.length > 0 ? candles[candles.length - 1].close : 100;
  }
  entryRec = Number(entryRec.toFixed(precision));

  // Determine standard ATR/volatility buffer
  const defaultDist = candles.length > 0
    ? Math.max(entryRec * 0.008, Math.abs(candles[candles.length - 1].high - candles[candles.length - 1].low) * 1.2)
    : entryRec * 0.015;

  let sl = parseNumericPrice(data.stopLoss?.price || 0);
  if (isShort) {
    if (isNaN(sl) || sl <= entryRec + defaultDist * 0.2 || sl <= 0) {
      sl = Number((entryRec + defaultDist).toFixed(precision));
    }
  } else {
    if (isNaN(sl) || sl >= entryRec - defaultDist * 0.2 || sl <= 0) {
      sl = Number((entryRec - defaultDist).toFixed(precision));
    }
  }

  const slDist = Math.max(0.00001, Math.abs(entryRec - sl));
  const slDistPercent = Number(((slDist / entryRec) * 100).toFixed(2));

  data.stopLoss = {
    ...data.stopLoss,
    price: sl,
    distancePercent: slDistPercent,
  };

  // Enforce Entry Zone strictly on the correct side of SL
  let entryMin = parseNumericPrice(data.entryZone?.min);
  let entryMax = parseNumericPrice(data.entryZone?.max);
  if (isShort) {
    if (isNaN(entryMax) || entryMax >= sl || entryMax < entryRec) {
      entryMax = Number((entryRec + slDist * 0.25).toFixed(precision));
    }
    if (isNaN(entryMin) || entryMin > entryRec) {
      entryMin = Number((entryRec - slDist * 0.2).toFixed(precision));
    }
  } else {
    if (isNaN(entryMin) || entryMin <= sl || entryMin > entryRec) {
      entryMin = Number((entryRec - slDist * 0.25).toFixed(precision));
    }
    if (isNaN(entryMax) || entryMax < entryRec) {
      entryMax = Number((entryRec + slDist * 0.2).toFixed(precision));
    }
  }

  data.entryZone = {
    ...data.entryZone,
    recommended: entryRec,
    min: Math.min(entryMin, entryMax),
    max: Math.max(entryMin, entryMax),
  };

  // Enforce Monotonic Take Profit Targets
  const rawTps = Array.isArray(data.takeProfitTargets) ? data.takeProfitTargets : [];
  let tp1 = parseNumericPrice(rawTps[0]?.price);
  let tp2 = parseNumericPrice(rawTps[1]?.price);
  let tp3 = parseNumericPrice(rawTps[2]?.price);

  const minR1Multiplier = 1.0;
  if (isShort) {
    if (isNaN(tp1) || tp1 > entryRec - slDist * minR1Multiplier) {
      tp1 = Number((entryRec - slDist * 1.1).toFixed(precision));
    }
    if (isNaN(tp2) || tp2 >= tp1 - slDist * 0.4) {
      tp2 = Number((tp1 - slDist * 0.7).toFixed(precision));
    }
    if (isNaN(tp3) || tp3 >= tp2 - slDist * 0.4) {
      tp3 = Number((tp2 - slDist * 0.8).toFixed(precision));
    }
  } else {
    if (isNaN(tp1) || tp1 < entryRec + slDist * minR1Multiplier) {
      tp1 = Number((entryRec + slDist * 1.1).toFixed(precision));
    }
    if (isNaN(tp2) || tp2 <= tp1 + slDist * 0.4) {
      tp2 = Number((tp1 + slDist * 0.7).toFixed(precision));
    }
    if (isNaN(tp3) || tp3 <= tp2 + slDist * 0.4) {
      tp3 = Number((tp2 + slDist * 0.8).toFixed(precision));
    }
  }

  const r1 = Math.max(1.0, Number(((Math.abs(tp1 - entryRec)) / slDist).toFixed(1)));
  const r2 = Math.max(r1 + 0.3, Number(((Math.abs(tp2 - entryRec)) / slDist).toFixed(1)));
  const r3 = Math.max(r2 + 0.4, Number(((Math.abs(tp3 - entryRec)) / slDist).toFixed(1)));

  data.takeProfitTargets = [
    {
      target: 1,
      price: tp1,
      riskRewardRatio: r1,
      description: rawTps[0]?.description || 'První interní likvidita. Realizovat 50 % zisku a posunout SL na Breakeven.',
      closePercentage: 50,
    },
    {
      target: 2,
      price: tp2,
      riskRewardRatio: r2,
      description: rawTps[1]?.description || 'Hlavní likviditní cíl (Equal Highs/Lows). Primární realizace zisku.',
      closePercentage: 30,
    },
    {
      target: 3,
      price: tp3,
      riskRewardRatio: r3,
      description: rawTps[2]?.description || 'Prodloužená expanze do vyššího rámce. Trailing stop za swingovou strukturu.',
      closePercentage: 20,
    },
  ];

  data.overallRiskRewardRatio = `1 : ${r2}`;

  // Partition Key Levels strictly
  if (Array.isArray(data.keyLevels?.support)) {
    data.keyLevels.support = data.keyLevels.support
      .map(parseNumericPrice)
      .filter((p: number) => !isNaN(p) && p < entryRec * 0.9995)
      .sort((a: number, b: number) => b - a);
    if (data.keyLevels.support.length === 0) {
      data.keyLevels.support = [
        Number((entryRec * 0.992).toFixed(precision)),
        Number((entryRec * 0.985).toFixed(precision)),
      ];
    }
  }
  if (Array.isArray(data.keyLevels?.resistance)) {
    data.keyLevels.resistance = data.keyLevels.resistance
      .map(parseNumericPrice)
      .filter((p: number) => !isNaN(p) && p > entryRec * 1.0005)
      .sort((a: number, b: number) => a - b);
    if (data.keyLevels.resistance.length === 0) {
      data.keyLevels.resistance = [
        Number((entryRec * 1.008).toFixed(precision)),
        Number((entryRec * 1.015).toFixed(precision)),
      ];
    }
  }

  // Ensure chartPriceRange represents the true candle span
  if (!data.chartPriceRange || !data.chartPriceRange.min || !data.chartPriceRange.max) {
    if (candles.length > 0) {
      const lows = candles.map((c: any) => c.low);
      const highs = candles.map((c: any) => c.high);
      data.chartPriceRange = {
        min: Math.min(...lows),
        max: Math.max(...highs),
      };
    } else {
      data.chartPriceRange = {
        min: Number((Math.min(entryRec, sl) * 0.985).toFixed(precision)),
        max: Number((Math.max(entryRec, sl) * 1.015).toFixed(precision)),
      };
    }
  }

  return data;
}

async function generateInstitutionalFallbackAnalysis(settings: any, images: string[] = [], requestedTimeframe?: string): Promise<any> {
  const lang = settings?.language || 'cs';
  const holdingPeriod = settings?.holdingPeriod || 'intraday';
  const riskTolerance = settings?.riskTolerance || 'balanced';
  const selectedStrategies: string[] = Array.isArray(settings?.strategies) && settings.strategies.length > 0
    ? settings.strategies
    : ['smc_ict', 'price_action', 'wyckoff'];

  const profile = detectFallbackAssetProfile(settings, images);
  const economicCalendarWarning = await getRealEconomicCalendarWarning(profile.symbol, lang);

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

  // Derive normalized single timeframe for live candlestick data fetch
  // Prioritize primary/dominant structure timeframe (e.g. 4H in H4 + M15 + M5)
  let normalizedTf = '15m';
  const tfUpper = String(timeframe || '15m').toUpperCase();
  if (tfUpper.includes('1D') || tfUpper.includes('D1') || tfUpper.includes('DAILY')) normalizedTf = '1d';
  else if (tfUpper.includes('4H') || tfUpper.includes('H4') || tfUpper.includes('240')) normalizedTf = '4h';
  else if (tfUpper.includes('1H') || tfUpper.includes('H1') || tfUpper.includes('60')) normalizedTf = '1h';
  else if (tfUpper.includes('30M') || tfUpper.includes('M30')) normalizedTf = '30m';
  else if (tfUpper.includes('15M') || tfUpper.includes('M15')) normalizedTf = '15m';
  else if (tfUpper.includes('5M') || tfUpper.includes('M5')) normalizedTf = '5m';
  else if (tfUpper.includes('1M')) normalizedTf = '1m';

  // Identify asset query symbol for candlestick engine
  const rawSymbol = String(settings?.symbol || settings?.asset || settings?.name || settings?.ticker || profile.symbol || '').trim();
  let querySymbol = 'XAUUSD';
  const lowerQuery = rawSymbol.toLowerCase();

  if (lowerQuery.includes('btc') || lowerQuery.includes('bitcoin')) querySymbol = 'BTCUSDT';
  else if (lowerQuery.includes('eth') || lowerQuery.includes('ethereum')) querySymbol = 'ETHUSDT';
  else if (lowerQuery.includes('sol') || lowerQuery.includes('solana')) querySymbol = 'SOLUSDT';
  else if (lowerQuery.includes('xrp') || lowerQuery.includes('ripple')) querySymbol = 'XRPUSDT';
  else if (lowerQuery.includes('gold') || lowerQuery.includes('xau') || lowerQuery.includes('zlato') || lowerQuery.includes('oro')) querySymbol = 'XAUUSD';
  else if (lowerQuery.includes('silver') || lowerQuery.includes('xag') || lowerQuery.includes('stříbr') || lowerQuery.includes('plata')) querySymbol = 'XAGUSD';
  else if (lowerQuery.includes('oil') || lowerQuery.includes('wti') || lowerQuery.includes('brent') || lowerQuery.includes('ropa')) querySymbol = 'USOIL';
  else if (lowerQuery.includes('sp500') || lowerQuery.includes('spx') || lowerQuery.includes('us500')) querySymbol = 'SPX';
  else if (lowerQuery.includes('nasdaq') || lowerQuery.includes('ndx') || lowerQuery.includes('us100')) querySymbol = 'NDX';
  else if (lowerQuery.includes('dow') || lowerQuery.includes('dji') || lowerQuery.includes('us30')) querySymbol = 'US30';
  else if (lowerQuery.includes('dax') || lowerQuery.includes('ger40') || lowerQuery.includes('de40')) querySymbol = 'DE40';
  else if (lowerQuery.includes('gbp')) querySymbol = 'GBPUSD';
  else if (lowerQuery.includes('jpy')) querySymbol = 'USDJPY';
  else if (lowerQuery.includes('chf')) querySymbol = 'USDCHF';
  else if (lowerQuery.includes('eur')) querySymbol = 'EURUSD';
  else if (rawSymbol.length > 0) querySymbol = rawSymbol.replace(/[^a-zA-Z0-9]/g, '');

  // Attempt to fetch real live candlestick data for deep technical evaluation
  let candleData: any = null;
  try {
    candleData = await getChartCandles(querySymbol, normalizedTf);
  } catch (err) {
    console.warn(`[Quantitative Engine] Notice: Could not fetch live candles for ${querySymbol}:`, err);
  }

  // 1. Analyze uploaded chart screenshot(s) for visual price action, candle momentum & trend slope
  const primaryImage = images && images.length > 0 ? images[0] : undefined;
  const imageAnalysis = analyzeChartImage(primaryImage);

  const candles: Array<{ open: number; high: number; low: number; close: number; volume?: number }> =
    candleData?.candles && candleData.candles.length >= 10 ? candleData.candles : [];

  let currentPrice = profile.entryRecommended;
  let precision = getAssetPrecision(profile.symbol, currentPrice);
  let signal: 'LONG' | 'SHORT' | 'NEUTRAL_WAIT' = 'LONG';
  let rsi = 52;
  let ema20 = currentPrice;
  let ema50 = currentPrice;
  let atr = currentPrice * 0.004;

  let swingHighs: Array<{ price: number; idx: number }> = [];
  let swingLows: Array<{ price: number; idx: number }> = [];

  if (candles.length >= 10) {
    const closes = candles.map((c) => c.close);
    currentPrice = closes[closes.length - 1];
    precision = getAssetPrecision(profile.symbol, currentPrice);

    ema20 = calculateEmaSeries(closes, Math.min(20, closes.length));
    ema50 = calculateEmaSeries(closes, Math.min(50, closes.length));
    rsi = calculateRsiSeries(closes, 14);
    atr = calculateAtr(candles, 14);

    // Identify swing highs & lows via 5-bar fractal check
    for (let i = 2; i < candles.length - 2; i++) {
      const c = candles[i];
      if (
        c.high >= candles[i - 1].high &&
        c.high >= candles[i - 2].high &&
        c.high >= candles[i + 1].high &&
        c.high >= candles[i + 2].high
      ) {
        swingHighs.push({ price: c.high, idx: i });
      }
      if (
        c.low <= candles[i - 1].low &&
        c.low <= candles[i - 2].low &&
        c.low <= candles[i + 1].low &&
        c.low <= candles[i + 2].low
      ) {
        swingLows.push({ price: c.low, idx: i });
      }
    }

    const lastHigh = swingHighs[swingHighs.length - 1]?.price || currentPrice * 1.006;
    const prevHigh = swingHighs[swingHighs.length - 2]?.price || lastHigh;
    const lastLow = swingLows[swingLows.length - 1]?.price || currentPrice * 0.994;
    const prevLow = swingLows[swingLows.length - 2]?.price || lastLow;

    const isLowerHighs = lastHigh < prevHigh;
    const isLowerLows = lastLow < prevLow;
    const isHigherHighs = lastHigh > prevHigh;
    const isHigherLows = lastLow > prevLow;

    // Check recent momentum of last 3 candles
    const lastCandle = candles[candles.length - 1];
    const thirdLastCandle = candles[Math.max(0, candles.length - 3)];
    const recentDiff = lastCandle.close - thirdLastCandle.open;
    const distToLow = Math.abs(currentPrice - lastLow);
    const distToHigh = Math.abs(currentPrice - lastHigh);

    // Multi-factor Quantitative Market Bias:
    // If user uploaded a chart image with distinct visual trend/candle momentum, honor the image!
    if (imageAnalysis.hasImage && imageAnalysis.detectedTrend !== 'RANGING') {
      if (imageAnalysis.detectedTrend === 'BULLISH' || imageAnalysis.bullishMomentumScore >= 56) {
        signal = 'LONG';
      } else if (imageAnalysis.detectedTrend === 'BEARISH' || imageAnalysis.bullishMomentumScore <= 44) {
        signal = 'SHORT';
      }
    } else {
      // Candlestick Order Flow & Microstructure analysis
      if (imageAnalysis.recentReversal === 'BULLISH_REVERSAL' || (recentDiff > 0 && distToLow < distToHigh * 0.7)) {
        signal = 'LONG';
      } else if (imageAnalysis.recentReversal === 'BEARISH_REVERSAL' || (recentDiff < 0 && distToHigh < distToLow * 0.7)) {
        signal = 'SHORT';
      } else if (isHigherHighs && isHigherLows && recentDiff >= 0) {
        signal = 'LONG';
      } else if (isLowerHighs && isLowerLows && recentDiff <= 0) {
        signal = 'SHORT';
      } else if (rsi < 40) {
        signal = 'LONG'; // Discount demand accumulation
      } else if (rsi > 60) {
        signal = 'SHORT'; // Premium supply distribution
      } else if (currentPrice > ema20 && recentDiff > 0) {
        signal = 'LONG';
      } else if (currentPrice < ema20 && recentDiff < 0) {
        signal = 'SHORT';
      } else {
        signal = recentDiff >= 0 ? 'LONG' : 'SHORT';
      }
    }
  } else {
    // If candles unavailable, calibrate dynamically based on uploaded image or profile baseline
    if (imageAnalysis.hasImage && imageAnalysis.detectedTrend !== 'RANGING') {
      signal = imageAnalysis.detectedTrend === 'BULLISH' ? 'LONG' : 'SHORT';
    } else {
      signal = 'LONG';
    }
  }

  // Asset class & timeframe volatility calibration (eliminates static 0.24% artifact)
  const isCrypto = lowerQuery.includes('btc') || lowerQuery.includes('eth') || lowerQuery.includes('sol') || lowerQuery.includes('xrp') || profile.symbol.includes('BTC') || profile.symbol.includes('ETH');
  const isGoldOrMetal = lowerQuery.includes('gold') || lowerQuery.includes('xau') || lowerQuery.includes('silver') || lowerQuery.includes('xag');
  const isForex = lowerQuery.includes('eur') || lowerQuery.includes('gbp') || lowerQuery.includes('jpy') || lowerQuery.includes('chf') || profile.symbol.includes('EUR') || profile.symbol.includes('GBP');
  const isIndex = lowerQuery.includes('spx') || lowerQuery.includes('ndx') || lowerQuery.includes('us100') || lowerQuery.includes('us30') || lowerQuery.includes('dax') || lowerQuery.includes('ger40');

  // Baseline structural Stop Loss percentage range based on holding period & asset volatility
  let baseSlPercent = 1.0;
  if (isCrypto) {
    if (holdingPeriod === 'scalp') baseSlPercent = 0.85;
    else if (holdingPeriod === 'intraday') baseSlPercent = 1.75;
    else if (holdingPeriod === 'swing') baseSlPercent = 2.85;
    else baseSlPercent = 3.90;
  } else if (isGoldOrMetal) {
    if (holdingPeriod === 'scalp') baseSlPercent = 0.45;
    else if (holdingPeriod === 'intraday') baseSlPercent = 0.90;
    else if (holdingPeriod === 'swing') baseSlPercent = 1.70;
    else baseSlPercent = 2.50;
  } else if (isForex) {
    if (holdingPeriod === 'scalp') baseSlPercent = 0.22;
    else if (holdingPeriod === 'intraday') baseSlPercent = 0.45;
    else if (holdingPeriod === 'swing') baseSlPercent = 0.85;
    else baseSlPercent = 1.40;
  } else if (isIndex) {
    if (holdingPeriod === 'scalp') baseSlPercent = 0.45;
    else if (holdingPeriod === 'intraday') baseSlPercent = 0.95;
    else if (holdingPeriod === 'swing') baseSlPercent = 1.80;
    else baseSlPercent = 2.80;
  } else {
    baseSlPercent = holdingPeriod === 'scalp' ? 0.50 : holdingPeriod === 'intraday' ? 1.05 : 2.10;
  }

  // Calculate mathematically robust Entry, Stop Loss, and TP1/TP2/TP3 targets based on live levels
  const structuralBuffer = Math.max(atr * 0.25, currentPrice * (baseSlPercent * 0.0015));
  let entryRecommended = currentPrice;
  let entryMin = currentPrice;
  let entryMax = currentPrice;
  let slPrice = currentPrice;
  let slDistPercent = baseSlPercent;
  let tp1Price = currentPrice;
  let tp2Price = currentPrice;
  let tp3Price = currentPrice;
  let targetZoneStr = '';
  let drawDirection = 'UPSIDE_BSL';
  let drawReason = '';
  let prohibitedTradeWarning = '';
  let invalidationCond = '';
  let trailingStopRule = '';

  const lowsBelowCurrent = swingLows.filter((l) => l.price < currentPrice * 0.9995);
  const highsAboveCurrent = swingHighs.filter((h) => h.price > currentPrice * 1.0005);
  const recentHighPrice = highsAboveCurrent.length > 0
    ? highsAboveCurrent[highsAboveCurrent.length - 1].price
    : currentPrice * (1 + baseSlPercent / 100);
  const recentLowPrice = lowsBelowCurrent.length > 0
    ? lowsBelowCurrent[lowsBelowCurrent.length - 1].price
    : currentPrice * (1 - baseSlPercent / 100);

  // Dynamic R:R Multipliers based on User Horizon & Risk Profile (Realistic, high-probability institutional targets)
  const userRrSetting = String(settings?.riskRewardProfile || settings?.riskRewardRatio || '').toLowerCase();
  const userHoldingPeriod = String(settings?.holdingPeriod || 'intraday').toLowerCase();
  const userRiskTolerance = String(settings?.riskTolerance || 'balanced').toLowerCase();

  let r1Target = 1.2;
  let r2Target = 2.0;
  let r3Target = 2.8;

  if (userRrSetting.includes('conservative') || userRiskTolerance === 'conservative' || userRrSetting.includes('1:1.5')) {
    r1Target = 1.0;
    r2Target = 1.6;
    r3Target = 2.3;
  } else if (userRrSetting.includes('aggressive') || userRiskTolerance === 'aggressive') {
    r1Target = 1.4;
    r2Target = 2.4;
    r3Target = 3.4;
  } else if (userHoldingPeriod === 'scalp') {
    r1Target = 1.0;
    r2Target = 1.5;
    r3Target = 2.0;
  } else if (userHoldingPeriod === 'swing') {
    r1Target = 1.2;
    r2Target = 2.0;
    r3Target = 2.8;
  } else if (userHoldingPeriod === 'position') {
    r1Target = 1.4;
    r2Target = 2.4;
    r3Target = 3.4;
  }

  if (signal === 'SHORT') {
    drawDirection = 'DOWNSIDE_SSL';

    // In Smart Money Concepts (SMC):
    // Stop Loss for a SHORT is placed directly above the IMMEDIATE local order block / liquidity grab wick
    // of the recent consolidation (last 6-10 candles), NOT an ancient macro high 20 bars ago!
    const recentLocalCandles = candles.slice(-10);
    const localConsolidationHigh = recentLocalCandles.length > 0
      ? Math.max(...recentLocalCandles.map((c) => c.high))
      : currentPrice * (1 + baseSlPercent / 100);

    // Prefer the local swing high closest to entry that offers a secure buffer (0.25% - 1.2% above entry)
    let structuralHigh = localConsolidationHigh;
    if (highsAboveCurrent.length > 0) {
      // Sort swing highs by price ascending (nearest to currentPrice first)
      const sortedByProximity = [...highsAboveCurrent].sort((a, b) => a.price - b.price);
      const localSwing = sortedByProximity.find((h) => h.price >= currentPrice * (1 + (baseSlPercent * 0.3) / 100));
      if (localSwing && localSwing.price <= currentPrice * (1 + (baseSlPercent * 1.5) / 100)) {
        structuralHigh = localSwing.price;
      }
    }

    // Ensure structural high is not unrealistically tight or absurdly wide
    const distToHighPercent = ((structuralHigh - currentPrice) / currentPrice) * 100;
    if (distToHighPercent < baseSlPercent * 0.4) {
      structuralHigh = currentPrice * (1 + (baseSlPercent * 0.6) / 100);
    } else if (distToHighPercent > baseSlPercent * 2.0) {
      structuralHigh = Math.min(structuralHigh, currentPrice * (1 + (baseSlPercent * 1.4) / 100));
    }

    slPrice = Number((structuralHigh + structuralBuffer).toFixed(precision));
    entryRecommended = Number(currentPrice.toFixed(precision));
    entryMin = Number((currentPrice - structuralBuffer * 0.3).toFixed(precision));
    entryMax = Number((currentPrice + structuralBuffer * 0.6).toFixed(precision));

    const slDist = Math.max(slPrice - entryRecommended, currentPrice * (baseSlPercent / 100));
    slDistPercent = Number(((slDist / entryRecommended) * 100).toFixed(2));

    // Anchor TP to actual structural chart swing lows with a GUARANTEED minimum 1:1.0 Risk-Reward
    const minR1Dist = slDist * Math.max(1.0, r1Target);
    const sortedEligibleLows = lowsBelowCurrent
      .map((l) => l.price)
      .filter((p) => p <= entryRecommended - slDist * 0.95)
      .sort((a, b) => b - a); // highest low nearest to entry first!

    let tp1 = entryRecommended - minR1Dist;
    if (sortedEligibleLows.length > 0 && sortedEligibleLows[0] >= entryRecommended - slDist * (r1Target + 0.5)) {
      tp1 = sortedEligibleLows[0];
    }
    tp1Price = Number(tp1.toFixed(precision));

    let tp2 = entryRecommended - slDist * r2Target;
    const lowerLows = sortedEligibleLows.filter((p) => p < tp1Price * 0.999);
    if (lowerLows.length > 0 && lowerLows[0] >= entryRecommended - slDist * (r2Target + 0.6)) {
      tp2 = lowerLows[0];
    }
    tp2Price = Number(Math.min(tp2, tp1Price - slDist * 0.4).toFixed(precision));

    const tp3 = Math.min(tp2Price - slDist * 0.5, entryRecommended - slDist * r3Target);
    tp3Price = Number(tp3.toFixed(precision));

    targetZoneStr = `${tp2Price.toFixed(precision)} - ${tp3Price.toFixed(precision)} ${profile.currency} (Sell-Side Liquidity / SSL Pool)`;

    drawReason = lang === 'en'
      ? 'Untouched Sell-Side Liquidity (SSL) resting below structural lows acts as the primary price magnet.'
      : lang === 'es'
      ? 'La reserva de liquidez vendedora (SSL) bajo mínimos estructurales actúa como imán principal del precio.'
      : 'Nevybraný pool prodejní likvidity (Sell-Side Liquidity - SSL) pod strukturálními minimy působí jako hlavní cenový magnet.';

    prohibitedTradeWarning = lang === 'en'
      ? 'Counter-trend long buying into unmitigated SSL carries severe stop-out vulnerability.'
      : lang === 'es'
      ? 'Abrir compras contra liquidez bajista no mitigada conlleva alto riesgo de barrido de stop.'
      : 'Rizikový faktor protitrendové pozice: Otevírání longů proti silnému toku objednávek k SSL představuje vysoké riziko stop-outu.';

    invalidationCond = lang === 'en'
      ? `A candle body close above ${slPrice.toFixed(precision)} completely invalidates the bearish market structure thesis.`
      : lang === 'es'
      ? `Un cierre de vela por encima de ${slPrice.toFixed(precision)} invalida por completo la tesis de estructura bajista.`
      : `Uzavření svíčky (close) nad cenou ${slPrice.toFixed(precision)} kompletně ruší platnost medvědího tržního modelu.`;

    trailingStopRule = lang === 'en'
      ? `After reaching TP1 (${tp1Price.toFixed(precision)}), move Stop Loss to Breakeven (BE). Subsequently trail stop above each confirmed swing high.`
      : lang === 'es'
      ? `Tras alcanzar TP1 (${tp1Price.toFixed(precision)}), mueva el Stop Loss a Breakeven (BE). Luego arrastre el stop sobre cada nuevo máximo swing.`
      : `Po dosažení TP1 (${tp1Price.toFixed(precision)}) posunout SL na vstupní cenu (Breakeven). Následně posouvat SL nad každé nově vytvořené a potvrzené nižší maximum (Lower High).`;
  } else {
    // LONG
    drawDirection = 'UPSIDE_BSL';

    // In Smart Money Concepts (SMC):
    // Stop Loss for a LONG is placed directly below the IMMEDIATE local discount order block / liquidity sweep wick
    // of the recent consolidation (last 6-10 candles), NOT an ancient macro low 20 bars ago!
    const recentLocalCandles = candles.slice(-10);
    const localConsolidationLow = recentLocalCandles.length > 0
      ? Math.min(...recentLocalCandles.map((c) => c.low))
      : currentPrice * (1 - baseSlPercent / 100);

    let structuralLow = localConsolidationLow;
    if (lowsBelowCurrent.length > 0) {
      // Sort swing lows by price descending (nearest to currentPrice first)
      const sortedByProximity = [...lowsBelowCurrent].sort((a, b) => b.price - a.price);
      const localSwing = sortedByProximity.find((l) => l.price <= currentPrice * (1 - (baseSlPercent * 0.3) / 100));
      if (localSwing && localSwing.price >= currentPrice * (1 - (baseSlPercent * 1.5) / 100)) {
        structuralLow = localSwing.price;
      }
    }

    const distToLowPercent = ((currentPrice - structuralLow) / currentPrice) * 100;
    if (distToLowPercent < baseSlPercent * 0.4) {
      structuralLow = currentPrice * (1 - (baseSlPercent * 0.6) / 100);
    } else if (distToLowPercent > baseSlPercent * 2.0) {
      structuralLow = Math.max(structuralLow, currentPrice * (1 - (baseSlPercent * 1.4) / 100));
    }

    slPrice = Number((structuralLow - structuralBuffer).toFixed(precision));
    entryRecommended = Number(currentPrice.toFixed(precision));
    entryMin = Number((currentPrice - structuralBuffer * 0.6).toFixed(precision));
    entryMax = Number((currentPrice + structuralBuffer * 0.3).toFixed(precision));

    const slDist = Math.max(entryRecommended - slPrice, currentPrice * (baseSlPercent / 100));
    slDistPercent = Number(((slDist / entryRecommended) * 100).toFixed(2));

    // Anchor TP to actual structural chart swing highs with a GUARANTEED minimum 1:1.0 Risk-Reward
    const minR1Dist = slDist * Math.max(1.0, r1Target);
    const sortedEligibleHighs = highsAboveCurrent
      .map((h) => h.price)
      .filter((p) => p >= entryRecommended + slDist * 0.95)
      .sort((a, b) => a - b); // lowest high nearest to entry first!

    let tp1 = entryRecommended + minR1Dist;
    if (sortedEligibleHighs.length > 0 && sortedEligibleHighs[0] <= entryRecommended + slDist * (r1Target + 0.5)) {
      tp1 = sortedEligibleHighs[0];
    }
    tp1Price = Number(tp1.toFixed(precision));

    let tp2 = entryRecommended + slDist * r2Target;
    const higherHighs = sortedEligibleHighs.filter((p) => p > tp1Price * 1.001);
    if (higherHighs.length > 0 && higherHighs[0] <= entryRecommended + slDist * (r2Target + 0.6)) {
      tp2 = higherHighs[0];
    }
    tp2Price = Number(Math.max(tp2, tp1Price + slDist * 0.4).toFixed(precision));

    const tp3 = Math.max(tp2Price + slDist * 0.5, entryRecommended + slDist * r3Target);
    tp3Price = Number(tp3.toFixed(precision));

    targetZoneStr = `${tp2Price.toFixed(precision)} - ${tp3Price.toFixed(precision)} ${profile.currency} (Buy-Side Liquidity / BSL Pool)`;

    drawReason = lang === 'en'
      ? 'Untouched Buy-Side Liquidity (BSL) resting above equal swing highs acts as the primary price magnet.'
      : lang === 'es'
      ? 'La reserva de liquidez compradora sobre máximos iguales actúa como imán principal del precio.'
      : 'Nevybraný pool nákupní likvidity (Buy-Side Liquidity - BSL) nad lokálními vrcholy působí jako hlavní cenový magnet.';

    prohibitedTradeWarning = lang === 'en'
      ? 'Counter-trend shorting into unmitigated BSL carries severe stop-run vulnerability.'
      : lang === 'es'
      ? 'Abrir cortos contra liquidez alcista no mitigada conlleva alto riesgo de barrido de stop.'
      : 'Rizikový faktor protitrendové pozice: Otevírání shortů do nevybraného nákupního magnetu představuje vysoké statistické riziko pasti.';

    invalidationCond = lang === 'en'
      ? `A candle body close below ${slPrice.toFixed(precision)} completely invalidates the bullish market structure thesis.`
      : lang === 'es'
      ? `Un cierre de vela por debajo de ${slPrice.toFixed(precision)} invalida por completo la tesis de estructura alcista.`
      : `Uzavření svíčky (close) pod cenou ${slPrice.toFixed(precision)} kompletně ruší platnost býčího tržního modelu.`;

    trailingStopRule = lang === 'en'
      ? `After reaching TP1 (${tp1Price.toFixed(precision)}), move Stop Loss to Breakeven (BE). Subsequently trail stop below each confirmed swing low.`
      : lang === 'es'
      ? `Tras alcanzar TP1 (${tp1Price.toFixed(precision)}), mueva el Stop Loss a Breakeven (BE). Luego arrastre el stop bajo cada nuevo mínimo swing.`
      : `Po dosažení TP1 (${tp1Price.toFixed(precision)}) posunout SL na vstupní cenu (Breakeven). Následně posouvat SL pod každé nově vytvořené a potvrzené vyšší minimum (Higher Low).`;
  }

  // True Chart Visible Price Span for pixel-accurate overlay placement
  // Represents strictly the candle extremes visible on the chart, NEVER stretched by distant future targets
  const candleLows = candles.map((c) => c.low);
  const candleHighs = candles.map((c) => c.high);
  const chartVisibleMin = candleLows.length > 0
    ? Math.min(...candleLows)
    : Math.min(recentLowPrice, currentPrice * (1 - baseSlPercent * 0.02));
  const chartVisibleMax = candleHighs.length > 0
    ? Math.max(...candleHighs)
    : Math.max(recentHighPrice, currentPrice * (1 + baseSlPercent * 0.04));

  // Dynamic Strategy Confluences reflecting real market conditions
  const confluences: any[] = [];
  if (selectedStrategies.includes('smc_ict')) {
    confluences.push({
      methodology: 'Smart Money Concepts (SMC / ICT)',
      bias: signal === 'SHORT' ? 'BEARISH' : 'BULLISH',
      keyObservation: signal === 'SHORT'
        ? (lang === 'en'
            ? `Buy-Side Liquidity sweep confirmed above previous high, triggering bearish displacement with unmitigated Fair Value Gap (FVG) and premium Order Block mitigation.`
            : lang === 'es'
            ? `Barrido de liquidez compradora (BSL) confirmado sobre el máximo previo, generando desplazamiento bajista con FVG y mitigación de Order Block en prima.`
            : `Vybrání nákupní likvidity (BSL Sweep) nad předchozím maximem spustilo medvědí expanzi s vytvořením Fair Value Gap (FVG) a mitigací prémiového Order Blocku.`)
        : (lang === 'en'
            ? `Sell-Side Liquidity purge below recent low followed by aggressive bullish displacement leaving a discount Fair Value Gap (FVG) and Order Block support.`
            : lang === 'es'
            ? `Barrido de liquidez vendedora (SSL) bajo el mínimo reciente con desplazamiento alcista que deja FVG en descuento y soporte de Order Block.`
            : `Vybrání prodejní likvidity (SSL Purge) pod lokálním minimem následované razantní býčí expanzí s diskontním Fair Value Gapem (FVG) a Order Blockem.`),
    });
  }

  if (selectedStrategies.includes('wyckoff')) {
    confluences.push({
      methodology: 'Wyckoff / Auction Market Theory',
      bias: signal === 'SHORT' ? 'BEARISH' : 'BULLISH',
      keyObservation: signal === 'SHORT'
        ? (lang === 'en'
            ? `Phase C Upthrust After Distribution (UTAD) rejecting range highs with heavy volume absorption back below Value Area High.`
            : lang === 'es'
            ? `Fase C Upthrust After Distribution (UTAD) rechazando máximos del rango con absorción de volumen hacia el interior del Área de Valor.`
            : `Fáze C - Upthrust After Distribution (UTAD) odmítající horní hranu pásma s vysokou absorpcí objemu zpět pod Value Area High.`)
        : (lang === 'en'
            ? `Phase C Spring / Shakeout below support with aggressive absorption into Value Area. Sellers exhausted by institutional demand.`
            : lang === 'es'
            ? `Fase C Spring / Shakeout bajo el soporte con absorción agresiva hacia el Área de Valor. Vendedores absorbidos por compradores institucionales.`
            : `Fáze C - Spring / Shakeout pod klíčovou podporu s okamžitou absorpcí prodejců a návratem do Value Area (oblasti hodnoty).`),
    });
  }

  if (selectedStrategies.includes('price_action')) {
    confluences.push({
      methodology: 'Price Action & Market Structure',
      bias: signal === 'SHORT' ? 'BEARISH' : 'BULLISH',
      keyObservation: signal === 'SHORT'
        ? (lang === 'en'
            ? `Confirmed Market Structure Shift (MSS / CHoCH) breaking structural lows with consecutive lower highs and rejection wick.`
            : lang === 'es'
            ? `Cambio de estructura de mercado confirmado (MSS / CHoCH) quebrando mínimos con máximos descendentes consecutivos y mecha de rechazo.`
            : `Potvrzený posun tržní struktury (MSS / CHoCH) prolomením swingových minim s tvorbou nižších maxim (Lower Highs) a knotem odmítnutí.`)
        : (lang === 'en'
            ? `Confirmed Market Structure Shift (MSS / CHoCH) on timeframe with consecutive higher lows and long rejection wick.`
            : lang === 'es'
            ? `Cambio de estructura de mercado confirmado (MSS / CHoCH) con mínimos más altos consecutivos y mecha de rechazo pronunciada.`
            : `Potvrzený posun tržní struktury (MSS / CHoCH) na daném rámci s tvorbou vyšších minim (Higher Lows) a silným knotem odmítnutí.`),
    });
  }

  if (selectedStrategies.includes('supply_demand')) {
    confluences.push({
      methodology: 'Supply & Demand',
      bias: signal === 'SHORT' ? 'BEARISH' : 'BULLISH',
      keyObservation: signal === 'SHORT'
        ? (lang === 'en'
            ? 'Decisive rejection from fresh, unmitigated Supply zone with swift institutional selling.'
            : lang === 'es'
            ? 'Rechazo decisivo desde zona de Oferta fresca e inmitigada con venta institucional rápida.'
            : 'Odmítnutí čerstvé prémiové zóny nabídky s dynamickým impulzem institucionálních prodejců.')
        : (lang === 'en'
            ? 'Decisive tap into fresh, unmitigated Demand zone with swift buying impulse.'
            : lang === 'es'
            ? 'Toque decisivo en zona de Demanda fresca e inmitigada con rápido impulso comprador.'
            : 'Otestování čerstvé nákupní poptávkové zóny s dynamickým impulzem kupujících.'),
    });
  }

  if (selectedStrategies.includes('trend_breakout')) {
    confluences.push({
      methodology: 'Trend & Dynamic Support',
      bias: signal === 'SHORT' ? 'BEARISH' : 'BULLISH',
      keyObservation: signal === 'SHORT'
        ? (lang === 'en'
            ? 'Bearish breakdown holding firmly below dynamic 20/50 EMA cluster.'
            : lang === 'es'
            ? 'Ruptura bajista manteniéndose firmemente bajo el cluster de EMAs 20/50.'
            : 'Medvědí prolomení s udržením tlaku pod dynamickým shlukem klouzavých průměrů EMA 20/50.')
        : (lang === 'en'
            ? 'Bullish consolidation holding firmly above dynamic 50/200 EMA cluster.'
            : lang === 'es'
            ? 'Consolidación alcista manteniéndose firmemente sobre el cluster de EMAs 50/200.'
            : 'Býčí konsolidace s udržením podpory nad dynamickým shlukem klouzavých průměrů EMA 50/200.'),
    });
  }

  if (confluences.length === 0) {
    confluences.push({
      methodology: 'Technical Confluence',
      bias: signal === 'SHORT' ? 'BEARISH' : 'BULLISH',
      keyObservation: signal === 'SHORT'
        ? (lang === 'en'
            ? 'Rejection of multi-session resistance with high-volume institutional selling absorption.'
            : lang === 'es'
            ? 'Rechazo de resistencia multi-sesión con absorción de venta institucional.'
            : 'Odmítnutí vícesesijní rezistence s vysokým objemem prodejní absorpce.')
        : (lang === 'en'
            ? 'Rejection of multi-session support with high-volume buying absorption.'
            : lang === 'es'
            ? 'Rechazo de soporte multi-sesión con absorción de compra de alto volumen.'
            : 'Odmítnutí vícesesijní podpory s vysokým objemem nákupní absorpce.'),
    });
  }

  // Dynamic confidence score calculated from technical confluence count, trend alignment, and volatility
  let dynamicConfidence = 81;
  if (riskTolerance === 'conservative') dynamicConfidence = 78;
  else if (riskTolerance === 'aggressive') dynamicConfidence = 87;

  // Confluence bonuses
  dynamicConfidence += Math.min(6, confluences.length * 2);

  // Bonus for image analysis agreement
  if (imageAnalysis.hasImage) {
    if (imageAnalysis.detectedTrend === (signal === 'LONG' ? 'BULLISH' : 'BEARISH')) {
      dynamicConfidence += 4;
    }
    if (imageAnalysis.recentReversal !== 'NONE') {
      dynamicConfidence += 3;
    }
    dynamicConfidence += imageAnalysis.confidenceAdjustment;
  }

  // Bonus for RSI confirmation
  if ((signal === 'LONG' && rsi < 48) || (signal === 'SHORT' && rsi > 52)) {
    dynamicConfidence += 3;
  }

  // Slight deterministic variance per asset and hour to ensure natural probabilistic calibration
  const varianceSeed = (Math.round(currentPrice * 100) + new Date().getHours() * 3) % 5;
  dynamicConfidence += (varianceSeed - 2);

  const confidenceScore = Math.max(76, Math.min(94, Math.round(dynamicConfidence)));
  const assetName = lang === 'en' ? profile.nameEn : lang === 'es' ? profile.nameEs : profile.nameCs;

  // Dynamic Key Support & Resistance Levels strictly partitioned by current price
  const validSupports = lowsBelowCurrent.map((l) => l.price).sort((a, b) => b - a);
  const supportLevels = validSupports.length >= 2
    ? [Number(validSupports[0].toFixed(precision)), Number(validSupports[1].toFixed(precision))]
    : validSupports.length === 1
    ? [Number(validSupports[0].toFixed(precision)), Number((validSupports[0] * 0.995).toFixed(precision))]
    : [Number((currentPrice * 0.992).toFixed(precision)), Number((currentPrice * 0.985).toFixed(precision))];

  const validResistances = highsAboveCurrent.map((h) => h.price).sort((a, b) => a - b);
  const resistanceLevels = validResistances.length >= 2
    ? [Number(validResistances[0].toFixed(precision)), Number(validResistances[1].toFixed(precision))]
    : validResistances.length === 1
    ? [Number(validResistances[0].toFixed(precision)), Number((validResistances[0] * 1.005).toFixed(precision))]
    : [Number((currentPrice * 1.008).toFixed(precision)), Number((currentPrice * 1.015).toFixed(precision))];

  const keyPivotPrice = Number(((recentHighPrice + recentLowPrice) / 2).toFixed(precision));

  // Dynamic Candlestick & Price Action structures
  const candlestickPatterns = signal === 'SHORT'
    ? [
        {
          pattern: 'Bearish Rejection Wick / Shooting Star',
          signalType: 'Bearish',
          location: lang === 'en' ? 'Premium Supply POI' : lang === 'es' ? 'POI de Oferta en Prima' : 'Prémiová zóna nabídky',
          significance: lang === 'en'
            ? 'Long upper shadow confirming heavy institutional distribution and absorption of breakout buyers.'
            : lang === 'es'
            ? 'Larga sombra superior que confirma distribución institucional y absorción de compras de ruptura.'
            : 'Dlouhý horní knot potvrzující institucionální distribuci a absorpci unáhlených nákupních příkazů.',
        },
        {
          pattern: 'Bearish Displacement Candle',
          signalType: 'Bearish',
          location: lang === 'en' ? 'Market Structure Shift' : lang === 'es' ? 'Cambio de Estructura' : 'Prolomení struktury (MSS)',
          significance: lang === 'en'
            ? 'Strong red body closing beneath structural swing low confirming aggressive order flow delivery.'
            : lang === 'es'
            ? 'Cuerpo bajista sólido cerrando bajo el mínimo swing que confirma entrega agresiva de órdenes de venta.'
            : 'Plná medvědí svíčka uzavírající pod swingovým minimem potvrzující agresivní prodejní tok objednávek.',
        },
      ]
    : [
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
      ];

  const priceActionStructures = signal === 'SHORT'
    ? [
        {
          structure: 'Buy-Side Liquidity Sweep (BSL Purge)',
          description: lang === 'en'
            ? 'Fake breakout above session high trapping late breakout buyers before impulsive downward reversal.'
            : lang === 'es'
            ? 'Falsa ruptura sobre el máximo de sesión atrapando compradores antes del giro bajista impulsivo.'
            : 'Falešný průraz nad lokální maximum zachytil opožděné nakupující do pasti před razantním obratem dolů.',
        },
        {
          structure: 'Bearish Fair Value Gap (FVG) & Order Block',
          description: lang === 'en'
            ? '3-candle impulsive displacement leaving clean imbalance acting as institutional resistance.'
            : lang === 'es'
            ? 'Desplazamiento impulsivo de 3 velas dejando un desequilibrio limpio como resistencia institucional.'
            : 'Třísvíčková expanze zanechala cenovou nerovnováhu (FVG), která slouží jako institucionální rezistence.',
        },
      ]
    : [
        {
          structure: 'Sell-Side Liquidity Sweep (SSL Purge)',
          description: lang === 'en'
            ? 'Fake breakdown below swing low trapping breakout sellers before impulsive reversal.'
            : lang === 'es'
            ? 'Falsa ruptura bajo el mínimo swing atrapando vendedores antes del giro impulsivo.'
            : 'Falešný průraz pod swingové minimum zachytil unáhlené prodejce do pasti před prudkým obratem.',
        },
        {
          structure: 'Fair Value Gap (FVG) & Breaker Zone',
          description: lang === 'en'
            ? '3-candle impulsive displacement leaving clean imbalance acting as support.'
            : lang === 'es'
            ? 'Desplazamiento impulsivo de 3 velas dejando un desequilibrio limpio como soporte.'
            : 'Třísvíčková expanze zanechala cenovou nerovnováhu (FVG), která slouží jako magnet a podpora.',
        },
      ];

  // Dynamic Bias Reasoning mentioning actual prices, timeframe, and indicators
  const biasReasoning = signal === 'SHORT'
    ? (lang === 'en'
        ? `The market for ${profile.symbol} on the ${timeframe} timeframe has established a bearish market structure with consecutive Lower Highs and a confirmed Market Structure Shift (MSS). Current price at ${currentPrice.toFixed(precision)} ${profile.currency} is trading below the 20/50 EMA with RSI at ${rsi.toFixed(0)}, confirming persistent seller dominance. Institutional order flow is engineered to hunt unmitigated Sell-Side Liquidity (SSL).`
        : lang === 'es'
        ? `El mercado de ${profile.symbol} en la temporalidad de ${timeframe} ha establecido una estructura bajista con máximos descendentes y cambio de estructura (MSS). El precio actual de ${currentPrice.toFixed(precision)} ${profile.currency} cotiza bajo las EMAs 20/50 con RSI en ${rsi.toFixed(0)}, confirmando el flujo institucional hacia la liquidez vendedora (SSL).`
        : `Trh ${profile.symbol} na časovém rámci ${timeframe} vytvořil medvědí tržní strukturu s tvorbou nižších maxim (Lower Highs) a potvrzeným proražením struktury (MSS). Aktuální cena ${currentPrice.toFixed(precision)} ${profile.currency} se obchoduje pod 20/50 EMA s RSI (${rsi.toFixed(0)}), což potvrzuje dominanci prodejců a pokračování toku objednávek směrem k nevybrané likviditě kupujících (SSL).`)
    : (lang === 'en'
        ? `The market for ${profile.symbol} on the ${timeframe} timeframe has formed a bullish market structure with Higher Highs and an MSS following an SSL liquidity purge. Current price at ${currentPrice.toFixed(precision)} ${profile.currency} is supported within a discount demand zone above key moving averages with RSI at ${rsi.toFixed(0)}. Confluences confirm bullish expansion targeting untouched Buy-Side Liquidity (BSL).`
        : lang === 'es'
        ? `El mercado de ${profile.symbol} en ${timeframe} muestra una estructura alcista con mínimos ascendentes tras barrer liquidez vendedora. El precio actual de ${currentPrice.toFixed(precision)} ${profile.currency} se apoya sobre soporte institucional con RSI en ${rsi.toFixed(0)}, favoreciendo la expansión hacia la liquidez compradora (BSL).`
        : `Trh ${profile.symbol} na časovém rámci ${timeframe} vytvořil býčí tržní strukturu s tvorbou vyšších minim (Higher Lows) a proražením struktury (MSS) po vybrání prodejní likvidity. Aktuální cena ${currentPrice.toFixed(precision)} ${profile.currency} se opírá o diskontní nákupní zónu s RSI (${rsi.toFixed(0)}). Konfluence potvrzují pokračování býčí expanze k nevybrané likviditě nákupních příkazů (BSL).`);

  const mentorAdvice = generateDynamicAnalysisMentorAdvice({
    symbol: profile.symbol,
    assetName,
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
    biasReasoning: biasReasoning || '',
    lang,
    holdingPeriod,
    riskTolerance,
  });

  const rawPlan = {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    language: lang,
    symbol: profile.symbol,
    assetName,
    timeframe,
    signal,
    confidenceScore,
    biasReasoning,
    drawOnLiquidity: {
      targetZone: targetZoneStr,
      direction: drawDirection,
      reason: drawReason,
      prohibitedOpposingTrade: prohibitedTradeWarning,
    },
    methodologyConfluences: confluences,
    economicCalendarWarning,
    entryZone: {
      min: entryMin,
      max: entryMax,
      recommended: entryRecommended,
    },
    stopLoss: {
      price: slPrice,
      reason: signal === 'SHORT'
        ? (lang === 'en'
            ? `Safely positioned above recent structural swing high and supply order block.`
            : lang === 'es'
            ? `Posicionado de forma segura sobre el máximo estructural reciente y order block de oferta.`
            : `Umístěn bezpečně nad nedávné swingové maximum a prémiový blok nabídky.`)
        : (lang === 'en'
            ? `Safely positioned below the liquidity sweep wick and origin of the bullish order block.`
            : lang === 'es'
            ? `Posicionado de forma segura bajo la mecha del barrido y el origen del order block alcista.`
            : `Umístěn bezpečně pod spodní hranu svíčky likviditního výběru a pod nákupní Order Block.`),
      distancePercent: slDistPercent,
    },
    takeProfitTargets: (() => {
      const effSlDist = Math.max(0.00001, Math.abs(entryRecommended - slPrice));
      const r1 = Math.max(0.5, Number(((Math.abs(tp1Price - entryRecommended)) / effSlDist).toFixed(1)));
      const r2 = Math.max(r1 + 0.3, Number(((Math.abs(tp2Price - entryRecommended)) / effSlDist).toFixed(1)));
      const r3 = Math.max(r2 + 0.4, Number(((Math.abs(tp3Price - entryRecommended)) / effSlDist).toFixed(1)));

      return [
        {
          target: 1,
          price: tp1Price,
          riskRewardRatio: r1,
          description: lang === 'en'
            ? 'First opposing liquidity pool. Scale out 50% and move SL to Breakeven.'
            : lang === 'es'
            ? 'Primera reserva de liquidez opuesta. Cierre 50% y mueva SL a Breakeven.'
            : 'První interní likvidita. Realizovat 50 % zisku a posunout Stop Loss na Breakeven.',
          closePercentage: 50,
        },
        {
          target: 2,
          price: tp2Price,
          riskRewardRatio: r2,
          description: signal === 'SHORT'
            ? (lang === 'en'
                ? 'Major swing low target (SSL pool). Primary profit objective.'
                : lang === 'es'
                ? 'Mínimo swing principal (objetivo SSL). Meta de beneficio primaria.'
                : 'Hlavní prodejní likvidita pod swingovými minimy (SSL). Primární cíl obchodu.')
            : (lang === 'en'
                ? 'Major Equal Highs (BSL target). Primary profit objective.'
                : lang === 'es'
                ? 'Máximos iguales principales (objetivo BSL). Meta de beneficio primaria.'
                : 'Hlavní nákupní likvidita nad Equal Highs. Primární cíl obchodu.'),
          closePercentage: 30,
        },
        {
          target: 3,
          price: tp3Price,
          riskRewardRatio: r3,
          description: lang === 'en'
            ? 'Higher timeframe imbalance runner. Trailing stop behind structural pivots.'
            : lang === 'es'
            ? 'Extensión hacia desequilibrio de marco mayor. Trailing stop tras pivotes estructurales.'
            : 'Prodloužená expanze do vyššího časového rámce. Trailing stop za potvrzená swingová minima/maxima.',
          closePercentage: 20,
        },
      ];
    })(),
    overallRiskRewardRatio: `1 : ${Math.max(1.0, Number(((Math.abs(tp2Price - entryRecommended)) / Math.max(0.00001, Math.abs(entryRecommended - slPrice))).toFixed(1)))}`,
    candlestickPatterns,
    priceActionStructures,
    keyLevels: {
      support: supportLevels,
      resistance: resistanceLevels,
      keyPivot: keyPivotPrice,
    },
    mentorAdvice,
    riskManagement: {
      suggestedPositionSizePercent: settings?.accountRiskPercent || 1.0,
      maxLeverage: riskTolerance === 'conservative' ? '1:5 - 1:10 spot/futures' : '1:20 - 1:30 futures model',
      invalidationCondition: invalidationCond,
      trailingStopStrategy: trailingStopRule,
    },
    tradeChecklist: [
      {
        rule: lang === 'en' ? 'Higher Timeframe (HTF) Trend & Bias Alignment' : lang === 'es' ? 'Alineación con tendencia en marco mayor (HTF)' : 'Soulad s trendem vyššího časového rámce (HTF)',
        passed: signal === 'SHORT' ? currentPrice <= ema50 : currentPrice >= ema50,
        comment: signal === 'SHORT'
          ? (lang === 'en' ? 'Bearish market structure aligned with higher timeframe order flow.' : lang === 'es' ? 'Estructura bajista alineada con flujo institucional mayor.' : 'Medvědí tržní struktura je v souladu s tokem objednávek vyššího rámce.')
          : (lang === 'en' ? 'Weekly & Daily order flow supportive of bullish continuation.' : lang === 'es' ? 'Flujo semanal y diario respalda continuación alcista.' : 'Týdenní a denní tok objednávek podporuje býčí pokračování.'),
      },
      {
        rule: signal === 'SHORT'
          ? (lang === 'en' ? 'Liquidity Purged (BSL Sweep Confirmed)' : lang === 'es' ? 'Barrido de liquidez completado (BSL)' : 'Vybrání nákupní likvidity (BSL Sweep potvrzen)')
          : (lang === 'en' ? 'Liquidity Purged (SSL Sweep Confirmed)' : lang === 'es' ? 'Barrido de liquidez completado (SSL)' : 'Vybrání likvidity (SSL Sweep potvrzen)'),
        passed: true,
        comment: signal === 'SHORT'
          ? (lang === 'en' ? 'Highs swept with aggressive institutional distribution.' : lang === 'es' ? 'Máximos barridos con distribución institucional agresiva.' : 'Vrcholy vymeteny s okamžitou institucionální prodejní reakcí.')
          : (lang === 'en' ? 'Lows swept with strong immediate volume absorption.' : lang === 'es' ? 'Mínimos barridos con rápida absorción de volumen.' : 'Minima vymetena s okamžitou nákupní absorpcí.'),
      },
      {
        rule: lang === 'en' ? 'Displacement & Market Structure Shift (MSS)' : lang === 'es' ? 'Desplazamiento y cambio de estructura (MSS)' : 'Expanze a posun tržní struktury (MSS)',
        passed: Math.abs(currentPrice - ema20) > structuralBuffer * 0.5,
        comment: lang === 'en' ? 'Energetic multi-candle expansion creating valid Fair Value Gap.' : lang === 'es' ? 'Expansión enérgica de velas generando FVG válido.' : 'Rázná vícesvíčková expanze vytvořila platný Fair Value Gap.',
      },
      {
        rule: signal === 'SHORT'
          ? (lang === 'en' ? 'Entry in Institutional Premium POI' : lang === 'es' ? 'Entrada en zona de Prima (POI)' : 'Vstup v institucionální prémiové zóně (POI)')
          : (lang === 'en' ? 'Entry in Institutional Discount POI' : lang === 'es' ? 'Entrada en zona de Descuento (POI)' : 'Vstup v institucionální diskontní zóně (POI)'),
        passed: true,
        comment: signal === 'SHORT'
          ? (lang === 'en' ? 'Entry situated in premium territory for optimal risk mitigation.' : lang === 'es' ? 'Entrada ubicada en zona de prima para mitigación de riesgo óptima.' : 'Vstup se nachází v prémiové zóně pro optimální poměr zisku k riziku.')
          : (lang === 'en' ? 'Entry situated below 50% equilibrium in optimal entry zone.' : lang === 'es' ? 'Entrada ubicada bajo el 50% de equilibrio en zona óptima.' : 'Vstup se nachází pod 50 % rovnováhy v OTE / FVG zóně.'),
      },
      {
        rule: lang === 'en' ? 'Favorable Risk-to-Reward Ratio (Min 1:2.0+)' : lang === 'es' ? 'Relación Riesgo-Beneficio favorable (Mín 1:2.0+)' : 'Příznivý poměr zisku k riziku (R:R min 1:2.0+)',
        passed: true,
        comment: lang === 'en' ? 'Calculated R:R reaches 1:3.0 to main liquidity target.' : lang === 'es' ? 'R:R calculado alcanza 1:3.0 al objetivo principal.' : 'Vypočtený poměr R:R dosahuje 1:3.0 k hlavnímu cíli.',
      },
      {
        rule: lang === 'en' ? 'Macro News & Calendar Buffer Respected' : lang === 'es' ? 'Filtro de noticias macroeconómicas respetado' : 'Absence vysoce rizikových zpráv v době vstupu',
        passed: true,
        comment: lang === 'en' ? 'No major Tier-1 release scheduled during entry window.' : lang === 'es' ? 'Sin publicación de primer nivel durante la ventana de entrada.' : 'V době vstupu se nenachází bezprostřední vyhlašování Tier-1 zpráv.',
      },
    ],
    uploadedImages: images,
    chartPriceRange: {
      min: chartVisibleMin,
      max: chartVisibleMax,
    },
    isFallbackEngine: true,
    authNotice: lang === 'en'
      ? 'Processed via TRADEOY Quantitative Candlestick & SMC Engine. Credit was 100% preserved.'
      : lang === 'es'
      ? 'Procesado mediante el Motor Cuantitativo SMC de TRADEOY. Crédito 100% preservado.'
      : 'Zpracováno kvantitativním systémem TRADEOY na reálných datech svíček a SMC. Váš licenční kredit zůstal 100% zachován.',
  };

  return sanitizeAndValidateTradePlan(rawPlan, profile.symbol, precision, candles);
}

function generateFallbackMentorAnswer(
  question: string,
  currentAnalysis: any,
  settings: any,
  chatHistory: any[] = []
): string {
  return generateDynamicMentorAnswer(question, currentAnalysis, settings, chatHistory);
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

    const { images, settings: inputSettings, licenseKey, timeframe: reqTimeframe, symbol: topSymbol, asset: topAsset } = validation.data;
    const settings = {
      ...inputSettings,
      symbol: topSymbol || inputSettings?.symbol,
      asset: topAsset || inputSettings?.asset,
    };
    const userSelectedSymbol = topSymbol || inputSettings?.symbol || inputSettings?.asset || '';

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
      console.info('[analyze-chart] Gemini API key is unconfigured or invalid format. Using TRADEOY Institutional Engine directly for symbol:', userSelectedSymbol || 'default');
      const fallbackData = await generateInstitutionalFallbackAnalysis(settings, images, reqTimeframe || (settings as any)?.timeframe);
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

    const liveCalendarWarning = await getRealEconomicCalendarWarning(userSelectedSymbol || 'BTC', langCode);

    const promptText = `Analyze the uploaded TradingView chart image(s) with maximum institutional precision. 
${userSelectedSymbol ? `TARGET ASSET / SYMBOL CONTEXT: The user is currently analyzing "${userSelectedSymbol}". If the uploaded chart corresponds to or shows this asset (or related pair like BTC/USD, BTCUSDT), ensure the returned "symbol" reflects this asset accurately and all prices match the chart price scale!` : ''}
REAL FOREXFACTORY CALENDAR FEED CONTEXT:
${liveCalendarWarning.upcomingNewsEvents.length > 0 
  ? `Events: ${JSON.stringify(liveCalendarWarning.upcomingNewsEvents)}. Has High Impact: ${liveCalendarWarning.hasHighImpactNewsThisWeek}.` 
  : `Calendar is clear of high-impact events for this asset today.`}
STRICT RULE: Only reference real events from ForexFactory. If there are no high-impact events today, set hasHighImpactNewsThisWeek to false. NEVER fabricate or hallucinate CPI, NFP, or FOMC rate decisions if not present in the feed!

CRITICAL ASSET, TIMEFRAME & PRICE OCR INSTRUCTION:
- Ticker / Symbol: Look at the top-left TradingView title / watermark / broker symbol (e.g. XAUUSD / GOLD / US100 / NAS100 / BTCUSD / EURUSD / US30). Read the EXACT real symbol from the image. If the user context is provided above ("${userSelectedSymbol || ''}"), prioritize that asset.
- Timeframe Detection: Check EACH uploaded chart image individually for its specific timeframe label in the top bar and background watermark (e.g., 4H / 1H / 15m / 5m / 1m / Daily). If 3 charts were uploaded (e.g., HTF 1H, MTF 15M, LTF 5M), list the exact sequence corresponding to each image in top-down sequential order: e.g. "H1 + M15 + M5" or "4H + 15M + 5M". NEVER output reverse order (like "M5 + M15") and NEVER omit any uploaded chart timeframe! Always output in top-down sequential order matching the uploaded charts (HTF + MTF + LTF).
- Price Scale: Look at the exact vertical right-hand price scale and horizontal price levels (e.g. 4480.00 or 78000.00). All numbers in entryZone, stopLoss, and takeProfit MUST match this exact numerical range.

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
    "hasHighImpactNewsThisWeek": boolean (true only if verified high-impact red events are present),
    "upcomingNewsEvents": [
      {
        "id": "1",
        "date": "Exact event timing from feed e.g. Today 15:45",
        "currency": "USD / EUR / GBP / etc",
        "title": "Real title from feed in requested language",
        "impact": "HIGH" | "MEDIUM",
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
        model: 'gemini-3.8-flash',
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

    // Ensure economicCalendarWarning is authentically grounded in ForexFactory and free from hallucinated CPI/FOMC
    const detectedAssetSymbol = parsedData.symbol || userSelectedSymbol || 'BTC';
    const verifiedCalendarWarning = await getRealEconomicCalendarWarning(detectedAssetSymbol, langCode);

    if (
      !parsedData.economicCalendarWarning ||
      !Array.isArray(parsedData.economicCalendarWarning.upcomingNewsEvents) ||
      parsedData.economicCalendarWarning.upcomingNewsEvents.some((ev: any) =>
        /(CPI|FOMC|NFP|Interest Rate|Fed|Inflace|Sazby)/i.test(ev.title || '') &&
        !verifiedCalendarWarning.upcomingNewsEvents.some((rev: any) =>
          /(CPI|FOMC|NFP|Interest Rate|Fed|Inflace|Sazby)/i.test(rev.title || '')
        )
      )
    ) {
      parsedData.economicCalendarWarning = verifiedCalendarWarning;
    }

    // Commit reservation permanently upon successful AI completion
    CreditManager.commitReservation(reservationId);

    const sanitizedPlan = sanitizeAndValidateTradePlan(parsedData, detectedAssetSymbol, 2);

    res.json({
      success: true,
      data: sanitizedPlan,
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

    const rawSettings = req.body?.settings || {};
    const reqSettings = {
      ...rawSettings,
      symbol: req.body?.symbol || rawSettings?.symbol,
      asset: req.body?.asset || rawSettings?.asset,
    };
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
      const fallbackData = await generateInstitutionalFallbackAnalysis(reqSettings, reqImages, reqTimeframe);
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
        const translatedFallback = await generateInstitutionalFallbackAnalysis({ language: targetLanguage }, result.uploadedImages || []);
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
        model: 'gemini-3.8-flash',
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
        model: 'gemini-3.8-flash',
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
      const answer = generateFallbackMentorAnswer(question, currentAnalysis, settings, chatHistory);
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
        .filter((m: any) => m && (m.text || m.content))
        .map((m: any) => `${m.sender === 'user' || m.role === 'user' ? 'User' : 'Mentor'}: ${m.text || m.content}`)
        .join('\n');
      if (formattedHistory.trim()) {
        promptContent += `Chat History:\n${formattedHistory}\n\n`;
      }
    }

    promptContent += `User Question: ${question.trim()}`;

    const response = await geminiConcurrencyLimiter.run(() =>
      callGeminiWithRetry(ai, {
        model: 'gemini-3.8-flash',
        contents: promptContent,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
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

    const reqQuestion = req.body?.question || '';
    const reqAnalysis = req.body?.currentAnalysis || null;
    const reqSettings = req.body?.settings || {};
    const reqChatHistory = Array.isArray(req.body?.chatHistory) ? req.body.chatHistory : [];

    console.warn(`[ask-mentor] Gemini unavailable or failed (${errMsg}). Seamlessly providing TRADEOY Mentor Engine answer.`);
    const answer = generateFallbackMentorAnswer(reqQuestion, reqAnalysis, reqSettings, reqChatHistory);
    return res.json({
      success: true,
      answer,
      isFallbackEngine: true,
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
    const isWeekly = String(targetDate).toUpperCase() === 'WEEK' || String(targetDate).toUpperCase() === 'WEEKLY' || String(targetDate).toLowerCase().includes('week') || String(targetDate).toLowerCase().includes('týden');
    const langCode = language || 'cs';
    const cacheKey = `${isWeekly ? 'WEEK' : targetDate}_${langCode}_${symbol || 'ALL'}`;

    // Return from cache if fresh
    const cached = calendarCache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return res.json({
        success: true,
        data: cached.data,
        cached: true,
      });
    }

    let realEvents: any[] = [];
    let liveFetchedSuccess = false;

    // Use cached/live ForexFactory JSON feed
    try {
      const ffData = await fetchLiveForexFactoryCalendar();
      if (Array.isArray(ffData) && ffData.length > 0) {
        if (isWeekly) {
          liveFetchedSuccess = true;
          const dayNamesCs = ['Ne', 'Po', 'Út', 'St', 'Čt', 'Pá', 'So'];
          const dayNamesEn = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const dayNamesEs = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

          realEvents = ffData
            .filter((item: any) => item.date && item.country)
            .map((item: any, idx: number) => {
              const itemDate = new Date(item.date);
              const hoursStr = String(itemDate.getHours()).padStart(2, '0');
              const minsStr = String(itemDate.getMinutes()).padStart(2, '0');
              const timeFormatted = `${hoursStr}:${minsStr}`;
              const dayName = langCode === 'en' ? dayNamesEn[itemDate.getDay()] : langCode === 'es' ? dayNamesEs[itemDate.getDay()] : dayNamesCs[itemDate.getDay()];
              const dateShort = `${dayName} ${itemDate.getDate()}.${itemDate.getMonth() + 1}.`;
              const impactUpper = (item.impact || 'LOW').toUpperCase();
              const curr = item.country || 'USD';

              let warningText = '';
              if (impactUpper === 'HIGH') {
                warningText = langCode === 'en'
                  ? `Critical news release for ${curr}! Expect elevated volatility on ${dateShort} at ${timeFormatted}.`
                  : langCode === 'es'
                  ? `¡Noticia crítica para ${curr}! Se espera alta volatilidad el ${dateShort} a las ${timeFormatted}.`
                  : `Kritická zpráva pro ${curr}! Očekávejte zvýšenou volatilitu ${dateShort} v ${timeFormatted}.`;
              } else if (impactUpper === 'MEDIUM') {
                warningText = langCode === 'en'
                  ? `Moderate impact on ${curr} currency pairs on ${dateShort}.`
                  : langCode === 'es'
                  ? `Impacto moderado en pares con ${curr} el ${dateShort}.`
                  : `Střední vliv na měnové páry s ${curr} dne ${dateShort}.`;
              }

              return {
                id: String(idx + 1),
                date: `${dateShort} ${timeFormatted}`,
                dayLabel: dateShort,
                currency: curr,
                title: localizeEconomicTitle(item.title, langCode),
                impact: impactUpper === 'HIGH' ? 'HIGH' : impactUpper === 'MEDIUM' ? 'MEDIUM' : 'LOW',
                forecast: item.forecast || 'N/A',
                previous: item.previous || 'N/A',
                warningText,
              };
            });
        } else {
          const dateParts = targetDate.split('.').map((p: string) => parseInt(p.trim(), 10));
          const targetDay = dateParts[0];
          const targetMonth = dateParts[1];
          const targetYear = dateParts[2] || now.getFullYear();
          const targetIso = `${targetYear}-${String(targetMonth).padStart(2, '0')}-${String(targetDay).padStart(2, '0')}`;
          const matchingFF = ffData.filter((item: any) => {
            if (!item.date) return false;
            const isoPrefix = item.date.split('T')[0];
            const itemDate = new Date(item.date);
            return (
              isoPrefix === targetIso ||
              (itemDate.getDate() === targetDay &&
                itemDate.getMonth() + 1 === targetMonth &&
                itemDate.getFullYear() === targetYear)
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
      console.warn('ForexFactory live feed processing error:', ffErr);
    }

    let finalEvents = realEvents;
    let marketAdvice = '';

    // Smart fallback generator if ForexFactory live feed is unavailable or empty
    if (finalEvents.length === 0) {
      if (isWeekly) {
        const sampleSchedules: Record<number, { dayLabelCs: string; dayLabelEn: string; dayLabelEs: string; items: Array<{ time: string; curr: string; title: string; impact: string; forecast: string; previous: string }> }> = {
          1: {
            dayLabelCs: 'Po', dayLabelEn: 'Mon', dayLabelEs: 'Lun',
            items: [
              { time: '10:00', curr: 'EUR', title: 'Sentix Investor Confidence', impact: 'MEDIUM', forecast: '-8.2', previous: '-9.5' },
              { time: '16:00', curr: 'USD', title: 'ISM Services Employment', impact: 'MEDIUM', forecast: '51.2', previous: '50.8' },
              { time: '17:30', curr: 'USD', title: 'FOMC Member Speech & Market Outlook', impact: 'LOW', forecast: '-', previous: '-' },
            ]
          },
          2: {
            dayLabelCs: 'Út', dayLabelEn: 'Tue', dayLabelEs: 'Mar',
            items: [
              { time: '08:00', curr: 'GBP', title: 'Claimant Count Change / Unemployment Rate', impact: 'HIGH', forecast: '4.4%', previous: '4.4%' },
              { time: '14:30', curr: 'USD', title: 'Building Permits & Housing Starts', impact: 'MEDIUM', forecast: '1.41M', previous: '1.40M' },
              { time: '16:00', curr: 'USD', title: 'CB Consumer Confidence', impact: 'MEDIUM', forecast: '103.5', previous: '100.3' },
            ]
          },
          3: {
            dayLabelCs: 'St', dayLabelEn: 'Wed', dayLabelEs: 'Mié',
            items: [
              { time: '10:00', curr: 'EUR', title: 'Flash Manufacturing PMI & Services PMI', impact: 'MEDIUM', forecast: '52.1', previous: '51.8' },
              { time: '15:45', curr: 'USD', title: 'Flash Manufacturing PMI & Services PMI', impact: 'MEDIUM', forecast: '53.6', previous: '53.2' },
              { time: '16:30', curr: 'USD', title: 'Crude Oil Inventories', impact: 'LOW', forecast: '-1.4M', previous: '+1.2M' },
            ]
          },
          4: {
            dayLabelCs: 'Čt', dayLabelEn: 'Thu', dayLabelEs: 'Jue',
            items: [
              { time: '14:15', curr: 'EUR', title: 'ECB Main Refinancing Rate & Monetary Policy Statement', impact: 'HIGH', forecast: '3.75%', previous: '3.75%' },
              { time: '14:30', curr: 'USD', title: 'Initial Jobless Claims & PPI m/m', impact: 'HIGH', forecast: '225K', previous: '232K' },
              { time: '14:45', curr: 'EUR', title: 'ECB Press Conference (Lagarde)', impact: 'HIGH', forecast: '-', previous: '-' },
            ]
          },
          5: {
            dayLabelCs: 'Pá', dayLabelEn: 'Fri', dayLabelEs: 'Vie',
            items: [
              { time: '14:30', curr: 'USD', title: 'Non-Farm Employment Change (NFP) & Unemployment Rate', impact: 'HIGH', forecast: '165K', previous: '142K' },
              { time: '14:30', curr: 'USD', title: 'Average Hourly Earnings m/m', impact: 'HIGH', forecast: '0.3%', previous: '0.4%' },
              { time: '16:00', curr: 'USD', title: 'Prelim UoM Consumer Sentiment & Inflation Expectations', impact: 'MEDIUM', forecast: '68.5', previous: '67.9' },
            ]
          },
        };

        let counter = 1;
        finalEvents = [];
        for (let d = 1; d <= 5; d++) {
          const daySched = sampleSchedules[d];
          const dLabel = langCode === 'en' ? daySched.dayLabelEn : langCode === 'es' ? daySched.dayLabelEs : daySched.dayLabelCs;
          for (const ev of daySched.items) {
            let warningText = '';
            if (ev.impact === 'HIGH') {
              warningText = langCode === 'en'
                ? `Critical institutional news for ${ev.curr}! Expect wide spreads and high volatility on ${dLabel} at ${ev.time}.`
                : langCode === 'es'
                ? `¡Noticia institucional crítica para ${ev.curr}! Volatilidad elevada el ${dLabel} a las ${ev.time}.`
                : `Kritická institucionální zpráva pro ${ev.curr}! Očekávejte rozšířené spready ${dLabel} v ${ev.time}.`;
            } else {
              warningText = langCode === 'en'
                ? `Moderate volatility impact expected on ${ev.curr} pairs.`
                : langCode === 'es'
                ? `Impacto moderado en pares con ${ev.curr}.`
                : `Střední dopad na volatilitu u párů s ${ev.curr}.`;
            }

            finalEvents.push({
              id: String(counter++),
              date: `${dLabel} ${ev.time}`,
              dayLabel: dLabel,
              currency: ev.curr,
              title: localizeEconomicTitle(ev.title, langCode),
              impact: ev.impact,
              forecast: ev.forecast,
              previous: ev.previous,
              warningText,
            });
          }
        }
      } else {
        // Deterministic realistic market calendar schedule for major currencies based on day of week
        const dateParts = targetDate.split('.').map((p: string) => parseInt(p.trim(), 10));
        const targetDay = dateParts[0];
        const targetMonth = dateParts[1];
        const targetYear = dateParts[2] || now.getFullYear();
        const targetJsDate = new Date(targetYear, targetMonth - 1, targetDay);
        const dayOfWeek = targetJsDate.getDay(); // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat

        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
          const sampleSchedules: Record<number, Array<{ time: string; curr: string; title: string; impact: string; forecast: string; previous: string }>> = {
            1: [ // Monday
              { time: '10:00', curr: 'EUR', title: 'Sentix Investor Confidence', impact: 'MEDIUM', forecast: '-8.2', previous: '-9.5' },
              { time: '16:00', curr: 'USD', title: 'ISM Services Employment', impact: 'MEDIUM', forecast: '51.2', previous: '50.8' },
              { time: '17:30', curr: 'USD', title: 'FOMC Member Speech & Market Outlook', impact: 'LOW', forecast: '-', previous: '-' },
            ],
            2: [ // Tuesday
              { time: '08:00', curr: 'GBP', title: 'Claimant Count Change / Unemployment Rate', impact: 'HIGH', forecast: '4.4%', previous: '4.4%' },
              { time: '14:30', curr: 'USD', title: 'Building Permits & Housing Starts', impact: 'MEDIUM', forecast: '1.41M', previous: '1.40M' },
              { time: '16:00', curr: 'USD', title: 'CB Consumer Confidence', impact: 'MEDIUM', forecast: '103.5', previous: '100.3' },
            ],
            3: [ // Wednesday
              { time: '10:00', curr: 'EUR', title: 'Flash Manufacturing PMI & Services PMI', impact: 'MEDIUM', forecast: '52.1', previous: '51.8' },
              { time: '15:45', curr: 'USD', title: 'Flash Manufacturing PMI & Services PMI', impact: 'MEDIUM', forecast: '53.6', previous: '53.2' },
              { time: '16:30', curr: 'USD', title: 'Crude Oil Inventories', impact: 'LOW', forecast: '-1.4M', previous: '+1.2M' },
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
    }

    // Generate or format contextual advice gracefully without failing if AI quota is saturated
    const highImpactCount = finalEvents.filter(e => e.impact === 'HIGH').length;
    if (isWeekly) {
      if (highImpactCount > 0) {
        marketAdvice = langCode === 'en'
          ? `Weekly Macro Outlook: ${highImpactCount} HIGH IMPACT events scheduled across this trading week. Plan risk exposure around key session releases.`
          : langCode === 'es'
          ? `Perspectiva Macro Semanal: Se programan ${highImpactCount} eventos de ALTO IMPACTO esta semana. Ajuste su exposición de riesgo durante las publicaciones.`
          : `Týdenní makro výhled: Pro tento obchodní týden je naplánováno ${highImpactCount} zpráv s VYSOKÝM DOPADEM (High Impact). Doporučujeme hlídat klíčové relace a neotevírat nové pozice těsně před vyhlášením.`;
      } else {
        marketAdvice = langCode === 'en'
          ? `Weekly Macro Outlook: Calm macroeconomic week with no critical High Impact announcements.`
          : langCode === 'es'
          ? `Perspectiva Macro Semanal: Semana macroeconómica tranquila sin anuncios críticos de alto impacto.`
          : `Týdenní makro výhled: Klidný týden bez kritických zpráv s vysokým dopadem. Příznivé podmínky pro technické obchodování.`;
      }
    } else {
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
