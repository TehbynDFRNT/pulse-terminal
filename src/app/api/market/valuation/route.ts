import { NextRequest, NextResponse } from 'next/server';
import yf from '@/lib/yahoo';
import { getCached, setCached } from '@/lib/market-cache';
import {
  type ValuationData,
  type ValuationAssessment,
  type AssessmentMetric,
  type StockType,
  type TrackId,
  STOCK_TYPE_MAP,
} from '@/lib/valuation-types';

const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

// ============ HELPERS ============

function n(v: unknown): number | null {
  if (v === undefined || v === null || typeof v !== 'number' || !isFinite(v)) return null;
  return v;
}

function pct(v: unknown): number | null {
  const val = n(v);
  return val !== null ? val * 100 : null;
}

function fmtPct(v: number | null): string {
  if (v === null) return '—';
  return `${v.toFixed(1)}%`;
}

function fmtX(v: number | null): string {
  if (v === null) return '—';
  return `${v.toFixed(1)}x`;
}

function fmtDollar(v: number | null): string {
  if (v === null) return '—';
  if (Math.abs(v) >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  return `$${v.toFixed(0)}`;
}

// ============ ASSESSMENT PER STOCK TYPE ============

function assessGoldMiner(d: ValuationData): ValuationAssessment {
  const metrics: AssessmentMetric[] = [];
  let bullish = 0, bearish = 0, total = 0;

  // 1. Operating margin (AISC proxy)
  if (d.operatingMargin !== null) {
    const m = d.operatingMargin;
    total++;
    if (m > 30) { bullish++; metrics.push({ label: 'Operating Margin', value: fmtPct(m), signal: 'bullish', detail: 'Exceptional margin — strong AISC proxy' }); }
    else if (m >= 20) { metrics.push({ label: 'Operating Margin', value: fmtPct(m), signal: 'neutral', detail: 'Healthy margin' }); }
    else { bearish++; metrics.push({ label: 'Operating Margin', value: fmtPct(m), signal: 'bearish', detail: 'Margin pressure — watch cost inflation' }); }
  }

  // 2. FCF Yield
  if (d.fcfYield !== null) {
    const y = d.fcfYield;
    total++;
    if (y > 8) { bullish++; metrics.push({ label: 'FCF Yield', value: fmtPct(y), signal: 'bullish', detail: 'Deep value territory' }); }
    else if (y > 4) { bullish++; metrics.push({ label: 'FCF Yield', value: fmtPct(y), signal: 'bullish', detail: 'Attractively priced on cash flow' }); }
    else if (y > 2) { metrics.push({ label: 'FCF Yield', value: fmtPct(y), signal: 'neutral', detail: 'Fair value on cash flow' }); }
    else { bearish++; metrics.push({ label: 'FCF Yield', value: fmtPct(y), signal: 'bearish', detail: 'Expensive or FCF weak' }); }
  }

  // 3. Forward PE
  if (d.forwardPE !== null) {
    const pe = d.forwardPE;
    total++;
    if (pe < 8) { bullish++; metrics.push({ label: 'Forward P/E', value: fmtX(pe), signal: 'bullish', detail: 'Deep value' }); }
    else if (pe <= 15) { metrics.push({ label: 'Forward P/E', value: fmtX(pe), signal: 'neutral', detail: 'Reasonable for gold miner' }); }
    else if (pe <= 25) { metrics.push({ label: 'Forward P/E', value: fmtX(pe), signal: 'neutral', detail: 'Growth premium priced in' }); }
    else { bearish++; metrics.push({ label: 'Forward P/E', value: fmtX(pe), signal: 'bearish', detail: 'Expensive vs gold miner peers' }); }
  }

  // 4. EV/EBITDA
  if (d.evToEbitda !== null) {
    const ev = d.evToEbitda;
    total++;
    if (ev < 5) { bullish++; metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'bullish', detail: 'Cheap vs sector avg ~7x' }); }
    else if (ev <= 8) { metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'neutral', detail: 'Fair for gold miner' }); }
    else if (ev <= 12) { metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'neutral', detail: 'Full valuation' }); }
    else { bearish++; metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'bearish', detail: 'Expensive — above sector norms' }); }
  }

  // 5. Debt/Equity
  if (d.debtToEquity !== null) {
    const de = d.debtToEquity;
    total++;
    if (de < 30) { bullish++; metrics.push({ label: 'Debt/Equity', value: `${de.toFixed(0)}%`, signal: 'bullish', detail: 'Conservative balance sheet' }); }
    else if (de <= 60) { metrics.push({ label: 'Debt/Equity', value: `${de.toFixed(0)}%`, signal: 'neutral', detail: 'Moderate leverage' }); }
    else { bearish++; metrics.push({ label: 'Debt/Equity', value: `${de.toFixed(0)}%`, signal: 'bearish', detail: 'Leveraged — watch in downturns' }); }
  }

  // Gold leverage note
  if (d.operatingMargin !== null && d.operatingMargin < 25) {
    metrics.push({ label: 'Gold Leverage', value: 'High', signal: 'neutral', detail: 'High-cost miners have MORE earnings leverage to gold price increases' });
  }

  // Fair value: EV/EBITDA approach (7x multiple)
  let fairValueRange: ValuationAssessment['fairValueRange'] = null;
  if (d.evToEbitda !== null && d.evToEbitda > 0 && d.marketCap > 0 && d.price > 0) {
    const impliedEbitda = d.enterpriseValue / d.evToEbitda;
    const netDebt = d.enterpriseValue - d.marketCap;
    const sharesOut = d.marketCap / d.price;
    const fairEV = impliedEbitda * 7; // 7x sector avg
    const fairMktCap = fairEV - netDebt;
    const fairPrice = fairMktCap / sharesOut;
    if (fairPrice > 0 && isFinite(fairPrice)) {
      fairValueRange = {
        low: Math.round(fairPrice * 0.8 * 100) / 100,
        mid: Math.round(fairPrice * 100) / 100,
        high: Math.round(fairPrice * 1.2 * 100) / 100,
      };
    }
  }

  const verdict = total === 0 ? 'insufficient-data' :
    bullish >= total * 0.6 ? 'undervalued' :
    bearish >= total * 0.6 ? 'overvalued' : 'fair';
  const confidence = total >= 4 ? 'high' : total >= 2 ? 'medium' : 'low';

  const summary = verdict === 'undervalued'
    ? `${d.name} screens as undervalued on ${bullish} of ${total} key metrics. Cash generation and multiples suggest upside.`
    : verdict === 'overvalued'
    ? `${d.name} appears stretched on ${bearish} of ${total} metrics. Growth premium may be excessive at current gold prices.`
    : `${d.name} trades near fair value. ${bullish} bullish and ${bearish} bearish signals across ${total} metrics.`;

  return {
    verdict,
    confidence,
    summary,
    metrics,
    fairValueRange,
    catalysts: [
      'Gold price move above/below key levels',
      'Quarterly production report and AISC guidance',
      'Reserve/resource upgrade or new discovery',
      'M&A activity in gold sector',
    ],
  };
}

