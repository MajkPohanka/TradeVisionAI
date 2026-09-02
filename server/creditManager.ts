import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import Stripe from 'stripe';

export interface LicenseRecord {
  key: string;
  credits: number;
  tier: string;
  email?: string;
  totalPurchased: number;
  totalUsed: number;
  createdAt: number;
  lastUsedAt?: number;
  stripeSessionIds?: string[];
}

export interface CreditPackage {
  id: string;
  name: string;
  priceUsd: number;
  credits: number;
  bonusCredits: number;
  popular?: boolean;
  tag?: string;
  description: string;
}

export const VIP_UNLIMITED_EMAILS = ['majklpohanka@gmail.com'];
export const VIP_UNLIMITED_KEYS = [
  'TRADEOY-VIP-UNLIMITED-ALPHA',
  'TRADEOY-VIP-FRIENDS-2026',
  'TRADEOY-VIP-ELITE-MASTER',
  'TRADEOY-VIP-FOUNDER-PASS',
  'TRADEOY-VIP-PRO-TRADER',
  'TRADEOY-VIP-1000',
  'AIAUTO-DEMO-TEST-2026',
];

export function isUnlimitedUser(record?: LicenseRecord | null, email?: string): boolean {
  if (email && VIP_UNLIMITED_EMAILS.includes(email.trim().toLowerCase())) {
    return true;
  }
  if (record) {
    if (record.email && VIP_UNLIMITED_EMAILS.includes(record.email.trim().toLowerCase())) {
      return true;
    }
    if (record.key && VIP_UNLIMITED_KEYS.includes(record.key.toUpperCase())) {
      return true;
    }
    if (record.tier === 'vip_unlimited' || record.tier === 'unlimited') {
      return true;
    }
  }
  return false;
}
export const CREDIT_PACKAGES: Record<string, CreditPackage> = {
  starter: {
    id: 'starter',
    name: 'Starter (Zkušební)',
    priceUsd: 1,
    credits: 1,
    bonusCredits: 0,
    description: '1 kompletní AI analýza grafu s detailním obchodním plánem',
  },
  pro: {
    id: 'pro',
    name: 'Pro Trader (Nejoblíbenější)',
    priceUsd: 10,
    credits: 12,
    bonusCredits: 2,
    popular: true,
    tag: '+2 BONUS ANALÝZY',
    description: '12 analýz (10 + 2 zdarma) pro aktivní swing a intraday trading',
  },
  institutional: {
    id: 'institutional',
    name: 'Institutional Master',
    priceUsd: 25,
    credits: 35,
    bonusCredits: 10,
    tag: '+10 BONUS ZDARMA',
    description: '35 analýz pro prop-firm tradery s maximální výhodností',
  },
};

let DATA_DIR = path.join(process.cwd(), 'data');
let LICENSES_FILE = path.join(DATA_DIR, 'licenses.json');
let LICENSES_BACKUP_FILE = path.join(DATA_DIR, 'licenses.backup.json');
let LICENSES_TEMP_FILE = path.join(DATA_DIR, 'licenses.json.tmp');

function resolveSafeDataDir() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    // Test write permission
    const testFile = path.join(DATA_DIR, '.perm_test');
    fs.writeFileSync(testFile, 'ok', 'utf-8');
    fs.unlinkSync(testFile);
  } catch (err) {
    console.warn('[CreditManager] Primary DATA_DIR not writable, falling back to /tmp/tradeoy_data:', err);
    DATA_DIR = path.join('/tmp', 'tradeoy_data');
    LICENSES_FILE = path.join(DATA_DIR, 'licenses.json');
    LICENSES_BACKUP_FILE = path.join(DATA_DIR, 'licenses.backup.json');
    LICENSES_TEMP_FILE = path.join(DATA_DIR, 'licenses.json.tmp');
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
    } catch {
      // Ignored fallback
    }
  }
}

// In-memory cache backed by disk storage
let licensesCache: Map<string, LicenseRecord> = new Map();
let isInitialized = false;
let isSaving = false;

