'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { previewOrder as requestOrderPreview } from '@/lib/ibkr/gateway-client';
import { getAllowedTifsForOrderType } from '@/lib/ibkr/order-ticket';
import { useOrdersStore } from '@/lib/store/orders';
import { useWatchlistStore } from '@/lib/store/watchlist';
import { cn, formatPrice } from '@/lib/utils';
import type {
  OrderMutationResponse,
  OrderParams,
  OrderSide,
  OrderTicket,
  OrderType,
  OrderWhatIfPreview,
  TimeInForce,
  TrailingType,
  WatchlistItem,
} from '@/lib/ibkr/types';

interface Props {
  conid: number;
  instrument: WatchlistItem;
}

function parseOptionalNumber(value: string): number | null {
  if (value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundToStep(value: number, step: number | null) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(step) || !step || step <= 0) return value;
  const rounded = Math.round(value / step) * step;
  return rounded > 0 ? rounded : step;
}

function floorToStep(value: number, step: number | null) {
  if (!Number.isFinite(value) || value <= 0) return 0;
  if (!Number.isFinite(step) || !step || step <= 0) return value;
  const floored = Math.floor(value / step + 1e-9) * step;
  return floored > 0 ? Number(floored.toFixed(8)) : 0;
}

function formatEditableNumber(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) {
    return '';
  }

  return String(value);
}

function formatSignedPrice(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '—';
  return `${value >= 0 ? '+' : ''}${formatPrice(value, -1)}`;
}

