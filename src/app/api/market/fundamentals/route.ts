import { NextRequest, NextResponse } from 'next/server';
import yf from '@/lib/yahoo';
import { getCached, setCached, getCacheAge } from '@/lib/market-cache';

const CACHE_TTL = 60 * 60 * 1000; // 60 minutes (fundamentals change slowly)

function safe(v: number | undefined | null): number | null {
  if (v === undefined || v === null || !isFinite(v)) return null;
  return Math.round(v * 10000) / 10000;
}

interface FundResult {
  symbol: string;
  profile?: Record<string, unknown>;
  metrics?: Record<string, unknown>;
  price_data?: Record<string, unknown>;
  income?: Record<string, unknown>[];
  error?: string;
}

async function fetchOne(symbol: string): Promise<FundResult> {
  const data: FundResult = { symbol };
  try {
    const summary = await yf.quoteSummary(symbol, {
      modules: [
        'price',
        'defaultKeyStatistics',
        'financialData',
      ],
    });

    const price = summary.price;
    const stats = summary.defaultKeyStatistics;
    const fin = summary.financialData;

    data.profile = {
      name: price?.longName || price?.shortName,
      sector: undefined, // not in these modules
      market_cap: safe(price?.marketCap),
      price: safe(price?.regularMarketPrice),
      exchange: price?.exchangeName,
      currency: price?.currency,
    };

    data.metrics = {
      pe_ratio: safe(stats?.trailingEps && price?.regularMarketPrice
        ? price.regularMarketPrice / stats.trailingEps : undefined) ??
        safe(price?.regularMarketPrice && fin?.earningsGrowth !== undefined
          ? undefined : undefined),
      forward_pe: safe(stats?.forwardPE as number | undefined),
      pb_ratio: safe(stats?.priceToBook as number | undefined),
      ps_ratio: safe(stats?.priceToSalesTrailing12Months as number | undefined),
      ev_ebitda: safe(stats?.enterpriseToEbitda as number | undefined),
      ev_revenue: safe(stats?.enterpriseToRevenue as number | undefined),
      dividend_yield: safe(stats?.yield as number | undefined),
      payout_ratio: safe(stats?.payoutRatio as number | undefined),
      roe: safe(fin?.returnOnEquity as number | undefined),
      roa: safe(fin?.returnOnAssets as number | undefined),
      debt_to_equity: safe(fin?.debtToEquity as number | undefined),
      current_ratio: safe(fin?.currentRatio as number | undefined),
      free_cash_flow: safe(fin?.freeCashflow as number | undefined),
      operating_cash_flow: safe(fin?.operatingCashflow as number | undefined),
      market_cap: safe(price?.marketCap as number | undefined),
      enterprise_value: safe(stats?.enterpriseValue as number | undefined),
      beta: safe(stats?.beta as number | undefined),
    };

    // Compute PE from price/EPS if available
    const trailingEps = stats?.trailingEps as number | undefined;
    const regPrice = price?.regularMarketPrice as number | undefined;
    if (trailingEps && regPrice && trailingEps > 0) {
      data.metrics.pe_ratio = safe(regPrice / trailingEps);
    }

    // Earnings yield + FCF yield
    const pe = data.metrics.pe_ratio as number | null;
    const mcap = price?.marketCap as number | undefined;
    const fcf = fin?.freeCashflow as number | undefined;
    if (pe && pe > 0) data.metrics.earnings_yield = safe(1 / pe);
    if (fcf && mcap && mcap > 0) data.metrics.free_cash_flow_yield = safe(fcf / mcap);

    data.price_data = {
      year_high: safe((stats?.fiftyTwoWeekHigh ?? price?.regularMarketDayHigh) as number | undefined),
      year_low: safe((stats?.fiftyTwoWeekLow ?? price?.regularMarketDayLow) as number | undefined),
      ma_50d: safe(stats?.fiftyDayAverage as number | undefined),
      ma_200d: safe(stats?.twoHundredDayAverage as number | undefined),
      eps_trailing: safe(stats?.trailingEps as number | undefined),
      eps_forward: safe(stats?.forwardEps as number | undefined),
    };

    // Income via fundamentalsTimeSeries (incomeStatementHistory deprecated since Nov 2024)
    try {
      const ts = await yf.fundamentalsTimeSeries(symbol, {
        type: 'annual',
        period1: new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10),
        module: 'financials',
      });
      if (ts && Array.isArray(ts) && ts.length > 0) {
        data.income = ts.slice(0, 2).map((stmt) => {
          const s = stmt as unknown as Record<string, unknown>;
          return {
            date: s.date ? new Date(s.date as string).toISOString().slice(0, 10) : undefined,
            total_revenue: safe(s.totalRevenue as number | undefined),
            gross_profit: safe(s.grossProfit as number | undefined),
            operating_income: safe(s.operatingIncome as number | undefined),
            net_income: safe(s.netIncome as number | undefined),
            ebitda: safe(s.ebitda as number | undefined),
          };
        });
      }
    } catch {
      // Financials time series not available for all tickers
    }
  } catch (e: unknown) {
    data.error = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }

  return data;
}

async function fetchFundamentals(symbols: string[]): Promise<Record<string, FundResult>> {
  // All in parallel
  const results = await Promise.all(symbols.map(s => fetchOne(s)));
  const out: Record<string, FundResult> = {};
  results.forEach(r => { out[r.symbol] = r; });
  return out;
}

export async function GET(req: NextRequest) {
  const symbolsParam = req.nextUrl.searchParams.get('symbols') || 'NEM';
  const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean);
  const cacheKey = `fundamentals:${symbols.sort().join(',')}`;

  try {
    const cached = getCached<Record<string, FundResult>>(cacheKey, CACHE_TTL);
    if (cached) {
      const age = getCacheAge(cacheKey);
      return NextResponse.json(cached, {
        headers: {
          'Cache-Control': 'public, max-age=3600',
          'X-Cache': 'HIT',
          'X-Cache-Age': String(age ?? 0),
        },
      });
    }

    const data = await fetchFundamentals(symbols);
    setCached(cacheKey, data);

    return NextResponse.json(data, {
      headers: {
        'Cache-Control': 'public, max-age=3600',
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
