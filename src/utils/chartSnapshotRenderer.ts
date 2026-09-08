export interface CandleData {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface RenderChartOptions {
  symbol: string;
  timeframe: string;
  displayName?: string;
  candles: CandleData[];
  precision?: number;
  currentPrice?: number;
  priceChangePercent?: number;
  width?: number;
  height?: number;
}

// Compute Exponential Moving Average (EMA)
function calculateEMA(data: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const emaArray: (number | null)[] = [];
  let prevEma: number | null = null;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) {
      emaArray.push(null);
      continue;
    }
    if (prevEma === null) {
      // First EMA is simple moving average
      const sum = data.slice(0, period).reduce((a, b) => a + b, 0);
      prevEma = sum / period;
      emaArray.push(prevEma);
    } else {
      prevEma = data[i] * k + prevEma * (1 - k);
      emaArray.push(prevEma);
    }
  }
  return emaArray;
}

export function renderTradingViewChartSnapshot(options: RenderChartOptions): string {
  const {
    symbol,
    timeframe,
    displayName,
    candles,
    precision = 2,
    currentPrice: forcedCurrentPrice,
    priceChangePercent: forcedChange,
    width = 1280,
    height = 720,
  } = options;

  if (!candles || candles.length === 0) {
    throw new Error('No candle data available to render chart');
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  // Margins and structural layout (TradingView dark theme)
  const padTop = 50;
  const padBottom = 35;
  const padLeft = 16;
  const padRight = 85; // Right price axis width

  const chartAreaWidth = width - padLeft - padRight;
  const chartAreaHeight = height - padTop - padBottom;
  const volHeight = chartAreaHeight * 0.18; // Bottom 18% for volume
  const priceAreaHeight = chartAreaHeight - volHeight - 15;

  // 1. Fill background
  ctx.fillStyle = '#131722';
  ctx.fillRect(0, 0, width, height);

  // 2. Compute min/max prices
  let minPrice = Infinity;
  let maxPrice = -Infinity;
  let maxVol = 0;

  for (const c of candles) {
    if (c.low < minPrice) minPrice = c.low;
    if (c.high > maxPrice) maxPrice = c.high;
    if (c.volume > maxVol) maxVol = c.volume;
  }

  // Add 4% vertical breathing room
  const priceRange = Math.max(maxPrice - minPrice, minPrice * 0.005);
  minPrice -= priceRange * 0.04;
  maxPrice += priceRange * 0.04;
  const adjustedRange = maxPrice - minPrice;

  const priceToY = (price: number) => {
    return padTop + priceAreaHeight - ((price - minPrice) / adjustedRange) * priceAreaHeight;
  };

  const volToHeight = (vol: number) => {
    if (maxVol === 0) return 0;
    return (vol / maxVol) * volHeight;
  };

  // 3. Draw Watermark in Background
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.025)';
  ctx.font = 'bold 54px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${symbol} · ${timeframe}`, width / 2 - 30, height / 2 + 10);
  ctx.restore();

  // 4. Draw Horizontal Grid Lines & Price Labels on right axis
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.lineWidth = 1;
  ctx.fillStyle = '#787b86';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  const gridSteps = 7;
  for (let i = 0; i <= gridSteps; i++) {
    const p = minPrice + (adjustedRange * i) / gridSteps;
    const y = priceToY(p);

    // Grid line
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();

    // Right axis label
    const priceText = p.toFixed(precision);
    ctx.fillText(priceText, width - padRight + 8, y);
  }

  // Right axis separator line
  ctx.beginPath();
  ctx.moveTo(width - padRight, padTop);
  ctx.lineTo(width - padRight, height - padBottom);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.stroke();

  // Bottom time axis separator line
  ctx.beginPath();
  ctx.moveTo(padLeft, height - padBottom);
  ctx.lineTo(width, height - padBottom);
  ctx.stroke();
  ctx.restore();

  // 5. Calculate X coordinates for candles
  const count = candles.length;
  const candleSpacing = chartAreaWidth / count;
  const candleWidth = Math.max(3, Math.min(18, candleSpacing * 0.72));

  const candleXs: number[] = [];
  for (let i = 0; i < count; i++) {
    candleXs.push(padLeft + i * candleSpacing + candleSpacing / 2);
  }

  // 6. Draw Volume Bars
  const volBaseY = height - padBottom;
  for (let i = 0; i < count; i++) {
    const c = candles[i];
    const x = candleXs[i];
    const vH = volToHeight(c.volume);
    const isBull = c.close >= c.open;

    ctx.fillStyle = isBull ? 'rgba(8, 153, 129, 0.22)' : 'rgba(242, 54, 69, 0.22)';
    ctx.fillRect(x - candleWidth / 2, volBaseY - vH, candleWidth, vH);
  }

  // 7. Calculate and Draw Exponential Moving Averages (EMA 20, EMA 50)
  const closes = candles.map((c) => c.close);
  const ema20 = calculateEMA(closes, 20);
  const ema50 = calculateEMA(closes, 50);

  const drawEmaLine = (emaVals: (number | null)[], color: string) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;

    for (let i = 0; i < count; i++) {
      const val = emaVals[i];
      if (val !== null) {
        const x = candleXs[i];
        const y = priceToY(val);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else {
          ctx.lineTo(x, y);
        }
      }
    }
    ctx.stroke();
    ctx.restore();
  };

  drawEmaLine(ema20, '#2962ff'); // Blue EMA 20
  drawEmaLine(ema50, '#ff9800'); // Orange EMA 50

  // 8. Draw Candlesticks (Wicks + Bodies)
  const BULL_COLOR = '#089981'; // TradingView Green
  const BEAR_COLOR = '#f23645'; // TradingView Red

  for (let i = 0; i < count; i++) {
    const c = candles[i];
    const x = candleXs[i];
    const isBull = c.close >= c.open;
    const color = isBull ? BULL_COLOR : BEAR_COLOR;

    const yOpen = priceToY(c.open);
    const yClose = priceToY(c.close);
    const yHigh = priceToY(c.high);
    const yLow = priceToY(c.low);

    const bodyTop = Math.min(yOpen, yClose);
    const bodyHeight = Math.max(1.5, Math.abs(yOpen - yClose));

    // Wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x, yHigh);
    ctx.lineTo(x, yLow);
    ctx.stroke();

    // Candle Body
    ctx.fillStyle = color;
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
  }

  // 9. Current Price Marker & Dashed Crosshair Line
  const lastCandle = candles[candles.length - 1];
  const latestPrice = forcedCurrentPrice ?? lastCandle.close;
  const isLatestBull = lastCandle.close >= lastCandle.open;
  const markerColor = isLatestBull ? BULL_COLOR : BEAR_COLOR;
  const currentY = priceToY(latestPrice);

  // Dashed line across chart
  ctx.save();
  ctx.strokeStyle = markerColor;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(padLeft, currentY);
  ctx.lineTo(width - padRight, currentY);
  ctx.stroke();
  ctx.restore();

  // Glowing current price badge on right axis
  const badgeWidth = 72;
  const badgeHeight = 20;
  const badgeX = width - padRight + 2;
  const badgeY = currentY - badgeHeight / 2;

  ctx.fillStyle = markerColor;
  ctx.beginPath();
  // Round rect
  const r = 4;
  ctx.roundRect
    ? ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, r)
    : ctx.fillRect(badgeX, badgeY, badgeWidth, badgeHeight);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(latestPrice.toFixed(precision), badgeX + badgeWidth / 2, currentY);

  // 10. Time Axis Labels at Bottom
  ctx.fillStyle = '#787b86';
  ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';

  const timeLabelInterval = Math.max(1, Math.floor(count / 6));
  for (let i = 0; i < count; i += timeLabelInterval) {
    const c = candles[i];
    const x = candleXs[i];
    const date = new Date(c.time);
    const label = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
    ctx.fillText(label, x, height - padBottom + 8);
  }

  // 11. Top Header Bar (TradingView Institutional Header)
  ctx.save();
  // Top header background subtle strip
  ctx.fillStyle = 'rgba(19, 23, 34, 0.95)';
  ctx.fillRect(0, 0, width, padTop);

  // Symbol Title
  ctx.fillStyle = '#f0f3fa';
  ctx.font = 'bold 16px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const displayTitle = displayName || symbol;
  ctx.fillText(displayTitle, padLeft, 22);

  // Timeframe Badge
  const titleWidth = ctx.measureText(displayTitle).width;
  const tfX = padLeft + titleWidth + 10;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(tfX, 12, 38, 20, 4) : ctx.fillRect(tfX, 12, 38, 20);
  ctx.fill();

  ctx.fillStyle = '#2962ff';
  ctx.font = 'bold 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
  ctx.textAlign = 'center';
  ctx.fillText(timeframe, tfX + 19, 22);

  // OHLC Metrics
  const firstCandle = candles[0];
  const pctChange =
    forcedChange !== undefined
      ? forcedChange
      : firstCandle.open > 0
      ? ((lastCandle.close - firstCandle.open) / firstCandle.open) * 100
      : 0;

  const changeColor = pctChange >= 0 ? BULL_COLOR : BEAR_COLOR;
  const changeSign = pctChange >= 0 ? '+' : '';

  ctx.textAlign = 'left';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';

  let metricX = tfX + 50;
  const drawMetric = (label: string, val: string, color = '#d1d4dc') => {
    ctx.fillStyle = '#787b86';
    ctx.fillText(label, metricX, 22);
    metricX += ctx.measureText(label).width + 3;
    ctx.fillStyle = color;
    ctx.fillText(val, metricX, 22);
    metricX += ctx.measureText(val).width + 10;
  };

  drawMetric('O', lastCandle.open.toFixed(precision));
  drawMetric('H', lastCandle.high.toFixed(precision));
  drawMetric('L', lastCandle.low.toFixed(precision));
  drawMetric('C', lastCandle.close.toFixed(precision), changeColor);
  drawMetric('Chg', `${changeSign}${pctChange.toFixed(2)}%`, changeColor);

  // EMA Legends on the right side of header
  ctx.textAlign = 'right';
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace';
  const rightLegendX = width - padRight - 10;
  ctx.fillStyle = '#ff9800';
  ctx.fillText('EMA 50', rightLegendX, 22);
  const ema50W = ctx.measureText('EMA 50').width + 12;
  ctx.fillStyle = '#2962ff';
  ctx.fillText('EMA 20', rightLegendX - ema50W, 22);
  const ema20W = ctx.measureText('EMA 20').width + 12;
  ctx.fillStyle = '#787b86';
  ctx.fillText('Vol', rightLegendX - ema50W - ema20W, 22);

  ctx.restore();

  return canvas.toDataURL('image/jpeg', 0.95);
}