export function OrderPanel({ conid, instrument }: Props) {
  const price = useWatchlistStore((s) => s.prices[conid]);
  const previewRequestIdRef = useRef(0);
  const volumeInputFocusedRef = useRef(false);
  const [ticket, setTicket] = useState<OrderTicket | null>(null);
  const [ticketError, setTicketError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [preview, setPreview] = useState<OrderWhatIfPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [submitResult, setSubmitResult] = useState<OrderMutationResponse | null>(null);
  const [isSuppressingReplies, setIsSuppressingReplies] = useState(false);
  const [isLoadingTicket, setIsLoadingTicket] = useState(false);
  const [volumeInput, setVolumeInput] = useState('');
  const {
    orderForm,
    isSubmitting,
    setSide,
    setOrderType,
    setQuantityMode,
    setQuantity,
    setCashQty,
    setExposureAmount,
    setPrice,
    setAuxPrice,
    setTrailingAmt,
    setTrailingType,
    setTif,
    setOutsideRTH,
    setListingExchange,
    setSubmitting,
    setOrders,
    preparedDraft,
    clearPreparedDraft,
  } = useOrdersStore();

  useEffect(() => {
    let cancelled = false;

    const fetchTicket = async () => {
      setIsLoadingTicket(true);
      setTicketError(null);

      try {
        const res = await fetch(`/api/ibkr/orders/rules?conid=${conid}&side=${orderForm.side}`, {
          cache: 'no-store',
        });
        const data = await res.json();

        if (cancelled) return;

        if (!res.ok) {
          setTicket(null);
          setTicketError(data?.error || 'Failed to load order rules.');
          return;
        }

        setTicket(data as OrderTicket);
      } catch (err) {
        if (!cancelled) {
          setTicket(null);
          setTicketError(err instanceof Error ? err.message : 'Failed to load order rules.');
        }
      } finally {
        if (!cancelled) {
          setIsLoadingTicket(false);
        }
      }
    };

    fetchTicket();

    return () => {
      cancelled = true;
    };
  }, [conid, orderForm.side]);

  useEffect(() => {
    if (!ticket) return;

    setOrderType(ticket.defaultOrderType);
    setTif(ticket.defaultTif);
    setQuantityMode('units');
    setQuantity(ticket.defaultQuantity);
    setCashQty(null);
    setExposureAmount(null);
    setPrice(null);
    setAuxPrice(null);
    setTrailingAmt(null);
    setTrailingType('amt');
    setOutsideRTH(false);
    setListingExchange(null);
  }, [
    conid,
    setCashQty,
    ticket?.defaultOrderType,
    ticket?.defaultQuantity,
    ticket?.defaultTif,
    setAuxPrice,
    setListingExchange,
    setOrderType,
    setOutsideRTH,
    setPrice,
    setQuantity,
    setQuantityMode,
    setExposureAmount,
    setTrailingAmt,
    setTrailingType,
    setTif,
    ticket,
  ]);

  useEffect(() => {
    if (!ticket || !preparedDraft || preparedDraft.conid !== conid) return;

    if (preparedDraft.quantityMode === 'cash' && ticket.supportsCashQuantity) {
      setQuantityMode('cash');
      setCashQty(preparedDraft.cashQty);
      setExposureAmount(null);
    } else if (
      (
        preparedDraft.quantityMode === 'exposure' &&
        (preparedDraft.exposureAmount ?? 0) > 0
      ) ||
      (
        preparedDraft.quantityMode === 'cash' &&
        !ticket.supportsCashQuantity &&
        (preparedDraft.cashQty ?? 0) > 0
      )
    ) {
      setQuantityMode('exposure');
      setCashQty(null);
      setExposureAmount(
        preparedDraft.quantityMode === 'exposure'
          ? preparedDraft.exposureAmount
          : preparedDraft.cashQty
      );
    } else {
      setQuantityMode('units');
      setCashQty(null);
      setExposureAmount(null);
      setQuantity(preparedDraft.quantity);
    }

    clearPreparedDraft();
  }, [
    clearPreparedDraft,
    conid,
    preparedDraft,
    setCashQty,
    setExposureAmount,
    setQuantity,
    setQuantityMode,
    ticket,
  ]);

  const currentOrderType = useMemo(
    () => ticket?.orderTypes.find((option) => option.code === orderForm.orderType) ?? null,
    [ticket, orderForm.orderType]
  );

  const allowedTifs = useMemo(
    () => (ticket ? getAllowedTifsForOrderType(ticket, orderForm.orderType) : []),
    [ticket, orderForm.orderType]
  );

  useEffect(() => {
    if (!ticket) return;

    if (!ticket.orderTypes.some((option) => option.code === orderForm.orderType)) {
      setOrderType(ticket.defaultOrderType);
    }
  }, [ticket, orderForm.orderType, setOrderType]);

  useEffect(() => {
    if (allowedTifs.length === 0) return;
    if (!allowedTifs.some((option) => option.code === orderForm.tif)) {
      setTif(allowedTifs[0].code);
    }
  }, [allowedTifs, orderForm.tif, setTif]);

  useEffect(() => {
    if (currentOrderType?.supportsOutsideRth) return;
    if (orderForm.outsideRTH) {
      setOutsideRTH(false);
    }
  }, [currentOrderType?.supportsOutsideRth, orderForm.outsideRTH, setOutsideRTH]);

  useEffect(() => {
    if (!currentOrderType?.supportsCashQuantity && orderForm.quantityMode === 'cash') {
      setQuantityMode('units');
      setCashQty(null);
    }
  }, [currentOrderType?.supportsCashQuantity, orderForm.quantityMode, setCashQty, setQuantityMode]);

  const supportsExposureSizing = Boolean(
    ticket && currentOrderType && !currentOrderType.supportsCashQuantity
  );

  useEffect(() => {
    if (supportsExposureSizing) return;
    if (orderForm.quantityMode === 'exposure') {
      setQuantityMode(currentOrderType?.supportsCashQuantity ? 'cash' : 'units');
      setExposureAmount(null);
    }
  }, [
    currentOrderType?.supportsCashQuantity,
    orderForm.quantityMode,
    setExposureAmount,
    setQuantityMode,
    supportsExposureSizing,
  ]);

  useEffect(() => {
    if (!currentOrderType?.trailingRequired && orderForm.trailingAmt != null) {
      setTrailingAmt(null);
    }
  }, [currentOrderType?.trailingRequired, orderForm.trailingAmt, setTrailingAmt]);

  useEffect(() => {
    if (!currentOrderType?.priceLabel && orderForm.price != null) {
      setPrice(null);
    }
    if (!currentOrderType?.auxPriceLabel && orderForm.auxPrice != null) {
      setAuxPrice(null);
    }
  }, [
    currentOrderType?.auxPriceLabel,
    currentOrderType?.priceLabel,
    orderForm.auxPrice,
    orderForm.price,
    setAuxPrice,
    setPrice,
  ]);

  useEffect(() => {
    if (currentOrderType?.priceAllowsZero && currentOrderType.priceRequired && orderForm.price == null) {
      setPrice(0);
    }
  }, [currentOrderType?.priceAllowsZero, currentOrderType?.priceRequired, orderForm.price, setPrice]);

  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
    setSubmitResult(null);
  }, [conid]);

  useEffect(() => {
    setSubmitResult(null);
  }, [
    orderForm.side,
    orderForm.orderType,
    orderForm.quantityMode,
    orderForm.quantity,
    orderForm.cashQty,
    orderForm.exposureAmount,
    orderForm.price,
    orderForm.auxPrice,
    orderForm.trailingAmt,
    orderForm.trailingType,
    orderForm.tif,
    orderForm.outsideRTH,
    orderForm.listingExchange,
  ]);

  const quotePrice = price?.displayPrice || price?.last || price?.bid || price?.ask || 0;
  const usesCashQty = Boolean(
    currentOrderType?.supportsCashQuantity && orderForm.quantityMode === 'cash'
  );
  const usesExposure = Boolean(supportsExposureSizing && orderForm.quantityMode === 'exposure');
  const effectivePrimaryPrice = orderForm.price ?? (currentOrderType?.priceAllowsZero ? 0 : null);
  const executionPrice =
    ((currentOrderType?.requiresLimitPrice ? effectivePrimaryPrice : null) ?? quotePrice ?? 0);
  const contractMultiplier =
    ticket?.contract.multiplier && ticket.contract.multiplier > 0
      ? ticket.contract.multiplier
      : 1;
  const exposurePerContract = executionPrice > 0 ? executionPrice * contractMultiplier : 0;
  const derivedExposureQuantity = usesExposure
    ? floorToStep(
        (orderForm.exposureAmount ?? 0) / (exposurePerContract || Number.POSITIVE_INFINITY),
        ticket?.quantityStep ?? 1
      )
    : orderForm.quantity;
  const quantityModeOptions = [
    { key: 'units', label: 'Units', enabled: true },
    { key: 'cash', label: 'Cash', enabled: Boolean(currentOrderType?.supportsCashQuantity) },
    { key: 'exposure', label: 'Exposure', enabled: supportsExposureSizing },
  ].filter((option) => option.enabled);
  const quantityStep = ticket?.quantityStep ?? 1;
  const unitDisplayValue = usesCashQty
    ? roundToStep(
        (orderForm.cashQty ?? 0) / (exposurePerContract || Number.POSITIVE_INFINITY),
        quantityStep
      )
    : usesExposure
      ? derivedExposureQuantity
      : orderForm.quantity;
  const valueDisplayValue = usesCashQty
    ? (orderForm.cashQty ?? 0)
    : usesExposure
      ? (orderForm.exposureAmount ?? 0)
      : unitDisplayValue * exposurePerContract;
  const actualOrderValue = usesCashQty
    ? (orderForm.cashQty ?? 0)
    : (usesExposure ? derivedExposureQuantity : unitDisplayValue) * exposurePerContract;
  const valueDisplayLabel = ticket?.contract.currency || 'Value';
  const activeVolumeNumber = usesCashQty
    ? (orderForm.cashQty ?? null)
    : usesExposure
      ? (orderForm.exposureAmount ?? null)
      : orderForm.quantity;

  useEffect(() => {
    if (volumeInputFocusedRef.current) {
      return;
    }

    setVolumeInput(formatEditableNumber(activeVolumeNumber));
  }, [activeVolumeNumber, conid, orderForm.quantityMode]);

  const handleVolumeInputChange = useCallback(
    (nextValue: string) => {
      setVolumeInput(nextValue);
      const parsed = parseOptionalNumber(nextValue);

      if (usesCashQty) {
        setCashQty(parsed);
        return;
      }

      if (usesExposure) {
        setExposureAmount(parsed);
        return;
      }

      setQuantity(parsed ?? 0);
    },
    [setCashQty, setExposureAmount, setQuantity, usesCashQty, usesExposure]
  );

  const selectQuantityMode = useCallback(
    (nextMode: 'units' | 'cash' | 'exposure') => {
      if (nextMode === orderForm.quantityMode) {
        return;
      }

      if (nextMode === 'units') {
        setQuantity(unitDisplayValue);
      } else if (nextMode === 'cash') {
        setCashQty(valueDisplayValue > 0 ? valueDisplayValue : null);
      } else {
        setExposureAmount(valueDisplayValue > 0 ? valueDisplayValue : null);
      }

      setQuantityMode(nextMode);
    },
    [
      orderForm.quantityMode,
      setCashQty,
      setExposureAmount,
      setQuantity,
      setQuantityMode,
      unitDisplayValue,
      valueDisplayValue,
    ]
  );

  const buildPayload = useCallback((): OrderParams => {
    const supportsCashQty = usesCashQty;

    return {
      conid,
      side: orderForm.side,
      orderType: orderForm.orderType,
      tif: orderForm.tif,
      outsideRTH: orderForm.outsideRTH,
      ...(supportsCashQty
        ? { cashQty: orderForm.cashQty ?? undefined }
        : { quantity: usesExposure ? derivedExposureQuantity : orderForm.quantity }),
      ...(orderForm.price != null && { price: orderForm.price }),
      ...(orderForm.auxPrice != null && { auxPrice: orderForm.auxPrice }),
      ...(orderForm.trailingAmt != null && { trailingAmt: orderForm.trailingAmt }),
      ...(orderForm.trailingAmt != null && { trailingType: orderForm.trailingType }),
      ...(orderForm.listingExchange && { listingExchange: orderForm.listingExchange }),
    };
  }, [conid, derivedExposureQuantity, orderForm, usesCashQty, usesExposure]);

  const handleSubmit = useCallback(async () => {
    setSubmitError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/ibkr/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      const data = await res.json();

      if (!res.ok) {
        setSubmitError(data?.error || 'Order placement failed.');
        return;
      }

      setSubmitResult(data as OrderMutationResponse);

      // Refresh orders
      const ordersRes = await fetch('/api/ibkr/orders');
      const orders = await ordersRes.json();
      if (Array.isArray(orders)) {
        setOrders(orders);
      }
    } finally {
      setSubmitting(false);
    }
  }, [buildPayload, setOrders, setSubmitting]);

  const handleSuppressReplies = useCallback(async () => {
    const messageIds = submitResult?.suppressedMessageIds ?? [];
    if (messageIds.length === 0) return;

    setIsSuppressingReplies(true);
    try {
      const res = await fetch('/api/ibkr/orders/suppress', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messageIds }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Suppress failed');
      }
      setSubmitResult((current) =>
        current
          ? {
              ...current,
              suppressedMessageIds: [],
            }
          : current
      );
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Suppress failed');
    } finally {
      setIsSuppressingReplies(false);
    }
  }, [submitResult]);

  const priceVisible = Boolean(currentOrderType?.priceLabel);
  const auxPriceVisible = Boolean(currentOrderType?.auxPriceLabel);
  const trailingVisible = Boolean(currentOrderType?.trailingLabel);
  const requiredQuantityValid = usesCashQty
    ? (orderForm.cashQty ?? 0) > 0
    : usesExposure
      ? (orderForm.exposureAmount ?? 0) > 0 && derivedExposureQuantity > 0 && executionPrice > 0
      : orderForm.quantity > 0;
  const primaryPriceValid = !currentOrderType?.priceRequired
    ? true
    : currentOrderType.priceAllowsZero
      ? (effectivePrimaryPrice ?? -1) >= 0
      : (effectivePrimaryPrice ?? 0) > 0;
  const auxPriceValid = !currentOrderType?.auxPriceRequired
    ? true
    : (orderForm.auxPrice ?? 0) > 0;
  const trailingValid = !currentOrderType?.trailingRequired
    ? true
    : (orderForm.trailingAmt ?? 0) > 0;
  const estimatedValue = String(
    actualOrderValue
  );
  const routingOptions = useMemo(() => {
    if (!ticket) return [];
    return Array.from(new Set([ticket.contract.exchange, ...ticket.contract.validExchanges].filter(Boolean)));
  }, [ticket]);
  const canSubmit =
    !isSubmitting &&
    !!ticket &&
    requiredQuantityValid &&
    primaryPriceValid &&
    auxPriceValid &&
    trailingValid;
  const canPreview =
    !!ticket &&
    requiredQuantityValid &&
    primaryPriceValid &&
    auxPriceValid &&
    trailingValid;

  useEffect(() => {
    if (!canPreview) {
      setIsPreviewing(false);
      return;
    }

    let cancelled = false;
    const requestId = ++previewRequestIdRef.current;
    const timer = window.setTimeout(async () => {
      setPreviewError(null);
      setIsPreviewing(true);

      try {
        const result = await requestOrderPreview(buildPayload());
        if (cancelled || previewRequestIdRef.current !== requestId) {
          return;
        }
        setPreview(result);
      } catch (err) {
        if (cancelled || previewRequestIdRef.current !== requestId) {
          return;
        }
        setPreviewError(err instanceof Error ? err.message : 'Order preview failed.');
      } finally {
        if (!cancelled && previewRequestIdRef.current === requestId) {
          setIsPreviewing(false);
        }
      }
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [buildPayload, canPreview]);

  return (
    <div className="flex min-h-full shrink-0 flex-col border-t border-border bg-card px-4 py-3">
      <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>
          {ticket
            ? `${ticket.contract.instrumentType} · ${ticket.contract.currency} · ${ticket.contract.exchange}`
            : `${instrument.type} · ${instrument.exchange}`}
        </span>
        {ticket?.contract.multiplier ? <span>Multiplier x{ticket.contract.multiplier}</span> : null}
      </div>

      <div className="mb-3 grid h-9 grid-cols-2 overflow-hidden rounded border border-border/70 bg-background/70">
        {(['BUY', 'SELL'] as const).map((side) => (
          <button
            key={side}
            type="button"
            onClick={() => setSide(side)}
            className={cn(
              'text-sm font-semibold transition-colors',
              side === 'BUY'
                ? orderForm.side === side
                  ? 'bg-[var(--color-pulse-buy)] text-black'
                  : 'text-muted-foreground hover:bg-[var(--color-pulse-buy)]/10 hover:text-[var(--color-pulse-buy)]'
                : orderForm.side === side
                  ? 'bg-[var(--color-pulse-sell)] text-white'
                  : 'text-muted-foreground hover:bg-[var(--color-pulse-sell)]/10 hover:text-[var(--color-pulse-sell)]'
            )}
          >
            {side}
          </button>
        ))}
      </div>

      <div className="mb-3 rounded border border-border/70 bg-background/40">
        <div className="grid gap-3 p-3">
          <div className="min-w-0">
            <div className="mb-1 flex items-center justify-between gap-3">
              <label className="text-[10px] uppercase tracking-wider text-muted-foreground">
                Volume
              </label>
              {quantityModeOptions.length > 1 ? (
                <div className="flex shrink-0 items-center gap-0 border-l border-border/50 pl-3">
                  <div
                    className={cn(
                      'grid h-7 overflow-hidden rounded border border-border/70 bg-background/70',
                      quantityModeOptions.length === 2 ? 'grid-cols-2' : 'grid-cols-3'
                    )}
                  >
                  {quantityModeOptions.map((option) => (
                      <button
                        key={option.key}
                        type="button"
                        onClick={() =>
                          selectQuantityMode(option.key as 'units' | 'cash' | 'exposure')
                        }
                        className={cn(
                          'px-2 text-[10px] uppercase tracking-wider transition-colors',
                          orderForm.quantityMode === option.key
                            ? 'bg-secondary text-foreground'
                            : 'text-muted-foreground hover:text-foreground'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
            <div className="grid h-9 grid-cols-2 overflow-hidden rounded-md border border-input bg-secondary shadow-xs">
              {usesCashQty || usesExposure ? (
                <>
                  <div className="flex min-w-0 items-center border-r border-border/60 px-3 text-[11px] font-mono text-muted-foreground">
                    <span className="truncate">
                      {unitDisplayValue > 0
                        ? `${Math.round(unitDisplayValue).toLocaleString()} Units`
                        : '— Units'}
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center px-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={volumeInput}
                      onChange={(e) => handleVolumeInputChange(e.target.value)}
                      onFocus={() => {
                        volumeInputFocusedRef.current = true;
                      }}
                      onBlur={() => {
                        volumeInputFocusedRef.current = false;
                        setVolumeInput(formatEditableNumber(activeVolumeNumber));
                      }}
                      className="h-full w-full bg-transparent text-right font-mono text-sm text-foreground outline-none"
                    />
                    <span className="ml-2 shrink-0 text-[11px] font-mono text-foreground">
                      {valueDisplayLabel}
                    </span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex min-w-0 items-center px-3">
                    <input
                      type="text"
                      inputMode="decimal"
                      value={volumeInput}
                      onChange={(e) => handleVolumeInputChange(e.target.value)}
                      onFocus={() => {
                        volumeInputFocusedRef.current = true;
                      }}
                      onBlur={() => {
                        volumeInputFocusedRef.current = false;
                        setVolumeInput(formatEditableNumber(activeVolumeNumber));
                      }}
                      className="h-full w-full bg-transparent text-left font-mono text-sm text-foreground outline-none"
                    />
                    <span className="ml-2 shrink-0 text-[11px] font-mono text-foreground">
                      Units
                    </span>
                  </div>
                  <div className="flex min-w-0 items-center justify-end border-l border-border/60 px-3 text-[11px] font-mono text-muted-foreground">
                    <span className="truncate">
                      {valueDisplayValue > 0
                        ? `${valueDisplayLabel} ${formatPrice(valueDisplayValue, -1)}`
                        : `${valueDisplayLabel} —`}
                    </span>
                  </div>
                </>
              )}
            </div>
            {usesExposure && exposurePerContract > 0 && derivedExposureQuantity <= 0 ? (
              <div className="mt-1 text-[10px] text-amber-400">
                Minimum size is {quantityStep} contract{quantityStep === 1 ? '' : 's'} (
                {formatPrice(quantityStep * exposurePerContract, -1)} {valueDisplayLabel}).
              </div>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mb-3 border-t border-border/50 pt-3">
        <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
          Order Type
        </label>
        <Select
          value={orderForm.orderType}
          onValueChange={(v) => setOrderType(v as OrderType)}
          disabled={!ticket || ticket.orderTypes.length === 0}
        >
          <SelectTrigger className="h-9 w-full bg-secondary font-mono text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(ticket?.orderTypes || []).map((option) => (
              <SelectItem key={option.code} value={option.code}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {priceVisible || auxPriceVisible || trailingVisible ? (
          <div className="mt-3 grid gap-2">
            {priceVisible ? (
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                  {currentOrderType?.priceLabel}
                </label>
                <Input
                  type="number"
                  step={ticket?.priceStep || 0.01}
                  value={orderForm.price ?? ''}
                  onChange={(e) => setPrice(parseOptionalNumber(e.target.value))}
                  className="h-9 w-full bg-secondary font-mono text-sm"
                  placeholder={
                    quotePrice
                      ? String(quotePrice)
                      : currentOrderType?.priceOptional
                        ? 'Optional'
                        : 'Price'
                  }
                />
              </div>
            ) : null}

            {auxPriceVisible ? (
              <div>
                <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                  {currentOrderType?.auxPriceLabel}
                </label>
                <Input
                  type="number"
                  step={ticket?.priceStep || 0.01}
                  value={orderForm.auxPrice ?? ''}
                  onChange={(e) => setAuxPrice(parseOptionalNumber(e.target.value))}
                  className="h-9 w-full bg-secondary font-mono text-sm"
                  placeholder={quotePrice ? String(quotePrice) : 'Value'}
                />
              </div>
            ) : null}

            {trailingVisible ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_120px]">
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                    {currentOrderType?.trailingLabel}
                  </label>
                  <Input
                    type="number"
                    step={orderForm.trailingType === '%' ? 0.01 : ticket?.priceStep || 0.01}
                    value={orderForm.trailingAmt ?? ''}
                    onChange={(e) => setTrailingAmt(parseOptionalNumber(e.target.value))}
                    className="h-9 w-full bg-secondary font-mono text-sm"
                    placeholder={orderForm.trailingType === '%' ? 'Percent' : 'Amount'}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                    Trailing Type
                  </label>
                  <Select
                    value={orderForm.trailingType}
                    onValueChange={(v) => setTrailingType(v as TrailingType)}
                  >
                    <SelectTrigger className="h-9 w-full bg-secondary font-mono text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="amt">Amount</SelectItem>
                      {currentOrderType?.supportsTrailingPercent ? (
                        <SelectItem value="%">Percent</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="mb-3 border-t border-border/50 pt-3">
        <div className="grid gap-2">
          <div>
            <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
              Time in Force
            </label>
            <Select
              value={orderForm.tif}
              onValueChange={(v) => setTif(v as TimeInForce)}
              disabled={allowedTifs.length === 0}
            >
              <SelectTrigger className="h-9 w-full bg-secondary font-mono text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {allowedTifs.map((option) => (
                  <SelectItem key={option.code} value={option.code}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {routingOptions.length > 1 ? (
            <div>
              <label className="mb-1 block text-[10px] uppercase tracking-wider text-muted-foreground">
                Routing
              </label>
              <Select
                value={orderForm.listingExchange || '__auto__'}
                onValueChange={(value) => setListingExchange(value === '__auto__' ? null : value)}
              >
                <SelectTrigger className="h-9 w-full bg-secondary font-mono text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto / Default</SelectItem>
                  {routingOptions.map((exchange) => (
                    <SelectItem key={exchange} value={exchange}>
                      {exchange}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {currentOrderType?.supportsOutsideRth ? (
            <div className="flex items-center justify-between rounded border border-border bg-background/70 px-3 py-2">
              <div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  Outside RTH
                </div>
                <div className="text-xs text-muted-foreground">
                  Allow this order type outside regular trading hours.
                </div>
              </div>
              <Button
                type="button"
                variant={orderForm.outsideRTH ? 'default' : 'outline'}
                className="h-8 px-3 font-mono text-xs"
                onClick={() => setOutsideRTH(!orderForm.outsideRTH)}
              >
                {orderForm.outsideRTH ? 'Enabled' : 'Off'}
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {ticket?.unsupportedOrderTypes.length ? (
        <div className="mb-3 rounded border border-border bg-background/70 px-3 py-2 text-xs text-muted-foreground">
          {ticket.unsupportedOrderTypes.length} IBKR order type
          {ticket.unsupportedOrderTypes.length === 1 ? ' is' : 's are'} available on this contract
          but still need extra fields before they can be exposed safely here.
        </div>
      ) : null}

      {ticketError ? (
        <div className="mb-3 rounded border border-[var(--color-pulse-sell)]/30 bg-[var(--color-pulse-sell)]/10 px-3 py-2 text-xs text-[var(--color-pulse-sell)]">
          {ticketError}
        </div>
      ) : null}

      {submitError ? (
        <div className="mb-3 rounded border border-[var(--color-pulse-sell)]/30 bg-[var(--color-pulse-sell)]/10 px-3 py-2 text-xs text-[var(--color-pulse-sell)]">
          {submitError}
        </div>
      ) : null}

      {submitResult?.replies.length ? (
        <div className="mb-3 rounded border border-sky-500/30 bg-sky-500/10 px-3 py-2 text-xs text-sky-300">
          <div className="text-[10px] uppercase tracking-widest text-sky-400">
            Confirmed Reply Chain
          </div>
          <div className="mt-2 space-y-1">
            {submitResult.replies.map((reply) => (
              <div key={reply.id}>{reply.message.join(' ')}</div>
            ))}
          </div>
          {submitResult.suppressedMessageIds.length > 0 ? (
            <div className="mt-2 flex justify-end">
              <Button
                type="button"
                size="xs"
                variant="outline"
                disabled={isSuppressingReplies}
                onClick={() => void handleSuppressReplies()}
              >
                {isSuppressingReplies ? 'Suppressing…' : 'Suppress Session Warnings'}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mt-auto space-y-3 pt-3">
        {previewError ? (
          <div className="rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-400">
            {previewError}
          </div>
        ) : null}

        {(preview || isPreviewing) ? (
          <div className="rounded border border-border/70 bg-background/70 p-3 text-xs">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                What-If
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">
                {isPreviewing ? 'Refreshing…' : 'Live'}
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
              <div className="rounded border border-border/60 bg-card/60 p-2.5">
                <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  Order Cost
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">Est. Value</span>
                    <span className="font-mono text-foreground">
                      {actualOrderValue > 0 ? formatPrice(actualOrderValue, -1) : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">Fee</span>
                    <span className="font-mono text-foreground">
                      {preview?.amount.commission == null
                        ? '—'
                        : formatPrice(preview.amount.commission, -1)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2">
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">Total</span>
                    <span className="font-mono text-foreground">
                      {preview?.amount.total == null ? '—' : formatPrice(preview.amount.total, -1)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="rounded border border-border/60 bg-card/60 p-2.5">
                <div className="mb-2 text-[10px] uppercase tracking-widest text-muted-foreground">
                  Account Impact
                </div>
                <div className="space-y-2">
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">Equity</span>
                    <span className="font-mono text-foreground">
                      {preview?.equity.after == null ? '—' : formatPrice(preview.equity.after, -1)}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatSignedPrice(preview?.equity.change)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">Init</span>
                    <span className="font-mono text-foreground">
                      {preview?.initial.after == null ? '—' : formatPrice(preview.initial.after, -1)}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatSignedPrice(preview?.initial.change)}
                    </span>
                  </div>
                  <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3">
                    <span className="whitespace-nowrap text-[11px] text-muted-foreground">Maint</span>
                    <span className="font-mono text-foreground">
                      {preview?.maintenance.after == null
                        ? '—'
                        : formatPrice(preview.maintenance.after, -1)}
                    </span>
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {formatSignedPrice(preview?.maintenance.change)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
            {preview?.warning ? (
              <div className="mt-3 rounded border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-amber-400">
                {preview.warning}
              </div>
            ) : null}
          </div>
        ) : null}

        <Button
          onClick={handleSubmit}
          disabled={!canSubmit}
          className={`h-11 w-full text-sm font-bold ${
            orderForm.side === 'BUY'
              ? 'bg-[var(--color-pulse-buy)] hover:bg-[var(--color-pulse-buy)]/90 text-black'
              : 'bg-[var(--color-pulse-sell)] hover:bg-[var(--color-pulse-sell)]/90 text-white'
          }`}
        >
          {isSubmitting
            ? 'Submitting...'
            : `${orderForm.side} ${
                usesCashQty
                  ? orderForm.cashQty || 0
                  : usesExposure
                    ? derivedExposureQuantity
                    : orderForm.quantity
              } ${instrument.symbol}`}
        </Button>
      </div>
    </div>
  );
}