function assessGoldStreamer(d: ValuationData): ValuationAssessment {
  // Streamers have very different economics — high margins, low capex
  const metrics: AssessmentMetric[] = [];
  let bullish = 0, bearish = 0, total = 0;

  if (d.operatingMargin !== null) {
    total++;
    if (d.operatingMargin > 60) { bullish++; metrics.push({ label: 'Operating Margin', value: fmtPct(d.operatingMargin), signal: 'bullish', detail: 'Exceptional — streaming model advantage' }); }
    else if (d.operatingMargin > 40) { metrics.push({ label: 'Operating Margin', value: fmtPct(d.operatingMargin), signal: 'neutral', detail: 'Healthy streaming margin' }); }
    else { bearish++; metrics.push({ label: 'Operating Margin', value: fmtPct(d.operatingMargin), signal: 'bearish', detail: 'Below streaming norms' }); }
  }

  if (d.forwardPE !== null) {
    total++;
    if (d.forwardPE < 20) { bullish++; metrics.push({ label: 'Forward P/E', value: fmtX(d.forwardPE), signal: 'bullish', detail: 'Cheap for a streamer' }); }
    else if (d.forwardPE <= 35) { metrics.push({ label: 'Forward P/E', value: fmtX(d.forwardPE), signal: 'neutral', detail: 'Fair streamer premium' }); }
    else { bearish++; metrics.push({ label: 'Forward P/E', value: fmtX(d.forwardPE), signal: 'bearish', detail: 'Stretched even for streaming model' }); }
  }

  if (d.fcfYield !== null) {
    total++;
    if (d.fcfYield > 4) { bullish++; metrics.push({ label: 'FCF Yield', value: fmtPct(d.fcfYield), signal: 'bullish', detail: 'Attractive cash return' }); }
    else if (d.fcfYield > 2) { metrics.push({ label: 'FCF Yield', value: fmtPct(d.fcfYield), signal: 'neutral', detail: 'Typical for premium streamer' }); }
    else { bearish++; metrics.push({ label: 'FCF Yield', value: fmtPct(d.fcfYield), signal: 'bearish', detail: 'Low cash yield' }); }
  }

  if (d.dividendYield !== null) {
    metrics.push({ label: 'Dividend Yield', value: fmtPct(d.dividendYield), signal: d.dividendYield > 1.5 ? 'bullish' : 'neutral', detail: 'Streaming royalty income' });
  }

  const verdict = total === 0 ? 'insufficient-data' :
    bullish >= total * 0.6 ? 'undervalued' :
    bearish >= total * 0.6 ? 'overvalued' : 'fair';

  return {
    verdict,
    confidence: total >= 3 ? 'medium' : 'low',
    summary: `${d.name} is a streaming/royalty company. ${verdict === 'fair' ? 'Trading near fair value for the streaming premium.' : verdict === 'undervalued' ? 'Rare opportunity below typical streamer premium.' : 'Stretched even for the premium business model.'}`,
    metrics,
    fairValueRange: null,
    catalysts: ['New streaming deal acquisition', 'Gold price movement', 'Mine operator production changes', 'Dividend increase'],
  };
}

