import assert from 'node:assert/strict';
import { VIP_UNLIMITED_KEYS } from '../server/creditManager';

interface AuditResult {
  category: string;
  test: string;
  passed: boolean;
  details?: string;
  durationMs: number;
}

const auditLog: AuditResult[] = [];

async function auditStep(category: string, test: string, fn: () => Promise<void> | void) {
  const t0 = Date.now();
  try {
    await fn();
    const durationMs = Date.now() - t0;
    auditLog.push({ category, test, passed: true, durationMs });
    console.log(`  ✓ [${category}] ${test} (${durationMs}ms)`);
  } catch (err: any) {
    const durationMs = Date.now() - t0;
    auditLog.push({ category, test, passed: false, details: err?.message || String(err), durationMs });
    console.error(`  ✗ [${category}] ${test} (${durationMs}ms):`, err?.message || err);
  }
}

const BASE_URL = 'http://127.0.0.1:3000';
const DUMMY_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';
const VIP_KEY = VIP_UNLIMITED_KEYS[0];

async function runComprehensiveEngineAudit() {
  console.log('\n===============================================================');
  console.log('🔬 TRADEOY INSTITUTIONAL ENGINE & METHODOLOGY AUDIT & VERIFICATION');
  console.log('===============================================================\n');

  // ---------------------------------------------------------------------------
  // 1. AUDIT: SCALP TIMEFRAMES (H1 + M5 + M1) & MATHEMATICAL INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('--- 1. Scalp Multi-Timeframe (H1 + M5 + M1) & Risk Engine Audit ---');

  const scalpAssets = [
    { symbol: 'BTCUSDT', name: 'Bitcoin', expectedTf: 'H1 + M5 + M1' },
    { symbol: 'XAUUSD', name: 'Gold', expectedTf: 'H1 + M5 + M1' },
    { symbol: 'EURUSD', name: 'Euro/USD', expectedTf: 'H1 + M5 + M1' },
    { symbol: 'US100', name: 'Nasdaq 100', expectedTf: 'H1 + M5 + M1' },
  ];

  let scalpSlDistances: number[] = [];

  for (const asset of scalpAssets) {
    await auditStep('Engine/Scalp', `${asset.name} (${asset.symbol}) Scalp calculation & timeframe resolution`, async () => {
      const res = await fetch(`${BASE_URL}/api/analyze-chart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: VIP_KEY,
          images: [DUMMY_PNG, DUMMY_PNG, DUMMY_PNG],
          settings: {
            language: 'cs',
            tradingStyle: 'scalp',
            confidenceThreshold: 75,
            symbol: asset.symbol,
          },
        }),
      });

      assert.equal(res.status, 200, `API should respond with 200 for ${asset.symbol}`);
      const json: any = await res.json();
      assert.equal(json.success, true, 'Response must be success');
      const data = json.data;

      // 1. Timeframe verification
      assert.equal(data.timeframe, asset.expectedTf, `Timeframe must be ${asset.expectedTf}, got ${data.timeframe}`);

      // 2. Entry Zone sanity
      assert.ok(typeof data.entryZone?.recommended === 'number' && data.entryZone.recommended > 0);
      assert.ok(typeof data.entryZone?.min === 'number' && data.entryZone.min > 0);
      assert.ok(typeof data.entryZone?.max === 'number' && data.entryZone.max > 0);
      assert.ok(
        data.entryZone.min <= data.entryZone.recommended,
        `entryMin (${data.entryZone.min}) <= entryRecommended (${data.entryZone.recommended})`
      );
      assert.ok(
        data.entryZone.recommended <= data.entryZone.max,
        `entryRecommended (${data.entryZone.recommended}) <= entryMax (${data.entryZone.max})`
      );

      // 3. Stop Loss sanity
      assert.ok(typeof data.stopLoss?.price === 'number' && data.stopLoss.price > 0);
      assert.ok(typeof data.stopLoss?.distancePercent === 'number' && data.stopLoss.distancePercent > 0);
      scalpSlDistances.push(data.stopLoss.distancePercent);

      const isShort = data.signal === 'SHORT' || data.signal === 'SELL';
      if (isShort) {
        assert.ok(data.stopLoss.price > data.entryZone.max, `Short SL (${data.stopLoss.price}) must be above entryMax (${data.entryZone.max})`);
      } else {
        assert.ok(data.stopLoss.price < data.entryZone.min, `Long SL (${data.stopLoss.price}) must be below entryMin (${data.entryZone.min})`);
      }

      // 4. Take Profit Targets Monotonicity & R:R Verification
      assert.ok(Array.isArray(data.takeProfitTargets) && data.takeProfitTargets.length === 3);
      const tp1 = data.takeProfitTargets[0];
      const tp2 = data.takeProfitTargets[1];
      const tp3 = data.takeProfitTargets[2];

      if (isShort) {
        assert.ok(tp1.price < data.entryZone.min, 'TP1 must be below entry for Short');
        assert.ok(tp2.price < tp1.price, 'TP2 must be below TP1 for Short');
        assert.ok(tp3.price < tp2.price, 'TP3 must be below TP2 for Short');
      } else {
        assert.ok(tp1.price > data.entryZone.max, 'TP1 must be above entry for Long');
        assert.ok(tp2.price > tp1.price, 'TP2 must be above TP1 for Long');
        assert.ok(tp3.price > tp2.price, 'TP3 must be above TP2 for Long');
      }

      // R:R sanity (TP1 >= 1.0, TP2 >= 1.5, TP3 >= 2.0)
      assert.ok(tp1.riskRewardRatio >= 1.0, `TP1 R:R (${tp1.riskRewardRatio}) must be >= 1.0`);
      assert.ok(tp2.riskRewardRatio >= 1.5, `TP2 R:R (${tp2.riskRewardRatio}) must be >= 1.5`);
      assert.ok(tp3.riskRewardRatio >= 2.0, `TP3 R:R (${tp3.riskRewardRatio}) must be >= 2.0`);

      // 5. Fair Value Gaps (FVG) and Price Action Structures Verification
      assert.ok(Array.isArray(data.fvgZones), 'fvgZones must be an array');
      assert.ok(data.fvgZones.length > 0, 'fvgZones should not be empty');
      for (const fvg of data.fvgZones) {
        assert.ok(fvg.max >= fvg.min, `FVG max (${fvg.max}) must be >= min (${fvg.min})`);
        const expectedMid = (fvg.max + fvg.min) / 2;
        const diff = Math.abs(fvg.midpoint - expectedMid);
        assert.ok(diff <= 0.05 * expectedMid, `FVG Consequent Encroachment (50%) mathematically verified: ${fvg.midpoint} vs ${expectedMid}`);
      }

      assert.ok(Array.isArray(data.priceActionStructures), 'priceActionStructures must be an array');
      assert.ok(data.priceActionStructures.length > 0, 'priceActionStructures should not be empty');
    });
  }

  // ---------------------------------------------------------------------------
  // 2. AUDIT: INTRADAY TIMEFRAMES (H1 + M15 + M5) & MATHEMATICAL INTEGRITY
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. Intraday Multi-Timeframe (H1 + M15 + M5) & Risk Engine Audit ---');

  const intradayAssets = [
    { symbol: 'ETHUSDT', name: 'Ethereum', expectedTf: 'H1 + M15 + M5' },
    { symbol: 'XAUUSD', name: 'Gold Spot', expectedTf: 'H1 + M15 + M5' },
    { symbol: 'GBPUSD', name: 'Cable (GBP/USD)', expectedTf: 'H1 + M15 + M5' },
    { symbol: 'GER40', name: 'DAX 40', expectedTf: 'H1 + M15 + M5' },
  ];

  let intradaySlDistances: number[] = [];

  for (const asset of intradayAssets) {
    await auditStep('Engine/Intraday', `${asset.name} (${asset.symbol}) Intraday calculation & timeframe resolution`, async () => {
      const res = await fetch(`${BASE_URL}/api/analyze-chart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: VIP_KEY,
          images: [DUMMY_PNG, DUMMY_PNG, DUMMY_PNG],
          settings: {
            language: 'cs',
            tradingStyle: 'intraday',
            confidenceThreshold: 80,
            symbol: asset.symbol,
          },
        }),
      });

      assert.equal(res.status, 200);
      const json: any = await res.json();
      assert.equal(json.success, true);
      const data = json.data;

      assert.equal(data.timeframe, asset.expectedTf, `Timeframe must be ${asset.expectedTf}, got ${data.timeframe}`);
      assert.ok(data.entryZone.min <= data.entryZone.recommended && data.entryZone.recommended <= data.entryZone.max);
      intradaySlDistances.push(data.stopLoss.distancePercent);

      // Verify Take profit monotonicity
      const isShort = data.signal === 'SHORT' || data.signal === 'SELL';
      if (isShort) {
        assert.ok(data.takeProfitTargets[0].price < data.entryZone.min);
        assert.ok(data.takeProfitTargets[1].price < data.takeProfitTargets[0].price);
        assert.ok(data.takeProfitTargets[2].price < data.takeProfitTargets[1].price);
      } else {
        assert.ok(data.takeProfitTargets[0].price > data.entryZone.max);
        assert.ok(data.takeProfitTargets[1].price > data.takeProfitTargets[0].price);
        assert.ok(data.takeProfitTargets[2].price > data.takeProfitTargets[1].price);
      }
    });
  }

  // ---------------------------------------------------------------------------
  // 3. AUDIT: SWING (D1 + H4 + H1) & POSITION (W1 + D1 + H4)
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. Swing & Position Holding Period Hierarchy Audit ---');

  let swingSlDist: number = 0;
  await auditStep('Engine/Swing', 'Swing Trading resolves to D1 + H4 + H1 with proportional risk', async () => {
    const res = await fetch(`${BASE_URL}/api/analyze-chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: VIP_KEY,
        images: [DUMMY_PNG, DUMMY_PNG, DUMMY_PNG],
        settings: {
          language: 'cs',
          tradingStyle: 'swing',
          confidenceThreshold: 80,
          symbol: 'BTCUSDT',
        },
      }),
    });
    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.data.timeframe, 'D1 + H4 + H1');
    swingSlDist = json.data.stopLoss.distancePercent;
  });

  let positionSlDist: number = 0;
  await auditStep('Engine/Position', 'Position Trading resolves to W1 + D1 + H4 with proportional risk', async () => {
    const res = await fetch(`${BASE_URL}/api/analyze-chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: VIP_KEY,
        images: [DUMMY_PNG, DUMMY_PNG, DUMMY_PNG],
        settings: {
          language: 'cs',
          tradingStyle: 'position',
          confidenceThreshold: 80,
          symbol: 'BTCUSDT',
        },
      }),
    });
    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.data.timeframe, 'W1 + D1 + H4');
    positionSlDist = json.data.stopLoss.distancePercent;
  });

  // ---------------------------------------------------------------------------
  // 4. AUDIT: RISK CALIBRATION HIERARCHY (Scalp < Intraday < Swing < Position)
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. Mathematical Risk Hierarchy Verification ---');

  await auditStep('Engine/RiskHierarchy', 'Average SL distance strictly respects Scalp < Intraday < Swing < Position', () => {
    const avgScalpSl = scalpSlDistances.reduce((a, b) => a + b, 0) / scalpSlDistances.length;
    const avgIntradaySl = intradaySlDistances.reduce((a, b) => a + b, 0) / intradaySlDistances.length;

    console.log(`    -> Avg Scalp SL: ${avgScalpSl.toFixed(2)}%`);
    console.log(`    -> Avg Intraday SL: ${avgIntradaySl.toFixed(2)}%`);
    console.log(`    -> Swing BTC SL: ${swingSlDist.toFixed(2)}%`);
    console.log(`    -> Position BTC SL: ${positionSlDist.toFixed(2)}%`);

    assert.ok(
      avgScalpSl < avgIntradaySl,
      `Scalp average SL (${avgScalpSl.toFixed(2)}%) must be tighter than Intraday (${avgIntradaySl.toFixed(2)}%)`
    );
    assert.ok(
      avgIntradaySl < swingSlDist,
      `Intraday SL (${avgIntradaySl.toFixed(2)}%) must be tighter than Swing SL (${swingSlDist.toFixed(2)}%)`
    );
    assert.ok(
      swingSlDist <= positionSlDist,
      `Swing SL (${swingSlDist.toFixed(2)}%) must be <= Position SL (${positionSlDist.toFixed(2)}%)`
    );
  });

  // ---------------------------------------------------------------------------
  // 5. AUDIT: TRADING MENTOR ENGINE METHODOLOGY EXPLANATIONS
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. Trading Mentor Methodology & Timeframe Advice Audit ---');

  await auditStep('Mentor/Scalp', 'Mentor correctly recognizes Scalp setup and recommends 1M / 5M confirmation with 1H bias', async () => {
    const mockScalpAnalysis = {
      symbol: 'BTCUSDT',
      timeframe: 'H1 + M5 + M1',
      holdingPeriod: 'scalp',
      tradingStyle: 'scalp',
      signal: 'BUY',
      confidence: 86,
      entryZone: { recommended: 78000, min: 77800, max: 78200 },
      stopLoss: { price: 77400, distancePercent: 0.77 },
      takeProfitTargets: [
        { target: 1, price: 78800, riskRewardRatio: 1.3 },
        { target: 2, price: 79600, riskRewardRatio: 2.7 },
        { target: 3, price: 81000, riskRewardRatio: 5.0 },
      ],
      fairValueGaps: [{ type: 'BULLISH', high: 78300, low: 77900, consequentEncroachment: 78100, status: 'UNFILLED' }],
      orderBlocks: [{ type: 'BULLISH_ORDER_BLOCK', high: 78000, low: 77500, meanThreshold: 77750, isMitigated: false }],
    };

    const res = await fetch(`${BASE_URL}/api/ask-mentor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: VIP_KEY,
        currentAnalysis: mockScalpAnalysis,
        question: 'Jaké časové rámce mám sledovat pro potvrzení vstupu u tohoto scalpu?',
        language: 'cs',
      }),
    });

    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.success, true);
    const advice = json.answer || json.data?.advice || '';
    assert.ok(advice.length > 50, 'Mentor response must be rich and detailed');
    // Must contain 1M or 5M or H1/1H
    assert.ok(
      advice.includes('1M') || advice.includes('M1') || advice.includes('5M') || advice.includes('1H') || advice.includes('H1') || advice.includes('minut'),
      `Mentor advice should mention scalp timeframes (1M/5M/1H). Got: ${advice.substring(0, 150)}...`
    );
  });

  await auditStep('Mentor/Intraday', 'Mentor correctly recognizes Intraday setup with 1H + 15M + 5M structure', async () => {
    const mockIntradayAnalysis = {
      symbol: 'XAUUSD',
      timeframe: 'H1 + M15 + M5',
      holdingPeriod: 'intraday',
      tradingStyle: 'intraday',
      signal: 'BUY',
      confidence: 88,
      entryZone: { recommended: 4371.10, min: 4368.50, max: 4373.80 },
      stopLoss: { price: 4352.00, distancePercent: 0.44 },
      takeProfitTargets: [
        { target: 1, price: 4390.00, riskRewardRatio: 1.0 },
        { target: 2, price: 4410.00, riskRewardRatio: 2.0 },
        { target: 3, price: 4435.00, riskRewardRatio: 3.3 },
      ],
      fairValueGaps: [{ type: 'BULLISH', high: 4385, low: 4365, consequentEncroachment: 4375, status: 'UNFILLED' }],
      orderBlocks: [{ type: 'BULLISH_ORDER_BLOCK', high: 4370, low: 4350, meanThreshold: 4360, isMitigated: false }],
    };

    const res = await fetch(`${BASE_URL}/api/ask-mentor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: VIP_KEY,
        currentAnalysis: mockIntradayAnalysis,
        question: 'Proč je u intraday důležitý rámec H1?',
        language: 'cs',
      }),
    });

    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.success, true);
    const advice = json.answer || json.data?.advice || '';
    assert.ok(advice.length > 50);
    assert.ok(
      advice.includes('H1') || advice.includes('1H') || advice.includes('rámec') || advice.includes('trend') || advice.includes('intraday'),
      'Mentor must address H1 intraday structural context'
    );
  });

  await auditStep('Mentor/FVG_Math', 'Mentor accurately explains FVG 50% Consequent Encroachment (CE) level', async () => {
    const res = await fetch(`${BASE_URL}/api/ask-mentor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: VIP_KEY,
        question: 'Co přesně znamená 50% CE (Consequent Encroachment) úroveň u FVG?',
        language: 'cs',
      }),
    });

    assert.equal(res.status, 200);
    const json: any = await res.json();
    assert.equal(json.success, true);
    const advice = json.answer || json.data?.advice || '';
    assert.ok(advice.length > 50);
    assert.ok(
      advice.includes('50') || advice.includes('polovin') || advice.includes('střed') || advice.includes('FVG'),
      'Mentor must explain 50% midpoint of Fair Value Gap'
    );
  });

  // ---------------------------------------------------------------------------
  // 6. AUDIT: 1-IMAGE, 2-IMAGE, 3-IMAGE MULTI-TIMEFRAME ADAPTATION
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. Image Multi-Slot Dynamic Timeframe Parsing ---');

  await auditStep('Engine/Images', '1 image resolves to single main TF (H1)', async () => {
    const res = await fetch(`${BASE_URL}/api/analyze-chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: VIP_KEY,
        images: [DUMMY_PNG],
        settings: { tradingStyle: 'scalp', symbol: 'BTCUSDT' },
      }),
    });
    const json: any = await res.json();
    assert.equal(json.data.timeframe, 'H1');
  });

  await auditStep('Engine/Images', '2 images resolve to HTF + MTF (H1 + M5)', async () => {
    const res = await fetch(`${BASE_URL}/api/analyze-chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: VIP_KEY,
        images: [DUMMY_PNG, DUMMY_PNG],
        settings: { tradingStyle: 'scalp', symbol: 'BTCUSDT' },
      }),
    });
    const json: any = await res.json();
    assert.equal(json.data.timeframe, 'H1 + M5');
  });

  await auditStep('Engine/Images', '3 images resolve to HTF + MTF + LTF (H1 + M5 + M1)', async () => {
    const res = await fetch(`${BASE_URL}/api/analyze-chart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey: VIP_KEY,
        images: [DUMMY_PNG, DUMMY_PNG, DUMMY_PNG],
        settings: { tradingStyle: 'scalp', symbol: 'BTCUSDT' },
      }),
    });
    const json: any = await res.json();
    assert.equal(json.data.timeframe, 'H1 + M5 + M1');
  });

  // ---------------------------------------------------------------------------
  // SUMMARY
  // ---------------------------------------------------------------------------
  console.log('\n===============================================================');
  const passed = auditLog.filter(a => a.passed).length;
  const failed = auditLog.filter(a => !a.passed).length;
  console.log(`AUDIT FINISHED: ${passed} PASSED, ${failed} FAILED (Total: ${auditLog.length})`);
  console.log('===============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runComprehensiveEngineAudit().catch((err) => {
  console.error('Fatal audit failure:', err);
  process.exit(1);
});
