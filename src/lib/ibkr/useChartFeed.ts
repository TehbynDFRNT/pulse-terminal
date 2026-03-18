'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CHART_TIMEFRAMES,
  type ChartResolution,
  type ChartTimeframe,
} from './chart-presets';
import {
  deriveMarketDataDisplayStatus,
} from './display-status';
import {
  buildHistorySeed,
  buildLivelineFeed,
  type LiveBeatInput,
} from './liveline-feed';
import { useMarketSchedule } from './useMarketSchedule';
import {
  useIBKRChartBeats,
  useIBKRConnection,
  useIBKRMarketData,
  type StreamingPrice,
} from './useIBKRWebSocket';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { useNow } from '@/lib/useNow';
import { recordChartDiagnostic } from '@/lib/dev/chart-diagnostics';
import type {
  ChartBootstrapResponse,
  HistoricalBar,
  MarketDataSnapshot,
} from './types';

interface UseChartFeedParams {
  conid: number;
  exchange?: string;
  timeframe: ChartTimeframe;
  resolution: ChartResolution;
  mode: 'line' | 'candle';
  enableFeedClock: boolean;
  streamingEnabled?: boolean;
  debugLabel?: string;
}

interface ChartFeedBootstrapState {
  historyBars: HistoricalBar[];
  snapshot: MarketDataSnapshot | null;
  historyError: string | null;
  loaded: boolean;
}

export interface ChartFeedState {
  bootstrap: ChartFeedBootstrapState;
  snapshot: MarketDataSnapshot | null;
  streamData: StreamingPrice | null;
  connected: boolean;
  schedule: ReturnType<typeof useMarketSchedule>['schedule'];
  scheduleState: ReturnType<typeof useMarketSchedule>['state'];
  effectiveMarketDataStatus: 'live' | 'delayed' | 'frozen' | 'unavailable' | 'unknown';
  displayStatus: ReturnType<typeof deriveMarketDataDisplayStatus>;
  marketOpen: boolean;
  hasLiveFeed: boolean;
  line: ReturnType<typeof buildLivelineFeed>['line'];
  lineValue: number;
  lineLatestMarketTime: number | null;
  candles: ReturnType<typeof buildLivelineFeed>['candles'];
  liveCandle: ReturnType<typeof buildLivelineFeed>['liveCandle'];
  candleValue: number;
  candleLatestMarketTime: number | null;
  value: number;
  latestMarketTime: number | null;
  nowMs: number;
  waitingForDaemonCoverage: boolean;
}

interface ChartFeedCacheIdentity {
  conid: number;
  timeframeKey: string;
  resolutionKey: string;
}

interface ChartFeedBootstrapRequest extends ChartFeedCacheIdentity {
  fallbackSnapshot?: MarketDataSnapshot | null;
}

interface ChartFeedBootstrapPayload {
  state: ChartFeedBootstrapState;
  liveBeats: LiveBeatInput[];
}

interface ChartFeedCacheWarmResponseEntry {
  timeframeKey: string;
  historyBars: HistoricalBar[];
  historyError: string | null;
}

interface ChartFeedCacheWarmResponse {
  conid: number;
  entries: ChartFeedCacheWarmResponseEntry[];
}

const bootstrapCache = new Map<string, ChartFeedBootstrapState>();
const bootstrapFetchedAt = new Map<string, number>();
const bufferedBeatCache = new Map<string, LiveBeatInput[]>();
const inflightBootstrap = new Map<string, Promise<ChartFeedBootstrapPayload>>();
const inflightConidHydration = new Map<string, Promise<void>>();
const conidHydratedAt = new Map<string, number>();
const LIVE_BEAT_RETENTION_MS = 6 * 60 * 60 * 1000;
const BOOTSTRAP_REUSE_MS = 30_000;
const LIVE_HEAD_FRESHNESS_MS = 15_000;
const LIVE_ACTIVITY_FRESHNESS_MS = 30_000;

export function prewarmChartFeedBootstrap({
  conid,
  timeframeKey,
  resolutionKey,
  fallbackSnapshot = null,
}: ChartFeedBootstrapRequest): Promise<ChartFeedBootstrapState> {
  return loadBootstrapIntoCache({
    conid,
    timeframeKey,
    resolutionKey,
    fallbackSnapshot,
  });
}

