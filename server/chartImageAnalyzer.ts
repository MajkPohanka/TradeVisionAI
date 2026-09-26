import { execSync } from 'child_process';

export interface ImageAnalysisResult {
  hasImage: boolean;
  detectedTrend: 'BULLISH' | 'BEARISH' | 'RANGING';
  bullishMomentumScore: number; // 0 to 100
  greenCandleRatio: number; // ratio of green to red candle pixels
  recentReversal: 'BULLISH_REVERSAL' | 'BEARISH_REVERSAL' | 'NONE';
  trendSlope: number; // positive = upward, negative = downward
  confidenceAdjustment: number;
  dominantColorHint: string;
}

/**
 * Parses raw base64 data url to a Buffer
 */
function decodeBase64Image(dataUrl: string): Buffer | null {
  try {
    if (!dataUrl || typeof dataUrl !== 'string') return null;
    let base64Data = dataUrl;
    if (dataUrl.includes('base64,')) {
      base64Data = dataUrl.split('base64,')[1];
    }
    return Buffer.from(base64Data, 'base64');
  } catch {
    return null;
  }
}

/**
 * Analyze an uploaded chart image using lightweight fast ImageMagick sampling.
 * Detects candle colors (green/teal bullish vs red/rose bearish), price slope across the chart,
 * and recent momentum in the latest candles (right side).
 */