function assessUraniumMiner(d: ValuationData): ValuationAssessment {
  const metrics: AssessmentMetric[] = [];
  let bullish = 0, bearish = 0, total = 0;

  // 1. EV/EBITDA (premium thresholds)
  if (d.evToEbitda !== null && d.evToEbitda > 0) {
    const ev = d.evToEbitda;
    total++;
    if (ev < 15) { bullish++; metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'bullish', detail: 'Cheap for uranium sector' }); }
    else if (ev <= 25) { metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'neutral', detail: 'Fair uranium premium' }); }
    else if (ev <= 40) { metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'neutral', detail: 'Premium — growth priced in' }); }
    else { bearish++; metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'bearish', detail: 'Speculative premium territory' }); }
  }

  // 2. Forward PE
  if (d.forwardPE !== null) {
    const pe = d.forwardPE;
    total++;
    if (pe < 30) { bullish++; metrics.push({ label: 'Forward P/E', value: fmtX(pe), signal: 'bullish', detail: 'Reasonable for uranium cycle' }); }
    else if (pe <= 60) { metrics.push({ label: 'Forward P/E', value: fmtX(pe), signal: 'neutral', detail: 'Growth premium in uranium' }); }
    else { bearish++; metrics.push({ label: 'Forward P/E', value: fmtX(pe), signal: 'bearish', detail: 'Fully valued on forward earnings' }); }
  }

  // 3. Revenue growth
  if (d.revenueGrowth !== null) {
    total++;
    if (d.revenueGrowth > 0) { bullish++; metrics.push({ label: 'Revenue Growth', value: fmtPct(d.revenueGrowth), signal: 'bullish', detail: 'Production ramping' }); }
    else { bearish++; metrics.push({ label: 'Revenue Growth', value: fmtPct(d.revenueGrowth), signal: 'bearish', detail: 'Production issues or pricing headwind' }); }
  }

  // 4. FCF Yield
  if (d.fcfYield !== null) {
    total++;
    if (d.fcfYield > 8) { bullish++; metrics.push({ label: 'FCF Yield', value: fmtPct(d.fcfYield), signal: 'bullish', detail: 'Deep value' }); }
    else if (d.fcfYield > 4) { bullish++; metrics.push({ label: 'FCF Yield', value: fmtPct(d.fcfYield), signal: 'bullish', detail: 'Attractively priced' }); }
    else if (d.fcfYield > 2) { metrics.push({ label: 'FCF Yield', value: fmtPct(d.fcfYield), signal: 'neutral', detail: 'Fair value' }); }
    else { bearish++; metrics.push({ label: 'FCF Yield', value: fmtPct(d.fcfYield), signal: 'bearish', detail: 'Expensive or FCF weak' }); }
  }

  metrics.push({
    label: 'Sector Note',
    value: 'Premium',
    signal: 'neutral',
    detail: 'Uranium miners trade at premium multiples due to structural supply deficit. Contract book heavily influences true value.',
  });

  const verdict = total === 0 ? 'insufficient-data' :
    bullish >= total * 0.6 ? 'undervalued' :
    bearish >= total * 0.6 ? 'overvalued' : 'fair';

  return {
    verdict,
    confidence: total >= 3 ? 'medium' : 'low',
    summary: `${d.name} valued as uranium producer. ${verdict === 'undervalued' ? 'Trading below sector norms despite supply deficit.' : verdict === 'overvalued' ? 'Premium stretched beyond fundamentals.' : 'Trading within uranium sector premium range.'}`,
    metrics,
    fairValueRange: null,
    catalysts: [
      'Uranium spot price movement',
      'New utility contracting activity',
      'Production guidance changes',
      'Geopolitical supply disruption (Kazakhstan, Niger)',
    ],
  };
}

function assessUraniumDeveloper(d: ValuationData): ValuationAssessment {
  const metrics: AssessmentMetric[] = [];

  // P/B ratio is the key metric
  if (d.priceToBook !== null) {
    const pb = d.priceToBook;
    if (pb < 1.0) { metrics.push({ label: 'Price/Book', value: fmtX(pb), signal: 'bullish', detail: 'Below book value — market discounting assets' }); }
    else if (pb <= 3.0) { metrics.push({ label: 'Price/Book', value: fmtX(pb), signal: 'neutral', detail: 'Funded developer range (1-3x book)' }); }
    else { metrics.push({ label: 'Price/Book', value: fmtX(pb), signal: 'bearish', detail: 'Premium to book — speculative' }); }
  }

  // FCF negative is normal
  if (d.freeCashFlow !== null) {
    metrics.push({
      label: 'Free Cash Flow',
      value: fmtDollar(d.freeCashFlow),
      signal: d.freeCashFlow < 0 ? 'neutral' : 'bullish',
      detail: d.freeCashFlow < 0 ? 'Cash burn normal for pre-production' : 'Positive FCF — unusual for developer',
    });
  }

  if (d.debtToEquity !== null) {
    metrics.push({
      label: 'Debt/Equity',
      value: `${d.debtToEquity.toFixed(0)}%`,
      signal: d.debtToEquity < 50 ? 'bullish' : d.debtToEquity < 100 ? 'neutral' : 'bearish',
      detail: d.debtToEquity < 50 ? 'Low leverage — financing headroom' : 'Watch for dilutive financing',
    });
  }

  metrics.push({
    label: 'Valuation Basis',
    value: 'Optionality',
    signal: 'neutral',
    detail: 'Valued on in-ground resource and development timeline, not current earnings',
  });

  // Fair value: P/B approach
  let fairValueRange: ValuationAssessment['fairValueRange'] = null;
  if (d.priceToBook !== null && d.priceToBook > 0 && d.price > 0) {
    const bookPerShare = d.price / d.priceToBook;
    fairValueRange = {
      low: Math.round(bookPerShare * 1.5 * 100) / 100,
      mid: Math.round(bookPerShare * 2.0 * 100) / 100,
      high: Math.round(bookPerShare * 2.5 * 100) / 100,
    };
  }

  return {
    verdict: 'speculative',
    confidence: 'low',
    summary: `${d.name} is a pre-production uranium developer. Valued on in-ground resource and development milestones, not current earnings. Traditional multiples largely meaningless.`,
    metrics,
    fairValueRange,
    catalysts: [
      'Development milestone achievement',
      'Uranium spot price increase',
      'Offtake agreement signing',
      'Permitting or regulatory approval',
    ],
  };
}

