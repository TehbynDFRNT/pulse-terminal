/**
 * Signal computation — turns raw market data into compressed intelligence.
 * All logic for regime detection, thesis tracking, signal generation, and movers.
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

// ============ REGIME ============

export function computeRegime(
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  ratios: Record<string, number>,
): RegimeTag[] {
  const tags: RegimeTag[] = [];
  const gold = prices['GC=F'];
  const dxy = prices['DX-Y.NYB'];

  // PM trend
  if (gold?.price && gold?.ma_50d) {
    tags.push(
      gold.price > gold.ma_50d
        ? { label: 'PM BULL', status: 'bullish' }
        : { label: 'PM BEAR', status: 'bearish' },
    );
  }

  // Dollar
  if (dxy?.price) {
    if (dxy.price < 98) tags.push({ label: 'USD WEAK', status: 'bullish' });
    else if (dxy.price > 105) tags.push({ label: 'USD STRONG', status: 'bearish' });
    else tags.push({ label: 'USD RANGE', status: 'neutral' });
  }

  // Real rates
  const realRate = macro.DFII10?.value;
  if (realRate != null) {
    if (realRate < 0) tags.push({ label: 'REAL NEG', status: 'bullish' });
    else if (realRate < 1.5) tags.push({ label: 'REAL LOW', status: 'neutral' });
    else tags.push({ label: 'REAL POS', status: 'bearish' });
  }

  // Financial stress
  const stress = macro.STLFSI4?.value;
  if (stress != null) {
    if (stress > 1) tags.push({ label: 'STRESS HIGH', status: 'bearish' });
    else if (stress > 0) tags.push({ label: 'STRESS ELEV', status: 'neutral' });
    else tags.push({ label: 'STRESS LOW', status: 'bullish' });
  }

  // Yield curve
  const spread = macro.T10Y2Y?.value;
  if (spread != null) {
    if (spread < 0) tags.push({ label: 'INVERTED', status: 'bearish' });
    else if (spread > 0.3) tags.push({ label: 'STEEPENING', status: 'neutral' });
    else tags.push({ label: 'CURVE FLAT', status: 'neutral' });
  }

  return tags;
}

// ============ BRIEF ============

export function generateBrief(
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

  // Lead with metals
  if (gold?.price) {
    const above5k = gold.price >= 5000;
    const goldStr = above5k
      ? `Gold above $${(gold.price / 1000).toFixed(0)}k`
      : `Gold at $${Math.round(gold.price).toLocaleString()}`;

    if (
      silver?.change_pct &&
      gold?.change_pct &&
      Math.abs(silver.change_pct) > Math.abs(gold.change_pct) * 1.3
    ) {
      parts.push(`${goldStr} with silver outperforming`);
    } else if (gold.change_pct && gold.change_pct > 1) {
      parts.push(`${goldStr}, up ${gold.change_pct.toFixed(1)}%`);
    } else if (gold.change_pct && gold.change_pct < -1) {
      parts.push(`${goldStr}, down ${Math.abs(gold.change_pct).toFixed(1)}%`);
    } else {
      parts.push(goldStr);
    }
  }

  // G/S ratio
  if (gs != null) {
    if (gs < 55)
      parts.push(`G/S at ${gs.toFixed(0)} — extreme silver outperformance`);
    else if (gs < 65)
      parts.push(`G/S at ${gs.toFixed(0)} — late-cycle acceleration signal`);
    else if (gs > 90) parts.push(`G/S at ${gs.toFixed(0)} — silver lagging`);
  }

  // Real rates tension
  if (
    realRate != null &&
    gold?.price &&
    gold?.ma_50d &&
    gold.price > gold.ma_50d
  ) {
    if (realRate > 1.5)
      parts.push(`Real rates at +${realRate.toFixed(1)}% but being ignored`);
    else if (realRate < 0) parts.push(`Negative real rates fuelling the bid`);
  }

  // Dollar
  if (dxy?.price) {
    if (dxy.price < 95)
      parts.push(`Dollar breaking down at ${dxy.price.toFixed(0)}`);
    else if (dxy.price < 100) parts.push(`Dollar sub-100`);
    else if (dxy.price > 108)
      parts.push(`Dollar surging at ${dxy.price.toFixed(0)} — headwind`);
  }

  // Curve
  if (spread != null) {
    if (spread > 0 && spread < 1.5)
      parts.push('Curve steepening post-inversion');
    else if (spread < 0) parts.push('Yield curve inverted');
  }

  // Stress
  if (stress != null) {
    if (stress < -0.3) parts.push('Financial stress contained');
    else if (stress > 1) parts.push('Financial stress elevated');
  }

  if (parts.length === 0) return 'Waiting for data...';
  return parts.join('. ') + '.';
}

// ============ THESIS ============

export function computeThesis(
  prices: Record<string, PriceData>,
  macro: Record<string, MacroData>,
  ratios: Record<string, number>,
): ThesisCondition[] {
  const conditions: ThesisCondition[] = [];
  const gold = prices['GC=F'];
  const dxy = prices['DX-Y.NYB'];
  const gs = ratios.gold_silver;

  // Gold above MA50
  if (gold?.price && gold?.ma_50d) {
    conditions.push({
      label: 'Gold > 50d MA',
      met: gold.price > gold.ma_50d,
      value: `$${Math.round(gold.price).toLocaleString()} vs $${Math.round(gold.ma_50d).toLocaleString()}`,
    });
  }

  // Gold near ATH
  if (gold?.price && gold?.year_high) {
    const pctFromHigh =
      ((gold.year_high - gold.price) / gold.year_high) * 100;
    conditions.push({
      label: 'Gold at ATH',
      met: pctFromHigh < 3,
      value:
        pctFromHigh < 1
          ? 'At high'
          : `${pctFromHigh.toFixed(1)}% from high`,
    });
  }

  // Silver outperforming
  if (gs != null) {
    conditions.push({
      label: 'Silver outperforming',
      met: gs < 70,
      value: `G/S ${gs.toFixed(1)}`,
    });
  }

  // G/S below 65 (late cycle)
  if (gs != null) {
    conditions.push({
      label: 'G/S < 65 (late cycle)',
      met: gs < 65,
      value: gs.toFixed(1),
    });
  }

  // Real rates negative
  const realRate = macro.DFII10?.value;
  if (realRate != null) {
    conditions.push({
      label: 'Real rates negative',
      met: realRate < 0,
      value: `${realRate > 0 ? '+' : ''}${realRate.toFixed(2)}%`,
    });
  }

  // Dollar below 100
  if (dxy?.price) {
    conditions.push({
      label: 'Dollar < 100',
      met: dxy.price < 100,
      value: dxy.price.toFixed(1),
    });
  }

  // Yield curve positive (post-inversion)
  const spread = macro.T10Y2Y?.value;
  if (spread != null) {
    conditions.push({
      label: 'Curve positive',
      met: spread > 0,
      value: `${spread > 0 ? '+' : ''}${spread.toFixed(2)}`,
    });
  }

  // Financial stress low
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

// ============ SIGNALS ============

export function computeSignals(
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
        severity: 'bullish',
        score: 10,
        headline: 'Extreme silver outperformance',
        detail: `G/S at ${gs.toFixed(1)} — well below historical norms. Peak cycle momentum.`,
      });
    } else if (gs < 65) {
      signals.push({
        severity: 'bullish',
        score: 8,
        headline: 'Silver breakout',
        detail: `G/S at ${gs.toFixed(1)}, below 65. Late-cycle acceleration — silver catching up to gold.`,
      });
    } else if (gs > 90) {
      signals.push({
        severity: 'watch',
        score: 6,
        headline: 'Silver lagging',
        detail: `G/S at ${gs.toFixed(1)} — elevated. Silver hasn't confirmed the gold move.`,
      });
    }
  }

  // Gold defying real rates
  if (
    realRate != null &&
    realRate > 1 &&
    gold?.price &&
    gold?.ma_50d &&
    gold.price > gold.ma_50d
  ) {
    signals.push({
      severity: 'watch',
      score: 7,
      headline: 'Gold defying gravity',
      detail: `Rallying at $${Math.round(gold.price).toLocaleString()} despite real rates at +${realRate.toFixed(1)}%. Structural bid — central banks, de-dollarisation.`,
    });
  }

  // Post-inversion steepening
  if (spread != null && spread > 0 && spread < 1.5) {
    signals.push({
      severity: 'watch',
      score: 6,
      headline: 'Post-inversion steepening',
      detail: `Curve at +${spread.toFixed(2)}. Un-inversion historically precedes recession by 6–18 months.`,
    });
  } else if (spread != null && spread < 0) {
    signals.push({
      severity: 'bearish',
      score: 7,
      headline: 'Yield curve inverted',
      detail: `Spread at ${spread.toFixed(2)}. Active recession signal.`,
    });
  }

  // Gold near ATH
  if (gold?.price && gold?.year_high) {
    const pctFromHigh =
      ((gold.year_high - gold.price) / gold.year_high) * 100;
    if (pctFromHigh < 1) {
      signals.push({
        severity: 'bullish',
        score: 7,
        headline: 'Gold at all-time high',
        detail: `$${Math.round(gold.price).toLocaleString()} — ${pctFromHigh < 0.1 ? 'at' : 'within ' + pctFromHigh.toFixed(1) + '% of'} 52-week high. No overhead resistance.`,
      });
    }
  }

  // Silver near highs
  if (silver?.price && silver?.year_high) {
    const pctFromHigh =
      ((silver.year_high - silver.price) / silver.year_high) * 100;
    if (pctFromHigh < 2) {
      signals.push({
        severity: 'bullish',
        score: 6,
        headline: 'Silver at 52-week high',
        detail: `$${silver.price.toFixed(2)} — confirming gold's move. Breadth signal.`,
      });
    }
  }

  // Financial stress spike
  if (stress != null && stress > 1) {
    signals.push({
      severity: 'bearish',
      score: 9,
      headline: 'Financial stress elevated',
      detail: `STL Stress Index at ${stress.toFixed(2)}. Above 1.0 — systemic risk rising. Watch for liquidity events.`,
    });
  }

  // Miner leverage
  const goldChg = gold?.change_pct ?? 0;
  const minerKeys = ['NST.AX', 'EVN.AX', 'RMS.AX', 'WGX.AX'];
  const minerChgs = minerKeys
    .map((k) => ({
      sym: k,
      name: prices[k]?.name ?? k,
      chg: prices[k]?.change_pct ?? 0,
    }))
    .filter((m) => m.chg !== 0);
  if (minerChgs.length > 0 && goldChg > 0) {
    const avg = minerChgs.reduce((a, b) => a + b.chg, 0) / minerChgs.length;
    if (avg > goldChg * 1.5) {
      const top = minerChgs.sort((a, b) => b.chg - a.chg)[0];
      signals.push({
        severity: 'bullish',
        score: 5,
        headline: 'Miners showing leverage',
        detail: `ASX miners avg +${avg.toFixed(1)}% vs gold +${goldChg.toFixed(1)}%. ${top.name} leading at +${top.chg.toFixed(1)}%.`,
      });
    } else if (avg < goldChg * 0.3 && goldChg > 0.5) {
      signals.push({
        severity: 'watch',
        score: 5,
        headline: 'Miners lagging gold',
        detail: `Gold up +${goldChg.toFixed(1)}% but miners only avg +${avg.toFixed(1)}%. Watch for divergence.`,
      });
    }
  }

  // Dollar breakdown
  const dxy = prices['DX-Y.NYB'];
  if (dxy?.price && dxy.price < 95) {
    signals.push({
      severity: 'bullish',
      score: 8,
      headline: 'Dollar breaking down',
      detail: `DXY at ${dxy.price.toFixed(1)} — below 95 is historically rocket fuel for commodities.`,
    });
  }

  return signals.sort((a, b) => b.score - a.score);
}

// ============ MOVERS ============

export function computeMovers(
  prices: Record<string, PriceData>,
): Mover[] {
  const movers: Mover[] = [];

  for (const [sym, data] of Object.entries(prices)) {
    if (!data.price || data.change_pct == null || data.error) continue;

    let significance = Math.abs(data.change_pct);
    let tag: string | undefined;

    // Near 52-week high
    if (data.year_high && data.price) {
      const pct = ((data.year_high - data.price) / data.year_high) * 100;
      if (pct < 1) {
        significance += 3;
        tag = '52wk high';
      } else if (pct < 3) {
        significance += 1;
        tag = 'Near high';
      }
    }

    // Near 52-week low
    if (data.year_low && data.price) {
      const pct = ((data.price - data.year_low) / data.year_low) * 100;
      if (pct < 3) {
        significance += 3;
        tag = '52wk low';
      }
    }

    // Crossed MA50
    if (
      data.ma_50d &&
      data.price &&
      data.prev_close
    ) {
      const crossedAbove = data.prev_close < data.ma_50d && data.price > data.ma_50d;
      const crossedBelow = data.prev_close > data.ma_50d && data.price < data.ma_50d;
      if (crossedAbove) {
        significance += 2;
        tag = tag || 'Crossed MA50 ↑';
      }
      if (crossedBelow) {
        significance += 2;
        tag = tag || 'Crossed MA50 ↓';
      }
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

// ============ AUTO CHART ============

const TV_MAP: Record<string, string> = {
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
};

export function pickChartSymbol(movers: Mover[]): {
  yahoo: string;
  tv: string;
  reason: string;
} {
  const fallback = {
    yahoo: 'GC=F',
    tv: 'FOREXCOM:XAUUSD',
    reason: 'Gold',
  };

  if (movers.length === 0) return fallback;

  const goldIdx = movers.findIndex((m) => m.symbol === 'GC=F');
  const goldSig = goldIdx >= 0 ? movers[goldIdx].significance : 0;
  const top = movers[0];

  // Only switch away from gold if something is clearly more interesting
  if (
    top.symbol !== 'GC=F' &&
    top.significance > goldSig * 1.8 &&
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
