'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Loader2, Plus, Search, SlidersHorizontal, Trash2 } from 'lucide-react';
import { MarketSessionText } from '@/components/market/MarketSessionText';
import { MarketStatusBadge } from '@/components/market/MarketStatus';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { deriveScannerDisplayStatus } from '@/lib/ibkr/display-status';
import {
  getCompactScannerParams,
  searchInstruments,
  runScanner,
  type ScannerParams,
  type ScannerResult,
  type SearchResult,
} from '@/lib/ibkr/gateway-client';
import { useMarketSchedules } from '@/lib/ibkr/useMarketSchedules';
import { useNow } from '@/lib/useNow';

interface ScreenerDialogProps {
  onAdd: (result: SearchResult) => void;
  triggerClassName?: string;
  triggerLabel?: string;
}

interface FilterRowState {
  id: string;
  code: string;
  value: string;
}

const LOOKUP_FILTER_ALL = '__ALL__';

const LOOKUP_TYPE_LABELS: Record<string, string> = {
  STK: 'Stocks',
  ETF: 'ETFs',
  FUT: 'Futures',
  CASH: 'FX',
  CRYPTO: 'Crypto',
  CMDTY: 'Commodities',
  IND: 'Indices',
  OPT: 'Options',
  WAR: 'Warrants',
  BOND: 'Bonds',
  CFD: 'CFDs',
  FUND: 'Funds',
};

function inferLookupSecType(instrument: string): string {
  const normalized = instrument.trim().toUpperCase();
  if (!normalized) return '';

  const root = normalized.split(/[.:]/)[0] ?? normalized;
  if (root.startsWith('FUT')) return 'FUT';
  if (root.startsWith('STK')) return 'STK';
  if (root.startsWith('IND')) return 'IND';
  if (root.startsWith('CASH') || root.startsWith('FOREX')) return 'CASH';
  if (root.startsWith('BOND')) return 'BOND';
  if (root.startsWith('CMDTY')) return 'CMDTY';
  if (root.startsWith('CRYPTO')) return 'CRYPTO';
  if (root.startsWith('OPT')) return 'OPT';
  if (root.startsWith('WAR')) return 'WAR';
  if (root.startsWith('CFD')) return 'CFD';
  return '';
}

function getLookupTypeLabel(type: string): string {
  return LOOKUP_TYPE_LABELS[type] ?? type;
}

function buildLookupTypeOptions(results: SearchResult[]) {
  const types = new Set<string>(Object.keys(LOOKUP_TYPE_LABELS));
  for (const result of results) {
    const type = result.type?.trim().toUpperCase();
    if (type) types.add(type);
  }
  return [
    { code: LOOKUP_FILTER_ALL, label: 'All Types' },
    ...Array.from(types)
      .sort((left, right) => getLookupTypeLabel(left).localeCompare(getLookupTypeLabel(right)))
      .map((type) => ({
        code: type,
        label: getLookupTypeLabel(type),
      })),
  ];
}

function buildLookupExchangeOptions(results: SearchResult[]) {
  const exchanges = Array.from(
    new Set(
      results
        .map((result) => result.exchange?.trim())
        .filter((exchange): exchange is string => Boolean(exchange))
    )
  ).sort((left, right) => left.localeCompare(right));

  return [
    { code: LOOKUP_FILTER_ALL, label: 'All Venues' },
    ...exchanges.map((exchange) => ({
      code: exchange,
      label: exchange,
    })),
  ];
}

