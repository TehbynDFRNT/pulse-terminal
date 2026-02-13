'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Search, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { useWatchlistStore } from '@/lib/store/watchlist';
import type { SearchResult } from '@/lib/ibkr/types';

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
    if (q.length < 1) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/ibkr/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as SearchResult[];
      setResults(Array.isArray(data) ? data : []);
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
    addItem({
      conid: result.conid,
      symbol: result.symbol,
      name: result.name,
      exchange: result.exchange,
      type: result.type,
    });
    selectInstrument(result.conid);
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
    <div className="relative flex-1 max-w-xl">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => handleInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search instruments... (press /)"
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
          className="absolute top-full mt-1 w-full bg-card border border-border rounded-md shadow-xl z-50 max-h-80 overflow-auto"
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
          {results.map((result, i) => (
            <button
              key={result.conid}
              onClick={() => handleAdd(result)}
              className={`w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-accent transition-colors ${
                i === selectedIndex ? 'bg-accent' : ''
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-sm">
                    {result.symbol}
                  </span>
                  <span className="text-xs text-muted-foreground px-1.5 py-0.5 bg-secondary rounded">
                    {result.type}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {result.exchange}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground truncate mt-0.5">
                  {result.name}
                </div>
              </div>
              <Plus className="h-4 w-4 text-muted-foreground ml-2 flex-shrink-0" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
