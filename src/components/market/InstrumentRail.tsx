'use client';

import { SearchBar } from '@/components/SearchBar';
import { Watchlist } from '@/components/Watchlist';

export const INSTRUMENT_RAIL_WIDTH_CLASS = 'w-[300px]';

export function InstrumentRail() {
  return (
    <aside
      className={`${INSTRUMENT_RAIL_WIDTH_CLASS} flex min-h-0 shrink-0 flex-col border-r border-border/80 bg-card`}
    >
      <div className="shrink-0 border-b border-border/60 px-3 py-2">
        <SearchBar />
      </div>
      <div className="flex-1 min-h-0">
        <Watchlist />
      </div>
    </aside>
  );
}