// Ensure storage is loaded with automated backup recovery
function ensureLoaded(force = false) {
  if (isInitialized && !force) return;
  isInitialized = true;

  try {
    resolveSafeDataDir();

    let loadedSuccessfully = false;

    // 1. Try reading primary file
    if (fs.existsSync(LICENSES_FILE)) {
      try {
        const fileData = fs.readFileSync(LICENSES_FILE, 'utf-8');
        if (fileData.trim()) {
          const parsed = JSON.parse(fileData);
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const item of parsed) {
              if (item && item.key) {
                licensesCache.set(item.key.toUpperCase(), item);
              }
            }
            loadedSuccessfully = true;
          }
        }
      } catch (parseErr) {
        console.error('[CreditManager] Primary licenses.json was corrupted. Attempting backup restore...', parseErr);
      }
    }

    // 2. If primary failed or was empty, attempt recovery from backup
    if (!loadedSuccessfully && fs.existsSync(LICENSES_BACKUP_FILE)) {
      try {
        const backupData = fs.readFileSync(LICENSES_BACKUP_FILE, 'utf-8');
        if (backupData.trim()) {
          const parsedBackup = JSON.parse(backupData);
          if (Array.isArray(parsedBackup) && parsedBackup.length > 0) {
            for (const item of parsedBackup) {
              if (item && item.key) {
                licensesCache.set(item.key.toUpperCase(), item);
              }
            }
            loadedSuccessfully = true;
            console.log('[CreditManager] Successfully recovered licenses from backup file.');
          }
        }
      } catch (backupErr) {
        console.error('[CreditManager] Failed to recover from backup:', backupErr);
      }
    }

    // 3. Ensure all default VIP / Unlimited keys are ALWAYS present in cache & storage
    let seededAny = false;
    for (const vKey of VIP_UNLIMITED_KEYS) {
      if (!licensesCache.has(vKey)) {
        licensesCache.set(vKey, {
          key: vKey,
          credits: 999999,
          tier: 'vip_unlimited',
          email: 'majklpohanka@gmail.com',
          totalPurchased: 999999,
          totalUsed: 0,
          createdAt: Date.now(),
        });
        seededAny = true;
      }
    }
    if (seededAny || !loadedSuccessfully) {
      saveToDisk();
    }
  } catch (err) {
    console.error('[CreditManager] Fatal error loading licenses storage:', err);
  }
}

// Atomically persist licenses cache to disk with backup to prevent corruption on crash
function saveToDisk() {
  if (isSaving) {
    // If a save is already in-flight, schedule an immediate deferred save
    setTimeout(saveToDisk, 20);
    return;
  }
  isSaving = true;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const dataArray = Array.from(licensesCache.values());
    const jsonContent = JSON.stringify(dataArray, null, 2);

    // 1. Write to temporary file first (atomic staging)
    fs.writeFileSync(LICENSES_TEMP_FILE, jsonContent, 'utf-8');

    // 2. If primary file currently exists and is valid, create a backup
    if (fs.existsSync(LICENSES_FILE)) {
      try {
        fs.copyFileSync(LICENSES_FILE, LICENSES_BACKUP_FILE);
      } catch (backupErr) {
        // Non-fatal backup warning
      }
    }

    // 3. Atomic rename replaces destination in a single OS kernel step
    fs.renameSync(LICENSES_TEMP_FILE, LICENSES_FILE);
  } catch (err) {
    console.error('[CreditManager] Error atomically saving licenses storage:', err);
  } finally {
    isSaving = false;
  }
}

// Generate unique, readable license key formatted as TRADEOY-XXXX-XXXX-XXXX using cryptographically secure PRNG
export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit ambiguous 0, O, 1, I
  const segment = (len = 4) => {
    const bytes = crypto.randomBytes(len);
    let res = '';
    for (let i = 0; i < len; i++) {
      res += chars.charAt(bytes[i] % chars.length);
    }
    return res;
  };
  return `TRADEOY-${segment()}-${segment()}-${segment()}`;
}

// In-memory active credit reservations to prevent TOCTOU race conditions and allow safe rollback
interface ActiveCreditReservation {
  id: string;
  licenseKey: string;
  amount: number;
  timestamp: number;
  status: 'PENDING' | 'COMMITTED' | 'ROLLEDBACK';
}

