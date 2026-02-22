/**
 * Composite signal scoring — combines price data with fundamental/structural data.
 * Each composite signal has: score (0-100 or 0-10), label, trend, components, lastUpdated.
 */

import type { PriceData, MacroData, Track } from './signals';
import type { FundamentalsDeepData, ChinaLeverageFactor } from './fundamentals-types';

// Re-export china leverage config for use in UI
export { CHINA_LEVERAGE_CONFIG } from './fundamentals-types';

// ============ TYPES ============

export interface CompositeSignal {
  key: string;
  score: number;
  maxScore: number; // 100 or 10 depending on signal
  label: string;
  trend: 'improving' | 'declining' | 'stable';
  components: CompositeComponent[];
  lastUpdated: string;
}

export interface CompositeComponent {
  name: string;
  contribution: number; // how much this contributed to the score
  detail: string;
}

// ============ HELPERS ============

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function inferTrend(price: PriceData | undefined): 'improving' | 'declining' | 'stable' {
  if (!price?.change_pct) return 'stable';
  if (price.change_pct > 0.5) return 'improving';
  if (price.change_pct < -0.5) return 'declining';
  return 'stable';
}

function aboveMaScore(price: PriceData | undefined): number {
  if (!price?.price || !price?.ma_50d) return 50;
  const pct = ((price.price - price.ma_50d) / price.ma_50d) * 100;
  // +10% above MA → 100, -10% below → 0
  return clamp(50 + pct * 5, 0, 100);
}

// ============ ENERGY COMPOSITES ============

function computeUraniumSupplyStress(
  prices: Record<string, PriceData>,
  fundamentals: FundamentalsDeepData,
): CompositeSignal {
  const components: CompositeComponent[] = [];
  let totalScore = 0;
  let weights = 0;
  const now = new Date().toISOString();

  // 1. SPUT purchase velocity (weight: 25)
  const sputLbs = fundamentals.energy.sputHoldings.lbs;
  if (sputLbs != null) {
    // More lbs held = more supply locked up
    // 66M lbs is high historically → score 70+
    const sputScore = clamp((sputLbs / 80_000_000) * 100, 0, 100);
    components.push({ name: 'SPUT Holdings', contribution: sputScore, detail: `${(sputLbs / 1_000_000).toFixed(1)}M lbs held` });
    totalScore += sputScore * 25;
    weights += 25;
  }

  // 2. U3O8 spot vs $100 threshold (weight: 30)
  const uSpot = fundamentals.energy.uraniumSpot.price;
  if (uSpot != null) {
    // Above $100 → strong stress. Below $50 → weak. Linear between.
    const spotScore = clamp(((uSpot - 40) / 80) * 100, 0, 100);
    components.push({ name: 'U3O8 Spot Price', contribution: spotScore, detail: `$${uSpot.toFixed(0)}/lb (threshold: $100)` });
    totalScore += spotScore * 30;
    weights += 30;
  }

  // 3. EIA production trend (weight: 20)
  const eiaProd = fundamentals.energy.eiaProduction.value;
  if (eiaProd != null) {
    // Lower US production = higher stress. US produces very little (<1M lbs/yr)
    // Score inversely: low production → high stress
    const prodScore = clamp(100 - (eiaProd / 500) * 100, 30, 100);
    components.push({ name: 'US Production', contribution: prodScore, detail: `${eiaProd.toFixed(0)}K lbs (low = higher stress)` });
    totalScore += prodScore * 20;
    weights += 20;
  }

  // 4. Reactor count (weight: 25)
  const reactors = fundamentals.energy.reactorCount.operational;
  if (reactors != null) {
    // More reactors = more demand = higher stress on supply
    // 93 reactors baseline → 70 score. New builds push higher.
    const reactorScore = clamp((reactors / 100) * 80, 0, 100);
    components.push({ name: 'Reactor Count', contribution: reactorScore, detail: `${reactors} operational US reactors` });
    totalScore += reactorScore * 25;
    weights += 25;
  }

  const score = weights > 0 ? Math.round(totalScore / weights) : 50;
  const ura = prices['URA'];

  return {
    key: 'uraniumSupplyStress',
    score,
    maxScore: 100,
    label: 'Uranium Supply Stress',
    trend: inferTrend(ura),
    components,
    lastUpdated: now,
  };
}