function assessNuclearUtility(d: ValuationData): ValuationAssessment {
  const metrics: AssessmentMetric[] = [];
  let bullish = 0, bearish = 0, total = 0;

  // 1. EV/EBITDA
  if (d.evToEbitda !== null && d.evToEbitda > 0) {
    const ev = d.evToEbitda;
    total++;
    if (ev < 12) { bullish++; metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'bullish', detail: 'Below AI-era re-rating range' }); }
    else if (ev <= 18) { metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'neutral', detail: 'AI premium range (12-18x)' }); }
    else { bearish++; metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'bearish', detail: 'Full narrative premium' }); }
  }

  // 2. Forward PE
  if (d.forwardPE !== null) {
    const pe = d.forwardPE;
    total++;
    if (pe < 20) { bullish++; metrics.push({ label: 'Forward P/E', value: fmtX(pe), signal: 'bullish', detail: 'Attractive for nuclear utility' }); }
    else if (pe <= 30) { metrics.push({ label: 'Forward P/E', value: fmtX(pe), signal: 'neutral', detail: 'Growth priced in' }); }
    else { bearish++; metrics.push({ label: 'Forward P/E', value: fmtX(pe), signal: 'bearish', detail: 'Stretched beyond fundamentals' }); }
  }

  // 3. PEG Ratio
  if (d.pegRatio !== null && d.pegRatio > 0) {
    const peg = d.pegRatio;
    total++;
    if (peg < 1.0) { bullish++; metrics.push({ label: 'PEG Ratio', value: fmtX(peg), signal: 'bullish', detail: 'Growth at a discount' }); }
    else if (peg <= 2.0) { metrics.push({ label: 'PEG Ratio', value: fmtX(peg), signal: 'neutral', detail: 'Fairly valued vs growth' }); }
    else { bearish++; metrics.push({ label: 'PEG Ratio', value: fmtX(peg), signal: 'bearish', detail: 'Premium to growth rate' }); }
  }

  // 4. Debt/Equity (special thresholds for utilities)
  if (d.debtToEquity !== null) {
    const de = d.debtToEquity;
    total++;
    if (de < 100) { bullish++; metrics.push({ label: 'Debt/Equity', value: `${de.toFixed(0)}%`, signal: 'bullish', detail: 'Healthy for a utility' }); }
    else if (de <= 200) { metrics.push({ label: 'Debt/Equity', value: `${de.toFixed(0)}%`, signal: 'neutral', detail: 'Moderate leverage' }); }
    else { bearish++; metrics.push({ label: 'Debt/Equity', value: `${de.toFixed(0)}%`, signal: 'bearish', detail: 'Significant leverage risk' }); }
  }

  // 5. FCF Yield
  if (d.fcfYield !== null) {
    total++;
    if (d.fcfYield > 6) { bullish++; metrics.push({ label: 'FCF Yield', value: fmtPct(d.fcfYield), signal: 'bullish', detail: 'Strong cash generation' }); }
    else if (d.fcfYield > 3) { metrics.push({ label: 'FCF Yield', value: fmtPct(d.fcfYield), signal: 'neutral', detail: 'Adequate cash flow' }); }
    else { bearish++; metrics.push({ label: 'FCF Yield', value: fmtPct(d.fcfYield), signal: 'bearish', detail: 'Low cash yield' }); }
  }

  if (d.dividendYield !== null) {
    metrics.push({ label: 'Dividend Yield', value: fmtPct(d.dividendYield), signal: d.dividendYield > 2 ? 'bullish' : 'neutral', detail: 'Utility income' });
  }

  metrics.push({
    label: 'Sector Note',
    value: 'AI Premium',
    signal: 'neutral',
    detail: 'PJM capacity price surge (+833%) is real revenue, not narrative. But some AI premium is priced beyond fundamentals.',
  });

  // Fair value: EV/EBITDA with 14x (mid AI-era range)
  let fairValueRange: ValuationAssessment['fairValueRange'] = null;
  if (d.evToEbitda !== null && d.evToEbitda > 0 && d.marketCap > 0 && d.price > 0) {
    const impliedEbitda = d.enterpriseValue / d.evToEbitda;
    const netDebt = d.enterpriseValue - d.marketCap;
    const sharesOut = d.marketCap / d.price;
    const fairEV = impliedEbitda * 14;
    const fairMktCap = fairEV - netDebt;
    const fairPrice = fairMktCap / sharesOut;
    if (fairPrice > 0 && isFinite(fairPrice)) {
      fairValueRange = {
        low: Math.round(fairPrice * 0.85 * 100) / 100,
        mid: Math.round(fairPrice * 100) / 100,
        high: Math.round(fairPrice * 1.15 * 100) / 100,
      };
    }
  }

  const verdict = total === 0 ? 'insufficient-data' :
    bullish >= total * 0.6 ? 'undervalued' :
    bearish >= total * 0.6 ? 'overvalued' : 'fair';

  return {
    verdict,
    confidence: total >= 4 ? 'high' : total >= 2 ? 'medium' : 'low',
    summary: `${d.name} as nuclear utility in AI era. ${verdict === 'undervalued' ? 'Data centre power demand thesis not fully priced.' : verdict === 'overvalued' ? 'AI premium may exceed near-term reality.' : 'Trading within AI-era nuclear utility range.'}`,
    metrics,
    fairValueRange,
    catalysts: [
      'PJM capacity auction outcomes',
      'Hyperscaler power purchase agreements',
      'Nuclear plant life extensions / new builds',
      'Regulatory changes on nuclear power',
    ],
  };
}