export function useChartFeed({
  conid,
  exchange,
  timeframe,
  resolution,
  mode,
  enableFeedClock,
  streamingEnabled = true,
  debugLabel,
}: UseChartFeedParams): ChartFeedState {
  const cachedWatchlistPrice = useWatchlistStore((s) => s.prices[conid] ?? null);
  const watchlistSnapshot = useMemo(
    () => toSnapshotFromWatchlist(cachedWatchlistPrice),
    [cachedWatchlistPrice]
  );
  const watchlistSnapshotRef = useRef<MarketDataSnapshot | null>(watchlistSnapshot);
  const { connected } = useIBKRConnection(streamingEnabled);
  const streamData = useIBKRMarketData(conid, streamingEnabled);
  const streamBeats = useIBKRChartBeats(conid, streamingEnabled);
  const { schedule, state: scheduleState } = useMarketSchedule(conid, exchange);
  const shouldDebug = process.env.NODE_ENV === 'development' && Boolean(debugLabel);
  const cacheKey = getChartFeedCacheKey({
    conid,
    timeframeKey: timeframe.key,
    resolutionKey: resolution.key,
  });
  const requestIdRef = useRef(0);
  const warmRetryRef = useRef<string | null>(null);
  const [bootstrap, setBootstrap] = useState<ChartFeedBootstrapState>(() => {
    const cached = bootstrapCache.get(cacheKey);
    if (cached) return cached;

    return {
      historyBars: [],
      snapshot: watchlistSnapshot,
      historyError: null,
      loaded: false,
    };
  });
  const bootstrapRef = useRef<ChartFeedBootstrapState>(bootstrap);
  const [bufferedBeats, setBufferedBeats] = useState<LiveBeatInput[]>(
    () => readCachedBufferedBeats(cacheKey)
  );

  useEffect(() => {
    watchlistSnapshotRef.current = watchlistSnapshot;
  }, [watchlistSnapshot]);

  useEffect(() => {
    bootstrapRef.current = bootstrap;
  }, [bootstrap]);

  useEffect(() => {
    const cached = bootstrapCache.get(cacheKey);
    setBufferedBeats(readCachedBufferedBeats(cacheKey));
    warmRetryRef.current = null;

    if (cached) {
      setBootstrap({
        ...cached,
        snapshot: pickFreshestSnapshot(cached.snapshot, watchlistSnapshot),
      });
      return;
    }

    setBootstrap({
      historyBars: [],
      snapshot: watchlistSnapshot,
      historyError: null,
      loaded: false,
    });
  // Intentionally keyed to chart identity, not snapshot churn.
  // The freshest snapshot is merged separately via seedSnapshot.
  }, [cacheKey]);

  useEffect(() => {
    bufferedBeatCache.set(cacheKey, bufferedBeats);
  }, [bufferedBeats, cacheKey]);

  const fetchBootstrap = useCallback(async () => {
    const requestId = ++requestIdRef.current;

    try {
      const next = await loadBootstrapIntoCache({
        conid,
        timeframeKey: timeframe.key,
        resolutionKey: resolution.key,
        fallbackSnapshot: watchlistSnapshotRef.current,
      });
      if (requestIdRef.current !== requestId) return;
      bootstrapRef.current = next;
      setBootstrap(next);
    } catch {
      if (requestIdRef.current !== requestId) return;
      const cached = bootstrapCache.get(cacheKey);
      if (!cached) return;
      bootstrapRef.current = cached;
      setBootstrap(cached);
    }
  }, [cacheKey, conid, resolution.key, timeframe.key]);

  useEffect(() => {
    const cached = bootstrapCache.get(cacheKey);
    if (cached?.loaded && cached.historyBars.length > 0) {
      return;
    }
    void fetchBootstrap();
  }, [cacheKey, fetchBootstrap]);

  useEffect(() => {
    void hydrateConidBootstrapCache(conid, watchlistSnapshotRef.current).then(() => {
      const exactKey = getChartFeedCacheKey({
        conid,
        timeframeKey: timeframe.key,
        resolutionKey: resolution.key,
      });
      const cached = bootstrapCache.get(exactKey);
      if (!cached) return;

      setBootstrap((current) => {
        if (current.historyBars.length >= cached.historyBars.length && current.loaded) {
          return current;
        }

        const next = {
          ...cached,
          snapshot: pickFreshestSnapshot(cached.snapshot, watchlistSnapshotRef.current),
        };
        bootstrapRef.current = next;
        return next;
      });
    });
  }, [conid, resolution.key, timeframe.key]);

  const sessionPhase = scheduleState?.phase ?? 'unknown';
  const scheduleOpen =
    sessionPhase === 'regular' || sessionPhase === 'extended';
  const marketClosed = sessionPhase === 'closed';
  const effectiveBootstrap = useMemo(
    () => resolveBootstrapState(cacheKey, bootstrap, watchlistSnapshot),
    [bootstrap, cacheKey, watchlistSnapshot]
  );
  const seedSnapshot = useMemo(
    () => pickFreshestSnapshot(effectiveBootstrap.snapshot, watchlistSnapshot),
    [effectiveBootstrap.snapshot, watchlistSnapshot]
  );
  const hasStreamQuote =
    streamingEnabled &&
    (
      (streamData?.chartPrice ?? 0) > 0 ||
      (streamData?.displayPrice ?? 0) > 0 ||
      (streamData?.last ?? 0) > 0 ||
      (streamData?.bid ?? 0) > 0 ||
      (streamData?.ask ?? 0) > 0
    );
  const effectiveMarketDataStatus =
    seedSnapshot?.marketDataStatus ??
    (hasStreamQuote ? 'live' : 'unknown');
  const latestQuoteUpdatedMs = Math.max(
    streamData?.updated ?? 0,
    seedSnapshot?.updated ?? 0
  );
  const hasFreshQuoteSignal =
    latestQuoteUpdatedMs > 0 &&
    Date.now() - latestQuoteUpdatedMs <= LIVE_ACTIVITY_FRESHNESS_MS;
  const marketOpen =
    scheduleOpen ||
    (
      sessionPhase === 'unknown' &&
      (effectiveMarketDataStatus === 'live' ||
        effectiveMarketDataStatus === 'delayed') &&
      hasFreshQuoteSignal
    );
  const hasLiveFeed =
    streamingEnabled && (hasStreamQuote || effectiveMarketDataStatus === 'live');
  useEffect(() => {
    if (warmRetryRef.current === cacheKey) return;
    if (!effectiveBootstrap.loaded) return;
    if (effectiveBootstrap.historyBars.length > 0) return;
    if (!streamingEnabled) return;
    if (!(connected || hasLiveFeed)) return;

    warmRetryRef.current = cacheKey;
    void fetchBootstrap();
  }, [
    cacheKey,
    connected,
    effectiveBootstrap.historyBars.length,
    effectiveBootstrap.loaded,
    fetchBootstrap,
    hasLiveFeed,
    streamingEnabled,
  ]);
  const feedNowMs = useNow(
    Math.max(resolution.bucketSecs * 1000, 1000),
    enableFeedClock && streamingEnabled && marketOpen && hasLiveFeed
  );
  const historySeed = useMemo(
    () => buildHistorySeed(effectiveBootstrap.historyBars, timeframe, resolution),
    [effectiveBootstrap.historyBars, resolution, timeframe]
  );
  const rawLiveBeat = useMemo<LiveBeatInput | null>(() => {
    if (!streamingEnabled) {
      return null;
    }
    if (marketClosed) {
      return null;
    }

    const streamValue =
      streamData?.chartPrice ||
      streamData?.displayPrice ||
      streamData?.last ||
      0;

    if (streamValue > 0) {
      return {
        value: streamValue,
        updatedMs: streamData?.updated ?? feedNowMs,
        source:
          streamData?.chartSource ??
          streamData?.displaySource ??
          'none',
      };
    }

    const snapshotValue =
      seedSnapshot?.displayPrice ||
      seedSnapshot?.last ||
      0;

    if (snapshotValue > 0) {
      return {
        value: snapshotValue,
        updatedMs: seedSnapshot?.updated ?? feedNowMs,
        source: seedSnapshot?.displaySource ?? 'none',
      };
    }

    return null;
  }, [feedNowMs, marketClosed, seedSnapshot, streamData, streamingEnabled]);
  useEffect(() => {
    if (!streamingEnabled) return;
    if (marketClosed) return;
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
      const next = previous.filter((beat) => beat.updatedMs >= cutoff);
      next.push(rawLiveBeat);
      return next;
    });
  }, [
    marketClosed,
    rawLiveBeat?.source,
    rawLiveBeat?.updatedMs,
    rawLiveBeat?.value,
    streamingEnabled,
  ]);
  const effectiveBeats = useMemo(
    () =>
      mergeLiveBeats(
        streamBeats.map((beat) => ({
          value: beat.value,
          updatedMs: beat.timeMs,
          source: beat.source,
        })),
        bufferedBeats
      ),
    [bufferedBeats, streamBeats]
  );
  const contiguousRecentBeats = useMemo(
    () => getContiguousRecentBeats(effectiveBeats),
    [effectiveBeats]
  );
  const liveBeat = useMemo(
    () =>
      !streamingEnabled || marketClosed
        ? null
        : pickFreshestLiveBeat(rawLiveBeat, effectiveBeats),
    [effectiveBeats, marketClosed, rawLiveBeat, streamingEnabled]
  );
  const contiguousCoverageMs = useMemo(() => {
    if (contiguousRecentBeats.length === 0) return 0;
    const first = contiguousRecentBeats[0]?.updatedMs ?? 0;
    const last =
      contiguousRecentBeats[contiguousRecentBeats.length - 1]?.updatedMs ?? 0;
    return Math.max(0, last - first + resolution.bucketSecs * 1000);
  }, [contiguousRecentBeats, resolution.bucketSecs]);
  const latestContiguousBeatUpdatedMs =
    contiguousRecentBeats[contiguousRecentBeats.length - 1]?.updatedMs ?? 0;
  const hasFreshDaemonHead =
    latestContiguousBeatUpdatedMs > 0 &&
    feedNowMs - latestContiguousBeatUpdatedMs <= LIVE_HEAD_FRESHNESS_MS;
  const latestObservedLiveActivityMs = Math.max(
    latestContiguousBeatUpdatedMs,
    liveBeat?.updatedMs ?? 0,
    streamData?.updated ?? 0,
    seedSnapshot?.updated ?? 0
  );
  const hasFreshObservedLiveActivity =
    latestObservedLiveActivityMs > 0 &&
    feedNowMs - latestObservedLiveActivityMs <= LIVE_ACTIVITY_FRESHNESS_MS;
  const hasHistorySeed =
    historySeed.line.length > 0 || historySeed.candles.length > 0;
  const hasRenderableLiveFeed =
    (effectiveMarketDataStatus === 'live' ||
      effectiveMarketDataStatus === 'delayed') &&
    hasFreshObservedLiveActivity &&
    hasFreshDaemonHead;
  const waitingForDaemonCoverage = false;
  const lineFeed = useMemo(
    () =>
      buildLivelineFeed({
        seed: historySeed,
        mode: 'line',
        liveBeat,
        liveBeats: effectiveBeats,
        nowMs: feedNowMs,
        marketOpen,
        hasLiveFeed: hasRenderableLiveFeed,
        timeframe,
        resolution,
      }),
    [
      feedNowMs,
      hasRenderableLiveFeed,
      historySeed,
      liveBeat,
      effectiveBeats,
      marketOpen,
      resolution,
      timeframe,
    ]
  );
  const candleFeed = useMemo(
    () =>
      buildLivelineFeed({
        seed: historySeed,
        mode: 'candle',
        liveBeat,
        liveBeats: effectiveBeats,
        nowMs: feedNowMs,
        marketOpen,
        hasLiveFeed: hasRenderableLiveFeed,
        timeframe,
        resolution,
      }),
    [
      feedNowMs,
      hasRenderableLiveFeed,
      historySeed,
      liveBeat,
      effectiveBeats,
      marketOpen,
      resolution,
      timeframe,
    ]
  );
  const renderedLineFeed = lineFeed;
  const renderedCandleFeed = candleFeed;
  const renderedFeed = mode === 'line' ? renderedLineFeed : renderedCandleFeed;
  const hasHistory =
    renderedLineFeed.line.length > 0 || renderedCandleFeed.candles.length > 0;
  const displayStatus = deriveMarketDataDisplayStatus({
    marketDataStatus: effectiveMarketDataStatus,
    sessionPhase,
    lastActivityMs: renderedFeed.latestMarketTime != null
      ? renderedFeed.latestMarketTime * 1000
      : seedSnapshot?.updated ?? streamData?.updated ?? null,
    hasHistory,
  });

  useEffect(() => {
    if (!shouldDebug) return;

    recordChartDiagnostic({
      event: 'chart-feed:bootstrap',
      scope: `${debugLabel}:${timeframe.key}:${resolution.key}`,
      signature: [
        effectiveBootstrap.loaded ? 'loaded' : 'loading',
        effectiveBootstrap.historyBars.length > 0 ? 'history' : 'no-history',
        effectiveBootstrap.historyError ? 'history-error' : 'history-ok',
        effectiveBootstrap.snapshot?.marketDataStatus ?? 'no-snapshot',
      ].join(':'),
      summary: {
        conid,
        loaded: effectiveBootstrap.loaded,
        historyBars: effectiveBootstrap.historyBars.length,
        historyError: effectiveBootstrap.historyError ?? null,
        snapshotStatus: effectiveBootstrap.snapshot?.marketDataStatus ?? null,
      },
      detail: {
        label: debugLabel,
        conid,
        timeframe: timeframe.key,
        resolution: resolution.key,
        loaded: effectiveBootstrap.loaded,
        historyBars: effectiveBootstrap.historyBars.length,
        historyError: effectiveBootstrap.historyError,
        snapshotPrice:
          effectiveBootstrap.snapshot?.displayPrice ??
          effectiveBootstrap.snapshot?.last ??
          null,
        snapshotStatus: effectiveBootstrap.snapshot?.marketDataStatus ?? null,
        snapshotUpdated: effectiveBootstrap.snapshot?.updated ?? null,
      },
    });
  }, [
    conid,
    debugLabel,
    effectiveBootstrap.historyBars.length,
    effectiveBootstrap.historyError,
    effectiveBootstrap.loaded,
    effectiveBootstrap.snapshot?.displayPrice,
    effectiveBootstrap.snapshot?.last,
    effectiveBootstrap.snapshot?.marketDataStatus,
    effectiveBootstrap.snapshot?.updated,
    resolution.key,
    shouldDebug,
    timeframe.key,
  ]);

  useEffect(() => {
    if (!shouldDebug) return;

    const lastBeat = effectiveBeats[effectiveBeats.length - 1] ?? null;
    recordChartDiagnostic({
      event: 'chart-feed:stream',
      scope: `${debugLabel}:${timeframe.key}:${resolution.key}`,
      signature: [
        connected ? 'connected' : 'disconnected',
        marketOpen ? 'market-open' : marketClosed ? 'market-closed' : 'market-unknown',
        effectiveMarketDataStatus,
        displayStatus,
        streamData?.chartSource ?? streamData?.displaySource ?? 'none',
        effectiveBeats.length > 0 ? 'has-beats' : 'no-beats',
      ].join(':'),
      summary: {
        conid,
        connected,
        marketOpen,
        effectiveMarketDataStatus,
        displayStatus,
        streamSource: streamData?.chartSource ?? streamData?.displaySource ?? null,
        hasBeats: effectiveBeats.length > 0,
        hasLiveFeed,
        hasRenderableLiveFeed,
        waitingForDaemonCoverage,
      },
      detail: {
        label: debugLabel,
        conid,
        connected,
        marketOpen,
        effectiveMarketDataStatus,
        displayStatus,
        streamPrice: streamData?.chartPrice ?? streamData?.displayPrice ?? streamData?.last ?? null,
        streamSource: streamData?.chartSource ?? streamData?.displaySource ?? null,
        streamUpdated: streamData?.updated ?? null,
        beatCount: effectiveBeats.length,
        contiguousBeatCount: contiguousRecentBeats.length,
        contiguousCoverageMs,
        latestContiguousBeatUpdatedMs,
        hasFreshDaemonHead,
        latestObservedLiveActivityMs,
        hasFreshObservedLiveActivity,
        hasRenderableLiveFeed,
        waitingForDaemonCoverage,
        lastBeat: lastBeat
          ? {
              timeMs: lastBeat.updatedMs,
              value: lastBeat.value,
              source: lastBeat.source,
            }
          : null,
        seedSnapshotPrice: seedSnapshot?.displayPrice ?? seedSnapshot?.last ?? null,
        seedSnapshotUpdated: seedSnapshot?.updated ?? null,
        expected: {
          liveHeadShouldUseFastestBeat: true,
          committedTailShouldLagLiveHeadWhenLive: hasLiveFeed,
        },
      },
    });
  }, [
    conid,
    connected,
    debugLabel,
    displayStatus,
    effectiveMarketDataStatus,
    hasLiveFeed,
    hasRenderableLiveFeed,
    hasFreshObservedLiveActivity,
    hasFreshDaemonHead,
    contiguousCoverageMs,
    contiguousRecentBeats.length,
    latestObservedLiveActivityMs,
    marketOpen,
    latestContiguousBeatUpdatedMs,
    seedSnapshot?.displayPrice,
    seedSnapshot?.last,
    seedSnapshot?.updated,
    shouldDebug,
    effectiveBeats.length,
    streamData?.chartPrice,
    streamData?.chartSource,
    streamData?.displayPrice,
    streamData?.displaySource,
    streamData?.last,
    streamData?.updated,
    waitingForDaemonCoverage,
  ]);

  useEffect(() => {
    if (!shouldDebug) return;

    const tail = renderedFeed.line[renderedFeed.line.length - 1] ?? null;
    const prevTail = renderedFeed.line[renderedFeed.line.length - 2] ?? null;
    recordChartDiagnostic({
      event: 'chart-feed:liveline',
      scope: `${debugLabel}:${timeframe.key}:${resolution.key}:${mode}`,
      signature: [
        mode,
        waitingForDaemonCoverage ? 'waiting-daemon' : 'ready-daemon',
        renderedFeed.line.length > 0 ? 'has-line' : 'no-line',
        renderedFeed.candles.length > 0 ? 'has-candles' : 'no-candles',
        renderedFeed.liveCandle ? 'has-live-candle' : 'no-live-candle',
        tail != null && renderedFeed.latestMarketTime != null && tail.time === renderedFeed.latestMarketTime
          ? 'tail-at-head-time'
          : 'tail-behind-head',
        tail != null && tail.value === renderedFeed.value
          ? 'tail-matches-live-value'
          : 'tail-differs-live-value',
      ].join(':'),
      summary: {
        conid,
        linePoints: renderedLineFeed.line.length,
        candles: renderedCandleFeed.candles.length,
        tailTime: tail?.time ?? null,
        tailValue: tail?.value ?? null,
        liveValue: renderedFeed.value,
        latestMarketTime: renderedFeed.latestMarketTime,
        waitingForDaemonCoverage,
      },
      detail: {
        label: debugLabel,
        conid,
        timeframe: timeframe.key,
        resolution: resolution.key,
        mode,
        linePoints: renderedLineFeed.line.length,
        candles: renderedCandleFeed.candles.length,
        liveCandle: renderedCandleFeed.liveCandle?.time ?? null,
        tail,
        prevTail,
        liveValue: renderedFeed.value,
        latestMarketTime: renderedFeed.latestMarketTime,
        waitingForDaemonCoverage,
        expected: {
          activeHeadLivesInDataAndValue: true,
          tailShouldMatchHeadWhenLive:
            tail != null && renderedFeed.latestMarketTime != null
              ? tail.value === renderedFeed.value && tail.time === renderedFeed.latestMarketTime
              : null,
        },
      },
    });
  }, [
    conid,
    debugLabel,
    renderedCandleFeed.candles.length,
    renderedFeed.latestMarketTime,
    renderedLineFeed.line,
    renderedCandleFeed.liveCandle?.time,
    renderedFeed.value,
    mode,
    resolution.key,
    shouldDebug,
    timeframe.key,
    waitingForDaemonCoverage,
  ]);

  return {
    bootstrap: effectiveBootstrap,
    snapshot: seedSnapshot,
    streamData,
    connected,
    schedule,
    scheduleState,
    effectiveMarketDataStatus,
    displayStatus,
    marketOpen,
    hasLiveFeed,
    line: renderedLineFeed.line,
    lineValue: renderedLineFeed.value,
    lineLatestMarketTime: renderedLineFeed.latestMarketTime,
    candles: renderedCandleFeed.candles,
    liveCandle: renderedCandleFeed.liveCandle,
    candleValue: renderedCandleFeed.value,
    candleLatestMarketTime: renderedCandleFeed.latestMarketTime,
    value: renderedFeed.value,
    latestMarketTime: renderedFeed.latestMarketTime,
    nowMs: feedNowMs,
    waitingForDaemonCoverage,
  };
}

