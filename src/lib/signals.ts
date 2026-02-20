/**
 * Signal computation — turns raw market data into compressed intelligence.
 * Multi-thesis architecture: PM, Energy, REE tracks.
 */

// ============ TYPES ============

export interface PriceData {
  name: string;
  price: number | null;
  prev_close?: number | null;
  change: number | null;
  change_pct: number | null;
  year_high: number | null;
  year_low: number | null;
  ma_50d: number | null;
  error?: string;
}

export interface MacroData {
  label: string;
  value: number | null;
  date?: string;
  error?: string;
}

export interface RegimeTag {
  label: string;
  status: 'bullish' | 'bearish' | 'neutral';
}

export type Severity = 'bullish' | 'bearish' | 'watch';

export interface Signal {
  severity: Severity;
  headline: string;
  detail: string;
  score: number;
}

export interface ThesisCondition {
  label: string;
  met: boolean | null;
  value: string;
}

export interface Mover {
  symbol: string;
  name: string;
  change_pct: number;
  tag?: string;
  significance: number;
}

// ============ TRACK TYPES ============

export type Track = 'pm' | 'energy' | 'ree';

export interface TrackConfig {
  id: Track;
  name: string;
  shortName: string;
  description: string;
  color: string;       // tailwind accent class stem (e.g. 'yellow', 'cyan', 'violet')
  accentHex: string;   // hex for chart line etc
}

export const TRACKS: Record<Track, TrackConfig> = {
  pm: {
    id: 'pm',
    name: 'Precious Metals',
    shortName: 'PM',
    description: 'Central bank policy / bond divestment. Dollar debasement. Negative real rates.',
    color: 'yellow',
    accentHex: '#facc15',
  },
  energy: {
    id: 'energy',
    name: 'Energy',
    shortName: 'ENERGY',
    description: 'AI compute demand → power demand → energy infrastructure. Data centres need baseload.',
    color: 'cyan',
    accentHex: '#22d3ee',
  },
  ree: {
    id: 'ree',
    name: 'Critical Minerals',
    shortName: 'REE',
    description: 'Supply chain reshoring. Geopolitical deglobalisation. Western subsidy push.',
    color: 'violet',
    accentHex: '#8b5cf6',
  },
};

// ============ TRACK INSTRUMENT UNIVERSES ============

const PM_SYMBOLS = [
  'GC=F', 'SI=F', 'PL=F', 'DX-Y.NYB', 'BTC-USD',
  'NST.AX', 'EVN.AX', 'RMS.AX', 'WGX.AX',
  'GLD', 'SLV', 'HG=F',
];

const ENERGY_SYMBOLS = [
  'URA', 'CCJ', 'UEC', 'PDN.AX', 'BOE.AX', 'DYL.AX', 'LOT.AX',
  'NG=F', 'SMR', 'OKLO', 'VST', 'CEG', 'CL=F',
];

const REE_SYMBOLS = [
  'REMX', 'MP', 'LYC.AX', 'ARU.AX', 'ILU.AX', 'ASM.AX',
  'LIT', 'ALB', 'PLS.AX', 'MIN.AX',
  'HG=F', 'SCCO',
];

const TRACK_SYMBOLS: Record<Track, string[]> = {
  pm: PM_SYMBOLS,
  energy: ENERGY_SYMBOLS,
  ree: REE_SYMBOLS,
};

// ============ HELPERS ============

function p(data: PriceData | undefined): { price: number; ma: number; high: number; low: number; chg: number; prev: number } | null {
  if (!data?.price || data.error) return null;
  return {
    price: data.price,
    ma: data.ma_50d ?? 0,
    high: data.year_high ?? 0,
    low: data.year_low ?? 0,
    chg: data.change_pct ?? 0,
    prev: (data.prev_close as number) ?? 0,
  };
}

function aboveMa(data: PriceData | undefined): boolean | null {
  if (!data?.price || !data?.ma_50d) return null;
  return data.price > data.ma_50d;
}

function pctFromHigh(data: PriceData | undefined): number | null {
  if (!data?.price || !data?.year_high) return null;
  return ((data.year_high - data.price) / data.year_high) * 100;
}

