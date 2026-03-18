'use client';

import { useEffect, useMemo, useState } from 'react';
import { deriveMarketScheduleState } from './market-schedule';
import { getMarketSchedules } from './gateway-client';
import type { MarketSchedule } from './types';

const MARKET_SCHEDULE_TTL_MS = 30 * 60 * 1000;

const scheduleCache = new Map<
  string,
  {
    data: MarketSchedule;
    timestamp: number;
  }
>();
const inflightRequests = new Map<string, Promise<MarketSchedule>>();

function getCacheKey(conid: number, exchange?: string) {
  return `${conid}:${exchange ?? ''}`;
}

function getCachedEntry(conid: number, exchange?: string) {
  return scheduleCache.get(getCacheKey(conid, exchange)) ?? null;
}

function isFresh(conid: number, exchange?: string) {
  const cached = getCachedEntry(conid, exchange);
  return cached != null && Date.now() - cached.timestamp <= MARKET_SCHEDULE_TTL_MS;
}

export function useMarketSchedules(
  instruments: Array<{ conid: number; exchange?: string }>
) {
  const instrumentsKey = instruments
    .map((instrument) => `${instrument.conid}:${instrument.exchange ?? ''}`)
    .join('|');

  const normalized = useMemo(() => {
    const seen = new Set<string>();
    return instruments.filter((instrument) => {
      if (!Number.isFinite(instrument.conid) || instrument.conid <= 0) return false;
      const key = getCacheKey(instrument.conid, instrument.exchange);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [instrumentsKey]);

  const [schedules, setSchedules] = useState<Record<number, MarketSchedule>>({});
  const [loading, setLoading] = useState(false);
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const nextSchedules: Record<number, MarketSchedule> = {};
    for (const instrument of normalized) {
      const cached = getCachedEntry(instrument.conid, instrument.exchange);
      if (cached) {
        nextSchedules[instrument.conid] = cached.data;
      }
    }
    setSchedules(nextSchedules);
  }, [normalized]);

  useEffect(() => {
    if (normalized.length === 0) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const missing = normalized.filter(
      (instrument) => !isFresh(instrument.conid, instrument.exchange)
    );

    const fetchMissing = async () => {
      if (missing.length === 0) return;
      setLoading(true);

      try {
        const uncached = missing.filter(
          (instrument) => !inflightRequests.has(getCacheKey(instrument.conid, instrument.exchange))
        );

        if (uncached.length > 0) {
          const batchPromise = getMarketSchedules(uncached);
          uncached.forEach((instrument, index) => {
            inflightRequests.set(
              getCacheKey(instrument.conid, instrument.exchange),
              batchPromise.then((results) => results[index]!)
            );
          });

          const batchResults = await batchPromise;
          batchResults.forEach((schedule) => {
            scheduleCache.set(getCacheKey(schedule.conid, schedule.exchange ?? undefined), {
              data: schedule,
              timestamp: Date.now(),
            });
          });
        } else {
          await Promise.all(
            missing.map((instrument) =>
              inflightRequests.get(getCacheKey(instrument.conid, instrument.exchange))
            )
          );
        }

        if (cancelled) return;

        const nextSchedules: Record<number, MarketSchedule> = {};
        for (const instrument of normalized) {
          const cached = getCachedEntry(instrument.conid, instrument.exchange);
          if (cached) {
            nextSchedules[instrument.conid] = cached.data;
          }
        }
        setSchedules(nextSchedules);
        setNowMs(Date.now());
      } catch {
        // Keep whatever cached data we already had; consumers degrade gracefully.
      } finally {
        missing.forEach((instrument) => {
          inflightRequests.delete(getCacheKey(instrument.conid, instrument.exchange));
        });
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void fetchMissing();

    const refreshOnFocus = () => {
      if (document.visibilityState === 'hidden') return;
      setNowMs(Date.now());
    };

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);

    return () => {
      cancelled = true;
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, [normalized]);

  const states = useMemo(() => {
    const next: Record<number, ReturnType<typeof deriveMarketScheduleState>> = {};
    for (const instrument of normalized) {
      const schedule = schedules[instrument.conid];
      if (!schedule) continue;
      next[instrument.conid] = deriveMarketScheduleState(schedule, nowMs);
    }
    return next;
  }, [normalized, nowMs, schedules]);

  useEffect(() => {
    const nextChangeCandidates = Object.values(states)
      .map((state) => state.nextChangeAt)
      .filter((value): value is number => value != null);
    if (nextChangeCandidates.length === 0) return;

    const soonest = Math.min(...nextChangeCandidates);
    const delayMs = Math.max(250, soonest - Date.now() + 1000);
    const timer = window.setTimeout(() => {
      setNowMs(Date.now());
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [states]);

  return {
    schedules,
    states,
    loading,
  };
}
