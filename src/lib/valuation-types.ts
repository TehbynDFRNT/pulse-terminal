/**
 * Types for the stock valuation panel.
 * Shared between API route (server) and ValuationPanel (client).
 */

// ============ STOCK CLASSIFICATION ============

export type StockType =
  | 'gold-miner'
  | 'gold-streamer'
  | 'uranium-miner'
  | 'uranium-developer'
  | 'nuclear-utility'
  | 'nuclear-prerevenue'
  | 'ree-producer'
  | 'ree-developer'
  | 'lithium-producer'
  | 'copper-producer'
  | 'etf'
  | 'other';

export type TrackId = 'pm' | 'energy' | 'ree';

export const STOCK_TYPE_MAP: Record<string, { type: StockType; track: TrackId }> = {
  // Gold Miners
  'NST.AX': { type: 'gold-miner', track: 'pm' },
  'EVN.AX': { type: 'gold-miner', track: 'pm' },
  'RMS.AX': { type: 'gold-miner', track: 'pm' },
  'WGX.AX': { type: 'gold-miner', track: 'pm' },
  'NEM':    { type: 'gold-miner', track: 'pm' },
  'AEM':    { type: 'gold-miner', track: 'pm' },
  'GOLD':   { type: 'gold-miner', track: 'pm' },
  // Gold Streaming
  'WPM':    { type: 'gold-streamer', track: 'pm' },
  'FNV':    { type: 'gold-streamer', track: 'pm' },
  // Uranium Miners / Producers
  'CCJ':    { type: 'uranium-miner', track: 'energy' },
  'PDN.AX': { type: 'uranium-miner', track: 'energy' },
  'BOE.AX': { type: 'uranium-miner', track: 'energy' },
  // Uranium Developers
  'UEC':    { type: 'uranium-developer', track: 'energy' },
  'DYL.AX': { type: 'uranium-developer', track: 'energy' },
  'LOT.AX': { type: 'uranium-developer', track: 'energy' },
  // Nuclear Utilities
  'CEG':    { type: 'nuclear-utility', track: 'energy' },
  'VST':    { type: 'nuclear-utility', track: 'energy' },
  // Nuclear Pre-Revenue
  'SMR':    { type: 'nuclear-prerevenue', track: 'energy' },
  'OKLO':   { type: 'nuclear-prerevenue', track: 'energy' },
  // REE Producers
  'MP':     { type: 'ree-producer', track: 'ree' },
  'LYC.AX': { type: 'ree-producer', track: 'ree' },
  // REE Developers
  'ARU.AX': { type: 'ree-developer', track: 'ree' },
  'ILU.AX': { type: 'ree-developer', track: 'ree' },
  'ASM.AX': { type: 'ree-developer', track: 'ree' },
  // Lithium
  'ALB':    { type: 'lithium-producer', track: 'ree' },
  'PLS.AX': { type: 'lithium-producer', track: 'ree' },
  'MIN.AX': { type: 'lithium-producer', track: 'ree' },
  'LIT':    { type: 'etf', track: 'ree' },
  // Copper
  'SCCO':   { type: 'copper-producer', track: 'ree' },
  'HG=F':   { type: 'copper-producer', track: 'ree' },
  // ETFs
  'URA':    { type: 'etf', track: 'energy' },
  'REMX':   { type: 'etf', track: 'ree' },
  'GLD':    { type: 'etf', track: 'pm' },
  'SLV':    { type: 'etf', track: 'pm' },
  'GDX':    { type: 'etf', track: 'pm' },
  'GDXJ':   { type: 'etf', track: 'pm' },
  'SPY':    { type: 'etf', track: 'pm' },
};

export const STOCK_TYPE_LABELS: Record<StockType, string> = {
  'gold-miner': 'GOLD MINER',
  'gold-streamer': 'GOLD STREAMER',
  'uranium-miner': 'URANIUM PRODUCER',
  'uranium-developer': 'URANIUM DEVELOPER',
  'nuclear-utility': 'NUCLEAR UTILITY',
  'nuclear-prerevenue': 'PRE-REVENUE',
  'ree-producer': 'REE PRODUCER',
  'ree-developer': 'REE DEVELOPER',
  'lithium-producer': 'LITHIUM',
  'copper-producer': 'COPPER',
  'etf': 'ETF',
  'other': 'OTHER',
};

// ============ VALUATION DATA ============

export interface ValuationData {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  marketCap: number;
  enterpriseValue: number;

  // Core multiples
  trailingPE: number | null;
  forwardPE: number | null;
  priceToBook: number | null;
  evToEbitda: number | null;
  evToRevenue: number | null;
  pegRatio: number | null;

  // Profitability
  grossMargin: number | null;
  operatingMargin: number | null;
  profitMargin: number | null;
  roe: number | null;

  // Cash flow
  freeCashFlow: number | null;
  fcfYield: number | null;

  // Balance sheet
  debtToEquity: number | null;

  // Growth
  earningsGrowth: number | null;
  revenueGrowth: number | null;

  // Dividends
  dividendYield: number | null;
  payoutRatio: number | null;

  // Stock-specific context
  stockType: StockType;
  track: TrackId;

  // Valuation assessment
  assessment: ValuationAssessment;
}

export interface ValuationAssessment {
  verdict: 'undervalued' | 'fair' | 'overvalued' | 'speculative' | 'insufficient-data';
  confidence: 'high' | 'medium' | 'low';
  summary: string;
  metrics: AssessmentMetric[];
  fairValueRange: { low: number; mid: number; high: number } | null;
  catalysts: string[];
}

export interface AssessmentMetric {
  label: string;
  value: string;
  signal: 'bullish' | 'bearish' | 'neutral';
  detail: string;
}