function readCachedBufferedBeats(cacheKey: string): LiveBeatInput[] {
  const cached = bufferedBeatCache.get(cacheKey) ?? [];
  const cutoff = Date.now() - LIVE_BEAT_RETENTION_MS;
  const filtered = cached.filter((beat) => beat.updatedMs >= cutoff);

  if (filtered.length !== cached.length) {
    bufferedBeatCache.set(cacheKey, filtered);
  }

  return filtered;
}

function getContiguousRecentBeats(beats: LiveBeatInput[]): LiveBeatInput[] {
  if (beats.length <= 1) {
    return beats;
  }

  const sorted = [...beats].sort((left, right) => left.updatedMs - right.updatedMs);
  let startIndex = sorted.length - 1;

  for (let index = sorted.length - 2; index >= 0; index -= 1) {
    const gapMs = sorted[index + 1].updatedMs - sorted[index].updatedMs;
    if (gapMs > LIVE_HEAD_FRESHNESS_MS) {
      break;
    }
    startIndex = index;
  }

  return sorted.slice(startIndex);
}

function hasHistoryBars(
  value: ChartFeedBootstrapState | null | undefined
): value is ChartFeedBootstrapState {
  return Boolean(value && value.historyBars.length > 0);
}

function getBootstrapBaseline(
  cacheKey: string,
  current: ChartFeedBootstrapState | null | undefined
): ChartFeedBootstrapState | null {
  const cached = bootstrapCache.get(cacheKey) ?? null;
  if (hasHistoryBars(current) && hasHistoryBars(cached)) {
    return current.historyBars.length >= cached.historyBars.length ? current : cached;
  }
  if (hasHistoryBars(current)) return current;
  if (hasHistoryBars(cached)) return cached;
  return current ?? cached;
}

