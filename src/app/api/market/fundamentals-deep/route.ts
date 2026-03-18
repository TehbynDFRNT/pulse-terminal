/**
 * Fundamentals Deep — structural/fundamental data beyond price tickers.
 * 
 * DATA SOURCE STATUS:
 * ✅ FRED PURANUSDM (Uranium price) — works via existing FRED infra
 * ✅ Yahoo Finance REMX/SETM flows — volume/AUM proxy
 * ✅ Yahoo Finance SPUT.TO — Sprott Physical Uranium Trust data
 * ⚠️  EIA Uranium Production — free API, may need key for some endpoints
 * ⚠️  NRC Reactor Status — HTML scrape, may be blocked
 * ⚠️  Sprott Holdings — scrape, frequently blocked by Cloudflare
 * 🔴 NdPr Price — no free reliable source, STUB with manual update
 * 🔴 LME Copper Stocks — paywalled, STUB with manual update  
 * 🔴 Grid Queue — no public API, STUB
 * 
 * Cache: 60min TTL (most data is daily or slower)
 */

import { NextResponse } from 'next/server';
import { getCached, setCached, getCacheAge, FRED_API_KEY } from '@/lib/market-cache';
import yf from '@/lib/yahoo';
import { WESTERN_REE_PROJECTS, type FundamentalsDeepData } from '@/lib/fundamentals-types';

const CACHE_KEY = 'fundamentals-deep';
const CACHE_TTL = 60 * 60 * 1000; // 60 minutes

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// ============ FETCHERS ============

async function fetchFredUranium(): Promise<{ price: number | null; date: string | null }> {
  if (!FRED_API_KEY) {
    return { price: null, date: null };
  }

  try {
    const url = `https://api.stlouisfed.org/fred/series/observations?series_id=PURANUSDM&sort_order=desc&limit=5&api_key=${FRED_API_KEY}&file_type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return { price: null, date: null };
    const json = await res.json();
    const obs = json.observations || [];
    for (const o of obs) {
      if (o.value !== '.' && o.value !== '') {
        const val = parseFloat(o.value);
        if (isFinite(val)) return { price: val, date: o.date };
      }
    }
    return { price: null, date: null };
  } catch {
    return { price: null, date: null };
  }
}

async function fetchSputData(): Promise<{ lbs: number | null; navPerUnit: number | null; navDiscount: number | null; source: string }> {
  try {
    // Try yahoo-finance2 for SPUT.TO (Sprott Physical Uranium Trust)
    const quotes = await yf.quote(['SPUT.TO', 'U-UN.TO']);
    const quoteArr = Array.isArray(quotes) ? quotes : [quotes];
    const sput = quoteArr.find(q => q.symbol === 'SPUT.TO' || q.symbol === 'U-UN.TO');
    
    if (sput?.regularMarketPrice) {
      const price = sput.regularMarketPrice;
      // SPUT NAV is tracked — use bookValue if available
      const nav = (sput as Record<string, unknown>).bookValue as number | undefined;
      const navDiscount = nav && price ? ((price - nav) / nav) * 100 : null;
      
      // Estimate holdings: Total AUM / U3O8 spot price
      // SPUT holds ~62M lbs as of late 2024 (public knowledge)
      // We can estimate from market cap if available
      const marketCap = sput.marketCap;
      // Rough estimate: marketCap / (CAD price per share * shares) → lbs from AUM/U3O8 price
      // Better to use a known baseline and track from there
      return {
        lbs: 66_500_000, // STUB: ~66.5M lbs as of Feb 2025 (from Sprott reports, manually updated)
        navPerUnit: nav ?? null,
        navDiscount: navDiscount ? Math.round(navDiscount * 100) / 100 : null,
        source: marketCap ? 'yahoo-finance (SPUT.TO)' : 'yahoo-finance (partial)',
      };
    }
    return { lbs: 66_500_000, navPerUnit: null, navDiscount: null, source: 'stub (yahoo unavailable)' };
  } catch {
    // STUB: manual update from Sprott website
    return {
      lbs: 66_500_000,
      navPerUnit: null,
      navDiscount: null,
      source: 'stub (fetch failed)',
    };
  }
}

async function fetchEiaProduction(): Promise<{ value: number | null; period: string | null }> {
  try {
    const apiKey = process.env.EIA_API_KEY || '';
    const keyParam = apiKey ? `&api_key=${apiKey}` : '';
    // EIA Open Data API v2 — US uranium production
    const url = `https://api.eia.gov/v2/nuclear/uranium-production/mine-production/data/?frequency=quarterly&data[0]=production&sort[0][column]=period&sort[0][direction]=desc&length=1${keyParam}`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) return { value: null, period: null };
    const json = await res.json();
    const data = json?.response?.data;
    if (Array.isArray(data) && data.length > 0) {
      const latest = data[0];
      return {
        value: typeof latest.production === 'number' ? latest.production : parseFloat(latest.production),
        period: latest.period || null,
      };
    }
    return { value: null, period: null };
  } catch {
    return { value: null, period: null };
  }
}

async function fetchNrcReactors(): Promise<{ operational: number | null; source: string }> {
  try {
    const url = 'https://www.nrc.gov/reading-rm/doc-collections/event-status/reactor-status/ps.html';
    const res = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: { 'User-Agent': UA },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();
    
    // Count rows with power level > 0 (operational reactors)
    // NRC page has a table with reactor names and power levels
    const powerMatches = html.match(/\d+\s*%/g);
    if (powerMatches) {
      const operational = powerMatches.filter(m => {
        const val = parseInt(m);
        return val > 0;
      }).length;
      return { operational, source: 'NRC reactor status page' };
    }
    
    // Fallback: count table rows that look like reactor entries
    // US has ~93 operational reactors
    return { operational: null, source: 'NRC (parse failed)' };
  } catch {
    // STUB: US has 93 commercial nuclear reactors operational
    return { operational: 93, source: 'stub (NRC scrape blocked, known count)' };
  }
}