function assessNuclearPreRevenue(d: ValuationData): ValuationAssessment {
  const metrics: AssessmentMetric[] = [];

  // P/B ratio — dynamic
  if (d.priceToBook !== null) {
    const pb = d.priceToBook;
    if (pb > 8) { metrics.push({ label: 'Price/Book', value: fmtX(pb), signal: 'bearish', detail: `Paying ${pb.toFixed(1)}x tangible value — extreme narrative premium` }); }
    else if (pb > 5) { metrics.push({ label: 'Price/Book', value: fmtX(pb), signal: 'bearish', detail: `${pb.toFixed(1)}x book — heavy narrative premium over tangible value` }); }
    else if (pb >= 2) { metrics.push({ label: 'Price/Book', value: fmtX(pb), signal: 'neutral', detail: `${pb.toFixed(1)}x book — speculative growth premium` }); }
    else { metrics.push({ label: 'Price/Book', value: fmtX(pb), signal: 'bullish', detail: `${pb.toFixed(1)}x book — closer to tangible value` }); }
  }

  // EV stripped of cash — what market pays for the *business alone*
  if (d.enterpriseValue > 0 && d.marketCap > 0) {
    const cash = d.marketCap - d.enterpriseValue; // approx net cash
    const businessValue = d.enterpriseValue;
    if (cash > 0) {
      metrics.push({
        label: 'Business Value (ex-cash)',
        value: fmtDollar(businessValue),
        signal: businessValue > 5_000_000_000 ? 'bearish' : businessValue > 2_000_000_000 ? 'neutral' : 'bullish',
        detail: `Market pays ${fmtDollar(businessValue)} for the business beyond ${fmtDollar(cash)} cash on hand`,
      });
    }
  }

  // Cash burn + runway calculation
  if (d.freeCashFlow !== null && d.freeCashFlow < 0) {
    const burn = Math.abs(d.freeCashFlow);
    const cash = d.marketCap > 0 && d.enterpriseValue > 0 ? Math.max(d.marketCap - d.enterpriseValue, 0) : 0;
    const runwayYears = cash > 0 ? cash / burn : null;
    
    let burnSignal: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let burnDetail = `${fmtDollar(burn)}/yr burn rate`;
    
    if (runwayYears !== null) {
      if (runwayYears > 5) { burnSignal = 'bullish'; burnDetail = `${runwayYears.toFixed(1)}yr runway at current burn — comfortable`; }
      else if (runwayYears > 2) { burnSignal = 'neutral'; burnDetail = `${runwayYears.toFixed(1)}yr runway — adequate but watch for dilution`; }
      else { burnSignal = 'bearish'; burnDetail = `${runwayYears.toFixed(1)}yr runway — will need capital raise soon`; }
    } else if (burn > 200_000_000) {
      burnSignal = 'bearish';
      burnDetail = `${fmtDollar(burn)}/yr burn — heavy for pre-revenue`;
    }

    metrics.push({ label: 'Cash Burn', value: fmtDollar(burn) + '/yr', signal: burnSignal, detail: burnDetail });
    if (runwayYears !== null) {
      metrics.push({ label: 'Cash Runway', value: `${runwayYears.toFixed(1)} years`, signal: burnSignal, detail: runwayYears < 2 ? 'Dilutive raise likely within 18 months' : runwayYears > 5 ? 'Well-funded through development phase' : 'Watch secondary offering risk' });
    }
  }

  // Revenue (if any — SMR has some, OKLO has zero)
  if (d.revenueGrowth !== null) {
    metrics.push({
      label: 'Revenue Growth',
      value: `${(d.revenueGrowth * 100).toFixed(0)}%`,
      signal: d.revenueGrowth > 0 ? 'bullish' : 'neutral',
      detail: d.revenueGrowth > 0 ? 'Some revenue traction — rare for pre-revenue nuclear' : 'Revenue declining — still in development mode',
    });
  }

  // Forward PE (if available, usually deeply negative)
  if (d.forwardPE !== null && d.forwardPE < 0) {
    metrics.push({
      label: 'Forward P/E',
      value: `${d.forwardPE.toFixed(1)}x`,
      signal: 'neutral',
      detail: 'Negative — losses expected to continue near-term',
    });
  }

  // Dynamic summary based on actual data
  const pb = d.priceToBook;
  const cash = d.marketCap > 0 && d.enterpriseValue > 0 ? Math.max(d.marketCap - d.enterpriseValue, 0) : 0;
  const burn = d.freeCashFlow !== null && d.freeCashFlow < 0 ? Math.abs(d.freeCashFlow) : null;
  const runway = burn && cash > 0 ? cash / burn : null;

  let summaryParts: string[] = [];
  summaryParts.push(`${d.name} is pre-revenue nuclear technology trading at ${fmtDollar(d.marketCap)} market cap`);
  if (pb !== null) summaryParts.push(`${pb.toFixed(1)}x book value`);
  if (runway !== null) {
    if (runway < 3) summaryParts.push(`only ${runway.toFixed(1)} years cash runway — dilution risk elevated`);
    else if (runway > 8) summaryParts.push(`${runway.toFixed(1)} years cash runway — well-funded through development`);
    else summaryParts.push(`${runway.toFixed(1)} years cash runway`);
  }
  summaryParts.push('No reliable fair value calculable — valued on regulatory milestones and technology promise');

  // Symbol-specific colour
  const catalysts = d.symbol === 'SMR' ? [
    'NRC design certification (only SMR company with full certification)',
    'First customer unit construction start',
    'Power purchase agreement announcements',
    'DOE loan program disbursements',
  ] : d.symbol === 'OKLO' ? [
    'NRC combined license application resubmission outcome',
    'First customer agreement execution',
    'Fuel recycling technology demonstration',
    'Sam Altman / OpenAI strategic alignment signals',
  ] : [
    'NRC design certification progress',
    'First customer order / power purchase agreement',
    'Technology demonstration milestone',
    'Government funding or loan guarantee',
  ];

  return {
    verdict: 'speculative',
    confidence: 'low',
    summary: summaryParts.join('. ') + '.',
    metrics,
    fairValueRange: null,
    catalysts,
  };
}