function computeGridStressIndex(
  prices: Record<string, PriceData>,
  fundamentals: FundamentalsDeepData,
): CompositeSignal {
  const components: CompositeComponent[] = [];
  let totalScore = 0;
  let weights = 0;
  const now = new Date().toISOString();

  // 1. Grid queue size (weight: 40)
  const queueMW = fundamentals.energy.gridQueue.totalMW;
  if (queueMW != null) {
    // 2.6TW queue is massive — indicates structural undersupply
    const queueScore = clamp((queueMW / 3_000_000) * 100, 0, 100);
    components.push({ name: 'Interconnection Queue', contribution: queueScore, detail: `${(queueMW / 1_000_000).toFixed(1)}TW pending` });
    totalScore += queueScore * 40;
    weights += 40;
  }

  // 2. Nuclear/utility equity momentum as proxy (weight: 30)
  const nuclearSyms = ['CEG', 'VST', 'SMR', 'OKLO'];
  const nuclearScores = nuclearSyms.map(s => aboveMaScore(prices[s])).filter(s => s !== 50);
  if (nuclearScores.length > 0) {
    const avg = nuclearScores.reduce((a, b) => a + b, 0) / nuclearScores.length;
    components.push({ name: 'Nuclear Equity Momentum', contribution: Math.round(avg), detail: `${nuclearScores.length} stocks tracked` });
    totalScore += avg * 30;
    weights += 30;
  }

  // 3. Natural gas as demand proxy (weight: 30)
  const gas = prices['NG=F'];
  if (gas?.price && gas?.ma_50d) {
    const gasScore = aboveMaScore(gas);
    components.push({ name: 'Gas Price Trend', contribution: gasScore, detail: `NG at $${gas.price.toFixed(2)}` });
    totalScore += gasScore * 30;
    weights += 30;
  }

  const score = weights > 0 ? Math.round(totalScore / weights) : 50;

  return {
    key: 'gridStressIndex',
    score,
    maxScore: 100,
    label: 'Grid Stress Index',
    trend: inferTrend(prices['VST']),
    components,
    lastUpdated: now,
  };
}

function computeNuclearMomentum(
  prices: Record<string, PriceData>,
  fundamentals: FundamentalsDeepData,
): CompositeSignal {
  const components: CompositeComponent[] = [];
  let totalScore = 0;
  let weights = 0;
  const now = new Date().toISOString();

  // 1. Nuclear equity performance (weight: 60)
  const nuclearSyms = ['SMR', 'OKLO', 'CEG', 'VST'];
  const equityScores: number[] = [];
  for (const sym of nuclearSyms) {
    const pr = prices[sym];
    if (pr?.price && pr?.ma_50d) {
      equityScores.push(aboveMaScore(pr));
    }
  }
  if (equityScores.length > 0) {
    const avg = equityScores.reduce((a, b) => a + b, 0) / equityScores.length;
    components.push({ name: 'Nuclear Equity Trend', contribution: Math.round(avg), detail: `${equityScores.length} stocks above/below MA` });
    totalScore += avg * 60;
    weights += 60;
  }

  // 2. NRC pipeline / reactor count (weight: 20)
  const reactors = fundamentals.energy.reactorCount.operational;
  if (reactors != null) {
    const reactorScore = clamp((reactors / 100) * 80, 0, 100);
    components.push({ name: 'NRC Reactor Base', contribution: reactorScore, detail: `${reactors} reactors operational` });
    totalScore += reactorScore * 20;
    weights += 20;
  }

  // 3. URA ETF trend (weight: 20)
  const ura = prices['URA'];
  if (ura?.price && ura?.ma_50d) {
    const uraScore = aboveMaScore(ura);
    components.push({ name: 'URA ETF Trend', contribution: uraScore, detail: `$${ura.price.toFixed(2)} vs MA $${ura.ma_50d.toFixed(2)}` });
    totalScore += uraScore * 20;
    weights += 20;
  }

  const score = weights > 0 ? Math.round(totalScore / weights) : 50;

  return {
    key: 'nuclearMomentum',
    score,
    maxScore: 100,
    label: 'Nuclear Momentum',
    trend: inferTrend(prices['SMR']),
    components,
    lastUpdated: now,
  };
}

// ============ REE COMPOSITES ============