function NativeSelect({
  value,
  onChange,
  options,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ code: string; label: string }>;
  placeholder: string;
}) {
  return (
    <Select
      value={value || undefined}
      onValueChange={onChange}
    >
      <SelectTrigger className="h-9 w-full border-border bg-background font-mono text-sm text-foreground">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent
        align="start"
        className="max-h-72 border-border bg-popover text-popover-foreground"
      >
        {options.map((option) => (
          <SelectItem
            key={option.code}
            value={option.code}
            className="font-mono text-sm"
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ScreenerDialog({
  onAdd,
  triggerClassName,
  triggerLabel = 'Screener',
}: ScreenerDialogProps) {
  const [viewMode, setViewMode] = useState<'scanner' | 'lookup'>('scanner');
  const [open, setOpen] = useState(false);
  const [params, setParams] = useState<ScannerParams | null>(null);
  const [paramsLoading, setParamsLoading] = useState(false);
  const [paramsError, setParamsError] = useState('');
  const [instrument, setInstrument] = useState('');
  const [location, setLocation] = useState('');
  const [scanType, setScanType] = useState('');
  const [filters, setFilters] = useState<FilterRowState[]>([]);
  const [results, setResults] = useState<ScannerResult[]>([]);
  const [runLoading, setRunLoading] = useState(false);
  const [runError, setRunError] = useState('');
  const [loadedInstrument, setLoadedInstrument] = useState('');
  const [lookupQuery, setLookupQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<SearchResult[]>([]);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [lookupTypeFilter, setLookupTypeFilter] = useState(LOOKUP_FILTER_ALL);
  const [lookupExchangeFilter, setLookupExchangeFilter] = useState(LOOKUP_FILTER_ALL);
  const [lookupSubmittedQuery, setLookupSubmittedQuery] = useState('');
  const idBase = useId();
  const paramsRequestIdRef = useRef(0);

  const loadParams = useCallback(async (nextInstrument: string) => {
    const requestId = ++paramsRequestIdRef.current;
    setParamsLoading(true);
    setParamsError('');
    try {
      const data = await getCompactScannerParams(nextInstrument);
      if (paramsRequestIdRef.current !== requestId) return;
      setParams(data);
      setLoadedInstrument(nextInstrument);
    } catch (err) {
      if (paramsRequestIdRef.current !== requestId) return;
      setParamsError(err instanceof Error ? err.message : 'Failed to load scanner params');
    } finally {
      if (paramsRequestIdRef.current === requestId) {
        setParamsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (!open || viewMode !== 'scanner' || paramsLoading) return;
    if (!params) {
      void loadParams(instrument || 'STK');
    }
  }, [instrument, loadParams, open, params, paramsLoading, viewMode]);

  useEffect(() => {
    if (
      !open ||
      viewMode !== 'scanner' ||
      !instrument ||
      instrument === loadedInstrument ||
      paramsLoading
    ) {
      return;
    }
    void loadParams(instrument);
  }, [instrument, loadedInstrument, loadParams, open, paramsLoading, viewMode]);

  const availableInstruments = params?.instruments ?? [];
  const availableLocations = params?.locations ?? [];
  const availableScanTypes = params?.scanTypes ?? [];
  const availableFilters = params?.filters ?? [];

  useEffect(() => {
    if (!params || instrument) return;
    setInstrument(loadedInstrument || (params.instruments[0]?.code ?? 'STK'));
  }, [instrument, loadedInstrument, params]);

  useEffect(() => {
    if (!params || !instrument) return;

    if (!availableLocations.some((option) => option.code === location)) {
      setLocation(availableLocations[0]?.code ?? '');
    }

    if (!availableScanTypes.some((option) => option.code === scanType)) {
      setScanType(availableScanTypes[0]?.code ?? '');
    }

    setFilters((current) =>
      current.filter((filter) =>
        availableFilters.some((option) => option.code === filter.code)
      )
    );
  }, [
    availableFilters,
    availableLocations,
    availableScanTypes,
    instrument,
    location,
    params,
    scanType,
  ]);

  const addFilter = () => {
    const nextOption = availableFilters.find(
      (option) => !filters.some((filter) => filter.code === option.code)
    ) ?? availableFilters[0];

    if (!nextOption) return;

    setFilters((current) => [
      ...current,
      {
        id: `${idBase}-${current.length}-${nextOption.code}`,
        code: nextOption.code,
        value: '',
      },
    ]);
  };

  const updateFilter = (id: string, patch: Partial<FilterRowState>) => {
    setFilters((current) =>
      current.map((filter) => (filter.id === id ? { ...filter, ...patch } : filter))
    );
  };

  const removeFilter = (id: string) => {
    setFilters((current) => current.filter((filter) => filter.id !== id));
  };

  const executeScan = async () => {
    if (!instrument || !location || !scanType) return;

    setRunLoading(true);
    setRunError('');
    try {
      const data = await runScanner({
        instrument,
        location,
        scanType,
        filters: filters
          .filter((filter) => filter.code && filter.value.trim() !== '')
          .map((filter) => ({
            code: filter.code,
            value: filter.value.trim(),
          })),
      });
      setResults(data);
    } catch (err) {
      setRunError(err instanceof Error ? err.message : 'Scanner run failed');
      setResults([]);
    } finally {
      setRunLoading(false);
    }
  };

  const executeLookup = async () => {
    if (!lookupQuery.trim()) {
      setLookupResults([]);
      setLookupError('');
      setLookupSubmittedQuery('');
      return;
    }

    const submittedQuery = lookupQuery.trim();
    setLookupLoading(true);
    setLookupError('');
    setLookupSubmittedQuery(submittedQuery);
    try {
      const data = await searchInstruments(submittedQuery);
      setLookupResults(data);
    } catch (err) {
      setLookupError(err instanceof Error ? err.message : 'Lookup failed');
      setLookupResults([]);
    } finally {
      setLookupLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode !== 'lookup') return;
    const inferred = inferLookupSecType(instrument);
    if (!inferred) return;
    setLookupTypeFilter((current) =>
      current === LOOKUP_FILTER_ALL ? inferred : current
    );
  }, [instrument, viewMode]);

  useEffect(() => {
    if (lookupExchangeFilter === LOOKUP_FILTER_ALL) return;
    const exchangeStillExists = lookupResults.some(
      (result) => result.exchange === lookupExchangeFilter
    );
    if (!exchangeStillExists) {
      setLookupExchangeFilter(LOOKUP_FILTER_ALL);
    }
  }, [lookupExchangeFilter, lookupResults]);

  const filteredLookupResults =
    viewMode !== 'lookup'
      ? lookupResults
      : lookupResults.filter((result) => {
          const matchesType =
            lookupTypeFilter === LOOKUP_FILTER_ALL || result.type === lookupTypeFilter;
          const matchesExchange =
            lookupExchangeFilter === LOOKUP_FILTER_ALL ||
            result.exchange === lookupExchangeFilter;
          return matchesType && matchesExchange;
        });

  const lookupTypeOptions = buildLookupTypeOptions(lookupResults);
  const lookupExchangeOptions = buildLookupExchangeOptions(lookupResults);

  const handleAdd = (result: SearchResult) => {
    onAdd(result);
    setOpen(false);
  };

  const activeResults: Array<SearchResult | ScannerResult> =
    viewMode === 'lookup' ? filteredLookupResults : results;
  const { schedules } = useMarketSchedules(
    activeResults.map((result) => ({
      conid: result.conid,
      exchange: result.exchange,
    }))
  );
  const nowMs = useNow(1000, activeResults.length > 0);
  const hasLookupRun = lookupSubmittedQuery.trim().length > 0;
  const lookupFilteredOut =
    hasLookupRun &&
    lookupResults.length > 0 &&
    filteredLookupResults.length === 0 &&
    !lookupLoading &&
    !lookupError;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={triggerClassName}
          type="button"
        >
          <SlidersHorizontal className="h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>

      <DialogContent className="max-w-[96vw] border-border bg-card p-0 text-foreground sm:max-w-[1400px]">
        <DialogHeader className="border-b border-border/70 px-5 py-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <DialogTitle className="font-mono text-base tracking-wide">
              IBKR Screener
            </DialogTitle>
            <div className="flex items-center gap-2 rounded-md border border-border bg-background p-1">
              <Button
                type="button"
                size="xs"
                variant={viewMode === 'scanner' ? 'secondary' : 'ghost'}
                className="text-muted-foreground"
                onClick={() => setViewMode('scanner')}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
                Scanner
              </Button>
              <Button
                type="button"
                size="xs"
                variant={viewMode === 'lookup' ? 'secondary' : 'ghost'}
                className="text-muted-foreground"
                onClick={() => setViewMode('lookup')}
              >
                <Search className="h-3.5 w-3.5" />
                Lookup
              </Button>
            </div>
          </div>
          <DialogDescription className="text-muted-foreground">
            {viewMode === 'scanner'
              ? 'Uses a compact UI projection of `scanner/params` for responsiveness. Full scanner params remain available at `/api/ibkr/scanner/params`.'
              : 'Direct symbol or company lookup through the IBKR contract search endpoint.'}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 px-5 py-4 lg:grid-cols-[420px_minmax(0,1fr)]">
          <div className="space-y-4">
            {viewMode === 'scanner' ? (
              <>
                <div className="grid gap-3">
                  <div className="grid gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Instrument
                    </span>
                    <NativeSelect
                      value={instrument}
                      onChange={setInstrument}
                      options={availableInstruments}
                      placeholder="Choose instrument"
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Location
                    </span>
                    <NativeSelect
                      value={location}
                      onChange={setLocation}
                      options={availableLocations}
                      placeholder="Choose location"
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Scan Type
                    </span>
                    <NativeSelect
                      value={scanType}
                      onChange={setScanType}
                      options={availableScanTypes}
                      placeholder="Choose scan type"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/80 bg-card/70">
                  <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Filters
                    </span>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="text-muted-foreground hover:text-foreground"
                      onClick={addFilter}
                      disabled={availableFilters.length === 0}
                    >
                      <Plus className="h-3 w-3" />
                      Add
                    </Button>
                  </div>

                  <div className="space-y-2 p-3">
                    {filters.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No filters applied. Run the scan raw or add numeric filters first.
                      </p>
                    )}

                    {filters.map((filter) => (
                      <div key={filter.id} className="grid grid-cols-[minmax(0,1fr)_120px_32px] gap-2">
                        <NativeSelect
                          value={filter.code}
                          onChange={(value) => updateFilter(filter.id, { code: value })}
                          options={availableFilters}
                          placeholder="Choose filter"
                        />

                        <Input
                          value={filter.value}
                          onChange={(event) => updateFilter(filter.id, { value: event.target.value })}
                          placeholder="value"
                          className="h-9 border-border bg-background font-mono text-sm"
                        />

                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-red-500"
                          onClick={() => removeFilter(filter.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  type="button"
                  className="w-full bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                  onClick={executeScan}
                  disabled={
                    paramsLoading ||
                    runLoading ||
                    !instrument ||
                    !location ||
                    !scanType
                  }
                >
                  {runLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Running
                    </>
                  ) : (
                    'Run Screener'
                  )}
                </Button>

                {paramsLoading && (
                  <div className="text-xs text-muted-foreground">Loading scanner params...</div>
                )}
                {!paramsLoading && params && (
                  <div className="text-[10px] text-muted-foreground/80">
                    {availableLocations.length} locations, {availableScanTypes.length} scan types, {availableFilters.length} common filters
                  </div>
                )}
                {paramsError && (
                  <div className="text-xs text-red-400">{paramsError}</div>
                )}
                {runError && (
                  <div className="text-xs text-red-400">{runError}</div>
                )}
              </>
            ) : (
              <>
                <div className="grid gap-1.5">
                  <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                    Symbol or Company
                  </span>
                  <form
                    className="flex gap-2"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void executeLookup();
                    }}
                  >
                    <Input
                      value={lookupQuery}
                      onChange={(event) => setLookupQuery(event.target.value)}
                      placeholder="AAPL, BHP, Commonwealth Bank..."
                      className="h-9 border-border bg-background font-mono text-sm"
                    />
                    <Button
                      type="submit"
                      className="shrink-0 bg-zinc-100 text-zinc-900 hover:bg-zinc-200"
                      disabled={lookupLoading || !lookupQuery.trim()}
                    >
                      {lookupLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                      Search
                    </Button>
                  </form>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Type
                    </span>
                    <NativeSelect
                      value={lookupTypeFilter}
                      onChange={(value) => {
                        setLookupTypeFilter(value);
                        setLookupExchangeFilter(LOOKUP_FILTER_ALL);
                      }}
                      options={lookupTypeOptions}
                      placeholder="All Types"
                    />
                  </div>

                  <div className="grid gap-1.5">
                    <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Venue
                    </span>
                    <NativeSelect
                      value={lookupExchangeFilter}
                      onChange={setLookupExchangeFilter}
                      options={lookupExchangeOptions}
                      placeholder="All Venues"
                    />
                  </div>
                </div>

                <div className="rounded-lg border border-border/80 bg-card/70 px-3 py-3 text-xs text-muted-foreground">
                  Direct lookup now supports search scoping by type and venue, so you can narrow the IBKR contract list before adding it.
                </div>

                {lookupError && (
                  <div className="text-xs text-red-400">{lookupError}</div>
                )}
              </>
            )}
          </div>

          <div className="min-h-[420px] overflow-hidden rounded-lg border border-border/80 bg-card/70">
            <div className="flex items-center justify-between border-b border-border/70 px-3 py-2">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
                {viewMode === 'lookup' ? 'Lookup Results' : 'Results'}
              </span>
              <span className="text-[10px] text-muted-foreground/80">
                {viewMode === 'lookup' && lookupResults.length !== activeResults.length
                  ? `${activeResults.length} / ${lookupResults.length} matches`
                  : `${activeResults.length} matches`}
              </span>
            </div>

            <div className="max-h-[520px] overflow-y-auto">
              {activeResults.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {viewMode === 'lookup'
                    ? lookupLoading
                      ? 'Searching...'
                      : lookupFilteredOut
                        ? `No ${lookupTypeFilter === LOOKUP_FILTER_ALL ? '' : `${getLookupTypeLabel(lookupTypeFilter)} `}matches left after filters.`
                        : hasLookupRun
                          ? `No matches for "${lookupSubmittedQuery}".`
                          : 'Search for a symbol or company to load candidates.'
                    : 'Run a scanner to load candidates.'}
                </div>
              ) : (
                activeResults.map((result) => (
                  (() => {
                    const schedule = schedules[result.conid];
                    const displayStatus =
                      'marketDataStatus' in result
                        ? deriveScannerDisplayStatus(result, schedule?.state.phase)
                        : null;
                    const showStatusBadge =
                      displayStatus != null && displayStatus !== 'unknown';

                    return (
                      <button
                        key={`${result.conid}-${result.symbol}`}
                        type="button"
                        onClick={() => handleAdd(result)}
                        className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-4 border-b border-border/60 px-4 py-3.5 text-left transition-colors hover:bg-accent/60"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {'rank' in result && (
                              <span className="text-[10px] text-muted-foreground/80">
                                #{result.rank}
                              </span>
                            )}
                            <span
                              className="font-mono text-sm font-semibold text-foreground"
                              title={
                                result.contractDisplay && result.underlyingSymbol
                                  ? `${result.name} · ${result.symbol}`
                                  : result.name
                              }
                            >
                              {result.underlyingSymbol || result.symbol}
                            </span>
                            {result.contractDisplay && (
                              <span className="rounded bg-emerald-500/10 px-1 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
                                {result.contractDisplay}
                              </span>
                            )}
                            <span className="rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">
                              {result.type}
                            </span>
                            {showStatusBadge && displayStatus && (
                              <span
                                title={
                                  'mdAvailability' in result && result.mdAvailability
                                    ? `IBKR mdAvailability: ${result.mdAvailability}`
                                    : 'IBKR mdAvailability unavailable'
                                }
                              >
                                <MarketStatusBadge
                                  status={displayStatus}
                                  sessionPhase={schedule?.state.phase}
                                />
                              </span>
                            )}
                            <span className="text-[10px] text-muted-foreground/80">
                              {result.exchange || '—'}
                            </span>
                          </div>
                          <div className="mt-1 truncate text-xs text-muted-foreground">
                            {result.contractDisplay && result.underlyingSymbol
                              ? `${result.name} · ${result.symbol}`
                              : result.name}
                          </div>
                          {'contractDescription' in result &&
                            result.contractDescription &&
                            result.contractDescription !== result.symbol && (
                              <div className="mt-1 truncate text-[10px] text-muted-foreground/75">
                                {result.contractDescription}
                              </div>
                            )}
                          <MarketSessionText
                            schedule={schedule}
                            nowMs={nowMs}
                            className="mt-1 block text-muted-foreground/80"
                          />
                        </div>

                        <div className="min-w-[112px] shrink-0 text-right">
                          {'scanValue' in result && result.scanValue && (
                            <div className="font-mono text-xs text-foreground/85">
                              {result.scanValue}
                            </div>
                          )}
                          {'scanLabel' in result && result.scanLabel && (
                            <div className="mt-1 text-[10px] text-muted-foreground/80">
                              {result.scanLabel}
                            </div>
                          )}
                        </div>
                      </button>
                    );
                  })()
                ))
              )}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
