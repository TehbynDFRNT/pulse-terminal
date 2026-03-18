'use client';

import { PanelLeftClose } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Watchlist } from '@/components/Watchlist';
import { cn } from '@/lib/utils';

interface BoardWatchlistSidecartProps {
  open: boolean;
  onClose: () => void;
}

export function BoardWatchlistSidecart({
  open,
  onClose,
}: BoardWatchlistSidecartProps) {
  return (
    <div className="pointer-events-none absolute inset-y-0 left-0 z-30 flex">
      <aside
        className={cn(
          'pulse-app-shadow pointer-events-auto flex h-full w-[320px] max-w-[88vw] flex-col border-r border-border/80 bg-card transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border/60 px-3 py-2">
          <div className="text-[10px] uppercase tracking-[0.24em] text-muted-foreground">
            Watchlist
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={onClose}
            aria-label="Close watchlist"
            title="Close watchlist"
          >
            <PanelLeftClose className="h-3.5 w-3.5" />
          </Button>
        </div>
        <div className="min-h-0 flex-1">
          <Watchlist />
        </div>
      </aside>
    </div>
  );
}