function computeReeSupplyStress(
  prices: Record<string, PriceData>,
  fundamentals: FundamentalsDeepData,
): CompositeSignal {
  const components: CompositeComponent[] = [];
  let totalScore = 0;
  let weights = 0;
  const now = new Date().toISOString();

  // 1. NdPr price momentum (weight: 30)
  const ndpr = fundamentals.ree.ndprPrice.price;
  if (ndpr != null) {
    // NdPr above $80/kg → supply stress high. Below $50 → low.
    const ndprScore = clamp(((ndpr - 40) / 60) * 100, 0, 100);
    components.push({ name: 'NdPr Price', contribution: ndprScore, detail: `$${ndpr.toFixed(0)}/kg` });
    totalScore += ndprScore * 30;
    weights += 30;
  }

  // 2. MOFCOM alert (weight: 15) — binary, from China leverage config
  // If China pressure score is 2, MOFCOM is active
  const mofcomActive = true; // Ge/Ga/Sb controls active, REE expected
  const mofcomScore = mofcomActive ? 85 : 30;
  components.push({ name: 'MOFCOM Alert', contribution: mofcomScore, detail: mofcomActive ? 'Export controls active' : 'No active controls' });
  totalScore += mofcomScore * 15;
  weights += 15;

  // 3. MP/LYC equity momentum (weight: 35)
  const mp = prices['MP'];
  const lyc = prices['LYC.AX'];
  const processorScores: number[] = [];
  if (mp?.price && mp?.ma_50d) processorScores.push(aboveMaScore(mp));
  if (lyc?.price && lyc?.ma_50d) processorScores.push(aboveMaScore(lyc));
  if (processorScores.length > 0) {
    const avg = processorScores.reduce((a, b) => a + b, 0) / processorScores.length;
    components.push({ name: 'Western Processors', contribution: Math.round(avg), detail: `MP + LYC momentum` });
    totalScore += avg * 35;
    weights += 35;
  }

  // 4. Copper warehouse divergence (weight: 20)
  const copperStocks = fundamentals.ree.copperStocks.tonnes;
  const copper = prices['HG=F'];
  if (copperStocks != null && copper?.price) {
    // Low stocks + high price = supply stress
    // 198K tonnes is mid-range historically
    const stockScore = clamp(100 - (copperStocks / 400_000) * 100, 0, 100);
    const copperMa = aboveMaScore(copper);
    const combined = (stockScore + copperMa) / 2;
    components.push({ name: 'Copper Supply Signal', contribution: Math.round(combined), detail: `${(copperStocks / 1000).toFixed(0)}K tonnes, Cu $${copper.price.toFixed(2)}` });
    totalScore += combined * 20;
    weights += 20;
  }

  const score = weights > 0 ? Math.round(totalScore / weights) : 50;

  return {
    key: 'reeSupplyStress',
    score,
    maxScore: 100,
    label: 'REE Supply Stress',
    trend: inferTrend(prices['REMX']),
    components,
    lastUpdated: now,
  };
}

function computeWesternReshoringMomentum(
  prices: Record<string, PriceData>,
  fundamentals: FundamentalsDeepData,
): CompositeSignal {
  const components: CompositeComponent[] = [];
  let totalScore = 0;
  let weights = 0;
  const now = new Date().toISOString();

  // 1. Project milestone progress (weight: 40)
  const projects = fundamentals.ree.projectPipeline;
  const onTrack = projects.filter(p => p.status === 'on-track' || p.status === 'completed').length;
  const total = projects.length;
  const milestoneScore = total > 0 ? clamp((onTrack / total) * 100, 0, 100) : 50;
  components.push({ name: 'Project Pipeline', contribution: milestoneScore, detail: `${onTrack}/${total} projects on track` });
  totalScore += milestoneScore * 40;
  weights += 40;

  // 2. Government $ committed — cumulative tracker (weight: 25)
  // Aggregate from project funding (rough estimate)
  // Known: DOE loans + grants ≈ $4B+ across projects
  const govFunding = 4.2; // $B — manually tracked
  const fundingScore = clamp((govFunding / 6) * 100, 0, 100); // $6B would be 100
  components.push({ name: 'Government Funding', contribution: fundingScore, detail: `~$${govFunding.toFixed(1)}B committed` });
  totalScore += fundingScore * 25;
  weights += 25;

  // 3. REMX/SETM flows (weight: 35)
  const remx = fundamentals.ree.remxFlows;
  const setm = fundamentals.ree.setmFlows;
  let flowScore = 50;
  const flowDetails: string[] = [];
  if (remx.flowDirection === 'inflow') { flowScore += 15; flowDetails.push('REMX inflows'); }
  else if (remx.flowDirection === 'outflow') { flowScore -= 15; flowDetails.push('REMX outflows'); }
  if (setm.flowDirection === 'inflow') { flowScore += 10; flowDetails.push('SETM inflows'); }
  else if (setm.flowDirection === 'outflow') { flowScore -= 10; flowDetails.push('SETM outflows'); }
  flowScore = clamp(flowScore, 0, 100);
  components.push({ name: 'ETF Flows', contribution: flowScore, detail: flowDetails.length > 0 ? flowDetails.join(', ') : 'Neutral' });
  totalScore += flowScore * 35;
  weights += 35;

  const score = weights > 0 ? Math.round(totalScore / weights) : 50;

  return {
    key: 'westernReshoringMomentum',
    score,
    maxScore: 100,
    label: 'Western Reshoring Momentum',
    trend: inferTrend(prices['MP']),
    components,
    lastUpdated: now,
  };
}