function avgChange(prices: Record<string, PriceData>, symbols: string[]): number | null {
  const vals = symbols.map((s) => prices[s]?.change_pct).filter((v): v is number => v != null && v !== 0);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ============ REGIME (dispatched) ============

export function computeRegime(
  track: Track,
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  ratios: Record<string, number>,
): RegimeTag[] {
  switch (track) {
    case 'pm': return computeRegimePM(prices, macro, ratios);
    case 'energy': return computeRegimeEnergy(prices);
    case 'ree': return computeRegimeREE(prices);
  }
}

function computeRegimePM(
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  ratios: Record<string, number>,
): RegimeTag[] {
  const tags: RegimeTag[] = [];
  const gold = prices['GC=F'];
  const dxy = prices['DX-Y.NYB'];

  if (gold?.price && gold?.ma_50d) {
    tags.push(
      gold.price > gold.ma_50d
        ? { label: 'PM BULL', status: 'bullish' }
        : { label: 'PM BEAR', status: 'bearish' },
    );
  }

  if (dxy?.price) {
    if (dxy.price < 98) tags.push({ label: 'USD WEAK', status: 'bullish' });
    else if (dxy.price > 105) tags.push({ label: 'USD STRONG', status: 'bearish' });
    else tags.push({ label: 'USD RANGE', status: 'neutral' });
  }

  const realRate = macro.DFII10?.value;
  if (realRate != null) {
    if (realRate < 0) tags.push({ label: 'REAL NEG', status: 'bullish' });
    else if (realRate < 1.5) tags.push({ label: 'REAL LOW', status: 'neutral' });
    else tags.push({ label: 'REAL POS', status: 'bearish' });
  }

  const stress = macro.STLFSI4?.value;
  if (stress != null) {
    if (stress > 1) tags.push({ label: 'STRESS HIGH', status: 'bearish' });
    else if (stress > 0) tags.push({ label: 'STRESS ELEV', status: 'neutral' });
    else tags.push({ label: 'STRESS LOW', status: 'bullish' });
  }

  const spread = macro.T10Y2Y?.value;
  if (spread != null) {
    if (spread < 0) tags.push({ label: 'INVERTED', status: 'bearish' });
    else if (spread > 0.3) tags.push({ label: 'STEEPENING', status: 'neutral' });
    else tags.push({ label: 'CURVE FLAT', status: 'neutral' });
  }

  return tags;
}

function computeRegimeEnergy(prices: Record<string, PriceData>): RegimeTag[] {
  const tags: RegimeTag[] = [];
  const ura = prices['URA'];
  const gas = prices['NG=F'];
  const nuclearAvg = avgChange(prices, ['SMR', 'OKLO', 'CEG']);

  // Uranium regime
  if (ura?.price && ura?.ma_50d) {
    tags.push(
      ura.price > ura.ma_50d
        ? { label: 'URANIUM BULL', status: 'bullish' }
        : { label: 'URANIUM BEAR', status: 'bearish' },
    );
  }

  // Gas regime
  if (gas?.price && gas?.ma_50d) {
    const pctDev = ((gas.price - gas.ma_50d) / gas.ma_50d) * 100;
    if (pctDev > 10) tags.push({ label: 'GAS BULL', status: 'bullish' });
    else if (pctDev < -10) tags.push({ label: 'GAS BEAR', status: 'bearish' });
    else tags.push({ label: 'GAS RANGE', status: 'neutral' });
  }

  // Nuclear regime
  if (nuclearAvg != null) {
    tags.push(
      nuclearAvg > 0.5
        ? { label: 'NUCLEAR BID', status: 'bullish' }
        : { label: 'NUCLEAR FLAT', status: 'neutral' },
    );
  }

  return tags;
}

function computeRegimeREE(prices: Record<string, PriceData>): RegimeTag[] {
  const tags: RegimeTag[] = [];
  const remx = prices['REMX'];
  const lit = prices['LIT'];
  const copper = prices['HG=F'];

  // REE regime
  if (remx?.price && remx?.ma_50d) {
    tags.push(
      remx.price > remx.ma_50d
        ? { label: 'REE BULL', status: 'bullish' }
        : { label: 'REE BEAR', status: 'bearish' },
    );
  }

  // Lithium regime
  if (lit?.price && lit?.ma_50d) {
    tags.push(
      lit.price > lit.ma_50d
        ? { label: 'LITHIUM RECOVERY', status: 'bullish' }
        : { label: 'LITHIUM OVERSUPPLY', status: 'bearish' },
    );
  }

  // Copper regime
  if (copper?.price && copper?.ma_50d) {
    tags.push(
      copper.price > copper.ma_50d
        ? { label: 'COPPER BULL', status: 'bullish' }
        : { label: 'COPPER BEAR', status: 'bearish' },
    );
  }

  return tags;
}

// ============ THESIS (dispatched) ============

export function computeThesis(
  track: Track,
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  ratios: Record<string, number>,
): ThesisCondition[] {
  switch (track) {
    case 'pm': return computeThesisPM(prices, macro, ratios);
    case 'energy': return computeThesisEnergy(prices);
    case 'ree': return computeThesisREE(prices);
  }
}

function computeThesisPM(
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  ratios: Record<string, number>,
): ThesisCondition[] {
  const conditions: ThesisCondition[] = [];
  const gold = prices['GC=F'];
  const dxy = prices['DX-Y.NYB'];
  const gs = ratios.gold_silver;

  if (gold?.price && gold?.ma_50d) {
    conditions.push({
      label: 'Gold > 50d MA',
      met: gold.price > gold.ma_50d,
      value: `$${Math.round(gold.price).toLocaleString()} vs $${Math.round(gold.ma_50d).toLocaleString()}`,
    });
  }

  if (gold?.price && gold?.year_high) {
    const pct = ((gold.year_high - gold.price) / gold.year_high) * 100;
    conditions.push({
      label: 'Gold at ATH',
      met: pct < 3,
      value: pct < 1 ? 'At high' : `${pct.toFixed(1)}% from high`,
    });
  }

  if (gs != null) {
    conditions.push({
      label: 'Silver outperforming',
      met: gs < 70,
      value: `G/S ${gs.toFixed(1)}`,
    });
    conditions.push({
      label: 'G/S < 65 (late cycle)',
      met: gs < 65,
      value: gs.toFixed(1),
    });
  }

  const realRate = macro.DFII10?.value;
  if (realRate != null) {
    conditions.push({
      label: 'Real rates negative',
      met: realRate < 0,
      value: `${realRate > 0 ? '+' : ''}${realRate.toFixed(2)}%`,
    });
  }

  if (dxy?.price) {
    conditions.push({
      label: 'Dollar < 100',
      met: dxy.price < 100,
      value: dxy.price.toFixed(1),
    });
  }

  const spread = macro.T10Y2Y?.value;
  if (spread != null) {
    conditions.push({
      label: 'Curve positive',
      met: spread > 0,
      value: `${spread > 0 ? '+' : ''}${spread.toFixed(2)}`,
    });
  }

  const stress = macro.STLFSI4?.value;
  if (stress != null) {
    conditions.push({
      label: 'Stress low',
      met: stress < 0,
      value: stress.toFixed(2),
    });
  }

  // Miners leveraged to gold
  const goldChg = gold?.change_pct ?? 0;
  const minerKeys = ['NST.AX', 'EVN.AX', 'RMS.AX', 'WGX.AX'];
  const minerChgs = minerKeys
    .map((k) => prices[k]?.change_pct ?? 0)
    .filter((c) => c !== 0);
  if (minerChgs.length > 0 && goldChg !== 0) {
    const avg = minerChgs.reduce((a, b) => a + b, 0) / minerChgs.length;
    const leveraged =
      goldChg > 0 ? avg > goldChg : goldChg < 0 ? avg < goldChg : false;
    conditions.push({
      label: 'Miners leveraged',
      met: leveraged,
      value: `Avg ${avg > 0 ? '+' : ''}${avg.toFixed(1)}% vs Au ${goldChg > 0 ? '+' : ''}${goldChg.toFixed(1)}%`,
    });
  }

  return conditions;
}

function computeThesisEnergy(prices: Record<string, PriceData>): ThesisCondition[] {
  const conditions: ThesisCondition[] = [];
  const ura = prices['URA'];
  const ccj = prices['CCJ'];
  const gas = prices['NG=F'];
  const oil = prices['CL=F'];

  // URA > 50d MA
  if (ura?.price && ura?.ma_50d) {
    conditions.push({
      label: 'URA > 50d MA',
      met: ura.price > ura.ma_50d,
      value: `$${ura.price.toFixed(2)} vs $${ura.ma_50d.toFixed(2)}`,
    });
  }

  // CCJ > 50d MA
  if (ccj?.price && ccj?.ma_50d) {
    conditions.push({
      label: 'CCJ > 50d MA',
      met: ccj.price > ccj.ma_50d,
      value: `$${ccj.price.toFixed(2)} vs $${ccj.ma_50d.toFixed(2)}`,
    });
  }

  // Natural gas > 50d MA
  if (gas?.price && gas?.ma_50d) {
    conditions.push({
      label: 'Gas > 50d MA',
      met: gas.price > gas.ma_50d,
      value: `$${gas.price.toFixed(2)} vs $${gas.ma_50d.toFixed(2)}`,
    });
  }

  // Nuclear plays trending
  const nuclearAvg = avgChange(prices, ['SMR', 'OKLO', 'CEG']);
  if (nuclearAvg != null) {
    conditions.push({
      label: 'Nuclear trending',
      met: nuclearAvg > 0,
      value: `Avg ${nuclearAvg > 0 ? '+' : ''}${nuclearAvg.toFixed(1)}%`,
    });
  }

  // Oil stable (within ±5% of 50d MA)
  if (oil?.price && oil?.ma_50d) {
    const pctDev = ((oil.price - oil.ma_50d) / oil.ma_50d) * 100;
    conditions.push({
      label: 'Oil stable (±5% MA)',
      met: Math.abs(pctDev) <= 5,
      value: `${pctDev > 0 ? '+' : ''}${pctDev.toFixed(1)}% from MA`,
    });
  }

  // Uranium miners leveraged to URA
  const uraChg = ura?.change_pct ?? 0;
  const uraniumMiners = ['CCJ', 'UEC', 'PDN.AX', 'BOE.AX', 'DYL.AX', 'LOT.AX'];
  const minerChgs = uraniumMiners
    .map((k) => prices[k]?.change_pct ?? 0)
    .filter((c) => c !== 0);
  if (minerChgs.length > 0 && uraChg !== 0) {
    const avg = minerChgs.reduce((a, b) => a + b, 0) / minerChgs.length;
    const leveraged =
      uraChg > 0 ? avg > uraChg : uraChg < 0 ? avg < uraChg : false;
    conditions.push({
      label: 'U miners leveraged',
      met: leveraged,
      value: `Avg ${avg > 0 ? '+' : ''}${avg.toFixed(1)}% vs URA ${uraChg > 0 ? '+' : ''}${uraChg.toFixed(1)}%`,
    });
  }

  return conditions;
}

function computeThesisREE(prices: Record<string, PriceData>): ThesisCondition[] {
  const conditions: ThesisCondition[] = [];
  const remx = prices['REMX'];
  const lyc = prices['LYC.AX'];
  const mp = prices['MP'];
  const copper = prices['HG=F'];
  const lit = prices['LIT'];

  // REMX > 50d MA
  if (remx?.price && remx?.ma_50d) {
    conditions.push({
      label: 'REMX > 50d MA',
      met: remx.price > remx.ma_50d,
      value: `$${remx.price.toFixed(2)} vs $${remx.ma_50d.toFixed(2)}`,
    });
  }

  // LYC.AX > 50d MA
  if (lyc?.price && lyc?.ma_50d) {
    conditions.push({
      label: 'Lynas > 50d MA',
      met: lyc.price > lyc.ma_50d,
      value: `A$${lyc.price.toFixed(2)} vs A$${lyc.ma_50d.toFixed(2)}`,
    });
  }

  // MP > 50d MA
  if (mp?.price && mp?.ma_50d) {
    conditions.push({
      label: 'MP > 50d MA',
      met: mp.price > mp.ma_50d,
      value: `$${mp.price.toFixed(2)} vs $${mp.ma_50d.toFixed(2)}`,
    });
  }

  // Copper > 50d MA
  if (copper?.price && copper?.ma_50d) {
    conditions.push({
      label: 'Copper > 50d MA',
      met: copper.price > copper.ma_50d,
      value: `$${copper.price.toFixed(2)} vs $${copper.ma_50d.toFixed(2)}`,
    });
  }

  // LIT > 50d MA (lithium recovering)
  if (lit?.price && lit?.ma_50d) {
    conditions.push({
      label: 'Lithium recovering',
      met: lit.price > lit.ma_50d,
      value: `$${lit.price.toFixed(2)} vs $${lit.ma_50d.toFixed(2)}`,
    });
  }

  // REE miners leveraged to REMX
  const remxChg = remx?.change_pct ?? 0;
  const reeMiners = ['MP', 'LYC.AX', 'ARU.AX', 'ILU.AX', 'ASM.AX'];
  const minerChgs = reeMiners
    .map((k) => prices[k]?.change_pct ?? 0)
    .filter((c) => c !== 0);
  if (minerChgs.length > 0 && remxChg !== 0) {
    const avg = minerChgs.reduce((a, b) => a + b, 0) / minerChgs.length;
    const leveraged =
      remxChg > 0 ? avg > remxChg : remxChg < 0 ? avg < remxChg : false;
    conditions.push({
      label: 'REE miners leveraged',
      met: leveraged,
      value: `Avg ${avg > 0 ? '+' : ''}${avg.toFixed(1)}% vs REMX ${remxChg > 0 ? '+' : ''}${remxChg.toFixed(1)}%`,
    });
  }

  return conditions;
}

// ============ SIGNALS (dispatched) ============

export function computeSignals(
  track: Track,
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  ratios: Record<string, number>,
): Signal[] {
  switch (track) {
    case 'pm': return computeSignalsPM(prices, macro, ratios);
    case 'energy': return computeSignalsEnergy(prices);
    case 'ree': return computeSignalsREE(prices);
  }
}

function computeSignalsPM(
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  ratios: Record<string, number>,
): Signal[] {
  const signals: Signal[] = [];
  const gold = prices['GC=F'];
  const silver = prices['SI=F'];
  const gs = ratios.gold_silver;
  const realRate = macro.DFII10?.value;
  const spread = macro.T10Y2Y?.value;
  const stress = macro.STLFSI4?.value;

  // G/S ratio signal
  if (gs != null) {
    if (gs < 55) {
      signals.push({
        severity: 'bullish', score: 10,
        headline: 'Extreme silver outperformance',
        detail: `G/S at ${gs.toFixed(1)} — well below historical norms. Peak cycle momentum.`,
      });
    } else if (gs < 65) {
      signals.push({
        severity: 'bullish', score: 8,
        headline: 'Silver breakout',
        detail: `G/S at ${gs.toFixed(1)}, below 65. Late-cycle acceleration — silver catching up to gold.`,
      });
    } else if (gs > 90) {
      signals.push({
        severity: 'watch', score: 6,
        headline: 'Silver lagging',
        detail: `G/S at ${gs.toFixed(1)} — elevated. Silver hasn't confirmed the gold move.`,
      });
    }
  }

  // Gold defying real rates
  if (realRate != null && realRate > 1 && gold?.price && gold?.ma_50d && gold.price > gold.ma_50d) {
    signals.push({
      severity: 'watch', score: 7,
      headline: 'Gold defying gravity',
      detail: `Rallying at $${Math.round(gold.price).toLocaleString()} despite real rates at +${realRate.toFixed(1)}%. Structural bid — central banks, de-dollarisation.`,
    });
  }

  // Post-inversion steepening
  if (spread != null && spread > 0 && spread < 1.5) {
    signals.push({
      severity: 'watch', score: 6,
      headline: 'Post-inversion steepening',
      detail: `Curve at +${spread.toFixed(2)}. Un-inversion historically precedes recession by 6–18 months.`,
    });
  } else if (spread != null && spread < 0) {
    signals.push({
      severity: 'bearish', score: 7,
      headline: 'Yield curve inverted',
      detail: `Spread at ${spread.toFixed(2)}. Active recession signal.`,
    });
  }

  // Gold near ATH
  if (gold?.price && gold?.year_high) {
    const pct = ((gold.year_high - gold.price) / gold.year_high) * 100;
    if (pct < 1) {
      signals.push({
        severity: 'bullish', score: 7,
        headline: 'Gold at all-time high',
        detail: `$${Math.round(gold.price).toLocaleString()} — ${pct < 0.1 ? 'at' : 'within ' + pct.toFixed(1) + '% of'} 52-week high. No overhead resistance.`,
      });
    }
  }

  // Silver near highs
  if (silver?.price && silver?.year_high) {
    const pct = ((silver.year_high - silver.price) / silver.year_high) * 100;
    if (pct < 2) {
      signals.push({
        severity: 'bullish', score: 6,
        headline: 'Silver at 52-week high',
        detail: `$${silver.price.toFixed(2)} — confirming gold's move. Breadth signal.`,
      });
    }
  }

  // Financial stress spike
  if (stress != null && stress > 1) {
    signals.push({
      severity: 'bearish', score: 9,
      headline: 'Financial stress elevated',
      detail: `STL Stress Index at ${stress.toFixed(2)}. Above 1.0 — systemic risk rising. Watch for liquidity events.`,
    });
  }

  // Miner leverage
  const goldChg = gold?.change_pct ?? 0;
  const minerKeys = ['NST.AX', 'EVN.AX', 'RMS.AX', 'WGX.AX'];
  const minerChgs = minerKeys
    .map((k) => ({ sym: k, name: prices[k]?.name ?? k, chg: prices[k]?.change_pct ?? 0 }))
    .filter((m) => m.chg !== 0);
  if (minerChgs.length > 0 && goldChg > 0) {
    const avg = minerChgs.reduce((a, b) => a + b.chg, 0) / minerChgs.length;
    if (avg > goldChg * 1.5) {
      const top = minerChgs.sort((a, b) => b.chg - a.chg)[0];
      signals.push({
        severity: 'bullish', score: 5,
        headline: 'Miners showing leverage',
        detail: `ASX miners avg +${avg.toFixed(1)}% vs gold +${goldChg.toFixed(1)}%. ${top.name} leading at +${top.chg.toFixed(1)}%.`,
      });
    } else if (avg < goldChg * 0.3 && goldChg > 0.5) {
      signals.push({
        severity: 'watch', score: 5,
        headline: 'Miners lagging gold',
        detail: `Gold up +${goldChg.toFixed(1)}% but miners only avg +${avg.toFixed(1)}%. Watch for divergence.`,
      });
    }
  }

  // Dollar breakdown
  const dxy = prices['DX-Y.NYB'];
  if (dxy?.price && dxy.price < 95) {
    signals.push({
      severity: 'bullish', score: 8,
      headline: 'Dollar breaking down',
      detail: `DXY at ${dxy.price.toFixed(1)} — below 95 is historically rocket fuel for commodities.`,
    });
  }

  return signals.sort((a, b) => b.score - a.score);
}

function computeSignalsEnergy(prices: Record<string, PriceData>): Signal[] {
  const signals: Signal[] = [];
  const ura = prices['URA'];
  const gas = prices['NG=F'];
  const oil = prices['CL=F'];

  // Uranium breakout (near 52wk high)
  if (ura?.price && ura?.year_high) {
    const pct = ((ura.year_high - ura.price) / ura.year_high) * 100;
    if (pct < 3) {
      signals.push({
        severity: 'bullish', score: 9,
        headline: 'Uranium breakout',
        detail: `URA at $${ura.price.toFixed(2)} — ${pct < 1 ? 'at' : 'within ' + pct.toFixed(1) + '% of'} 52-week high. Supply deficit thesis accelerating.`,
      });
    }
  }

  // Nuclear momentum
  const nuclearNames = ['SMR', 'OKLO', 'CEG'];
  const nuclearData = nuclearNames.map((s) => ({
    sym: s, name: prices[s]?.name ?? s, chg: prices[s]?.change_pct ?? 0,
  })).filter((d) => d.chg !== 0);
  const nuclearAvg = nuclearData.length > 0
    ? nuclearData.reduce((a, b) => a + b.chg, 0) / nuclearData.length
    : null;

  if (nuclearAvg != null) {
    if (nuclearAvg > 2) {
      const top = nuclearData.sort((a, b) => b.chg - a.chg)[0];
      signals.push({
        severity: 'bullish', score: 8,
        headline: 'Nuclear momentum strong',
        detail: `Nuclear plays avg +${nuclearAvg.toFixed(1)}%. ${top.name} leading at +${top.chg.toFixed(1)}%. AI power demand narrative strengthening.`,
      });
    } else if (nuclearAvg < -2) {
      signals.push({
        severity: 'bearish', score: 6,
        headline: 'Nuclear pullback',
        detail: `Nuclear plays avg ${nuclearAvg.toFixed(1)}%. Profit-taking or sentiment shift — monitor for support.`,
      });
    }
  }

  // Natural gas spike or breakdown
  if (gas?.price && gas?.ma_50d) {
    const pctDev = ((gas.price - gas.ma_50d) / gas.ma_50d) * 100;
    if (pctDev > 15) {
      signals.push({
        severity: 'watch', score: 7,
        headline: 'Natural gas spike',
        detail: `Henry Hub at $${gas.price.toFixed(2)}, +${pctDev.toFixed(0)}% above 50d MA. Supply disruption or demand surge — watch utility margins.`,
      });
    } else if (pctDev < -15) {
      signals.push({
        severity: 'bearish', score: 6,
        headline: 'Natural gas breakdown',
        detail: `Henry Hub at $${gas.price.toFixed(2)}, ${pctDev.toFixed(0)}% below 50d MA. Demand weakness or oversupply.`,
      });
    }
  }

  // Energy sector divergence
  const uraAbove = aboveMa(ura);
  const gasAbove = aboveMa(gas);
  if (uraAbove != null && gasAbove != null && uraAbove !== gasAbove) {
    if (uraAbove && !gasAbove) {
      signals.push({
        severity: 'watch', score: 6,
        headline: 'Energy divergence: uranium up, gas down',
        detail: 'Uranium above 50d MA while gas below. Nuclear thesis gaining relative to fossil — structural shift signal.',
      });
    } else {
      signals.push({
        severity: 'watch', score: 5,
        headline: 'Energy divergence: gas up, uranium down',
        detail: 'Gas above 50d MA while uranium below. Short-term fossil demand outpacing nuclear buildout narrative.',
      });
    }
  }

  // Oil headwind/tailwind
  if (oil?.price && oil?.ma_50d) {
    const pctDev = ((oil.price - oil.ma_50d) / oil.ma_50d) * 100;
    if (pctDev > 5) {
      signals.push({
        severity: 'bearish', score: 5,
        headline: 'Oil headwind for margins',
        detail: `Crude at $${oil.price.toFixed(2)}, +${pctDev.toFixed(1)}% above MA. Rising energy input costs compress data centre margins.`,
      });
    } else if (pctDev < -5) {
      signals.push({
        severity: 'bullish', score: 5,
        headline: 'Oil tailwind for margins',
        detail: `Crude at $${oil.price.toFixed(2)}, ${pctDev.toFixed(1)}% below MA. Lower energy costs support infrastructure buildout.`,
      });
    }
  }

  // Uranium miners leveraged
  const uraChg = ura?.change_pct ?? 0;
  const uraniumMiners = ['CCJ', 'UEC', 'PDN.AX', 'BOE.AX', 'DYL.AX', 'LOT.AX'];
  const uMinerData = uraniumMiners
    .map((k) => ({ sym: k, name: prices[k]?.name ?? k, chg: prices[k]?.change_pct ?? 0 }))
    .filter((m) => m.chg !== 0);
  if (uMinerData.length > 0 && uraChg > 0) {
    const avg = uMinerData.reduce((a, b) => a + b.chg, 0) / uMinerData.length;
    if (avg > uraChg * 1.5) {
      const top = uMinerData.sort((a, b) => b.chg - a.chg)[0];
      signals.push({
        severity: 'bullish', score: 5,
        headline: 'Uranium miners showing leverage',
        detail: `Miners avg +${avg.toFixed(1)}% vs URA +${uraChg.toFixed(1)}%. ${top.name} leading at +${top.chg.toFixed(1)}%.`,
      });
    }
  }

  return signals.sort((a, b) => b.score - a.score);
}

function computeSignalsREE(prices: Record<string, PriceData>): Signal[] {
  const signals: Signal[] = [];
  const remx = prices['REMX'];
  const lyc = prices['LYC.AX'];
  const mp = prices['MP'];
  const lit = prices['LIT'];
  const copper = prices['HG=F'];

  // REE breakout
  if (remx?.price && remx?.year_high) {
    const pct = ((remx.year_high - remx.price) / remx.year_high) * 100;
    if (pct < 3) {
      signals.push({
        severity: 'bullish', score: 9,
        headline: 'REE breakout',
        detail: `REMX at $${remx.price.toFixed(2)} — ${pct < 1 ? 'at' : 'within ' + pct.toFixed(1) + '% of'} 52-week high. Supply chain reshoring bid accelerating.`,
      });
    }
  }

  // Lynas/MP strength (Western processing)
  const lycAbove = aboveMa(lyc);
  const mpAbove = aboveMa(mp);
  if (lycAbove === true && mpAbove === true) {
    signals.push({
      severity: 'bullish', score: 8,
      headline: 'Western REE processors strong',
      detail: `Both Lynas and MP Materials above 50d MA. Western processing capacity buildout being priced in.`,
    });
  } else if (lycAbove === true || mpAbove === true) {
    const leader = lycAbove ? 'Lynas' : 'MP Materials';
    signals.push({
      severity: 'watch', score: 6,
      headline: `${leader} showing strength`,
      detail: `${leader} above 50d MA — Western REE processing thesis partially confirmed. Watch for the other to follow.`,
    });
  }

  // Lithium bottom signal
  if (lit?.price && lit?.ma_50d && lit?.year_low) {
    const aboveMa50 = lit.price > lit.ma_50d;
    const pctFromLow = lit.year_low > 0 ? ((lit.price - lit.year_low) / lit.year_low) * 100 : null;
    if (aboveMa50 && pctFromLow != null && pctFromLow < 20) {
      signals.push({
        severity: 'bullish', score: 7,
        headline: 'Lithium bottom signal',
        detail: `LIT at $${lit.price.toFixed(2)}, crossed above 50d MA and only ${pctFromLow.toFixed(0)}% off 52-week low. Oversupply potentially clearing.`,
      });
    } else if (!aboveMa50 && pctFromLow != null && pctFromLow < 5) {
      signals.push({
        severity: 'bearish', score: 6,
        headline: 'Lithium still under pressure',
        detail: `LIT at $${lit.price.toFixed(2)}, near 52-week low and below 50d MA. Oversupply persists — no recovery yet.`,
      });
    }
  }

  // Copper breakout or breakdown
  if (copper?.price && copper?.year_high && copper?.year_low) {
    const pctFromHigh = ((copper.year_high - copper.price) / copper.year_high) * 100;
    const pctFromLow = copper.year_low > 0 ? ((copper.price - copper.year_low) / copper.year_low) * 100 : null;
    if (pctFromHigh < 3) {
      signals.push({
        severity: 'bullish', score: 8,
        headline: 'Copper breakout',
        detail: `Copper at $${copper.price.toFixed(2)} — near 52-week high. Electrification demand and supply tightness.`,
      });
    } else if (pctFromLow != null && pctFromLow < 5) {
      signals.push({
        severity: 'bearish', score: 7,
        headline: 'Copper breakdown',
        detail: `Copper at $${copper.price.toFixed(2)} — near 52-week low. Demand slowdown or macro headwind.`,
      });
    }
  }

  // Critical minerals sector momentum
  const reeMiners = ['MP', 'LYC.AX', 'ARU.AX', 'ILU.AX', 'ASM.AX'];
  const reeMinerData = reeMiners
    .map((k) => ({ sym: k, name: prices[k]?.name ?? k, chg: prices[k]?.change_pct ?? 0 }))
    .filter((m) => m.chg !== 0);
  if (reeMinerData.length >= 2) {
    const avg = reeMinerData.reduce((a, b) => a + b.chg, 0) / reeMinerData.length;
    if (avg > 2) {
      const top = reeMinerData.sort((a, b) => b.chg - a.chg)[0];
      signals.push({
        severity: 'bullish', score: 6,
        headline: 'Critical minerals momentum',
        detail: `REE miners avg +${avg.toFixed(1)}%. ${top.name} leading at +${top.chg.toFixed(1)}%. Sector-wide bid.`,
      });
    } else if (avg < -2) {
      signals.push({
        severity: 'bearish', score: 5,
        headline: 'Critical minerals selling off',
        detail: `REE miners avg ${avg.toFixed(1)}%. Broad-based weakness in the reshoring trade.`,
      });
    }
  }

  return signals.sort((a, b) => b.score - a.score);
}

// ============ MOVERS (dispatched) ============

export function computeMovers(
  track: Track,
  prices: Record<string, PriceData>,
): Mover[] {
  const symbols = TRACK_SYMBOLS[track];
  const movers: Mover[] = [];

  for (const sym of symbols) {
    const data = prices[sym];
    if (!data?.price || data.change_pct == null || data.error) continue;

    let significance = Math.abs(data.change_pct);
    let tag: string | undefined;

    // Near 52-week high
    if (data.year_high && data.price) {
      const pct = ((data.year_high - data.price) / data.year_high) * 100;
      if (pct < 1) { significance += 3; tag = '52wk high'; }
      else if (pct < 3) { significance += 1; tag = 'Near high'; }
    }

    // Near 52-week low
    if (data.year_low && data.price) {
      const pct = ((data.price - data.year_low) / data.year_low) * 100;
      if (pct < 3) { significance += 3; tag = '52wk low'; }
    }

    // Crossed MA50
    if (data.ma_50d && data.price && data.prev_close) {
      const crossedAbove = data.prev_close < data.ma_50d && data.price > data.ma_50d;
      const crossedBelow = data.prev_close > data.ma_50d && data.price < data.ma_50d;
      if (crossedAbove) { significance += 2; tag = tag || 'Crossed MA50 ↑'; }
      if (crossedBelow) { significance += 2; tag = tag || 'Crossed MA50 ↓'; }
    }

    // Large move amplifier
    if (Math.abs(data.change_pct) > 3) significance += 2;

    movers.push({
      symbol: sym,
      name: data.name,
      change_pct: data.change_pct,
      tag,
      significance,
    });
  }

  return movers.sort((a, b) => b.significance - a.significance).slice(0, 8);
}

// ============ AUTO CHART (dispatched) ============

const TV_MAP: Record<string, string> = {
  // PM
  'GC=F': 'FOREXCOM:XAUUSD',
  'SI=F': 'FOREXCOM:XAGUSD',
  'PL=F': 'TVC:PLATINUM',
  'DX-Y.NYB': 'AMEX:UUP',
  'BTC-USD': 'BITSTAMP:BTCUSD',
  'NST.AX': 'ASX:NST',
  'EVN.AX': 'ASX:EVN',
  'RMS.AX': 'ASX:RMS',
  'WGX.AX': 'ASX:WGX',
  'SPY': 'AMEX:SPY',
  'GLD': 'AMEX:GLD',
  'SLV': 'AMEX:SLV',
  'HG=F': 'AMEX:CPER',
  'CL=F': 'AMEX:USO',
  // Energy
  'URA': 'AMEX:URA',
  'CCJ': 'NYSE:CCJ',
  'UEC': 'AMEX:UEC',
  'PDN.AX': 'ASX:PDN',
  'BOE.AX': 'ASX:BOE',
  'DYL.AX': 'ASX:DYL',
  'LOT.AX': 'ASX:LOT',
  'NG=F': 'NYMEX:NG1!',
  'SMR': 'NYSE:SMR',
  'OKLO': 'NYSE:OKLO',
  'VST': 'NYSE:VST',
  'CEG': 'NASDAQ:CEG',
  // REE / Critical Minerals
  'REMX': 'AMEX:REMX',
  'MP': 'NYSE:MP',
  'LYC.AX': 'ASX:LYC',
  'ARU.AX': 'ASX:ARU',
  'ILU.AX': 'ASX:ILU',
  'ASM.AX': 'ASX:ASM',
  'LIT': 'AMEX:LIT',
  'ALB': 'NYSE:ALB',
  'PLS.AX': 'ASX:PLS',
  'MIN.AX': 'ASX:MIN',
  'SCCO': 'NYSE:SCCO',
};

const TRACK_DEFAULTS: Record<Track, { yahoo: string; tv: string; reason: string }> = {
  pm: { yahoo: 'GC=F', tv: 'FOREXCOM:XAUUSD', reason: 'Gold' },
  energy: { yahoo: 'URA', tv: 'AMEX:URA', reason: 'Uranium ETF' },
  ree: { yahoo: 'REMX', tv: 'AMEX:REMX', reason: 'REE ETF' },
};

export function pickChartSymbol(
  track: Track,
  movers: Mover[],
): { yahoo: string; tv: string; reason: string } {
  const fallback = TRACK_DEFAULTS[track];

  if (movers.length === 0) return fallback;

  const defaultIdx = movers.findIndex((m) => m.symbol === fallback.yahoo);
  const defaultSig = defaultIdx >= 0 ? movers[defaultIdx].significance : 0;
  const top = movers[0];

  // Only switch away from default if something is clearly more interesting
  if (
    top.symbol !== fallback.yahoo &&
    top.significance > defaultSig * 1.8 &&
    TV_MAP[top.symbol]
  ) {
    return {
      yahoo: top.symbol,
      tv: TV_MAP[top.symbol],
      reason: top.name,
    };
  }

  return fallback;
}

// ============ BRIEF (dispatched) ============

export function generateBrief(
  track: Track,
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  ratios: Record<string, number>,
): string {
  switch (track) {
    case 'pm': return generateBriefPM(prices, macro, ratios);
    case 'energy': return generateBriefEnergy(prices);
    case 'ree': return generateBriefREE(prices);
  }
}

function generateBriefPM(
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  ratios: Record<string, number>,
): string {
  const parts: string[] = [];
  const gold = prices['GC=F'];
  const silver = prices['SI=F'];
  const gs = ratios.gold_silver;
  const realRate = macro.DFII10?.value;
  const dxy = prices['DX-Y.NYB'];
  const stress = macro.STLFSI4?.value;
  const spread = macro.T10Y2Y?.value;

  if (gold?.price) {
    const above5k = gold.price >= 5000;
    const goldStr = above5k
      ? `Gold above $${(gold.price / 1000).toFixed(0)}k`
      : `Gold at $${Math.round(gold.price).toLocaleString()}`;
    if (silver?.change_pct && gold?.change_pct && Math.abs(silver.change_pct) > Math.abs(gold.change_pct) * 1.3) {
      parts.push(`${goldStr} with silver outperforming`);
    } else if (gold.change_pct && gold.change_pct > 1) {
      parts.push(`${goldStr}, up ${gold.change_pct.toFixed(1)}%`);
    } else if (gold.change_pct && gold.change_pct < -1) {
      parts.push(`${goldStr}, down ${Math.abs(gold.change_pct).toFixed(1)}%`);
    } else {
      parts.push(goldStr);
    }
  }

  if (gs != null) {
    if (gs < 55) parts.push(`G/S at ${gs.toFixed(0)} — extreme silver outperformance`);
    else if (gs < 65) parts.push(`G/S at ${gs.toFixed(0)} — late-cycle acceleration signal`);
    else if (gs > 90) parts.push(`G/S at ${gs.toFixed(0)} — silver lagging`);
  }

  if (realRate != null && gold?.price && gold?.ma_50d && gold.price > gold.ma_50d) {
    if (realRate > 1.5) parts.push(`Real rates at +${realRate.toFixed(1)}% but being ignored`);
    else if (realRate < 0) parts.push(`Negative real rates fuelling the bid`);
  }

  if (dxy?.price) {
    if (dxy.price < 95) parts.push(`Dollar breaking down at ${dxy.price.toFixed(0)}`);
    else if (dxy.price < 100) parts.push(`Dollar sub-100`);
    else if (dxy.price > 108) parts.push(`Dollar surging at ${dxy.price.toFixed(0)} — headwind`);
  }

  if (spread != null) {
    if (spread > 0 && spread < 1.5) parts.push('Curve steepening post-inversion');
    else if (spread < 0) parts.push('Yield curve inverted');
  }

  if (stress != null) {
    if (stress < -0.3) parts.push('Financial stress contained');
    else if (stress > 1) parts.push('Financial stress elevated');
  }

  if (parts.length === 0) return 'Waiting for data...';
  return parts.join('. ') + '.';
}

function generateBriefEnergy(prices: Record<string, PriceData>): string {
  const parts: string[] = [];
  const ura = prices['URA'];
  const ccj = prices['CCJ'];
  const gas = prices['NG=F'];
  const oil = prices['CL=F'];

  // Lead with uranium
  if (ura?.price) {
    const uraStr = `Uranium ETF at $${ura.price.toFixed(2)}`;
    if (ura.change_pct && ura.change_pct > 1) {
      parts.push(`${uraStr}, up ${ura.change_pct.toFixed(1)}%`);
    } else if (ura.change_pct && ura.change_pct < -1) {
      parts.push(`${uraStr}, down ${Math.abs(ura.change_pct).toFixed(1)}%`);
    } else {
      parts.push(uraStr);
    }
  }

  // Uranium vs MA
  if (ura?.price && ura?.ma_50d) {
    const pct = ((ura.price - ura.ma_50d) / ura.ma_50d) * 100;
    if (pct > 5) parts.push(`URA trending ${pct.toFixed(0)}% above 50d MA — supply deficit narrative intact`);
    else if (pct < -5) parts.push(`URA ${Math.abs(pct).toFixed(0)}% below 50d MA — sentiment weakening`);
  }

  // Nuclear plays
  const nuclearAvg = avgChange(prices, ['SMR', 'OKLO', 'CEG']);
  if (nuclearAvg != null) {
    if (nuclearAvg > 2) parts.push(`Nuclear plays surging avg +${nuclearAvg.toFixed(1)}% — AI power narrative bid`);
    else if (nuclearAvg < -2) parts.push(`Nuclear plays pulling back avg ${nuclearAvg.toFixed(1)}%`);
  }

  // Gas context
  if (gas?.price) {
    if (gas.change_pct && Math.abs(gas.change_pct) > 3) {
      parts.push(`Henry Hub ${gas.change_pct > 0 ? 'spiking' : 'collapsing'} ${gas.change_pct > 0 ? '+' : ''}${gas.change_pct.toFixed(1)}% to $${gas.price.toFixed(2)}`);
    } else if (gas.ma_50d) {
      const pctDev = ((gas.price - gas.ma_50d) / gas.ma_50d) * 100;
      if (Math.abs(pctDev) > 10) {
        parts.push(`Natural gas ${pctDev > 0 ? 'elevated' : 'depressed'} vs 50d MA`);
      }
    }
  }

  // Oil context
  if (oil?.price && oil?.ma_50d) {
    const pctDev = ((oil.price - oil.ma_50d) / oil.ma_50d) * 100;
    if (pctDev > 5) parts.push(`Crude above MA — energy input costs rising`);
    else if (pctDev < -5) parts.push(`Crude below MA — lower energy costs support margins`);
  }

  // CCJ as proxy
  if (ccj?.price && ccj?.ma_50d) {
    if (ccj.price > ccj.ma_50d) parts.push('Cameco above 50d MA — largest Western producer confirming');
    else parts.push('Cameco below 50d MA — Western production proxy weak');
  }

  if (parts.length === 0) return 'Waiting for energy data...';
  return parts.join('. ') + '.';
}

function generateBriefREE(prices: Record<string, PriceData>): string {
  const parts: string[] = [];
  const remx = prices['REMX'];
  const lyc = prices['LYC.AX'];
  const mp = prices['MP'];
  const lit = prices['LIT'];
  const copper = prices['HG=F'];

  // Lead with REMX
  if (remx?.price) {
    const remxStr = `REE ETF at $${remx.price.toFixed(2)}`;
    if (remx.change_pct && remx.change_pct > 1) {
      parts.push(`${remxStr}, up ${remx.change_pct.toFixed(1)}%`);
    } else if (remx.change_pct && remx.change_pct < -1) {
      parts.push(`${remxStr}, down ${Math.abs(remx.change_pct).toFixed(1)}%`);
    } else {
      parts.push(remxStr);
    }
  }

  // Western processors
  const lycAbove = aboveMa(lyc);
  const mpAbove = aboveMa(mp);
  if (lycAbove === true && mpAbove === true) {
    parts.push('Both Lynas and MP above 50d MA — Western processing capacity being bid');
  } else if (lycAbove === true) {
    parts.push('Lynas above 50d MA but MP lagging — Australian REE processing leading');
  } else if (mpAbove === true) {
    parts.push('MP above 50d MA but Lynas lagging — US REE processing leading');
  } else if (lycAbove === false && mpAbove === false) {
    parts.push('Western REE processors both below 50d MA — reshoring trade under pressure');
  }

  // Lithium
  if (lit?.price && lit?.ma_50d) {
    if (lit.price > lit.ma_50d) {
      parts.push('Lithium ETF above 50d MA — oversupply potentially clearing');
    } else {
      const pctBelow = ((lit.ma_50d - lit.price) / lit.ma_50d) * 100;
      if (pctBelow > 10) parts.push(`Lithium still ${pctBelow.toFixed(0)}% below 50d MA — oversupply entrenched`);
      else parts.push('Lithium below 50d MA — no recovery yet');
    }
  }

  // Copper
  if (copper?.price && copper?.year_high) {
    const pct = ((copper.year_high - copper.price) / copper.year_high) * 100;
    if (pct < 3) parts.push('Copper near 52-week high — electrification demand strong');
    else if (copper.ma_50d && copper.price > copper.ma_50d) parts.push('Copper above 50d MA — demand intact');
    else if (copper.ma_50d && copper.price < copper.ma_50d) parts.push('Copper below 50d MA — demand concerns');
  }

  if (parts.length === 0) return 'Waiting for critical minerals data...';
  return parts.join('. ') + '.';
}

// ============ RATIO CHART CONFIG PER TRACK ============

export interface TrackRatioConfig {
  numerator: string;
  denominator: string;
  title: string;
  lineColor: string;
  bandHigh: number;
  bandLow: number;
}

export function getTrackRatioConfig(track: Track): TrackRatioConfig {
  switch (track) {
    case 'pm':
      return { numerator: 'GC=F', denominator: 'SI=F', title: 'Gold / Silver Ratio', lineColor: '#facc15', bandHigh: 90, bandLow: 65 };
    case 'energy':
      return { numerator: 'URA', denominator: 'NG=F', title: 'Uranium / Gas Ratio', lineColor: '#22d3ee', bandHigh: 20, bandLow: 5 };
    case 'ree':
      return { numerator: 'REMX', denominator: 'HG=F', title: 'REMX / Copper Ratio', lineColor: '#8b5cf6', bandHigh: 15, bandLow: 5 };
  }
}