async function fetchEtfFlows(symbol: string): Promise<{ volume: number | null; avgVolume: number | null; flowDirection: 'inflow' | 'outflow' | 'neutral' }> {
  try {
    const quotes = await yf.quote([symbol]);
    const quoteArr = Array.isArray(quotes) ? quotes : [quotes];
    const q = quoteArr.find(qq => qq.symbol === symbol);
    if (!q) return { volume: null, avgVolume: null, flowDirection: 'neutral' };
    
    const vol = q.regularMarketVolume ?? null;
    const avg = q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? null;
    
    let flowDirection: 'inflow' | 'outflow' | 'neutral' = 'neutral';
    if (vol && avg) {
      const ratio = vol / avg;
      const chg = q.regularMarketChangePercent ?? 0;
      if (ratio > 1.3 && chg > 0) flowDirection = 'inflow';
      else if (ratio > 1.3 && chg < 0) flowDirection = 'outflow';
      else if (chg > 1) flowDirection = 'inflow';
      else if (chg < -1) flowDirection = 'outflow';
    }
    
    return { volume: vol, avgVolume: avg, flowDirection };
  } catch {
    return { volume: null, avgVolume: null, flowDirection: 'neutral' };
  }
}

// ============ MAIN FETCH ============

async function fetchAll(): Promise<FundamentalsDeepData> {
  const errors: string[] = [];
  const now = new Date().toISOString();

  // Run all fetches in parallel
  const [
    fredU,
    sput,
    eia,
    nrc,
    remxFlows,
    setmFlows,
  ] = await Promise.all([
    fetchFredUranium().catch(e => { errors.push(`FRED uranium: ${e}`); return { price: null, date: null }; }),
    fetchSputData().catch(e => { errors.push(`SPUT: ${e}`); return { lbs: null, navPerUnit: null, navDiscount: null, source: 'error' }; }),
    fetchEiaProduction().catch(e => { errors.push(`EIA: ${e}`); return { value: null, period: null }; }),
    fetchNrcReactors().catch(e => { errors.push(`NRC: ${e}`); return { operational: null, source: 'error' }; }),
    fetchEtfFlows('REMX').catch(e => { errors.push(`REMX flows: ${e}`); return { volume: null, avgVolume: null, flowDirection: 'neutral' as const }; }),
    fetchEtfFlows('SETM').catch(e => { errors.push(`SETM flows: ${e}`); return { volume: null, avgVolume: null, flowDirection: 'neutral' as const }; }),
  ]);

  return {
    energy: {
      sputHoldings: {
        lbs: sput.lbs,
        navPerUnit: sput.navPerUnit,
        navDiscount: sput.navDiscount,
        source: sput.source,
        asOf: now,
      },
      uraniumSpot: {
        price: fredU.price,
        date: fredU.date,
        source: 'FRED PURANUSDM',
      },
      eiaProduction: {
        value: eia.value,
        unit: 'thousand lbs U3O8',
        period: eia.period,
        source: eia.value != null ? 'EIA OpenData API' : 'stub (EIA unavailable)',
      },
      reactorCount: {
        operational: nrc.operational,
        source: nrc.source,
        asOf: now,
      },
      gridQueue: {
        // STUB: no public API for interconnection queue data
        totalMW: 2_600_000,
        source: 'stub (interconnection.fyi — no public API, ~2.6TW estimated queue as of 2024)',
        asOf: '2024-12-01',
      },
    },
    ree: {
      ndprPrice: {
        // STUB: NdPr price not freely available. Manual update from Asian Metal or Shanghai Metals Market.
        price: 72.5,
        unit: 'USD/kg',
        source: 'stub (manual update — no free NdPr price API)',
        asOf: '2025-02-01',
      },
      copperStocks: {
        // STUB: LME warehouse data paywalled
        tonnes: 198_000,
        source: 'stub (LME copper stocks — manual update from westmetall.com)',
        asOf: '2025-02-01',
      },
      remxFlows: {
        volume: remxFlows.volume,
        avgVolume: remxFlows.avgVolume,
        flowDirection: remxFlows.flowDirection,
        source: 'yahoo-finance (REMX)',
      },
      setmFlows: {
        volume: setmFlows.volume,
        avgVolume: setmFlows.avgVolume,
        flowDirection: setmFlows.flowDirection,
        source: 'yahoo-finance (SETM)',
      },
      projectPipeline: WESTERN_REE_PROJECTS,
    },
    pm: {
      centralBankBuying: {
        // STUB: WGC data not freely available via API
        tonnes: 1037,
        period: '2024 full year',
        source: 'stub (WGC Central Bank Gold Survey — manual update)',
        asOf: '2025-01-31',
      },
    },
    meta: {
      fetchedAt: now,
      errors,
    },
  };
}

// ============ ROUTE HANDLER ============

export async function GET() {
  try {
    const cached = getCached<FundamentalsDeepData>(CACHE_KEY, CACHE_TTL);
    if (cached) {
      const age = getCacheAge(CACHE_KEY);
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, max-age=600',
          'X-Cache': 'HIT',
          'X-Cache-Age': String(age ?? 0),
        },
      });
    }

    const data = await fetchAll();
    setCached(CACHE_KEY, data);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=600',
        'X-Cache': 'MISS',
      },
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