function assessREEProducer(d: ValuationData): ValuationAssessment {
  const metrics: AssessmentMetric[] = [];
  let bullish = 0, bearish = 0, total = 0;

  // EV/Revenue (when earnings distorted)
  if (d.evToRevenue !== null && d.evToRevenue > 0) {
    const evr = d.evToRevenue;
    total++;
    if (evr < 5) { bullish++; metrics.push({ label: 'EV/Revenue', value: fmtX(evr), signal: 'neutral', detail: 'Reasonable for REE producer' }); }
    else if (evr <= 15) { metrics.push({ label: 'EV/Revenue', value: fmtX(evr), signal: 'neutral', detail: 'Growth premium' }); }
    else { bearish++; metrics.push({ label: 'EV/Revenue', value: fmtX(evr), signal: 'bearish', detail: 'Speculative premium' }); }
  }

  // Strategic premium checklist
  const strategicFactors: { label: string; met: boolean }[] = [];
  // These are known for MP and LYC
  if (d.symbol === 'MP') {
    strategicFactors.push(
      { label: 'Non-Chinese production', met: true },
      { label: 'Government backing (DoD/DoE)', met: true },
      { label: 'Downstream integration', met: true },
      { label: 'OECD jurisdiction', met: true },
      { label: 'Offtake agreements', met: true },
    );
  } else if (d.symbol === 'LYC.AX') {
    strategicFactors.push(
      { label: 'Non-Chinese production', met: true },
      { label: 'Government backing', met: true },
      { label: 'Downstream integration', met: false },
      { label: 'OECD jurisdiction', met: true },
      { label: 'Offtake agreements', met: true },
    );
  }

  if (strategicFactors.length > 0) {
    const count = strategicFactors.filter(f => f.met).length;
    total++;
    if (count >= 4) { bullish++; metrics.push({ label: 'Strategic Premium', value: `${count}/${strategicFactors.length}`, signal: 'bullish', detail: 'Strategic asset premium justified' }); }
    else { metrics.push({ label: 'Strategic Premium', value: `${count}/${strategicFactors.length}`, signal: 'neutral', detail: 'Emerging strategic position' }); }
  }

  if (d.operatingMargin !== null) {
    metrics.push({
      label: 'Operating Margin',
      value: fmtPct(d.operatingMargin),
      signal: d.operatingMargin > 10 ? 'bullish' : d.operatingMargin > 0 ? 'neutral' : 'bearish',
      detail: d.operatingMargin < 0 ? 'Negative — transition period' : 'Margin on production',
    });
  }

  // Special MP note
  if (d.symbol === 'MP') {
    metrics.push({
      label: 'DoD Floor',
      value: '$110/kg NdPr',
      signal: 'bullish',
      detail: 'Government-backed margin guarantee vs ~$59/kg market. Not a commodity play — strategic asset.',
    });
  }

  const verdict = total === 0 ? 'insufficient-data' :
    bullish >= total * 0.6 ? 'undervalued' :
    bearish >= total * 0.5 ? 'overvalued' : 'fair';

  return {
    verdict,
    confidence: total >= 2 ? 'medium' : 'low',
    summary: `${d.name} as Western REE producer. ${d.symbol === 'MP' ? 'Strategic asset with DoD price floor — not a pure commodity play.' : 'One of few non-Chinese REE producers globally.'}`,
    metrics,
    fairValueRange: null,
    catalysts: [
      'MOFCOM export control escalation',
      'New government contracts or subsidies',
      'NdPr price recovery',
      'Downstream processing milestones',
    ],
  };
}

function assessREEDeveloper(d: ValuationData): ValuationAssessment {
  const metrics: AssessmentMetric[] = [];

  if (d.priceToBook !== null) {
    metrics.push({
      label: 'Price/Book',
      value: fmtX(d.priceToBook),
      signal: d.priceToBook < 2 ? 'bullish' : d.priceToBook < 4 ? 'neutral' : 'bearish',
      detail: 'Book value basis for pre-production',
    });
  }

  if (d.marketCap > 0) {
    metrics.push({ label: 'Market Cap', value: fmtDollar(d.marketCap), signal: 'neutral', detail: 'Development-stage valuation' });
  }

  if (d.debtToEquity !== null) {
    metrics.push({
      label: 'Debt/Equity',
      value: `${d.debtToEquity.toFixed(0)}%`,
      signal: d.debtToEquity < 50 ? 'bullish' : 'bearish',
      detail: d.debtToEquity < 50 ? 'Financing headroom' : 'May need equity raise',
    });
  }

  return {
    verdict: 'speculative',
    confidence: 'low',
    summary: `${d.name} is a REE development-stage company. Valued on resource base, permitting progress, and government backing. Traditional earnings multiples not applicable.`,
    metrics,
    fairValueRange: null,
    catalysts: [
      'Feasibility study completion',
      'Government grant or loan award',
      'Offtake agreement with end-user',
      'China export controls on REE',
    ],
  };
}

