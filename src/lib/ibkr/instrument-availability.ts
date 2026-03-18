import type { MarketDataSnapshot, MarketScheduleState, InstrumentAvailability } from './types';

interface InstrumentAvailabilityArgs {
  snapshot: MarketDataSnapshot | null;
  scheduleState: MarketScheduleState | null;
}

export function deriveInstrumentAvailability({
  snapshot,
  scheduleState,
}: InstrumentAvailabilityArgs): InstrumentAvailability {
  const marketDataStatus = snapshot?.marketDataStatus ?? 'unknown';
  const sessionPhase = scheduleState?.phase ?? 'unknown';
  const hasKnownSchedule = sessionPhase !== 'unknown';
  const venueOpen = sessionPhase === 'regular' || sessionPhase === 'extended';
  const entitled = marketDataStatus !== 'unknown' && marketDataStatus !== 'unavailable';
  const hasQuote =
    Boolean(snapshot) &&
    ((snapshot?.displayPrice ?? 0) > 0 ||
      (snapshot?.last ?? 0) > 0 ||
      (snapshot?.bid ?? 0) > 0 ||
      (snapshot?.ask ?? 0) > 0);

  if (!hasKnownSchedule && marketDataStatus === 'live' && hasQuote) {
    return {
      key: 'open-live',
      label: 'Live · Session unavailable',
      entitled: true,
      venueOpen: true,
      hasQuote,
    };
  }

  if (
    !hasKnownSchedule &&
    hasQuote &&
    (marketDataStatus === 'delayed' || marketDataStatus === 'frozen')
  ) {
    return {
      key: 'open-delayed',
      label:
        marketDataStatus === 'frozen'
          ? 'Feed · Session unavailable'
          : 'Delayed · Session unavailable',
      entitled: true,
      venueOpen: true,
      hasQuote,
    };
  }

  if (venueOpen && marketDataStatus === 'live') {
    return {
      key: 'open-live',
      label: 'Open · Live data',
      entitled: true,
      venueOpen: true,
      hasQuote,
    };
  }

  if (venueOpen && (marketDataStatus === 'delayed' || marketDataStatus === 'frozen')) {
    return {
      key: 'open-delayed',
      label: marketDataStatus === 'frozen' ? 'Open · Frozen feed' : 'Open · Delayed feed',
      entitled: true,
      venueOpen: true,
      hasQuote,
    };
  }

  if (venueOpen && !entitled) {
    return {
      key: 'open-no-entitlement',
      label: 'Open · No entitlement',
      entitled: false,
      venueOpen: true,
      hasQuote,
    };
  }

  if (!venueOpen && entitled && hasQuote) {
    return {
      key: 'closed-cached',
      label: 'Closed · Cached quote',
      entitled: true,
      venueOpen: false,
      hasQuote,
    };
  }

  if (!venueOpen && !entitled && hasQuote) {
    return {
      key: 'historical-only',
      label: 'Closed · Historical only',
      entitled: false,
      venueOpen: false,
      hasQuote,
    };
  }

  if (!venueOpen) {
    return {
      key: 'closed-no-data',
      label: 'Closed · No quote',
      entitled,
      venueOpen: false,
      hasQuote,
    };
  }

  return {
    key: 'unknown',
    label: 'Status unknown',
    entitled,
    venueOpen: venueOpen || (!hasKnownSchedule && hasQuote),
    hasQuote,
  };
}
