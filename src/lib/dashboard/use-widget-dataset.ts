'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { WidgetDataset } from '@/lib/dashboard/dataset-types';
import {
  buildBoardDatasetUrl,
  type BoardDatasetKey,
  type BoardDatasetQuery,
} from '@/lib/dashboard/widget-datasets';

interface UseWidgetDatasetOptions {
  key: BoardDatasetKey;
  params?: BoardDatasetQuery;
  enabled?: boolean;
  refreshIntervalMs?: number;
}

interface UseWidgetDatasetState {
  data: WidgetDataset | null;
  error: string;
  loading: boolean;
  reload: () => void;
}

export function useWidgetDataset({
  key,
  params = {},
  enabled = true,
  refreshIntervalMs,
}: UseWidgetDatasetOptions): UseWidgetDatasetState {
  const [data, setData] = useState<WidgetDataset | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reloadCount, setReloadCount] = useState(0);

  const serializedParams = useMemo(() => JSON.stringify(params), [params]);
  const url = useMemo(
    () => buildBoardDatasetUrl(key, JSON.parse(serializedParams) as BoardDatasetQuery),
    [key, serializedParams]
  );

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let intervalId: number | null = null;

    async function load() {
      setLoading(true);
      setError('');

      try {
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { Accept: 'application/json' },
          cache: 'no-store',
        });
        const payload = await response.json();

        if (!response.ok) {
          const detail =
            typeof payload?.error === 'string'
              ? payload.error
              : `Dataset request failed with HTTP ${response.status}`;
          throw new Error(detail);
        }

        setData(payload as WidgetDataset);
      } catch (err) {
        if (controller.signal.aborted) return;
        setError(err instanceof Error ? err.message : 'Dataset request failed');
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    if (refreshIntervalMs && refreshIntervalMs > 0) {
      intervalId = window.setInterval(() => {
        void load();
      }, refreshIntervalMs);
    }

    return () => {
      controller.abort();
      if (intervalId !== null) {
        window.clearInterval(intervalId);
      }
    };
  }, [enabled, refreshIntervalMs, reloadCount, url]);

  return {
    data,
    error,
    loading,
    reload,
  };
}
