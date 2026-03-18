'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getChartResolution } from './chart-presets';
import { getPortfolioPerformance } from './gateway-client';
import {
  buildHistorySeed,
  buildLivelineFeed,
  type LiveBeatInput,
} from './liveline-feed';
import {
  computePortfolioLiveValue,
  getPortfolioPerformanceResolution,
  getPortfolioPerformanceTimeframe,
  type PortfolioPerformanceTimeframe,
  toPortfolioPerformanceBars,
} from './portfolio-performance';
import {
  useIBKRConnection,
  useIBKRMarketDataMulti,
} from './useIBKRWebSocket';
import type { PortfolioPerformanceResponse } from './types';
import { usePortfolioStore } from '@/lib/store/portfolio';
import { useNow } from '@/lib/useNow';

interface PortfolioPerformanceBootstrapState {
  data: PortfolioPerformanceResponse | null;
  loaded: boolean;
  error: string | null;
}

export interface PortfolioPerformanceFeedState {
  bootstrap: PortfolioPerformanceBootstrapState;
  baseCurrency: string;
  connected: boolean;
  displayStatus: 'live' | 'historical' | 'unknown';
  timeframe: PortfolioPerformanceTimeframe;
  line: ReturnType<typeof buildLivelineFeed>['line'];
  value: number;
  latestMarketTime: number | null;
  netLiquidity: number;
}

const bootstrapCache = new Map<string, PortfolioPerformanceBootstrapState>();
const inflightBootstrap = new Map<
  string,
  Promise<PortfolioPerformanceBootstrapState>
>();
const LIVE_BEAT_RETENTION_MS = 6 * 60 * 60 * 1000;

