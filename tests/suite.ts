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