export function analyzeChartImage(imageBase64?: string): ImageAnalysisResult {
  const defaultResult: ImageAnalysisResult = {
    hasImage: false,
    detectedTrend: 'RANGING',
    bullishMomentumScore: 50,
    greenCandleRatio: 1.0,
    recentReversal: 'NONE',
    trendSlope: 0,
    confidenceAdjustment: 0,
    dominantColorHint: 'neutral',
  };

  if (!imageBase64) return defaultResult;

  const buf = decodeBase64Image(imageBase64);
  if (!buf || buf.length < 50) return defaultResult;

  try {
    // Resize image to 120x80 raw PPM (P3 text format)
    const ppmOutput = execSync('convert - -resize 120x80! -compress none ppm:-', {
      input: buf,
      maxBuffer: 4 * 1024 * 1024,
      timeout: 2500,
    }).toString('ascii');

    // Parse PPM ASCII format
    // Format:
    // P3
    // [optional comments #...]
    // width height
    // maxVal (e.g. 255)
    // r g b r g b ...
    const tokens = ppmOutput.split(/\s+/).filter(Boolean);
    if (tokens.length < 4 || tokens[0] !== 'P3') {
      return defaultResult;
    }

    let tokenIdx = 1;
    while (tokenIdx < tokens.length && tokens[tokenIdx].startsWith('#')) {
      tokenIdx++;
    }

    const width = parseInt(tokens[tokenIdx++], 10);
    const height = parseInt(tokens[tokenIdx++], 10);
    const maxVal = parseInt(tokens[tokenIdx++], 10);

    if (isNaN(width) || isNaN(height) || width <= 0 || height <= 0 || isNaN(maxVal)) {
      return defaultResult;
    }

    let totalGreenPixels = 0;
    let totalRedPixels = 0;
    let rightGreenPixels = 0;
    let rightRedPixels = 0;

    // Track vertical centroid of candle pixels in left vs right half
    let leftWeightedY = 0;
    let leftPixelCount = 0;
    let rightWeightedY = 0;
    let rightPixelCount = 0;

    const rightStartX = Math.floor(width * 0.65);
    const leftEndX = Math.floor(width * 0.35);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (tokenIdx + 2 >= tokens.length) break;
        const r = parseInt(tokens[tokenIdx++], 10);
        const g = parseInt(tokens[tokenIdx++], 10);
        const b = parseInt(tokens[tokenIdx++], 10);

        // Normalize to 0-255
        const nr = (r / maxVal) * 255;
        const ng = (g / maxVal) * 255;
        const nb = (b / maxVal) * 255;

        // Skip plain background (very dark or very light)
        const brightness = (nr + ng + nb) / 3;
        if (brightness < 20 || brightness > 245) continue;

        // Detect Bullish (Green / Teal / Cyan / Emerald) candle pixels
        // TradingView green: #089981 (r:8, g:153, b:129), #26a69a (r:38, g:166, b:154), #22c55e (r:34, g:197, b:94)
        const isGreenCandle = ng > 55 && ng > nr * 1.15 && (ng >= nb * 0.85 || (ng > 80 && nb > 70 && nr < 50));

        // Detect Bearish (Red / Rose / Crimson) candle pixels
        // TradingView red: #f23645 (r:242, g:54, b:69), #ef5350 (r:239, g:83, b:80)
        const isRedCandle = nr > 65 && nr > ng * 1.25 && nr > nb * 1.1;

        if (isGreenCandle) {
          totalGreenPixels++;
          if (x >= rightStartX) rightGreenPixels++;
        } else if (isRedCandle) {
          totalRedPixels++;
          if (x >= rightStartX) rightRedPixels++;
        }

        // Price trajectory (any candle pixel)
        if (isGreenCandle || isRedCandle) {
          if (x <= leftEndX) {
            leftWeightedY += y;
            leftPixelCount++;
          } else if (x >= rightStartX) {
            rightWeightedY += y;
            rightPixelCount++;
          }
        }
      }
    }

    const totalCandlePixels = totalGreenPixels + totalRedPixels;
    if (totalCandlePixels < 15) {
      // Not enough distinct candle pixels detected, return neutral
      return {
        ...defaultResult,
        hasImage: true,
      };
    }

    const greenRatio = totalGreenPixels / Math.max(1, totalRedPixels);
    const rightGreenRatio = rightGreenPixels / Math.max(1, rightRedPixels);

    // Calculate vertical slope (in images, y=0 is TOP and y=height is BOTTOM)
    // A smaller y value means HIGHER price on a chart!
    let trendSlope = 0;
    if (leftPixelCount > 5 && rightPixelCount > 5) {
      const avgLeftY = leftWeightedY / leftPixelCount;
      const avgRightY = rightWeightedY / rightPixelCount;
      // If right Y is smaller than left Y, price has moved UP!
      trendSlope = avgLeftY - avgRightY;
    }

    // Determine trend & momentum score
    let detectedTrend: 'BULLISH' | 'BEARISH' | 'RANGING' = 'RANGING';
    let bullishMomentumScore = 50;

    // Weight recent candles (right side) heavily
    const momentumRatio = rightGreenRatio * 0.6 + greenRatio * 0.4;

    if (momentumRatio > 1.25 || (trendSlope > 3 && momentumRatio > 0.95)) {
      detectedTrend = 'BULLISH';
      bullishMomentumScore = Math.min(95, Math.round(55 + (momentumRatio - 1) * 25 + Math.max(0, trendSlope) * 1.5));
    } else if (momentumRatio < 0.8 || (trendSlope < -3 && momentumRatio < 1.05)) {
      detectedTrend = 'BEARISH';
      bullishMomentumScore = Math.max(5, Math.round(45 - (1 - momentumRatio) * 25 - Math.max(0, -trendSlope) * 1.5));
    } else {
      detectedTrend = trendSlope > 2 ? 'BULLISH' : trendSlope < -2 ? 'BEARISH' : 'RANGING';
      bullishMomentumScore = 50 + Math.round(trendSlope * 2);
    }

    // Detect potential reversals
    let recentReversal: 'BULLISH_REVERSAL' | 'BEARISH_REVERSAL' | 'NONE' = 'NONE';
    if (trendSlope < -2 && rightGreenRatio > 1.4) {
      // Was falling, but right side has strong green expansion
      recentReversal = 'BULLISH_REVERSAL';
      detectedTrend = 'BULLISH';
      bullishMomentumScore = Math.max(68, bullishMomentumScore + 15);
    } else if (trendSlope > 2 && rightGreenRatio < 0.65) {
      // Was rising, but right side has strong red rejection
      recentReversal = 'BEARISH_REVERSAL';
      detectedTrend = 'BEARISH';
      bullishMomentumScore = Math.min(32, bullishMomentumScore - 15);
    }

    const confidenceAdjustment = Math.abs(bullishMomentumScore - 50) > 20 ? 5 : 0;

    return {
      hasImage: true,
      detectedTrend,
      bullishMomentumScore,
      greenCandleRatio: Number(greenRatio.toFixed(2)),
      recentReversal,
      trendSlope: Number(trendSlope.toFixed(2)),
      confidenceAdjustment,
      dominantColorHint: totalGreenPixels > totalRedPixels ? 'green' : 'red',
    };
  } catch (err) {
    console.warn('[analyzeChartImage] ImageMagick fast analysis fallback:', err);
    return {
      ...defaultResult,
      hasImage: true,
    };
  }
}