export function usePortfolioPerformanceFeed(
  timeframeKey: string
): PortfolioPerformanceFeedState {
  const timeframe = getPortfolioPerformanceTimeframe(timeframeKey);
  const resolution = getPortfolioPerformanceResolution(
    timeframe,
    getChartResolution
  );
  const cacheKey = timeframe.key;
  const { connected } = useIBKRConnection();
  const summary = usePortfolioStore((s) => s.summary);
  const positions = usePortfolioStore((s) => s.positions);
  const portfolioUpdatedAt = usePortfolioStore((s) => s.updatedAt);
  const streamPrices = useIBKRMarketDataMulti(
    positions.map((position) => position.conid)
  );
  const nowMs = useNow(Math.max(resolution.bucketSecs * 1000, 1000), true);
  const [bootstrap, setBootstrap] = useState<PortfolioPerformanceBootstrapState>(() => {
    return (
      bootstrapCache.get(cacheKey) ?? {
        data: null,
        loaded: false,
        error: null,
      }
    );
  });
  const [bufferedBeats, setBufferedBeats] = useState<LiveBeatInput[]>([]);
  const bootstrapRef = useRef(bootstrap);

  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);

  useEffect(() => {
    setBufferedBeats([]);
    setBootstrap(
      bootstrapCache.get(cacheKey) ?? {
        data: null,
        loaded: false,
        error: null,
      }
    );
  }, [cacheKey]);

  const fetchBootstrap = useCallback(async () => {
    const existing = inflightBootstrap.get(cacheKey);
    const request =
      existing ??
      getPortfolioPerformance(timeframe.key)
        .then((data) => ({
          data,
          loaded: true,
          error: null,
        }))
        .catch((error) => ({
          data: null,
          loaded: true,
          error:
            error instanceof Error
              ? error.message
              : 'Portfolio performance failed',
        }));

    if (!existing) {
      inflightBootstrap.set(cacheKey, request);
    }

    try {
      const result = await request;
      const baseline = getBootstrapBaseline(bootstrapRef.current, cacheKey);
      const next =
        result.data?.points.length
          ? result
          : {
              data: baseline?.data ?? result.data,
              loaded: true,
              error: result.error,
            };

      bootstrapCache.set(cacheKey, next);
      bootstrapRef.current = next;
      setBootstrap(next);
    } finally {
      inflightBootstrap.delete(cacheKey);
    }
  }, [cacheKey, timeframe.key]);

  useEffect(() => {
    void fetchBootstrap();
  }, [fetchBootstrap]);

  const baseCurrency = bootstrap.data?.baseCurrency ?? 'AUD';
  const historyBars = useMemo(
    () => toPortfolioPerformanceBars(bootstrap.data?.points ?? [], timeframe),
    [bootstrap.data?.points, timeframe]
  );
  const historySeed = useMemo(
    () => buildHistorySeed(historyBars, timeframe, resolution),
    [historyBars, resolution, timeframe]
  );
  const latestStreamUpdated = useMemo(() => {
    let latest = 0;
    for (const price of streamPrices.values()) {
      if (price.updated > latest) latest = price.updated;
    }
    return latest;
  }, [streamPrices]);
  const livePortfolioValue = useMemo(
    () =>
      computePortfolioLiveValue({
        baseCurrency,
        summary,
        positions,
        prices: streamPrices,
      }),
    [baseCurrency, positions, streamPrices, summary]
  );
  const rawLiveBeat = useMemo<LiveBeatInput | null>(() => {
    const value =
      livePortfolioValue ||
      summary?.netLiquidity ||
      bootstrap.data?.snapshot.value ||
      0;
    if (!(value > 0)) return null;

    const updatedMs = Math.max(
      latestStreamUpdated,
      portfolioUpdatedAt ?? 0,
      bootstrap.data?.snapshot.updatedAt ?? 0
    );

    return {
      value,
      updatedMs: updatedMs || nowMs,
      source: 'last',
    };
  }, [
    bootstrap.data?.snapshot.updatedAt,
    bootstrap.data?.snapshot.value,
    latestStreamUpdated,
    livePortfolioValue,
    nowMs,
    portfolioUpdatedAt,
    summary?.netLiquidity,
  ]);

  useEffect(() => {
    if (!rawLiveBeat || rawLiveBeat.value <= 0) return;

    setBufferedBeats((previous) => {
      const last = previous[previous.length - 1];
      if (
        last &&
        last.updatedMs === rawLiveBeat.updatedMs &&
        last.value === rawLiveBeat.value &&
        last.source === rawLiveBeat.source
      ) {
        return previous;
      }

      const cutoff = rawLiveBeat.updatedMs - LIVE_BEAT_RETENTION_MS;
      return [...previous.filter((beat) => beat.updatedMs >= cutoff), rawLiveBeat];
    });
  }, [rawLiveBeat]);

  const liveBeats = useMemo(
    () => mergeLiveBeats(bufferedBeats),
    [bufferedBeats]
  );
  const liveBeat = useMemo(
    () => pickFreshestLiveBeat(rawLiveBeat, liveBeats),
    [liveBeats, rawLiveBeat]
  );
  const hasLiveFeed = connected && liveBeat != null;
  const livelineFeed = useMemo(
    () =>
      buildLivelineFeed({
        seed: historySeed,
        mode: 'line',
        liveBeat,
        liveBeats,
        nowMs,
        marketOpen: hasLiveFeed,
        hasLiveFeed,
        timeframe,
        resolution,
      }),
    [hasLiveFeed, historySeed, liveBeat, liveBeats, nowMs, resolution, timeframe]
  );

  return {
    bootstrap,
    baseCurrency,
    connected,
    displayStatus:
      hasLiveFeed
        ? 'live'
        : livelineFeed.line.length > 0
          ? 'historical'
          : 'unknown',
    timeframe,
    line: livelineFeed.line,
    value: livelineFeed.value,
    latestMarketTime: livelineFeed.latestMarketTime,
    netLiquidity: summary?.netLiquidity ?? bootstrap.data?.snapshot.value ?? 0,
  };
}

function getBootstrapBaseline(
  current: PortfolioPerformanceBootstrapState,
  cacheKey: string
): PortfolioPerformanceBootstrapState | null {
  const cached = bootstrapCache.get(cacheKey) ?? null;
  if (current.data?.points.length) return current;
  if (cached?.data?.points.length) return cached;
  return current.data || current.error ? current : cached;
}

function mergeLiveBeats(beats: LiveBeatInput[]): LiveBeatInput[] {
  const merged = new Map<string, LiveBeatInput>();

  for (const beat of beats) {
    if (!(beat.value > 0)) continue;
    merged.set(`${beat.updatedMs}:${beat.value}:${beat.source}`, beat);
  }

  return Array.from(merged.values()).sort(
    (left, right) => left.updatedMs - right.updatedMs
  );
}

function pickFreshestLiveBeat(
  current: LiveBeatInput | null,
  beats: LiveBeatInput[]
): LiveBeatInput | null {
  const latest = beats[beats.length - 1] ?? null;
  if (!latest) return current;
  if (!current) return latest;
  return latest.updatedMs >= current.updatedMs ? latest : current;
}