function resolveBootstrapState(
  cacheKey: string,
  current: ChartFeedBootstrapState,
  watchlistSnapshot: MarketDataSnapshot | null
): ChartFeedBootstrapState {
  const baseline = getBootstrapBaseline(cacheKey, current);
  if (!baseline) {
    return {
      historyBars: [],
      snapshot: watchlistSnapshot,
      historyError: null,
      loaded: false,
    };
  }

  return {
    historyBars: hasHistoryBars(current)
      ? current.historyBars
      : baseline.historyBars,
    snapshot: pickFreshestSnapshot(current.snapshot, baseline.snapshot),
    historyError: current.historyBars.length === 0
      ? current.historyError ?? baseline.historyError
      : current.historyError,
    loaded: current.loaded || baseline.loaded,
  };
}

function mergeBootstrapSuccess(
  result: ChartFeedBootstrapState,
  baseline: ChartFeedBootstrapState | null,
  fallbackSnapshot: MarketDataSnapshot | null
): ChartFeedBootstrapState {
  if (result.historyBars.length > 0) {
    return {
      historyBars: result.historyBars,
      snapshot: pickFreshestSnapshot(
        result.snapshot,
        baseline?.snapshot ?? fallbackSnapshot
      ),
      historyError: result.historyError,
      loaded: true,
    };
  }

  if (hasHistoryBars(baseline)) {
    return {
      historyBars: baseline.historyBars,
      snapshot: pickFreshestSnapshot(result.snapshot, baseline.snapshot),
      historyError: result.historyError ?? baseline.historyError,
      loaded: true,
    };
  }

  return {
    historyBars: [],
    snapshot: pickFreshestSnapshot(result.snapshot, fallbackSnapshot),
    historyError: result.historyError,
    loaded: true,
  };
}

