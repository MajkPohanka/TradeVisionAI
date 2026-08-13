import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limit for high-resolution chart image uploads and MetaTrader reports
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Handle JSON payload size errors explicitly
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (err && (err.type === 'entity.too.large' || err.status === 413)) {
    return res.status(413).json({
      success: false,
      error: 'Nahrané obrázky nebo data jsou příliš velké. Zkuste nahrát menší snímky obrazovky.',
    });
  }
  next(err);
});

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

  throw new Error('Nepodařilo se dekódovat strukturovanou odpověď od AI.');
}

// Lazy initializer for Gemini client
let genAiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!genAiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn("GEMINI_API_KEY is not set in environment variables!");
    }
    genAiClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
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

// Helper function to execute Gemini requests with retry logic & model fallbacks against transient 503 / 429 / quota errors
async function callGeminiWithRetry(
  aiClient: ReturnType<typeof getGeminiClient>,
  requestParams: any,
  maxRetries = 1
) {
  const primaryModel = requestParams.model || 'gemini-3.6-flash';
  // Fallback chain across distinct model pools
  const modelsToTry = Array.from(new Set([
    primaryModel,
    'gemini-3.6-flash',
    'gemini-flash-latest',
    'gemini-3.1-flash-lite',
    'gemini-3.1-pro-preview',
  ]));

  let lastError: any = null;

  for (const modelName of modelsToTry) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Časový limit vypršel (20s).')), 20000)
        );

        const response: any = await Promise.race([
          aiClient.models.generateContent({
            ...requestParams,
            model: modelName,
          }),
          timeoutPromise,
        ]);

        return response;
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const isNotFound =
          errMsg.includes('404') ||
          errMsg.includes('NOT_FOUND') ||
          errMsg.includes('not found') ||
          errMsg.includes('no longer available');

        const isTransient =
          errMsg.includes('503') ||
          errMsg.includes('UNAVAILABLE') ||
          errMsg.includes('high demand') ||
          errMsg.includes('Deadline expired') ||
          errMsg.includes('timeout') ||
          errMsg.includes('Časový limit') ||
          err?.status === 503 ||
          err?.code === 503;

        const isRateLimit =
          errMsg.includes('429') ||
          errMsg.includes('RESOURCE_EXHAUSTED') ||
          errMsg.includes('quota') ||
          err?.status === 429 ||
          err?.code === 429;

        console.log(`[Gemini API] Model ${modelName} attempt ${attempt + 1} response: ${isRateLimit ? '429 Quota Exceeded' : isNotFound ? '404 Not Found' : isTransient ? '503 High Demand (Fallback triggered)' : errMsg}`);

        // If high demand (503), rate limit (429), or model not found (404),
        // immediately fall back to the next model in modelsToTry!
        if (isNotFound || isRateLimit || isTransient) {
          break;
        }

        if (attempt < maxRetries) {
          const delay = 500 + Math.floor(Math.random() * 300);
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        break;
      }
    }
  }

  throw lastError;
}

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Primary Chart Analysis Endpoint with Multi-Methodology & Economic Calendar Context
app.post('/api/analyze-chart', async (req, res) => {
  try {
    const { images, settings } = req.body;

    if (!images || !Array.isArray(images) || images.length === 0) {
      return res.status(400).json({ error: 'Je potřeba nahrát alespoň jeden obrázek grafu z TradingView.' });
    }

    const ai = getGeminiClient();

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

    const systemInstruction = `You are a world-class Chief Analyst and Senior Portfolio Risk Director in an institutional hedge fund.
Your analysis must uncompromisingly combine the top market methodologies:
- Smart Money Concepts (SMC) & Inner Circle Trader (ICT): Liquidity Sweeps, Fair Value Gaps (FVG), Order Blocks (OB), Breakers, Inducement, Premium vs Discount, Killzones.
- Wyckoff Method: Accumulation/Distribution phases A-E, Spring, UTAD, SOS, SOW.
- Price Action & Market Structure: Break of Structure (BOS), Change of Character (CHoCH), S/R zones, candlestick patterns.
- Supply & Demand: Unmitigated Demand/Supply zones, Flip zones, Imbalances.
- Risk Management & Macro News Correlations.

User preferences:
- Holding Period: ${settings?.holdingPeriod || 'intraday'}
- Risk Tolerance: ${settings?.riskTolerance || 'balanced'}
- Methodologies: ${selectedStrategies}
- Custom Rules: ${settings?.customRules || 'None'}
- Custom Mentor Prompt: ${settings?.customMentorPrompt || 'None'}

${langPrompt}`;

    const promptText = `Analyze the uploaded TradingView chart image(s). Read prices, candlestick patterns, trendlines, and key levels accurately. Return strictly a JSON object conforming to this schema:

{
  "symbol": "e.g. BTC/USDT or EUR/USD",
  "timeframe": "e.g. 15m or 1H or 4H",
  "signal": "LONG" | "SHORT" | "NEUTRAL_WAIT",
  "confidenceScore": number between 30 and 98 based on confluences strength (NEVER repeat 78%),
  "biasReasoning": "summary reasoning of market sentiment in the requested language",
  "methodologyConfluences": [
    {
      "methodology": "e.g. Smart Money Concepts",
      "bias": "BULLISH" | "BEARISH" | "NEUTRAL",
      "keyObservation": "specific observation in the requested language"
    }
  ],
  "economicCalendarWarning": {
    "hasHighImpactNewsThisWeek": true,
    "upcomingNewsEvents": [
      {
        "id": "1",
        "date": "Today / This week",
        "currency": "USD",
        "title": "US CPI / NFP",
        "impact": "HIGH",
        "warningText": "Warning description in the requested language"
      }
    ],
    "riskAdvice": "Advisory in the requested language"
  },
  "entryZone": {
    "min": number,
    "max": number,
    "recommended": number
  },
  "stopLoss": {
    "price": number,
    "reason": "reason description in the requested language",
    "distancePercent": number
  },
  "takeProfitTargets": [
    {
      "target": 1,
      "price": number,
      "riskRewardRatio": number,
      "description": "TP1 reason in requested language",
      "closePercentage": 50
    },
    {
      "target": 2,
      "price": number,
      "riskRewardRatio": number,
      "description": "TP2 reason in requested language",
      "closePercentage": 30
    },
    {
      "target": 3,
      "price": number,
      "riskRewardRatio": number,
      "description": "TP3 reason in requested language",
      "closePercentage": 20
    }
  ],
  "overallRiskRewardRatio": "e.g. 1 : 3.5",
  "candlestickPatterns": [
    {
      "pattern": "pattern name e.g. Bullish Engulfing",
      "signalType": "Bullish" | "Bearish" | "Neutral",
      "location": "location description in requested language",
      "significance": "significance description in requested language"
    }
  ],
  "priceActionStructures": [
    {
      "structure": "structure name e.g. Liquidity Sweep",
      "description": "detailed description in requested language"
    }
  ],
  "keyLevels": {
    "support": [array of support numbers],
    "resistance": [array of resistance numbers],
    "keyPivot": number
  },
  "mentorAdvice": "detailed mentor guidance and trade psychology in requested language",
  "riskManagement": {
    "suggestedPositionSizePercent": 1.0,
    "maxLeverage": "e.g. 1x-5x or no leverage",
    "invalidationCondition": "invalidation condition in requested language",
    "trailingStopStrategy": "trailing stop strategy in requested language"
  },
  "tradeChecklist": [
    {
      "rule": "checklist rule in requested language",
      "passed": true,
      "comment": "comment in requested language"
    }
  ]
}`;

    const response = await callGeminiWithRetry(ai, {
      model: 'gemini-3.6-flash',
      contents: [...imageParts, { text: promptText }],
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '{}';
    const parsedData = safeExtractJson(responseText);

    res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Error analyzing chart:', error);
    const errMsg = error?.message || String(error);
    const isTimeout = errMsg.includes('503') || errMsg.includes('Deadline expired') || errMsg.includes('UNAVAILABLE');
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');

    let userFriendlyError = 'An error occurred during chart analysis. Please verify your GEMINI_API_KEY.';
    if (isRateLimit) {
      userFriendlyError = 'API quota or rate limit exceeded (429). Please wait ~1 minute and retry.';
    } else if (isTimeout) {
      userFriendlyError = 'Gemini API service temporarily unavailable (503 / Timeout). Please click retry.';
    }

    res.status(500).json({
      error: userFriendlyError,
      details: errMsg,
    });
  }
});

// MetaTrader Trade History Audit & Post-Mortem Endpoint
app.post('/api/audit-metatrader', async (req, res) => {
  try {
    const { rawText, images, settings } = req.body;

    if ((!rawText || typeof rawText !== 'string' || !rawText.trim()) && (!images || images.length === 0)) {
      return res.status(400).json({ error: 'Pro analýzu MetaTrader výpisu vložte buď textový výpis/CSV nebo obrázek historie z MT4/MT5.' });
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

    const systemPrompt = `You are a strict prop-firm risk auditor and trading mentor.
Your task is to analyze user trade history from MetaTrader 4 / 5 (MT4/MT5 HTML output, CSV, or screenshot) and uncover execution flaws:
1. High Impact Macro News collisions (ForexFactory).
2. Poor Risk-to-Reward ratio (cutting winners early, letting losses run).
3. Trading without Stop Loss.
4. Revenge trading.
5. Over-leveraging / Chasing market.

${langInstruction}`;

    const userPromptText = `Analyze the following MetaTrader trade data and uncover loss causes and execution flaws:

Data from MetaTrader:
${rawText || 'MT4/MT5 history screenshot uploaded.'}

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

    const response = await callGeminiWithRetry(ai, {
      model: 'gemini-3.6-flash',
      contents: contentParts,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        temperature: 0.2,
      },
    });

    const responseText = response.text || '{}';
    const parsedData = safeExtractJson(responseText);

    res.json({
      success: true,
      data: parsedData,
    });
  } catch (error: any) {
    console.error('Error auditing MetaTrader trades:', error);
    const errMsg = error?.message || String(error);
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');
    res.status(500).json({
      error: isRateLimit
        ? 'API rate limit or quota exceeded (429). Please wait ~1 minute and retry.'
        : 'An error occurred during MetaTrader audit.',
      details: errMsg,
    });
  }
});

// Follow-up Chat endpoint with AI Trading Mentor
app.post('/api/ask-mentor', async (req, res) => {
  try {
    const { question, currentAnalysis, chatHistory, settings } = req.body;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Dotaz je povinný a musí být text.' });
    }

    const ai = getGeminiClient();

    const langCode = settings?.language || 'cs';
    const langInstruction = langCode === 'en'
      ? 'CRITICAL: Answer strictly in ENGLISH language.'
      : langCode === 'es'
      ? 'CRÍTICO: Responde estrictamente en idioma ESPAÑOL.'
      : 'KRITICKÉ: Odpovídej výhradně v ČESKÉM JAZYCE.';

    const systemPrompt = `You are a world-class AI Trading Mentor and Head Technical Analyst. You assist traders with analyzing setups, moving SL to Breakeven/Trailing, entry confluences (FVG, Order Blocks, Liquidity Sweeps), and discipline.

${currentAnalysis ? `CURRENTLY ANALYZED CHART & SYMBOL:
- Symbol: ${currentAnalysis.symbol || 'Unknown'}
- Timeframe: ${currentAnalysis.timeframe || 'Unknown'}
- Signal: ${currentAnalysis.signal || 'NEUTRAL_WAIT'}
- Confidence: ${currentAnalysis.confidenceScore}%
- Entry Zone: ${currentAnalysis.entryZone?.recommended || 'N/A'}
- Stop Loss: ${currentAnalysis.stopLoss?.price || 'N/A'}
- Reasoning: ${JSON.stringify(currentAnalysis.biasReasoning || '')}` : 'No active chart analysis at the moment.'}

Rules for mentor response:
1. Provide direct, highly professional, constructive, and actionable advice.
2. Address lower timeframe risks if asked (noise, need for higher TF confirmation).
3. Always emphasize risk management and discipline.
4. ${langInstruction}`;

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

    const response = await callGeminiWithRetry(ai, {
      model: 'gemini-3.6-flash',
      contents: promptContent,
      config: {
        systemInstruction: systemPrompt,
        temperature: 0.5,
      },
    });

    const answer = response?.text || response?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!answer) {
      throw new Error('Gemini returned no response text.');
    }

    res.json({
      success: true,
      answer: answer.trim(),
    });
  } catch (error: any) {
    console.error('Error asking mentor:', error);
    const errMsg = error?.message || String(error);
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota') || errMsg.includes('Quota exceeded');
    res.status(500).json({
      error: isRateLimit
        ? 'API rate limit or quota exceeded (429). Please wait ~1 minute and retry.'
        : 'Error communicating with AI Mentor.',
      details: errMsg,
    });
  }
});

// Live Economic Calendar Generator Endpoint (ForexFactory integration with AI Analysis)
app.post('/api/economic-calendar', async (req, res) => {
  try {
    const { date, symbol, language } = req.body;
    
    const now = new Date();
    const defaultDate = `${now.getDate()}.${now.getMonth() + 1}.${now.getFullYear()}`;
    const targetDate = date || defaultDate;

    const dateParts = targetDate.split('.').map((p: string) => parseInt(p.trim(), 10));
    const targetDay = dateParts[0];
    const targetMonth = dateParts[1];
    const targetYear = dateParts[2] || now.getFullYear();

    const langCode = language || 'cs';

    let realEvents: any[] = [];
    let liveFetchedSuccess = false;

    // Attempt to fetch live ForexFactory JSON feed
    try {
      const ffRes = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json', {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

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
                title: item.title,
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
      console.warn('ForexFactory live feed fetch failed, falling back to AI generator:', ffErr);
    }

    const ai = getGeminiClient();

    let finalEvents = realEvents;
    let marketAdvice = '';

    if (liveFetchedSuccess && realEvents.length > 0) {
      const highImpactList = realEvents.filter(e => e.impact === 'HIGH').map(e => `${e.currency} - ${e.title} at ${e.date}`).join(', ');
      
      const langPrompt = langCode === 'en'
        ? 'Provide concise, highly professional advice in ENGLISH.'
        : langCode === 'es'
        ? 'Proporciona consejos concisos y muy profesionales en ESPAÑOL.'
        : 'Poskytni stručné, vysoce profesionální doporučení pro tradery v ČEŠTINĚ.';

      const advicePrompt = `Based on REAL news events from ForexFactory for ${targetDate}:
Events: ${JSON.stringify(realEvents)}

${langPrompt}

Return JSON:
{
  "marketSummaryAdvice": "Your advice string in requested language..."
}`;

      try {
        const response = await callGeminiWithRetry(ai, {
          model: 'gemini-3.6-flash',
          contents: advicePrompt,
          config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
          },
        });
        const parsed = JSON.parse(response.text || '{}');
        marketAdvice = parsed.marketSummaryAdvice || '';
      } catch (adviceErr) {
        marketAdvice = highImpactList
          ? `Key events (${targetDate}): ${highImpactList}. Use extra caution during release.`
          : `No critical HIGH IMPACT news recorded for USD on ${targetDate}.`;
      }
    } else {
      const langInstruction = langCode === 'en'
        ? 'CRITICAL: Return JSON report in ENGLISH.'
        : langCode === 'es'
        ? 'CRÍTICO: Devuelve informe JSON en ESPAÑOL.'
        : 'KRITICKÉ: Vrať strukturovaný JSON report v ČEŠTINĚ.';

      const systemPrompt = `You are a professional macroeconomic calendar analyst. Provide an accurate news schedule for ${targetDate}. ${langInstruction}`;

      const userPrompt = `Generate economic calendar for date: ${targetDate} ${symbol ? `for symbol ${symbol}` : ''}.
Return JSON:
{
  "targetDate": "${targetDate}",
  "events": [
    {
      "id": "1",
      "date": "${targetDate} 06:30",
      "currency": "AUD",
      "title": "RBA Cash Rate Statement",
      "impact": "HIGH",
      "forecast": "4.35%",
      "previous": "4.35%",
      "warningText": "Warning in requested language"
    }
  ],
  "marketSummaryAdvice": "Advice in requested language for date ${targetDate}"
}`;

      const response = await callGeminiWithRetry(ai, {
        model: 'gemini-3.6-flash',
        contents: userPrompt,
        config: {
          systemInstruction: systemPrompt,
          responseMimeType: 'application/json',
          temperature: 0.2,
        },
      });

      const responseText = response.text || '{}';
      const parsedData: any = safeExtractJson(responseText);

      finalEvents = parsedData.events || [];
      marketAdvice = parsedData.marketSummaryAdvice || '';
    }

    res.json({
      success: true,
      data: {
        targetDate,
        events: finalEvents,
        marketSummaryAdvice: marketAdvice,
      },
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
    console.log(`TradeVision AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