const activeReservations = new Map<string, ActiveCreditReservation>();

// Clean up stale reservations periodically
setInterval(() => {
  const now = Date.now();
  for (const [id, res] of activeReservations.entries()) {
    if (now - res.timestamp > 15 * 60 * 1000) {
      activeReservations.delete(id);
    }
  }
}, 5 * 60 * 1000);

// In-memory IP tracking for trial claims
const trialClaimsByIp = new Map<string, { count: number; firstClaim: number }>();

// Lazy initialization for Stripe client
let stripeClient: Stripe | null = null;
export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia' as any,
    });
  }
  return stripeClient;
}

export const CreditManager = {
  // Check if Stripe is currently live-configured
  isStripeConfigured(): boolean {
    return Boolean(process.env.STRIPE_SECRET_KEY);
  },

  // Get license details
  getLicense(key: string): LicenseRecord | null {
    if (!key) return null;
    ensureLoaded();
    const cleanKey = key.trim().toUpperCase();
    let record = licensesCache.get(cleanKey);
    if (!record) {
      // Check disk in case it was updated by another process/worker
      ensureLoaded(true);
      record = licensesCache.get(cleanKey);
    }

    // If key is a valid VIP Unlimited key pattern, auto-generate & persist immediately
    if (!record && (VIP_UNLIMITED_KEYS.includes(cleanKey) || cleanKey.startsWith('TRADEOY-VIP-'))) {
      record = {
        key: cleanKey,
        credits: 999999,
        tier: 'vip_unlimited',
        email: 'majklpohanka@gmail.com',
        totalPurchased: 999999,
        totalUsed: 0,
        createdAt: Date.now(),
      };
      licensesCache.set(cleanKey, record);
      saveToDisk();
    }

    if (record && isUnlimitedUser(record)) {
      record.credits = 999999;
      record.tier = 'vip_unlimited';
    }
    return record || null;
  },

  // Create or issue a new license with specified credits
  createLicense(credits: number, tier = 'starter', email?: string, sessionId?: string): LicenseRecord {
    ensureLoaded();
    const key = generateLicenseKey();
    const record: LicenseRecord = {
      key,
      credits: Math.max(0, credits),
      tier,
      email: email?.trim(),
      totalPurchased: Math.max(0, credits),
      totalUsed: 0,
      createdAt: Date.now(),
      stripeSessionIds: sessionId ? [sessionId] : [],
    };
    licensesCache.set(key, record);
    saveToDisk();
    return record;
  },

  // Claim Starter Trial License with IP rate-limiting (max 5 trials per external IP per 24 hours)
  claimTrialLicense(email?: string, clientIp = 'unknown'): { success: boolean; license?: LicenseRecord; error?: string } {
    ensureLoaded();
    const now = Date.now();
    const ONE_DAY = 24 * 60 * 60 * 1000;

    const isLocalOrTest = clientIp === '127.0.0.1' || clientIp === '::1' || clientIp === '::ffff:127.0.0.1' || clientIp === 'localhost' || clientIp === 'unknown';

    if (!isLocalOrTest) {
      const ipData = trialClaimsByIp.get(clientIp);
      if (ipData) {
        if (now - ipData.firstClaim < ONE_DAY) {
          if (ipData.count >= 5) {
            return {
              success: false,
              error: 'Byl vyčerpán limit pro bezplatné zkušební kredity pro vaše připojení (max 5 účtů / 24h).',
            };
          }
          ipData.count++;
        } else {
          trialClaimsByIp.set(clientIp, { count: 1, firstClaim: now });
        }
      } else {
        trialClaimsByIp.set(clientIp, { count: 1, firstClaim: now });
      }
    }

    const license = this.createLicense(3, 'starter_trial', email || 'trial@tradeoy.com');
    return { success: true, license };
  },

  // Add credits to an existing license or by session ID
  addCredits(key: string, amount: number, sessionId?: string): LicenseRecord | null {
    ensureLoaded();
    const record = this.getLicense(key);
    if (!record) return null;

    record.credits += Math.max(0, amount);
    record.totalPurchased += Math.max(0, amount);
    if (sessionId) {
      record.stripeSessionIds = record.stripeSessionIds || [];
      if (!record.stripeSessionIds.includes(sessionId)) {
        record.stripeSessionIds.push(sessionId);
      }
    }
    licensesCache.set(record.key, record);
    saveToDisk();
    return record;
  },

  // 1. ATOMIC CREDIT RESERVATION (Check + Deduct in one atomic step before calling Gemini)
  reserveCredit(key: string, amount = 1): {
    success: boolean;
    reservationId?: string;
    remainingCredits: number;
    licenseKey?: string;
    error?: string;
  } {
    ensureLoaded();
    const record = this.getLicense(key);
    if (!record) {
      return {
        success: false,
        remainingCredits: 0,
        error: 'Neplatný nebo nenalezený licenční klíč.',
      };
    }

    // VIP Unlimited account bypass - never deplete or block
    if (isUnlimitedUser(record)) {
      const reservationId = `RES_VIP_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
      record.credits = 999999;
      record.tier = 'vip_unlimited';
      record.totalUsed = (record.totalUsed || 0) + amount;
      record.lastUsedAt = Date.now();
      licensesCache.set(record.key, record);

      activeReservations.set(reservationId, {
        id: reservationId,
        licenseKey: record.key,
        amount: 0,
        timestamp: Date.now(),
        status: 'PENDING',
      });

      return {
        success: true,
        reservationId,
        remainingCredits: 999999,
        licenseKey: record.key,
      };
    }

    if (record.credits < amount || record.credits <= 0) {
      return {
        success: false,
        remainingCredits: record.credits,
        licenseKey: record.key,
        error: 'Vyčerpali jste všechny zakoupené kredity. Pro pokračování prosím doplňte kredity.',
      };
    }

    // Atomically decrement immediately
    record.credits -= amount;
    record.totalUsed = (record.totalUsed || 0) + amount;
    record.lastUsedAt = Date.now();
    licensesCache.set(record.key, record);
    saveToDisk();

    const reservationId = `RES_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
    activeReservations.set(reservationId, {
      id: reservationId,
      licenseKey: record.key,
      amount,
      timestamp: Date.now(),
      status: 'PENDING',
    });

    return {
      success: true,
      reservationId,
      remainingCredits: record.credits,
      licenseKey: record.key,
    };
  },

  // 2. COMMIT RESERVATION: Mark as permanently used upon AI success
  commitReservation(reservationId?: string): boolean {
    if (!reservationId) return false;
    const res = activeReservations.get(reservationId);
    if (res && res.status === 'PENDING') {
      res.status = 'COMMITTED';
      return true;
    }
    return false;
  },

  // 3. ROLLBACK RESERVATION: Exact-once refund if Gemini fails
  rollbackReservation(reservationId?: string): { success: boolean; remainingCredits: number } {
    if (!reservationId) return { success: false, remainingCredits: 0 };
    const res = activeReservations.get(reservationId);
    if (!res) {
      return { success: false, remainingCredits: 0 };
    }

    // Strictly enforce that rollback can only happen once on pending reservations
    if (res.status !== 'PENDING') {
      const existing = this.getLicense(res.licenseKey);
      return { success: false, remainingCredits: existing?.credits || 0 };
    }

    res.status = 'ROLLEDBACK';
    ensureLoaded();
    const record = this.getLicense(res.licenseKey);
    if (record) {
      record.credits += res.amount;
      record.totalUsed = Math.max(0, (record.totalUsed || 0) - res.amount);
      licensesCache.set(record.key, record);
      saveToDisk();
      return { success: true, remainingCredits: record.credits };
    }
    return { success: false, remainingCredits: 0 };
  },

  // Direct consume (for non-async legacy calls if any)
  consumeCredit(key: string): { success: boolean; remaining: number; error?: string } {
    const res = this.reserveCredit(key, 1);
    if (res.success && res.reservationId) {
      this.commitReservation(res.reservationId);
      return { success: true, remaining: res.remainingCredits };
    }
    return { success: false, remaining: res.remainingCredits, error: res.error };
  },

  // Get all license records in cache
  getAllLicenses(): LicenseRecord[] {
    ensureLoaded();
    return Array.from(licensesCache.values());
  },

  // Find license by email address
  findLicensesByEmail(email: string): LicenseRecord[] {
    if (!email) return [];
    ensureLoaded();
    const target = email.trim().toLowerCase();
    const records = Array.from(licensesCache.values()).filter(
      (lic) => lic.email && lic.email.toLowerCase() === target
    );
    if (VIP_UNLIMITED_EMAILS.includes(target)) {
      if (records.length === 0) {
        const vipLic: LicenseRecord = {
          key: 'TRADEOY-VIP-1000',
          credits: 999999,
          tier: 'vip_unlimited',
          email: target,
          totalPurchased: 999999,
          totalUsed: 0,
          createdAt: Date.now(),
        };
        licensesCache.set(vipLic.key, vipLic);
        saveToDisk();
        return [vipLic];
      }
      for (const r of records) {
        r.credits = 999999;
        r.tier = 'vip_unlimited';
      }
    }
    return records;
  },

  // Find license by Stripe Checkout Session ID
  findBySessionId(sessionId: string): LicenseRecord | null {
    if (!sessionId) return null;
    ensureLoaded();
    for (const lic of licensesCache.values()) {
      if (lic.stripeSessionIds && lic.stripeSessionIds.includes(sessionId)) {
        return lic;
      }
    }
    return null;
  },

  // Central Idempotent Payment Processor (Used by both Stripe Webhook and confirmPaymentSession)
  async processPaymentSuccess(
    sessionId: string,
    stripeSession?: Stripe.Checkout.Session
  ): Promise<{ success: boolean; license?: LicenseRecord; alreadyProcessed?: boolean; error?: string }> {
    ensureLoaded();
    if (!sessionId) {
      return { success: false, error: 'Chybí ID platební relace.' };
    }

    // 1. Idempotency Check: Was this Stripe session already credited?
    const existing = this.findBySessionId(sessionId);
    if (existing) {
      return { success: true, license: existing, alreadyProcessed: true };
    }

    // 2. Handle Sandbox sessions in Development only
    if (sessionId.startsWith('SANDBOX_SES_')) {
      if (process.env.NODE_ENV === 'production') {
        return {
          success: false,
          error: 'Sandbox platby nejsou v produkčním prostředí povoleny.',
        };
      }
      const sandboxLicense = this.createLicense(12, 'pro', 'trader@aiautotrader.com', sessionId);
      return { success: true, license: sandboxLicense, alreadyProcessed: false };
    }

    // 3. Handle Live Stripe Session
    const stripe = getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe není na serveru nakonfigurován (chybí STRIPE_SECRET_KEY).' };
    }

    try {
      const session = stripeSession || (await stripe.checkout.sessions.retrieve(sessionId));
      if (session.payment_status !== 'paid') {
        return { success: false, error: 'Platba nebyla dokončena nebo byla zrušena.' };
      }

      // Read metadata safely
      const pkgId = session.metadata?.packageId || 'pro';
      const pkg = CREDIT_PACKAGES[pkgId] || CREDIT_PACKAGES.pro;
      const credits = parseInt(session.metadata?.credits || String(pkg.credits), 10) || pkg.credits;
      const existingKey = session.metadata?.existingKey ? String(session.metadata.existingKey).trim().toUpperCase() : undefined;
      const email = session.customer_details?.email || session.metadata?.customerEmail || undefined;

      let license: LicenseRecord;
      if (existingKey && this.getLicense(existingKey)) {
        license = this.addCredits(existingKey, credits, sessionId)!;
      } else {
        license = this.createLicense(credits, pkgId, email, sessionId);
      }

      return { success: true, license, alreadyProcessed: false };
    } catch (err: any) {
      console.error('[CreditManager] Error processing payment session:', err?.message || err);
      return { success: false, error: err?.message || 'Nepodařilo se ověřit Stripe platbu.' };
    }
  },

  // Authoritative Stripe Webhook Handler
  async handleStripeWebhook(
    rawBody: Buffer | string,
    signature: string | undefined
  ): Promise<{ success: boolean; eventType?: string; sessionId?: string; error?: string }> {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const stripe = getStripe();

    if (!stripe) {
      return { success: false, error: 'Stripe SDK není inicializován (chybí STRIPE_SECRET_KEY).' };
    }

    if (!webhookSecret) {
      if (process.env.NODE_ENV === 'production') {
        return { success: false, error: 'STRIPE_WEBHOOK_SECRET není v produkci nakonfigurován.' };
      }
      console.warn('[CreditManager] STRIPE_WEBHOOK_SECRET is missing. Webhooks cannot be cryptographically verified.');
      return { success: false, error: 'STRIPE_WEBHOOK_SECRET is not configured.' };
    }

    if (!signature) {
      return { success: false, error: 'Chybí hlavička Stripe-Signature.' };
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error('[CreditManager] Invalid Stripe webhook signature verification failed.');
      return { success: false, error: 'Neplatný Stripe webhook podpis.' };
    }

    // Process relevant webhook events
    if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session && session.id) {
        const result = await this.processPaymentSuccess(session.id, session);
        if (!result.success) {
          return { success: false, eventType: event.type, error: result.error };
        }
        return { success: true, eventType: event.type, sessionId: session.id };
      }
    }

    return { success: true, eventType: event.type };
  },

  // Create Stripe Checkout session (or sandbox session if in development mode)
  async createCheckoutSession(params: {
    packageId: string;
    existingKey?: string;
    customerEmail?: string;
    appUrl?: string;
  }): Promise<{ url: string; sessionId: string; mode: 'live' | 'sandbox'; key?: string }> {
    const pkg = CREDIT_PACKAGES[params.packageId] || CREDIT_PACKAGES.pro;
    const stripe = getStripe();
    const origin = params.appUrl || process.env.APP_URL || 'http://localhost:3000';

    if (stripe) {
      // Live Stripe Checkout Session
      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        customer_email: params.customerEmail || undefined,
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: `AIAUTOTRADER.com - ${pkg.name}`,
                description: `${pkg.credits}x AI Analýza Grafu & Obchodní Plán (SMC, Price Action, R:R)`,
                images: ['https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=500&auto=format&fit=crop&q=60'],
              },
              unit_amount: Math.round(pkg.priceUsd * 100),
            },
            quantity: 1,
          },
        ],
        mode: 'payment',
        success_url: `${origin}?payment_success=true&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}?payment_cancelled=true`,
        metadata: {
          packageId: pkg.id,
          credits: String(pkg.credits),
          existingKey: params.existingKey || '',
          customerEmail: params.customerEmail || '',
        },
      });

      return {
        url: session.url || '',
        sessionId: session.id,
        mode: 'live',
      };
    }

    // In Production: Never silently fall back to granting free sandbox credits
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Platební brána Stripe není v produkci nakonfigurována (chybí STRIPE_SECRET_KEY).');
    }

    // Development Sandbox Mode simulator (Only when NODE_ENV !== 'production')
    const sandboxSessionId = `SANDBOX_SES_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    let targetKey = params.existingKey;

    let license: LicenseRecord;
    if (targetKey && this.getLicense(targetKey)) {
      license = this.addCredits(targetKey, pkg.credits, sandboxSessionId)!;
    } else {
      license = this.createLicense(pkg.credits, pkg.id, params.customerEmail, sandboxSessionId);
    }

    return {
      url: `${origin}?payment_success=true&session_id=${sandboxSessionId}&key=${license.key}&sandbox=true`,
      sessionId: sandboxSessionId,
      mode: 'sandbox',
      key: license.key,
    };
  },

  // Confirm payment & return active license (UX Fallback leveraging idempotent processPaymentSuccess)
  async confirmPaymentSession(sessionId: string): Promise<{ success: boolean; license?: LicenseRecord; alreadyProcessed?: boolean; error?: string }> {
    return this.processPaymentSuccess(sessionId);
  },
};
