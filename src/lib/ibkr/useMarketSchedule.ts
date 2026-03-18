'use client';

import { useMemo } from 'react';
import { useMarketSchedules } from './useMarketSchedules';

export function useMarketSchedule(conid: number | null | undefined, exchange?: string) {
  const instruments = useMemo(
    () => (conid ? [{ conid, exchange }] : []),
    [conid, exchange]
  );
  const { schedules, states, loading } = useMarketSchedules(instruments);

  return {
    schedule: conid ? (schedules[conid] ?? null) : null,
    state: conid ? (states[conid] ?? null) : null,
    loading,
    error: null,
  };
}