function computeChinaLeverageScore(
  config: ChinaLeverageFactor[],
): CompositeSignal {
  const now = new Date().toISOString();
  const totalScore = config.reduce((sum, f) => sum + f.score, 0);
  const components = config.map(f => ({
    name: f.factor,
    contribution: f.score * 50, // Scale 0-2 to 0-100 for display
    detail: `${f.score}/2 — ${f.notes}`,
  }));

  return {
    key: 'chinaLeverageScore',
    score: totalScore,
    maxScore: 10,
    label: 'China Leverage Score',
    trend: 'stable', // This is manually scored, so always stable unless config changes
    components,
    lastUpdated: now,
  };
}

// ============ PM COMPOSITES ============

function computeCentralBankBid(
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  fundamentals: FundamentalsDeepData,
): CompositeSignal {
  const components: CompositeComponent[] = [];
  let totalScore = 0;
  let weights = 0;
  const now = new Date().toISOString();

  // 1. Gold price momentum (weight: 30)
  const gold = prices['GC=F'];
  if (gold?.price && gold?.ma_50d) {
    const goldScore = aboveMaScore(gold);
    components.push({ name: 'Gold Momentum', contribution: goldScore, detail: `$${Math.round(gold.price).toLocaleString()} vs MA $${Math.round(gold.ma_50d).toLocaleString()}` });
    totalScore += goldScore * 30;
    weights += 30;
  }

  // 2. Real rate divergence (weight: 25)
  const realRate = macro.DFII10?.value;
  if (realRate != null) {
    // Negative real rates → bullish for gold (score 100)
    // Above +2% → bearish (score 0)
    // But if gold is STILL rising with positive real rates, that's central bank bid
    const rateScore = clamp(100 - (realRate + 1) * 30, 0, 100);
    const goldAbove = gold?.price && gold?.ma_50d ? gold.price > gold.ma_50d : false;
    const adjustedScore = realRate > 1 && goldAbove ? Math.max(rateScore, 70) : rateScore;
    components.push({ name: 'Real Rate Signal', contribution: adjustedScore, detail: `${realRate > 0 ? '+' : ''}${realRate.toFixed(2)}% ${goldAbove && realRate > 1 ? '(gold defying)' : ''}` });
    totalScore += adjustedScore * 25;
    weights += 25;
  }

  // 3. DXY weakness (weight: 20)
  const dxy = prices['DX-Y.NYB'];
  if (dxy?.price) {
    // DXY below 95 → very bullish (100). Above 110 → very bearish (0).
    const dxyScore = clamp(((110 - dxy.price) / 20) * 100, 0, 100);
    components.push({ name: 'Dollar Weakness', contribution: dxyScore, detail: `DXY at ${dxy.price.toFixed(1)}` });
    totalScore += dxyScore * 20;
    weights += 20;
  }

  // 4. Financial stress containment (weight: 15)
  const stress = macro.STLFSI4?.value;
  if (stress != null) {
    // Stress contained (< 0) → bullish for gold thesis. High stress → risk-off might help gold short-term but signals chaos.
    const stressScore = stress < 0 ? 80 : stress < 0.5 ? 60 : stress < 1 ? 40 : 30;
    components.push({ name: 'Stress Containment', contribution: stressScore, detail: `FSI at ${stress.toFixed(2)}` });
    totalScore += stressScore * 15;
    weights += 15;
  }

  // 5. Central bank buying data (weight: 10)
  const cbBuying = fundamentals.pm.centralBankBuying.tonnes;
  if (cbBuying != null) {
    // 1000+ tonnes/yr is strong buying. Historical avg ~500t.
    const cbScore = clamp((cbBuying / 1200) * 100, 0, 100);
    components.push({ name: 'Central Bank Buying', contribution: cbScore, detail: `${cbBuying}t (${fundamentals.pm.centralBankBuying.period})` });
    totalScore += cbScore * 10;
    weights += 10;
  }

  const score = weights > 0 ? Math.round(totalScore / weights) : 50;

  return {
    key: 'centralBankBid',
    score,
    maxScore: 100,
    label: 'Central Bank Bid',
    trend: inferTrend(gold),
    components,
    lastUpdated: now,
  };
}

// ============ MAIN DISPATCH ============

export function computeCompositeSignals(
  track: Track,
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  fundamentals: FundamentalsDeepData,
  chinaConfig?: ChinaLeverageFactor[],
): CompositeSignal[] {
  switch (track) {
    case 'energy':
      return [
        computeUraniumSupplyStress(prices, fundamentals),
        computeGridStressIndex(prices, fundamentals),
        computeNuclearMomentum(prices, fundamentals),
      ];
    case 'ree': {
      const cfg = chinaConfig ?? ([] as ChinaLeverageFactor[]);
      const signals = [
        computeReeSupplyStress(prices, fundamentals),
        computeWesternReshoringMomentum(prices, fundamentals),
      ];
      if (cfg.length > 0) {
        signals.push(computeChinaLeverageScore(cfg));
      }
      return signals;
    }
    case 'pm':
      return [
        computeCentralBankBid(prices, macro, fundamentals),
      ];
  }
}