function mergeBootstrapError(
  errorMessage: string,
  baseline: ChartFeedBootstrapState | null,
  fallbackSnapshot: MarketDataSnapshot | null
): ChartFeedBootstrapState {
  if (hasHistoryBars(baseline)) {
    return {
      historyBars: baseline.historyBars,
      snapshot: pickFreshestSnapshot(baseline.snapshot, fallbackSnapshot),
      historyError: errorMessage,
      loaded: true,
    };
  }

  return {
    historyBars: [],
    snapshot: fallbackSnapshot,
    historyError: errorMessage,
    loaded: true,
  };
}

function isChartBootstrapResponse(value: unknown): value is ChartBootstrapResponse {
  return (
    typeof value === 'object' &&
    value != null &&
    'conid' in value &&
    'historyBars' in value
  );
}

function toSnapshotFromWatchlist(
  price: ReturnType<typeof useWatchlistStore.getState>['prices'][number] | null
): MarketDataSnapshot | null {
  if (!price) return null;

  return {
    conid: 0,
    last: price.last,
    displayPrice: price.displayPrice,
    displayChange: price.displayChange,
    displayChangePct: price.displayChangePct,
    displaySource: price.displaySource,
    symbol: '',
    companyName: '',
    mdAvailability: price.mdAvailability,
    marketDataStatus: price.marketDataStatus,
    bid: price.bid,
    bidSize: price.bidSize,
    ask: price.ask,
    askSize: price.askSize,
    change: price.change,
    changePct: price.changePct,
    volume: price.volume,
    dayLow: price.dayLow,
    dayHigh: price.dayHigh,
    open: price.open,
    prevClose: price.prevClose,
    updated: price.updated,
    hasLiveData: price.hasLiveData,
  };
}