function assessLithiumProducer(d: ValuationData): ValuationAssessment {
  const metrics: AssessmentMetric[] = [];
  let bullish = 0, bearish = 0, total = 0;

  // P/B at cycle bottom
  if (d.priceToBook !== null) {
    const pb = d.priceToBook;
    total++;
    if (pb < 1.5) { bullish++; metrics.push({ label: 'Price/Book', value: fmtX(pb), signal: 'bullish', detail: 'Near trough valuation' }); }
    else if (pb <= 3.0) { metrics.push({ label: 'Price/Book', value: fmtX(pb), signal: 'neutral', detail: 'Mid-cycle valuation' }); }
    else { bearish++; metrics.push({ label: 'Price/Book', value: fmtX(pb), signal: 'bearish', detail: 'Premium — pricing recovery' }); }
  }

  // Gross margin trend
  if (d.grossMargin !== null) {
    total++;
    if (d.grossMargin > 30) { bullish++; metrics.push({ label: 'Gross Margin', value: fmtPct(d.grossMargin), signal: 'bullish', detail: 'Healthy margins despite cycle' }); }
    else if (d.grossMargin > 10) { metrics.push({ label: 'Gross Margin', value: fmtPct(d.grossMargin), signal: 'neutral', detail: 'Compressed but positive' }); }
    else { bearish++; metrics.push({ label: 'Gross Margin', value: fmtPct(d.grossMargin), signal: 'bearish', detail: 'Margin under severe pressure' }); }
  }

  // FCF positive at cycle bottom = survivor
  if (d.freeCashFlow !== null) {
    total++;
    if (d.freeCashFlow > 0) { bullish++; metrics.push({ label: 'Free Cash Flow', value: fmtDollar(d.freeCashFlow), signal: 'bullish', detail: 'FCF positive at cycle bottom = survivor' }); }
    else { bearish++; metrics.push({ label: 'Free Cash Flow', value: fmtDollar(d.freeCashFlow), signal: 'bearish', detail: 'Cash burn — needs price recovery' }); }
  }

  metrics.push({
    label: 'Cycle Note',
    value: 'Cyclical',
    signal: 'neutral',
    detail: 'Lithium is cyclical. Traditional PE misleading at extremes. P/B is the floor metric.',
  });

  const verdict = total === 0 ? 'insufficient-data' :
    bullish >= total * 0.6 ? 'undervalued' :
    bearish >= total * 0.6 ? 'overvalued' : 'fair';

  return {
    verdict,
    confidence: total >= 2 ? 'medium' : 'low',
    summary: `${d.name} in lithium cycle. ${verdict === 'undervalued' ? 'Near trough valuation — survivor characteristics.' : verdict === 'overvalued' ? 'Pricing recovery that may not materialise near-term.' : 'Mid-cycle valuation.'}`,
    metrics,
    fairValueRange: null,
    catalysts: [
      'Lithium carbonate/hydroxide price inflection',
      'EV demand acceleration',
      'Chinese lithium supply cuts',
      'Battery technology shift (LFP vs NMC)',
    ],
  };
}

function assessCopperProducer(d: ValuationData): ValuationAssessment {
  const metrics: AssessmentMetric[] = [];
  let bullish = 0, bearish = 0, total = 0;

  if (d.evToEbitda !== null && d.evToEbitda > 0) {
    const ev = d.evToEbitda;
    total++;
    if (ev < 7) { bullish++; metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'bullish', detail: 'Cheap for major copper producer' }); }
    else if (ev <= 10) { metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'neutral', detail: 'Fair for copper' }); }
    else { bearish++; metrics.push({ label: 'EV/EBITDA', value: fmtX(ev), signal: 'bearish', detail: 'Premium above copper norms' }); }
  }

  if (d.forwardPE !== null) {
    total++;
    if (d.forwardPE < 15) { bullish++; metrics.push({ label: 'Forward P/E', value: fmtX(d.forwardPE), signal: 'bullish', detail: 'Attractive for copper producer' }); }
    else if (d.forwardPE <= 25) { metrics.push({ label: 'Forward P/E', value: fmtX(d.forwardPE), signal: 'neutral', detail: 'Growth priced' }); }
    else { bearish++; metrics.push({ label: 'Forward P/E', value: fmtX(d.forwardPE), signal: 'bearish', detail: 'Expensive' }); }
  }

  if (d.dividendYield !== null && d.dividendYield > 0) {
    metrics.push({ label: 'Dividend Yield', value: fmtPct(d.dividendYield), signal: d.dividendYield > 3 ? 'bullish' : 'neutral', detail: 'Mining income return' });
  }

  metrics.push({
    label: 'Sector Note',
    value: 'Deficit',
    signal: 'bullish',
    detail: '320K tonne global deficit forecast for 2026. Electrification demand structural.',
  });

  const verdict = total === 0 ? 'insufficient-data' :
    bullish >= total * 0.6 ? 'undervalued' :
    bearish >= total * 0.6 ? 'overvalued' : 'fair';

  return {
    verdict,
    confidence: total >= 2 ? 'medium' : 'low',
    summary: `${d.name} as copper producer. ${verdict === 'undervalued' ? 'Attractive multiples with structural deficit ahead.' : 'Trading within standard mining multiples.'}`,
    metrics,
    fairValueRange: null,
    catalysts: [
      'Copper price breakout above key levels',
      'Electrification demand acceleration',
      'Supply disruptions (Chile, Peru)',
      'Chinese stimulus impact on demand',
    ],
  };
}

