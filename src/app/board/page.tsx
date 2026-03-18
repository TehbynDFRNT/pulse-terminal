'use client';

import { useState } from 'react';
import { PulseNav } from '@/components/PulseNav';
import { BoardWorkspace } from '@/components/dashboard/BoardWorkspace';
import { BoardWatchlistSidecart } from '@/components/dashboard/BoardWatchlistSidecart';

export default function BoardPage() {
  const [watchlistOpen, setWatchlistOpen] = useState(false);

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
      <PulseNav />
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <BoardWorkspace
          watchlistOpen={watchlistOpen}
          onToggleWatchlist={() => setWatchlistOpen((open) => !open)}
        />
        <BoardWatchlistSidecart
          open={watchlistOpen}
          onClose={() => setWatchlistOpen(false)}
        />
      </div>
    </div>
  );
}
