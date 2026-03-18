'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { ScreenerDialog } from '@/components/ScreenerDialog';
import { Input } from '@/components/ui/input';
import { normalizeInstrument } from '@/lib/ibkr/normalize-instrument';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { searchInstruments, type SearchResult } from '@/lib/ibkr/gateway-client';
import { sanitizeInstrumentSearchQuery } from '@/lib/ibkr/search-query';

export function SearchBar() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const addItem = useWatchlistStore((s) => s.addItem);
  const selectInstrument = useWatchlistStore((s) => s.selectInstrument);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const search = useCallback(async (q: string) => {
    const sanitized = sanitizeInstrumentSearchQuery(q);
    if (!sanitized) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const data = await searchInstruments(sanitized);
      setResults(data);
      setIsOpen(true);
      setSelectedIndex(0);
    } catch {
      setResults([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleInput = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(value), 200);
  };

  const handleAdd = (result: SearchResult) => {
    const normalized = normalizeInstrument({
      conid: result.conid,
      symbol: result.symbol,
      name: result.name,
      exchange: result.exchange,
      type: result.type,
    });
    addItem(normalized);
    selectInstrument(normalized.conid);
    setQuery('');
    setIsOpen(false);
    setResults([]);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen || results.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      handleAdd(results[selectedIndex]);
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  // Keyboard shortcut: / to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && !e.ctrlKey && !e.metaKey) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Click outside to close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node) &&
        !inputRef.current?.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="flex w-full items-start gap-2">
      <div className="relative min-w-0 flex-1">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => handleInput(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => results.length > 0 && setIsOpen(true)}
            placeholder=""
            className="pl-9 pr-8 bg-secondary border-border font-mono text-sm h-9"
          />
          {query && (
            <button
              onClick={() => {
                setQuery('');
                setIsOpen(false);
                setResults([]);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {isOpen && (
          <div
            ref={dropdownRef}
            className="absolute left-0 top-full z-50 mt-1 min-w-full w-max max-w-[calc(100vw-1rem)] overflow-hidden rounded-md border border-border bg-card shadow-xl"
          >
            {isLoading && (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                Searching...
              </div>
            )}
            {!isLoading && results.length === 0 && query.length > 0 && (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                No results for &quot;{query}&quot;
              </div>
            )}
            <div className="max-h-80 overflow-auto">
              {results.map((result, i) => (
                <button
                  key={`${result.conid}-${result.symbol || result.name}-${result.exchange}-${i}`}
                  onClick={() => handleAdd(result)}
                  className={`flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-accent ${
                    i === selectedIndex ? 'bg-accent' : ''
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <span
                        className="font-mono text-sm font-semibold"
                        title={
                          result.contractDisplay && result.underlyingSymbol
                            ? `${result.name} · ${result.symbol}`
                            : result.name
                        }
                      >
                        {result.underlyingSymbol || result.symbol}
                      </span>
                      {result.contractDisplay && (
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-xs text-emerald-600 dark:text-emerald-400">
                          {result.contractDisplay}
                        </span>
                      )}
                      <span className="rounded bg-secondary px-1.5 py-0.5 text-xs text-muted-foreground">
                        {result.type}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {result.exchange}
                      </span>
                    </div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">
                      {result.contractDisplay && result.underlyingSymbol
                        ? `${result.name} · ${result.symbol}`
                        : result.name}
                    </div>
                  </div>
                  <Plus className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <ScreenerDialog
        onAdd={handleAdd}
        triggerClassName="h-9 border-border bg-secondary px-3 font-mono text-xs uppercase tracking-wider text-muted-foreground hover:text-foreground"
      />
    </div>
  );
}
