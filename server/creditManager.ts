import fs from 'fs';
import path from 'path';
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

const DATA_DIR = path.join(process.cwd(), 'data');
const LICENSES_FILE = path.join(DATA_DIR, 'licenses.json');

// In-memory cache backed by disk storage
let licensesCache: Map<string, LicenseRecord> = new Map();
let isInitialized = false;

// Ensure storage is loaded
function ensureLoaded() {
  if (isInitialized) return;
  isInitialized = true;

  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(LICENSES_FILE)) {
      const fileData = fs.readFileSync(LICENSES_FILE, 'utf-8');
      const parsed = JSON.parse(fileData);
      if (Array.isArray(parsed)) {
        for (const item of parsed) {
          if (item && item.key) {
            licensesCache.set(item.key.toUpperCase(), item);
          }
        }
      }
    } else {
      // Seed master development testing license with 1000 credits
      const demoKey = 'AIAUTO-DEMO-TEST-2026';
      const demoRecord: LicenseRecord = {
        key: demoKey,
        credits: 1000,
        tier: 'vip_tester',
        email: 'majklpohanka@gmail.com',
        totalPurchased: 1000,
        totalUsed: 0,
        createdAt: Date.now(),
      };
      licensesCache.set(demoKey, demoRecord);
      saveToDisk();
    }
  } catch (err) {
    console.error('Error loading licenses storage:', err);
  }
}

// Persist licenses cache to disk
function saveToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const dataArray = Array.from(licensesCache.values());
    fs.writeFileSync(LICENSES_FILE, JSON.stringify(dataArray, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error saving licenses storage:', err);
  }
}

// Generate unique, readable license key formatted as AIAUTO-XXXX-XXXX-XXXX
export function generateLicenseKey(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit easily confused 0, O, 1, I
  const segment = (len = 4) => {
    let res = '';
    for (let i = 0; i < len; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };
  return `AIAUTO-${segment()}-${segment()}-${segment()}`;
}

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
    return licensesCache.get(cleanKey) || null;
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

  // Atomically check & consume 1 credit for an analysis
  consumeCredit(key: string): { success: boolean; remaining: number; error?: string } {
    ensureLoaded();
    const record = this.getLicense(key);
    if (!record) {
      return {
        success: false,
        remaining: 0,
        error: 'Neplatný nebo nenalezený licenční klíč.',
      };
    }

    if (record.credits <= 0) {
      return {
        success: false,
        remaining: 0,
        error: 'Vyčerpali jste všechny zakoupené kredity. Pro pokračování prosím doplňte kredity.',
      };
    }

    record.credits -= 1;
    record.totalUsed += 1;
    record.lastUsedAt = Date.now();
    licensesCache.set(record.key, record);
    saveToDisk();

    return {
      success: true,
      remaining: record.credits,
    };
  },

  // Find license by email address
  findLicensesByEmail(email: string): LicenseRecord[] {
    if (!email) return [];
    ensureLoaded();
    const target = email.trim().toLowerCase();
    return Array.from(licensesCache.values()).filter(
      (lic) => lic.email && lic.email.toLowerCase() === target
    );
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

  // Create Stripe Checkout session (or sandbox session if Stripe key is omitted)
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

    // Seamless Sandbox / Test Simulator Mode when STRIPE_SECRET_KEY is not configured
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

  // Confirm payment & return active license
  async confirmPaymentSession(sessionId: string): Promise<{ success: boolean; license?: LicenseRecord; error?: string }> {
    ensureLoaded();
    if (!sessionId) {
      return { success: false, error: 'Chybí ID platební relace.' };
    }

    // 1. Check if already recorded
    const existing = this.findBySessionId(sessionId);
    if (existing) {
      return { success: true, license: existing };
    }

    // 2. Handle Sandbox session confirmation
    if (sessionId.startsWith('SANDBOX_SES_')) {
      // In sandbox mode, license was either already created or can be generated
      const sandboxLicense = this.createLicense(12, 'pro', 'trader@aiautotrader.com', sessionId);
      return { success: true, license: sandboxLicense };
    }

    // 3. Handle Live Stripe session
    const stripe = getStripe();
    if (!stripe) {
      return { success: false, error: 'Stripe není na serveru nakonfigurován.' };
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status !== 'paid') {
        return { success: false, error: 'Platba nebyla dokončena nebo byla zrušena.' };
      }

      const credits = parseInt(session.metadata?.credits || '12', 10);
      const pkgId = session.metadata?.packageId || 'pro';
      const existingKey = session.metadata?.existingKey;
      const email = session.customer_details?.email || session.metadata?.customerEmail || undefined;

      let license: LicenseRecord;
      if (existingKey && this.getLicense(existingKey)) {
        license = this.addCredits(existingKey, credits, sessionId)!;
      } else {
        license = this.createLicense(credits, pkgId, email, sessionId);
      }

      return { success: true, license };
    } catch (err: any) {
      console.error('Error verifying Stripe session:', err);
      return { success: false, error: err.message || 'Nepodařilo se ověřit Stripe platbu.' };
    }
  },
};
