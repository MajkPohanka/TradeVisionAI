export type HoldingPeriod = 'scalp' | 'intraday' | 'swing' | 'position';
export type RiskTolerance = 'conservative' | 'balanced' | 'aggressive';
export type TradingStrategy = 'price_action' | 'smc_ict' | 'trend_breakout' | 'supply_demand' | 'wyckoff' | 'custom';
export type TradeSignal = 'LONG' | 'SHORT' | 'NEUTRAL_WAIT';
export type LanguageOption = 'cs' | 'en' | 'es';

export interface StrategyPreset {
  id: string;
  name: string;
  holdingPeriod: HoldingPeriod;
  riskTolerance: RiskTolerance;
  strategies: TradingStrategy[];
  strategy?: TradingStrategy; // legacy fallback
  customRules: string;
  customMentorPrompt?: string;
  accountRiskPercent: number;
}

export interface StrategySettings {
  holdingPeriod: HoldingPeriod;
  riskTolerance: RiskTolerance;
  strategies: TradingStrategy[]; // multi-select methodologies!
  strategy?: TradingStrategy; // legacy fallback
  customRules: string;
  customMentorPrompt: string;
  language: LanguageOption;
  accountRiskPercent: number; // e.g. 1% or 2%
  presets: StrategyPreset[];
  activePresetId?: string;
}

export interface EconomicCalendarEvent {
  id: string;
  date: string; // e.g. "Dnes 14:30" or "Čt 14:30"
  currency: string; // USD, EUR, GBP, CZK
  title: string; // CPI Inflation, NFP Employment, FOMC Rate Decision
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
  forecast?: string;
  previous?: string;
  warningText?: string;
}

export interface CandlestickPattern {
  pattern: string;
  signalType: 'Bullish' | 'Bearish' | 'Neutral';
  location: string;
  significance: string;
}

export interface PriceActionStructure {
  structure: string;
  description: string;
}

export interface TakeProfitTarget {
  target: number; // 1, 2, 3
  price: number;
  riskRewardRatio: number;
  description: string;
  closePercentage: number; // e.g. 50% at TP1
}

export interface AnalysisResult {
  id: string;
  timestamp: number;
  symbol: string;
  timeframe: string;
  signal: TradeSignal;
  confidenceScore: number; // 0-100
  biasReasoning: string;
  methodologyConfluences?: {
    methodology: string;
    bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    keyObservation: string;
  }[];
  economicCalendarWarning?: {
    hasHighImpactNewsThisWeek: boolean;
    upcomingNewsEvents: EconomicCalendarEvent[];
    riskAdvice: string;
  };
  entryZone: {
    min: number;
    max: number;
    recommended: number;
  };
  stopLoss: {
    price: number;
    reason: string;
    distancePercent: number;
  };
  takeProfitTargets: TakeProfitTarget[];
  overallRiskRewardRatio: string;
  candlestickPatterns: CandlestickPattern[];
  priceActionStructures: PriceActionStructure[];
  keyLevels: {
    support: number[];
    resistance: number[];
    keyPivot: number;
  };
  mentorAdvice: string;
  riskManagement: {
    suggestedPositionSizePercent: number;
    maxLeverage: string;
    invalidationCondition: string;
    trailingStopStrategy: string;
  };
  tradeChecklist: {
    rule: string;
    passed: boolean;
    comment: string;
  }[];
  uploadedImages: string[]; // base64 or URLs
  userNotes?: string;
  tradeOutcome?: 'PENDING' | 'WIN' | 'LOSS' | 'BREAKEVEN';
}

export interface MetaTraderTradeRecord {
  ticket?: string;
  openTime?: string;
  type: 'BUY' | 'SELL';
  size?: number; // lots
  symbol: string;
  openPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  closeTime?: string;
  closePrice: number;
  profit: number; // PnL currency
  pips?: number;
  userNotes?: string;
}

export interface MetaTraderAuditResult {
  id: string;
  timestamp: number;
  tradesAnalyzedCount: number;
  winRatePercent: number;
  totalProfitLoss: number;
  profitFactor?: number;
  primaryMistakes: {
    category: 'NEWS_COLLISION' | 'NO_STOP_LOSS' | 'OVER_LEVERAGE' | 'REVENGE_TRADING' | 'CHASING_MARKET' | 'POOR_RR' | 'EARLY_EXIT';
    title: string;
    severity: 'HIGH' | 'MEDIUM' | 'LOW';
    description: string;
    affectedTrades: string[];
  }[];
  economicNewsCorrelations: {
    tradeTicketOrTime: string;
    newsTitle: string;
    newsImpact: 'HIGH' | 'MEDIUM';
    explanation: string; // e.g. "Obchod byl otevřen 5 minut před vyhlášením NFP/CPI, což způsobilo nečekaný skluz (slippage)."
  }[];
  psychologyAssessment: string;
  actionableRecommendations: string[];
  analyzedTrades: MetaTraderTradeRecord[];
}

export interface MentorChatMessage {
  id: string;
  sender: 'user' | 'mentor';
  text: string;
  timestamp: number;
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

export interface LicenseStatus {
  key: string;
  credits: number;
  tier?: string;
  email?: string;
  totalPurchased?: number;
  totalUsed?: number;
  createdAt?: number;
}