function pickFreshestSnapshot(
  primary: MarketDataSnapshot | null,
  secondary: MarketDataSnapshot | null
): MarketDataSnapshot | null {
  if (!primary) return secondary;
  if (!secondary) return primary;
  return secondary.updated > primary.updated ? secondary : primary;
}

function mergeLiveBeats(
  primary: LiveBeatInput[],
  secondary: LiveBeatInput[]
): LiveBeatInput[] {
  const merged = new Map<string, LiveBeatInput>();

  for (const beat of [...primary, ...secondary]) {
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
  const latestBeat = beats[beats.length - 1] ?? null;
  if (!latestBeat) return current;
  if (!current) return latestBeat;
  return latestBeat.updatedMs >= current.updatedMs ? latestBeat : current;
}

function getChartFeedCacheKey({
  conid,
  timeframeKey,
}: ChartFeedCacheIdentity): string {
  return `${conid}:${timeframeKey}`;
}

function shouldReuseBootstrap(cacheKey: string): boolean {
  const cached = bootstrapCache.get(cacheKey);
  const cachedAt = bootstrapFetchedAt.get(cacheKey) ?? 0;

  return Boolean(
    cached?.loaded &&
      cached.historyBars.length > 0 &&
      Date.now() - cachedAt < BOOTSTRAP_REUSE_MS
  );
}

async function requestBootstrapFromRoute({
  conid,
  timeframeKey,
  resolutionKey,
}: ChartFeedCacheIdentity): Promise<ChartFeedBootstrapPayload> {
  const res = await fetch(
    `/api/ibkr/chart-feed?conid=${conid}&timeframe=${timeframeKey}&resolution=${resolutionKey}`,
    { cache: 'no-store' }
  );
  const payload = (await res.json()) as ChartBootstrapResponse | { error?: string };
  if (!res.ok) {
    throw new Error(
      typeof payload === 'object' && payload && 'error' in payload
        ? String(payload.error || 'Chart bootstrap failed')
        : 'Chart bootstrap failed'
    );
  }
  if (!isChartBootstrapResponse(payload)) {
    throw new Error('Chart bootstrap failed');
  }

  return {
    state: {
      historyBars: Array.isArray(payload.historyBars) ? payload.historyBars : [],
      snapshot: payload.snapshot ?? null,
      historyError: payload.historyError ?? null,
      loaded: true,
    } satisfies ChartFeedBootstrapState,
    liveBeats: Array.isArray(payload.liveBeats)
      ? payload.liveBeats
          .filter((beat) => {
            return (
              beat &&
              typeof beat === 'object' &&
              Number.isFinite(beat.timeMs) &&
              Number.isFinite(beat.value)
            );
          })
          .map((beat) => ({
            updatedMs: beat.timeMs,
            value: beat.value,
            source: beat.source,
          }))
      : [],
  };
}

async function loadBootstrapIntoCache({
  conid,
  timeframeKey,
  resolutionKey,
  fallbackSnapshot = null,
}: ChartFeedBootstrapRequest): Promise<ChartFeedBootstrapState> {
  const cacheKey = getChartFeedCacheKey({ conid, timeframeKey, resolutionKey });

  if (shouldReuseBootstrap(cacheKey)) {
    return bootstrapCache.get(cacheKey)!;
  }

  const existing = inflightBootstrap.get(cacheKey);
  const request =
    existing ??
    requestBootstrapFromRoute({ conid, timeframeKey, resolutionKey });

  if (!existing) {
    inflightBootstrap.set(cacheKey, request);
  }

  try {
    const result = await request;
    const baseline = getBootstrapBaseline(cacheKey, bootstrapCache.get(cacheKey));
    const next = mergeBootstrapSuccess(result.state, baseline, fallbackSnapshot);
    if (result.liveBeats.length > 0) {
      const existingBeats = bufferedBeatCache.get(cacheKey) ?? [];
      bufferedBeatCache.set(
        cacheKey,
        mergeLiveBeats(existingBeats, result.liveBeats)
      );
    }
    bootstrapCache.set(cacheKey, next);
    bootstrapFetchedAt.set(cacheKey, Date.now());
    return next;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Chart bootstrap failed';
    const baseline = getBootstrapBaseline(cacheKey, bootstrapCache.get(cacheKey));
    const next = mergeBootstrapError(errorMessage, baseline, fallbackSnapshot);
    bootstrapCache.set(cacheKey, next);
    bootstrapFetchedAt.set(cacheKey, Date.now());
    return next;
  } finally {
    inflightBootstrap.delete(cacheKey);
  }
}

function shouldReuseConidHydration(conid: number): boolean {
  const hydratedAt = conidHydratedAt.get(String(conid)) ?? 0;
  return Date.now() - hydratedAt < BOOTSTRAP_REUSE_MS;
}

async function requestConidBootstrapCache(
  conid: number
): Promise<ChartFeedCacheWarmResponse> {
  const res = await fetch(`/api/ibkr/chart-feed/cache?conid=${conid}`, {
    cache: 'no-store',
  });
  const payload = (await res.json()) as ChartFeedCacheWarmResponse | { error?: string };

  if (!res.ok) {
    throw new Error(
      typeof payload === 'object' && payload && 'error' in payload
        ? String(payload.error || 'Chart cache warm failed')
        : 'Chart cache warm failed'
    );
  }

  if (
    !payload ||
    typeof payload !== 'object' ||
    !Array.isArray((payload as ChartFeedCacheWarmResponse).entries)
  ) {
    throw new Error('Chart cache warm failed');
  }

  return payload as ChartFeedCacheWarmResponse;
}

async function hydrateConidBootstrapCache(
  conid: number,
  fallbackSnapshot: MarketDataSnapshot | null
): Promise<void> {
  const conidKey = String(conid);
  if (shouldReuseConidHydration(conid)) {
    return;
  }

  const existing = inflightConidHydration.get(conidKey);
  if (existing) {
    return existing;
  }

  const request = (async () => {
    const payload = await requestConidBootstrapCache(conid);

    for (const entry of payload.entries) {
      const cacheKey = getChartFeedCacheKey({
        conid,
        timeframeKey: entry.timeframeKey,
        resolutionKey: '',
      });
      const baseline = getBootstrapBaseline(cacheKey, bootstrapCache.get(cacheKey));
      const next = mergeBootstrapSuccess(
        {
          historyBars: Array.isArray(entry.historyBars) ? entry.historyBars : [],
          snapshot: fallbackSnapshot,
          historyError: entry.historyError ?? null,
          loaded: true,
        },
        baseline,
        fallbackSnapshot
      );
      bootstrapCache.set(cacheKey, next);
      bootstrapFetchedAt.set(cacheKey, Date.now());
    }

    conidHydratedAt.set(conidKey, Date.now());
  })();

  inflightConidHydration.set(conidKey, request);

  try {
    await request;
  } finally {
    inflightConidHydration.delete(conidKey);
  }
}
