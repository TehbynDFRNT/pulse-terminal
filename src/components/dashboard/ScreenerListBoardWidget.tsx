'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { BoardWidgetCard } from '@/components/dashboard/BoardWidgetCard';
import { Button } from '@/components/ui/button';
import { runScanner, type ScannerResult } from '@/lib/ibkr/gateway-client';
import type { ScreenerListBoardWidget as ScreenerListWidget } from '@/lib/dashboard/widgets';

interface ScreenerListBoardWidgetProps {
  widget: ScreenerListWidget;
  onRemove: (id: string) => void;
  onEdit: (id: string) => void;
}

const REFRESH_INTERVAL_MS = 60_000;

function formatPrice(value?: number) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return '—';
  const safeValue = value;
  if (safeValue >= 1000) {
    return safeValue.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
  if (safeValue >= 100) return safeValue.toFixed(2);
  return safeValue.toFixed(4);
}

function formatScanValue(result: ScannerResult) {
  if (result.scanValue) return result.scanValue;
  if (result.displayChangePct) return result.displayChangePct;
  return '—';
}

export function ScreenerListBoardWidget({
  widget,
  onRemove,
  onEdit,
}: ScreenerListBoardWidgetProps) {
  const [results, setResults] = useState<ScannerResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (document.visibilityState === 'hidden') return;

      setLoading(true);
      setError('');
      try {
        const next = await runScanner({
          instrument: widget.instrument,
          location: widget.location,
          scanType: widget.scanType,
        });
        if (cancelled) return;
        setResults(next.slice(0, widget.limit));
        setLastLoadedAt(Date.now());
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Scanner widget failed');
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();
    const interval = window.setInterval(() => {
      void load();
    }, REFRESH_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [widget.instrument, widget.limit, widget.location, widget.scanType]);

  const subtitle = useMemo(() => {
    const parts = [
      widget.instrumentLabel,
      widget.scanLabel,
      widget.locationLabel,
      `${widget.limit} rows`,
    ];
    if (lastLoadedAt) {
      parts.push(`updated ${new Date(lastLoadedAt).toLocaleTimeString()}`);
    }
    return parts.join(' · ');
  }, [
    lastLoadedAt,
    widget.instrumentLabel,
    widget.limit,
    widget.locationLabel,
    widget.scanLabel,
  ]);

  return (
    <BoardWidgetCard
      title={widget.title}
      subtitle={subtitle}
      actions={
        <Button
          type="button"
          size="icon-xs"
          variant="ghost"
          onClick={() => {
            setLastLoadedAt(null);
            setResults([]);
            setError('');
            setLoading(true);
            void runScanner({
              instrument: widget.instrument,
              location: widget.location,
              scanType: widget.scanType,
            })
              .then((next) => {
                setResults(next.slice(0, widget.limit));
                setLastLoadedAt(Date.now());
              })
              .catch((err) => {
                setError(err instanceof Error ? err.message : 'Scanner widget failed');
              })
              .finally(() => setLoading(false));
          }}
          aria-label={`Refresh ${widget.title}`}
        >
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      }
      onEdit={() => onEdit(widget.id)}
      onRemove={() => onRemove(widget.id)}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-auto">
          {loading && results.length === 0 ? (
            <div className="flex h-full items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading scanner widget
            </div>
          ) : error ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-destructive">
              {error}
            </div>
          ) : results.length === 0 ? (
            <div className="flex h-full items-center justify-center px-4 text-center text-xs text-muted-foreground">
              No scanner rows returned for this configuration.
            </div>
          ) : (
            <table className="w-full table-fixed border-collapse text-left font-mono text-xs">
              <colgroup>
                <col className="w-[4.25rem]" />
                <col />
                <col className="w-[6.5rem]" />
                <col className="w-[7.5rem]" />
              </colgroup>
              <thead className="sticky top-0 bg-card/95 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
                <tr>
                  <th className="pl-3 pr-2 py-2 font-medium">Rank</th>
                  <th className="px-2 py-2 font-medium">Symbol</th>
                  <th className="px-2 py-2 text-right font-medium">Price</th>
                  <th className="pl-2 pr-3 py-2 text-right font-medium">{widget.scanLabel}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((result) => (
                  <tr key={`${result.conid}:${result.rank}`} className="border-t border-border/50">
                    <td className="pl-3 pr-2 py-2 text-muted-foreground">{result.rank + 1}</td>
                    <td className="px-2 py-2">
                      <div className="truncate text-foreground">{result.symbol}</div>
                      <div className="truncate text-[10px] text-muted-foreground">
                        {result.contractDescription || result.exchange}
                      </div>
                    </td>
                    <td className="px-2 py-2 text-right text-foreground">
                      {formatPrice(result.displayPrice)}
                    </td>
                    <td className="pl-2 pr-3 py-2 text-right text-foreground">
                      {formatScanValue(result)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </BoardWidgetCard>
  );
}
