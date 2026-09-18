import assert from 'node:assert/strict';
import { CreditManager, generateLicenseKey, isUnlimitedUser, VIP_UNLIMITED_KEYS } from '../server/creditManager';
import {
  AnalyzeChartSchema,
  AuditMetaTraderSchema,
  AskMentorSchema,
  CreateCheckoutSessionSchema,
  ConfirmSessionSchema,
  formatZodError,
} from '../server/schemas';
import { translations, getTranslation } from '../src/utils/translations';
import { localizeEconomicTitle } from '../server/economicLocalization';

interface TestResult {
  name: string;
  category: string;
  passed: boolean;
  error?: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function runTest(category: string, name: string, fn: () => Promise<void> | void) {
  const start = Date.now();
  try {
    await fn();
    results.push({ category, name, passed: true, durationMs: Date.now() - start });
    console.log(`  ✓ [${category}] ${name}`);
  } catch (err: any) {
    results.push({ category, name, passed: false, error: err?.message || String(err), durationMs: Date.now() - start });
    console.error(`  ✗ [${category}] ${name}:`, err?.message || err);
  }
}

async function main() {
  console.log('\n========================================');
  console.log('🚀 TRADEOY - COMPREHENSIVE SECURITY & RELIABILITY TEST SUITE');
  console.log('========================================\n');

  // ----------------------------------------------------
  // 1. UNIT & SECURITY TESTS: CreditManager & Licensing
  // ----------------------------------------------------
  console.log('--- 1. CreditManager & License Security Tests ---');

  await runTest('CreditManager', 'Generates valid cryptographically secure license key format', () => {
    const key = generateLicenseKey();
    assert.match(key, /^TRADEOY-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  });

  await runTest('CreditManager', 'License creation, balance inquiry, and trimming/case-insensitivity', () => {
    const created = CreditManager.createLicense(5, 'pro_test', 'test@example.com');
    assert.ok(created.key);
    assert.equal(created.credits, 5);

    // Case-insensitivity & trimming check
    const fetchedLower = CreditManager.getLicense(`  ${created.key.toLowerCase()}  `);
    assert.ok(fetchedLower);
    assert.equal(fetchedLower?.key, created.key);
    assert.equal(fetchedLower?.credits, 5);
  });

  await runTest('CreditManager', 'VIP Unlimited recognition for pre-configured founder keys & accounts', () => {
    const vipKey = VIP_UNLIMITED_KEYS[0];
    const vipRecord = CreditManager.getLicense(vipKey);
    assert.ok(vipRecord, 'VIP key must be registered');
    assert.equal(isUnlimitedUser(vipRecord), true);

    // Direct email check
    assert.equal(isUnlimitedUser(null, 'majklpohanka@gmail.com'), true);
    assert.equal(isUnlimitedUser(null, 'attacker@malicious.com'), false);
  });

  await runTest('CreditManager', 'Atomic credit reservation and exact-once commitment', () => {
    const user = CreditManager.createLicense(2, 'test_user');
    
    // 1. Reserve 1 credit
    const res1 = CreditManager.reserveCredit(user.key, 1);
    assert.equal(res1.success, true);
    assert.ok(res1.reservationId);
    assert.equal(res1.remainingCredits, 1);

    // 2. Commit the reservation
    const committed = CreditManager.commitReservation(res1.reservationId);
    assert.equal(committed, true);

    // 3. Rollback after commit must be rejected (cannot double-refund)
    const illegalRollback = CreditManager.rollbackReservation(res1.reservationId);
    assert.equal(illegalRollback.success, false);

    const refreshed = CreditManager.getLicense(user.key);
    assert.equal(refreshed?.credits, 1);
  });

  await runTest('CreditManager', 'Atomic credit rollback on failure refunds exact balance', () => {
    const user = CreditManager.createLicense(3, 'test_rollback');
    
    // Reserve 1 credit
    const res = CreditManager.reserveCredit(user.key, 1);
    assert.equal(res.success, true);
    assert.equal(res.remainingCredits, 2);

    // AI operation simulated failure -> Trigger rollback
    const rollback = CreditManager.rollbackReservation(res.reservationId);
    assert.equal(rollback.success, true);
    assert.equal(rollback.remainingCredits, 3);

    // Duplicate rollback attempt must fail safely
    const duplicateRollback = CreditManager.rollbackReservation(res.reservationId);
    assert.equal(duplicateRollback.success, false);

    const finalRecord = CreditManager.getLicense(user.key);
    assert.equal(finalRecord?.credits, 3);
  });

  await runTest('CreditManager', 'Rejects reservation when credits are 0 or insufficient', () => {
    const emptyUser = CreditManager.createLicense(0, 'empty');
    const res = CreditManager.reserveCredit(emptyUser.key, 1);
    assert.equal(res.success, false);
    assert.match(res.error || '', /Vyčerpali jste všechny zakoupené kredity/);
  });

  await runTest('CreditManager', 'VIP Unlimited reservation does not deduct credits', () => {
    const vipKey = VIP_UNLIMITED_KEYS[1];
    const res = CreditManager.reserveCredit(vipKey, 1);
    assert.equal(res.success, true);
    assert.equal(res.remainingCredits, 999999);
  });

  // ----------------------------------------------------
  // 2. INPUT VALIDATION & SCHEMAS SECURITY TESTS
  // ----------------------------------------------------
  console.log('\n--- 2. Zod Input Validation & Payload Security Tests ---');

  await runTest('Schemas', 'AnalyzeChartSchema accepts valid multi-timeframe payload', () => {
    const valid = {
      licenseKey: 'TRADEOY-ABCD-EFGH-IJKL',
      images: ['data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='],
      settings: {
        language: 'cs' as const,
        tradingStyle: 'swing',
        confidenceThreshold: 75,
      },
    };
    const parsed = AnalyzeChartSchema.safeParse(valid);
    assert.equal(parsed.success, true);
  });

  await runTest('Schemas', 'AnalyzeChartSchema rejects empty image list and short license key', () => {
    const invalidNoImg = {
      licenseKey: 'TRADEOY-VALID-KEY',
      images: [],
    };
    const p1 = AnalyzeChartSchema.safeParse(invalidNoImg);
    assert.equal(p1.success, false);

    const invalidKey = {
      licenseKey: '123',
      images: ['data:image/png;base64,abc1234567890'],
    };
    const p2 = AnalyzeChartSchema.safeParse(invalidKey);
    assert.equal(p2.success, false);
  });

  await runTest('Schemas', 'AuditMetaTraderSchema requires either rawText or images', () => {
    const neither = {
      licenseKey: 'TRADEOY-VALID-KEY',
    };
    const p = AuditMetaTraderSchema.safeParse(neither);
    assert.equal(p.success, false);

    const withText = {
      licenseKey: 'TRADEOY-VALID-KEY',
      rawText: 'Closed P/L: +$1,250.00 | Trades: 42',
    };
    const pOk = AuditMetaTraderSchema.safeParse(withText);
    assert.equal(pOk.success, true);
  });

  await runTest('Schemas', 'AskMentorSchema bounds question length to prevent token exhaustion', () => {
    const oversizedQuestion = 'A'.repeat(3000); // Limit is 2500
    const p = AskMentorSchema.safeParse({
      licenseKey: 'TRADEOY-VALID-KEY',
      question: oversizedQuestion,
    });
    assert.equal(p.success, false);
    if (!p.success) {
      const formatted = formatZodError(p.error);
      assert.match(formatted, /příliš dlouhý/);
    }
  });

  await runTest('Schemas', 'CreateCheckoutSessionSchema enforces known package identifiers', () => {
    const valid = CreateCheckoutSessionSchema.safeParse({
      packageId: 'pro',
      customerEmail: 'trader@example.com',
    });
    assert.equal(valid.success, true);

    const invalid = CreateCheckoutSessionSchema.safeParse({
      packageId: 'free_unlimited_hacked',
    });
    assert.equal(invalid.success, false);
  });

  // ----------------------------------------------------
  // 3. INTEGRATION HTTP ENDPOINT & SECURITY TESTS
  // ----------------------------------------------------
  console.log('\n--- 3. HTTP Server API & Security Middleware Tests ---');

  const BASE_URL = 'http://127.0.0.1:3000';

  await runTest('HTTP/API', 'GET /api/health returns 200 with readiness & liveness stats', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.equal(data.status, 'ok');
    assert.equal(data.liveness?.status, 'alive');
    assert.ok(typeof data.liveness?.memory?.heapUsedMb === 'number');
    assert.ok(typeof data.readiness?.storageReady === 'boolean');
  });

  await runTest('HTTP/Security', 'Security headers (X-Content-Type-Options, X-Frame-Options) are enforced', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.equal(res.headers.get('x-xss-protection'), '1; mode=block');
    assert.equal(res.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  });

  await runTest('HTTP/API', 'GET /api/credits/packages returns valid packages with positive credits', async () => {
    const res = await fetch(`${BASE_URL}/api/credits/packages`);
    assert.equal(res.status, 200);
    const data: any = await res.json();
    assert.ok(Array.isArray(data.packages), 'packages should be an array');
    const pro = data.packages.find((p: any) => p.id === 'pro');
    const starter = data.packages.find((p: any) => p.id === 'starter');
    const inst = data.packages.find((p: any) => p.id === 'institutional');
    assert.ok(pro, 'Pro package exists');
    assert.ok(starter, 'Starter package exists');
    assert.ok(inst, 'Institutional package exists');
    assert.ok(pro.credits > 0, 'Credits must be positive');
    assert.ok(pro.priceUsd > 0, 'Price must be positive');
  });

  await runTest('HTTP/API', 'POST /api/analyze-chart rejects unauthenticated or invalid payload with HTTP 400', async () => {
    const res = await fetch(`${BASE_URL}/api/analyze-chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400);
    const json: any = await res.json();
    assert.equal(json.code, 'VALIDATION_ERROR');
  });

  await runTest('HTTP/API', 'POST /api/ask-mentor rejects non-existent license key with HTTP 401', async () => {
    const res = await fetch(`${BASE_URL}/api/ask-mentor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: 'TRADEOY-FAKE-DOESNT-EXIST',
        question: 'What is the recommended risk management strategy?',
      }),
    });
    assert.equal(res.status, 401);
    const json: any = await res.json();
    assert.equal(json.code, 'INVALID_LICENSE_KEY');
  });

  await runTest('HTTP/Security', 'ALL /api/* unknown routes return JSON 404 (not HTML)', async () => {
    const res = await fetch(`${BASE_URL}/api/non_existent_exploit_path`);
    assert.equal(res.status, 404);
    const contentType = res.headers.get('content-type') || '';
    assert.ok(contentType.includes('application/json'));
    const json: any = await res.json();
    assert.equal(json.success, false);
  });

  await runTest('HTTP/API', 'POST /api/credits/claim-trial grants starter credits safely', async () => {
    const res = await fetch(`${BASE_URL}/api/credits/claim-trial`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'testrunner@tradeoy.com' }),
    });
    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.success, true);
    assert.ok(json.license?.key);
    assert.ok(json.license?.credits >= 3);
  });

  await runTest('HTTP/Security', 'API errors and schema validation never leak Google prepay or billing URLs', async () => {
    const res = await fetch(`${BASE_URL}/api/analyze-chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ licenseKey: 'TRADEOY-TEST-LEAK-PROBE' }),
    });
    const text = await res.text();
    assert.ok(!text.includes('billing#prepay'));
    assert.ok(!text.includes('prepayment credits are depleted'));
    assert.ok(!text.includes('ai.studio/projects'));
  });

  // ----------------------------------------------------
  // 4. PENETRATION TESTS & ARCHITECTURAL SECURITY DEFENSES
  // ----------------------------------------------------
  console.log('\n--- 4. Penetration Tests & DoS/SSRF/DB Security Defense ---');

  await runTest('PenTest/SSRF', 'POST /api/fetch-chart-image blocks Cloud Metadata service IP (169.254.169.254)', async () => {
    const res = await fetch(`${BASE_URL}/api/fetch-chart-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://169.254.169.254/computeMetadata/v1/instance/id' }),
    });
    assert.equal(res.status, 403);
    const data: any = await res.json();
    assert.equal(data.success, false);
  });

  await runTest('PenTest/SSRF', 'POST /api/fetch-chart-image blocks Cloud Metadata hostname (metadata.google.internal)', async () => {
    const res = await fetch(`${BASE_URL}/api/fetch-chart-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://metadata.google.internal/computeMetadata/v1/' }),
    });
    assert.equal(res.status, 403);
    const data: any = await res.json();
    assert.equal(data.success, false);
  });

  await runTest('PenTest/SSRF', 'POST /api/fetch-chart-image blocks local loopback (127.0.0.1 / localhost)', async () => {
    const res = await fetch(`${BASE_URL}/api/fetch-chart-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://127.0.0.1:3000/api/health' }),
    });
    assert.equal(res.status, 403);
  });

  await runTest('PenTest/SSRF', 'POST /api/fetch-chart-image blocks RFC 1918 private subnets (10.x, 192.168.x)', async () => {
    const res1 = await fetch(`${BASE_URL}/api/fetch-chart-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://192.168.1.1/admin' }),
    });
    assert.equal(res1.status, 403);

    const res2 = await fetch(`${BASE_URL}/api/fetch-chart-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'http://10.0.0.1/' }),
    });
    assert.equal(res2.status, 403);
  });

  await runTest('PenTest/SSRF', 'POST /api/fetch-chart-image rejects non-HTTP protocols (file://, ftp://)', async () => {
    const res = await fetch(`${BASE_URL}/api/fetch-chart-image`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: 'file:///etc/passwd' }),
    });
    assert.equal(res.status, 400);
  });

  await runTest('DB/Concurrency', 'Concurrent credit reservation prevents double-spending race conditions', async () => {
    // Create isolated test license with exactly 2 credits
    const testLicense = CreditManager.createLicense(2, 'starter', 'concurrency-pentest@tradeoy.com');
    const key = testLicense.key;

    // Fire 20 simultaneous reservation requests in parallel
    const reservationAttempts = Array.from({ length: 20 }, () =>
      CreditManager.reserveCredit(key, 1)
    );

    const results = await Promise.all(reservationAttempts);
    const successfulReservations = results.filter((r) => r.success);
    const rejectedReservations = results.filter((r) => !r.success);

    // Exactly 2 must succeed, exactly 18 must be blocked
    assert.equal(successfulReservations.length, 2, 'Exactly 2 reservations must succeed for balance 2');
    assert.equal(rejectedReservations.length, 18, 'Remaining 18 concurrent requests must be rejected');

    const finalState = CreditManager.getLicense(key);
    assert.equal(finalState?.credits, 0, 'Final credit balance must be exactly 0 (no negative balance)');
  });

  await runTest('PenTest/DoS', 'Rate limiter blocks brute-force enumeration attacks (returns HTTP 429)', async () => {
    // Send a burst of requests to trigger rate limit on auth endpoint
    let triggered429 = false;
    for (let i = 0; i < 40; i++) {
      const res = await fetch(`${BASE_URL}/api/credits/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: `BRUTE-FORCE-ATTEMPT-${i}` }),
      });
      if (res.status === 429) {
        triggered429 = true;
        const data: any = await res.json();
        assert.ok(data.retryAfter >= 0);
        break;
      }
    }
    assert.ok(triggered429, 'Rate limiter must engage and return HTTP 429 upon high-frequency burst');
  });

  await runTest('HTTP/Security', 'OWASP headers contain strict Permissions-Policy and COOP isolation', async () => {
    const res = await fetch(`${BASE_URL}/api/health`);
    assert.ok(res.headers.get('permissions-policy')?.includes('camera=()'));
    assert.equal(res.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
  });

  // ----------------------------------------------------
  // 5. LOCALIZATION & TRANSLATION PARITY (CS, EN, ES)
  // ----------------------------------------------------
  console.log('\n--- 5. Localization & Translation Parity (CS, EN, ES) ---');

  await runTest('Localization/Parity', 'Translation key parity between CS, EN, and ES (all 445+ keys present)', () => {
    const csKeys = Object.keys(translations.cs);
    const enKeys = Object.keys(translations.en);
    const esKeys = Object.keys(translations.es);

    assert.equal(csKeys.length, enKeys.length, `Key count mismatch between CS (${csKeys.length}) and EN (${enKeys.length})`);
    assert.equal(csKeys.length, esKeys.length, `Key count mismatch between CS (${csKeys.length}) and ES (${esKeys.length})`);

    const missingEn = csKeys.filter(k => !(k in translations.en));
    const missingEs = csKeys.filter(k => !(k in translations.es));

    assert.equal(missingEn.length, 0, `Missing EN keys: ${missingEn.join(', ')}`);
    assert.equal(missingEs.length, 0, `Missing ES keys: ${missingEs.join(', ')}`);
  });

  await runTest('Localization/Integrity', 'No empty, null, or undefined translation strings across all languages', () => {
    for (const lang of ['cs', 'en', 'es'] as const) {
      const dict = translations[lang];
      for (const [key, val] of Object.entries(dict)) {
        assert.ok(typeof val === 'string', `${lang}.${key} is not a string`);
        assert.ok(val.trim().length > 0, `${lang}.${key} is empty`);
      }
    }
  });

  await runTest('Localization/Helper', 'getTranslation helper returns correct language dictionary with fallback', () => {
    const cs = getTranslation('cs');
    const en = getTranslation('en');
    const es = getTranslation('es');
    const fallback = getTranslation('de' as any);

    assert.equal(cs.tabAnalyzer, 'Analýza Grafu');
    assert.equal(en.tabAnalyzer, 'Chart Analysis');
    assert.equal(es.tabAnalyzer, 'Análisis de Gráficos');
    assert.equal(fallback.tabAnalyzer, 'Analýza Grafu');
  });

  // ----------------------------------------------------
  // 6. ECONOMIC CALENDAR & MACRO NEWS LOCALIZATION
  // ----------------------------------------------------
  console.log('\n--- 6. Economic Calendar & Macro News Localization ---');

  await runTest('Calendar/Translation', 'localizeEconomicTitle translates US/EU macro indicators to CS and ES', () => {
    const testCases = [
      {
        raw: 'Core CPI m/m & Consumer Price Index y/y',
        cs: 'Jádrová inflace CPI (m/m) a Index spotřebitelských cen (y/y)',
        es: 'IPC subyacente (m/m) e Índice de Precios al Consumidor (a/a)',
      },
      {
        raw: 'Non-Farm Employment Change (NFP) & Unemployment Rate',
        cs: 'NFP - Tvorba pracovních míst mimo zemědělství a míra nezaměstnanosti',
        es: 'Nóminas no agrícolas (NFP) y Tasa de desempleo',
      },
      {
        raw: 'FOMC Meeting Minutes / Rate Decision',
        cs: 'Zápis z jednání FOMC / Rozhodnutí o úrokových sazbách Fed',
        es: 'Minutas de la reunión del FOMC / Decisión de tipos de interés',
      },
      {
        raw: 'Crude Oil Inventories',
        cs: 'Týdenní zásoby ropy v USA (EIA)',
        es: 'Inventarios de petróleo crudo de la AIE',
      },
    ];

    for (const tc of testCases) {
      assert.equal(localizeEconomicTitle(tc.raw, 'cs'), tc.cs);
      assert.equal(localizeEconomicTitle(tc.raw, 'es'), tc.es);
      assert.equal(localizeEconomicTitle(tc.raw, 'en'), tc.raw);
    }
  });

  await runTest('Calendar/API', 'POST /api/economic-calendar returns localized schedule in CS', async () => {
    const res = await fetch(`${BASE_URL}/api/economic-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'cs', date: '20.8.2026' }),
    });
    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.success, true);
    assert.ok(Array.isArray(json.data.events));
    assert.ok(json.data.events.length > 0);
    assert.ok(json.data.marketSummaryAdvice);
  });

  await runTest('Calendar/API', 'POST /api/economic-calendar returns localized schedule in EN and ES', async () => {
    const resEn = await fetch(`${BASE_URL}/api/economic-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'en', date: '20.8.2026' }),
    });
    assert.equal(resEn.status, 200);
    const jsonEn: any = await resEn.json();
    assert.equal(jsonEn.success, true);
    assert.ok(jsonEn.data.marketSummaryAdvice.includes('macro risk') || jsonEn.data.marketSummaryAdvice.includes('economic news'));

    const resEs = await fetch(`${BASE_URL}/api/economic-calendar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'es', date: '20.8.2026' }),
    });
    assert.equal(resEs.status, 200);
    const jsonEs: any = await resEs.json();
    assert.equal(jsonEs.success, true);
    assert.ok(jsonEs.data.marketSummaryAdvice.includes('Riesgo macro') || jsonEs.data.marketSummaryAdvice.includes('noticias'));
  });

  // ----------------------------------------------------
  // 7. MARKET OVERVIEW BAR & ASSET LOCALIZATION
  // ----------------------------------------------------
  console.log('\n--- 7. Market Overview Bar & Asset Localization ---');

  await runTest('MarketOverview/API', 'GET /api/market-overview returns 16 assets with complete CS, EN, and ES labels', async () => {
    const res = await fetch(`${BASE_URL}/api/market-overview`);
    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.assets.length, 16);

    for (const asset of json.assets) {
      assert.ok(asset.name, `Missing English name for ${asset.id}`);
      assert.ok(asset.nameCs, `Missing Czech name for ${asset.id}`);
      assert.ok(asset.nameEs, `Missing Spanish name for ${asset.id}`);
      assert.ok(asset.categoryLabelEn, `Missing English category for ${asset.id}`);
      assert.ok(asset.categoryLabelCs, `Missing Czech category for ${asset.id}`);
      assert.ok(asset.categoryLabelEs, `Missing Spanish category for ${asset.id}`);
      assert.ok(typeof asset.price === 'number', `Invalid price for ${asset.id}`);
    }
  });

  // ----------------------------------------------------
  // 8. METATRADER AUDIT & FALLBACK GENERATOR
  // ----------------------------------------------------
  console.log('\n--- 8. MetaTrader Audit & Fallback Engine Multi-Language Integrity ---');

  await runTest('Audit/API', 'POST /api/audit-metatrader processes text history with VIP unlimited license', async () => {
    const res = await fetch(`${BASE_URL}/api/audit-metatrader`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rawText: `Ticket\tOpen Time\tType\tSize\tItem\tPrice\tS/L\tT/P\tClose Time\tPrice\tProfit
#102941\t2026.08.06 14:28\tBUY\t1.00\tEURUSD\t1.08500\t0.00000\t1.09200\t2026.08.06 14:32\t1.08120\t-380.00
#102945\t2026.08.06 14:33\tSELL\t2.00\tEURUSD\t1.08100\t0.00000\t0.00000\t2026.08.06 14:36\t1.08350\t-500.00
#102950\t2026.08.06 15:10\tBUY\t0.50\tBTCUSD\t63200.00\t62500.00\t64500.00\t2026.08.06 18:20\t64500.00\t+650.00`,
        settings: { language: 'cs', holdingPeriod: 'intraday', methodologies: ['price_action', 'smc'], riskProfile: 'balanced' },
        licenseKey: 'TRADEOY-VIP-UNLIMITED-MASTER',
      }),
    });

    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.success, true);
    const tradesCount = json.data.tradesAnalyzedCount ?? json.data.totalTrades;
    assert.ok(typeof tradesCount === 'number' && tradesCount >= 1);
    const winRate = json.data.winRatePercent ?? json.data.winRate;
    assert.ok(typeof winRate === 'number');
    const mistakes = json.data.primaryMistakes ?? json.data.mistakeBreakdown;
    assert.ok(Array.isArray(mistakes));
  });

  // ----------------------------------------------------
  // 9. DYNAMIC ANALYSIS TRANSLATION PIPELINE
  // ----------------------------------------------------
  console.log('\n--- 9. Dynamic Analysis Translation Pipeline ---');

  await runTest('TranslateAnalysis/API', 'POST /api/translate-analysis returns translated structure for fallback analysis', async () => {
    const mockResult = {
      id: 'test-analysis-123',
      timestamp: Date.now(),
      symbol: 'BTCUSDT',
      timeframe: 'H1 + M15 + M5',
      signal: 'BUY',
      confidence: 85,
      isFallbackEngine: true,
      language: 'cs',
      biasReasoning: 'Cena testuje klíčovou zónu podpory a vytváří nákupní konfluenci.',
      drawOnLiquidity: {
        target: 'BSL 65000',
        type: 'BUY_SIDE_LIQUIDITY',
        reason: 'Likvidita čeká nad lokálními maximy',
        prohibitedOpposingTrade: 'Není doporučeno prodávat',
      },
      stopLoss: { price: 62000, reason: 'Invalidace pod swingovým minimem' },
      takeProfitTargets: [{ target: 'TP1', price: 64500, closePercentage: 50, description: 'První zóna odporu' }],
    };

    const res = await fetch(`${BASE_URL}/api/translate-analysis`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        result: mockResult,
        targetLanguage: 'en',
      }),
    });

    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.translatedResult.language, 'en');
    assert.equal(json.translatedResult.id, mockResult.id);
  });

  // ----------------------------------------------------
  // SUMMARY
  // ----------------------------------------------------
  console.log('\n========================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`RESULTS: ${passedCount} PASSED, ${failedCount} FAILED (Total: ${results.length})`);
  console.log('========================================\n');

  if (failedCount > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