function assessETF(d: ValuationData): ValuationAssessment {
  const metrics: AssessmentMetric[] = [];

  metrics.push({
    label: 'AUM Proxy',
    value: fmtDollar(d.marketCap),
    signal: 'neutral',
    detail: 'Market cap as AUM proxy',
  });

  if (d.dividendYield !== null && d.dividendYield > 0) {
    metrics.push({ label: 'Distribution Yield', value: fmtPct(d.dividendYield), signal: 'neutral', detail: 'ETF distribution' });
  }

  if (d.trailingPE !== null && d.trailingPE > 0) {
    metrics.push({ label: 'Weighted P/E', value: fmtX(d.trailingPE), signal: 'neutral', detail: 'Portfolio-weighted earnings multiple' });
  }

  return {
    verdict: 'fair',
    confidence: 'low',
    summary: `${d.name} is an ETF — tracks sector performance, not individually valued. Assess constituent stocks for fundamental views.`,
    metrics,
    fairValueRange: null,
    catalysts: [
      'Sector-wide momentum shift',
      'Fund flow direction (inflows vs outflows)',
      'Rebalancing or constituent changes',
    ],
  };
}

function assessOther(d: ValuationData): ValuationAssessment {
  const metrics: AssessmentMetric[] = [];

  if (d.forwardPE !== null) metrics.push({ label: 'Forward P/E', value: fmtX(d.forwardPE), signal: 'neutral', detail: 'Forward earnings multiple' });
  if (d.evToEbitda !== null) metrics.push({ label: 'EV/EBITDA', value: fmtX(d.evToEbitda), signal: 'neutral', detail: 'Enterprise value multiple' });
  if (d.priceToBook !== null) metrics.push({ label: 'Price/Book', value: fmtX(d.priceToBook), signal: 'neutral', detail: 'Book value multiple' });
  if (d.fcfYield !== null) metrics.push({ label: 'FCF Yield', value: fmtPct(d.fcfYield), signal: d.fcfYield > 5 ? 'bullish' : 'neutral', detail: 'Cash flow yield' });

  return {
    verdict: 'insufficient-data',
    confidence: 'low',
    summary: `${d.name} — no specific valuation framework configured for this stock type.`,
    metrics,
    fairValueRange: null,
    catalysts: ['Sector-specific developments'],
  };
}

function computeAssessment(d: ValuationData): ValuationAssessment {
  switch (d.stockType) {
    case 'gold-miner': return assessGoldMiner(d);
    case 'gold-streamer': return assessGoldStreamer(d);
    case 'uranium-miner': return assessUraniumMiner(d);
    case 'uranium-developer': return assessUraniumDeveloper(d);
    case 'nuclear-utility': return assessNuclearUtility(d);
    case 'nuclear-prerevenue': return assessNuclearPreRevenue(d);
    case 'ree-producer': return assessREEProducer(d);
    case 'ree-developer': return assessREEDeveloper(d);
    case 'lithium-producer': return assessLithiumProducer(d);
    case 'copper-producer': return assessCopperProducer(d);
    case 'etf': return assessETF(d);
    default: return assessOther(d);
  }
}

// ============ ROUTE ============

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get('symbol');
  if (!symbol) {
    return NextResponse.json({ error: 'Missing symbol parameter' }, { status: 400 });
  }

  const cacheKey = `valuation:${symbol}`;
  const cached = getCached<ValuationData>(cacheKey, CACHE_TTL);
  if (cached) {
    return NextResponse.json(cached);
  }

  try {
    const result = await yf.quoteSummary(symbol, {
      modules: ['defaultKeyStatistics', 'financialData', 'price', 'summaryDetail'],
    });

    const price = result.price;
    const fin = result.financialData;
    const stats = result.defaultKeyStatistics;
    const summary = result.summaryDetail;

    const currentPrice = n(price?.regularMarketPrice) ?? 0;
    const marketCap = n(price?.marketCap) ?? 0;
    const ev = n(stats?.enterpriseValue) ?? 0;
    const fcf = n(fin?.freeCashflow);
    const fcfYield = fcf !== null && marketCap > 0 ? (fcf / marketCap) * 100 : null;

    const lookup = STOCK_TYPE_MAP[symbol] ?? { type: 'other' as StockType, track: 'pm' as TrackId };

    const data: ValuationData = {
      symbol,
      name: price?.shortName ?? price?.longName ?? symbol,
      sector: String(price?.sector ?? ''),
      price: currentPrice,
      marketCap,
      enterpriseValue: ev,

      trailingPE: n(summary?.trailingPE),
      forwardPE: n(stats?.forwardPE) ?? n(summary?.forwardPE),
      priceToBook: n(stats?.priceToBook),
      evToEbitda: n(stats?.enterpriseToEbitda),
      evToRevenue: n(stats?.enterpriseToRevenue),
      pegRatio: n(stats?.pegRatio),

      grossMargin: pct(fin?.grossMargins),
      operatingMargin: pct(fin?.operatingMargins),
      profitMargin: pct(fin?.profitMargins),
      roe: pct(fin?.returnOnEquity),

      freeCashFlow: fcf,
      fcfYield,

      debtToEquity: n(fin?.debtToEquity),

      earningsGrowth: pct(fin?.earningsGrowth),
      revenueGrowth: pct(fin?.revenueGrowth),

      dividendYield: pct(summary?.dividendYield),
      payoutRatio: pct(summary?.payoutRatio),

      stockType: lookup.type,
      track: lookup.track,

      // Placeholder — will be computed below
      assessment: { verdict: 'insufficient-data', confidence: 'low', summary: '', metrics: [], fairValueRange: null, catalysts: [] },
    };

    // Compute assessment based on stock type
    data.assessment = computeAssessment(data);

    setCached(cacheKey, data);
    return NextResponse.json(data);
  } catch (err: unknown) {
    console.error(`Valuation fetch failed for ${symbol}:`, err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to fetch valuation for ${symbol}: ${message}` }, { status: 500 });
  }
}
