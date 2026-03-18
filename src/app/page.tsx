'use client';

import { PulseNav } from '@/components/PulseNav';
import { InstrumentDetail } from '@/components/InstrumentDetail';
import { InstrumentRail } from '@/components/market/InstrumentRail';
import { useWatchlistStore } from '@/lib/store/watchlist';

export default function Terminal() {
  const selectedConid = useWatchlistStore((s) => s.selectedConid);

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-background">
      <PulseNav />

      {/* Main content */}
      <div className="flex min-h-0 h-[calc(100vh-40px)] pb-10">
        <InstrumentRail />

        {/* Center: Instrument detail + order panel */}
        <div className="flex-1 flex flex-col min-w-0">
          <div className="flex-1 min-h-0 overflow-hidden">
            {selectedConid ? (
              <InstrumentDetail />
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    Select an instrument from the watchlist
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground/80">
                    or search for one above
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
