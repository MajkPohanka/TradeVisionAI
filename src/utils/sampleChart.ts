// Utility returning a realistic TradingView candlestick chart rendered on SVG canvas as base64 PNG data URL
export function convertSvgToPng(svgDataUrl: string): Promise<string> {
  return new Promise((resolve) => {
    if (typeof window === 'undefined') {
      resolve(svgDataUrl);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.width || 1200;
        canvas.height = img.height || 675;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          const pngUrl = canvas.toDataURL('image/png');
          resolve(pngUrl);
          return;
        }
      } catch (e) {
        console.error('Canvas SVG to PNG conversion error:', e);
      }
      resolve(svgDataUrl);
    };
    img.onerror = () => {
      resolve(svgDataUrl);
    };
    img.src = svgDataUrl;
  });
}

export async function getSampleBTCChartDataUrl(): Promise<string> {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="675" viewBox="0 0 1200 675" fill="none">
    <!-- Dark TradingView Background -->
    <rect width="1200" height="675" fill="#131722"/>
    
    <!-- Grid lines -->
    <g stroke="#1e222d" stroke-width="1">
      <line x1="0" y1="100" x2="1200" y2="100"/>
      <line x1="0" y1="200" x2="1200" y2="200"/>
      <line x1="0" y1="300" x2="1200" y2="300"/>
      <line x1="0" y1="400" x2="1200" y2="400"/>
      <line x1="0" y1="500" x2="1200" y2="500"/>
      <line x1="0" y1="600" x2="1200" y2="600"/>
      
      <line x1="200" y1="0" x2="200" y2="675"/>
      <line x1="400" y1="0" x2="400" y2="675"/>
      <line x1="600" y1="0" x2="600" y2="675"/>
      <line x1="800" y1="0" x2="800" y2="675"/>
      <line x1="1000" y1="0" x2="1000" y2="675"/>
    </g>

    <!-- TradingView Top Bar Header -->
    <rect width="1200" height="40" fill="#1e222d"/>
    <text x="20" y="25" fill="#d1d4dc" font-family="sans-serif" font-size="14" font-weight="bold">BTCUSDT.P • 15 • BINANCE</text>
    <text x="260" y="25" fill="#089981" font-family="sans-serif" font-size="14" font-weight="bold">64,250.00 (+3.42%)</text>
    <text x="450" y="25" fill="#787b86" font-family="sans-serif" font-size="12">O: 62,800 H: 64,500 L: 62,400 C: 64,250</text>

    <!-- Support Zone Highlight (Green Area) -->
    <rect x="150" y="480" width="900" height="40" fill="#089981" fill-opacity="0.12" stroke="#089981" stroke-dasharray="4 4" stroke-width="1"/>
    <text x="160" y="505" fill="#089981" font-family="sans-serif" font-size="12" font-weight="bold">DEMAND / ORDER BLOCK ZONE (62,400 - 62,700)</text>

    <!-- Resistance / Target Zone (Red Area) -->
    <rect x="150" y="140" width="900" height="40" fill="#f23645" fill-opacity="0.12" stroke="#f23645" stroke-dasharray="4 4" stroke-width="1"/>
    <text x="160" y="165" fill="#f23645" font-family="sans-serif" font-size="12" font-weight="bold">KEY RESISTANCE / FVG FILL TARGET (65,800 - 66,200)</text>

    <!-- 200 EMA Line (Yellow Curve) -->
    <path d="M 50 520 Q 350 500, 650 440 T 1150 280" stroke="#f7a600" stroke-width="2" fill="none"/>
    <text x="1080" y="270" fill="#f7a600" font-family="sans-serif" font-size="11" font-weight="bold">200 EMA</text>

    <!-- Candlesticks Series -->
    <!-- Candle 1 - Green -->
    <line x1="100" y1="420" x2="100" y2="480" stroke="#089981" stroke-width="2"/>
    <rect x="92" y="430" width="16" height="35" fill="#089981"/>

    <!-- Candle 2 - Red -->
    <line x1="150" y1="440" x2="150" y2="510" stroke="#f23645" stroke-width="2"/>
    <rect x="142" y="450" width="16" height="45" fill="#f23645"/>

    <!-- Candle 3 - Bullish Pinbar (Liquidity Sweep at Support) -->
    <line x1="200" y1="420" x2="200" y2="520" stroke="#089981" stroke-width="2"/>
    <rect x="192" y="425" width="16" height="15" fill="#089981"/>
    <text x="215" y="525" fill="#22c55e" font-family="sans-serif" font-size="11" font-weight="bold">← Bullish Pin Bar (Sweep)</text>

    <!-- Candle 4 - Big Green Engulfing -->
    <line x1="250" y1="360" x2="250" y2="435" stroke="#089981" stroke-width="2"/>
    <rect x="242" y="370" width="16" height="55" fill="#089981"/>

    <!-- Candle 5 - Green -->
    <line x1="300" y1="330" x2="300" y2="385" stroke="#089981" stroke-width="2"/>
    <rect x="292" y="340" width="16" height="35" fill="#089981"/>

    <!-- Candle 6 - Small Red Pullback -->
    <line x1="350" y1="340" x2="350" y2="380" stroke="#f23645" stroke-width="2"/>
    <rect x="342" y="350" width="16" height="20" fill="#f23645"/>

    <!-- Candle 7 - Green Breakout -->
    <line x1="400" y1="290" x2="400" y2="355" stroke="#089981" stroke-width="2"/>
    <rect x="392" y="300" width="16" height="45" fill="#089981"/>

    <!-- Candle 8 - Green -->
    <line x1="450" y1="260" x2="450" y2="310" stroke="#089981" stroke-width="2"/>
    <rect x="442" y="270" width="16" height="30" fill="#089981"/>

    <!-- Candle 9 - Red -->
    <line x1="500" y1="270" x2="500" y2="320" stroke="#f23645" stroke-width="2"/>
    <rect x="492" y="280" width="16" height="30" fill="#f23645"/>

    <!-- Candle 10 - Strong Green Bullish Impulse -->
    <line x1="550" y1="200" x2="550" y2="280" stroke="#089981" stroke-width="2"/>
    <rect x="542" y="210" width="16" height="60" fill="#089981"/>

    <!-- Volume Bars at Bottom -->
    <rect x="92" y="600" width="16" height="40" fill="#089981" fill-opacity="0.5"/>
    <rect x="142" y="580" width="16" height="60" fill="#f23645" fill-opacity="0.5"/>
    <rect x="192" y="560" width="16" height="80" fill="#089981" fill-opacity="0.8"/>
    <rect x="242" y="550" width="16" height="90" fill="#089981" fill-opacity="0.9"/>
    <rect x="292" y="590" width="16" height="50" fill="#089981" fill-opacity="0.5"/>
    <rect x="342" y="610" width="16" height="30" fill="#f23645" fill-opacity="0.4"/>
    <rect x="392" y="570" width="16" height="70" fill="#089981" fill-opacity="0.7"/>
    <rect x="442" y="580" width="16" height="60" fill="#089981" fill-opacity="0.6"/>
    <rect x="492" y="610" width="16" height="30" fill="#f23645" fill-opacity="0.4"/>
    <rect x="542" y="540" width="16" height="100" fill="#089981" fill-opacity="1"/>

    <!-- Watermark Logo -->
    <text x="600" y="350" fill="#2a2e39" font-family="sans-serif" font-size="48" font-weight="extrabold" text-anchor="middle" opacity="0.6">AIAUTOTRADER.com Sample Chart</text>
  </svg>`;

  const svgDataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  return await convertSvgToPng(svgDataUrl);
}
