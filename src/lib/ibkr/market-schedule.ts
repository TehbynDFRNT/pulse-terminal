import type {
  MarketSchedule,
  MarketScheduleDay,
  MarketScheduleState,
  MarketScheduleWindow,
} from './types';

interface SessionWindowDescriptor {
  code: 'REG' | 'EXT';
  opening: number;
  closing: number;
  active: boolean;
}

export interface MarketSessionPresentation {
  code: 'REG' | 'EXT';
  rangeText: string;
  countdownText: string | null;
  countdownTone: 'open' | 'close' | null;
}

export interface MarketSessionVerbosePresentation {
  phaseLabel: string;
  rangeLabel: string;
  currentRangeText: string | null;
  primaryBoundaryLabel: string | null;
  primaryBoundaryText: string | null;
  secondaryBoundaryLabel: string | null;
  secondaryBoundaryText: string | null;
  exchangeTimezone: string | null;
}

interface RawTradingScheduleWindow {
  opening?: number | string;
  closing?: number | string;
  cancel_daily_orders?: boolean;
}

interface RawTradingScheduleDay {
  liquid_hours?: RawTradingScheduleWindow[];
  extended_hours?: RawTradingScheduleWindow[];
}

interface RawTradingScheduleResponse {
  exchange_time_zone?: string;
  schedules?: Record<string, RawTradingScheduleDay>;
}

function parseWindow(raw: RawTradingScheduleWindow): MarketScheduleWindow | null {
  const openingSecs = Number(raw.opening);
  const closingSecs = Number(raw.closing);

  if (!Number.isFinite(openingSecs) || !Number.isFinite(closingSecs)) {
    return null;
  }

  const opening = openingSecs * 1000;
  const closing = closingSecs * 1000;

  if (closing <= opening) {
    return null;
  }

  return {
    opening,
    closing,
    cancelDailyOrders: raw.cancel_daily_orders === true,
  };
}

function normalizeWindows(
  rawWindows: RawTradingScheduleWindow[] | undefined
): MarketScheduleWindow[] {
  return (rawWindows ?? [])
    .map(parseWindow)
    .filter((window): window is MarketScheduleWindow => window !== null)
    .sort((left, right) => left.opening - right.opening);
}

function buildDays(raw: RawTradingScheduleResponse): MarketScheduleDay[] {
  return Object.entries(raw.schedules ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, entry]) => ({
      date,
      liquidHours: normalizeWindows(entry.liquid_hours),
      extendedHours: normalizeWindows(entry.extended_hours),
    }))
    .filter((day) => day.liquidHours.length > 0 || day.extendedHours.length > 0);
}

function earliestAfter(
  windows: MarketScheduleWindow[],
  nowMs: number
): number | null {
  let candidate: number | null = null;

  for (const window of windows) {
    if (window.opening <= nowMs) continue;
    if (candidate == null || window.opening < candidate) {
      candidate = window.opening;
    }
  }

  return candidate;
}

function latestBefore(
  windows: MarketScheduleWindow[],
  nowMs: number
): number | null {
  let candidate: number | null = null;

  for (const window of windows) {
    if (window.closing > nowMs) continue;
    if (candidate == null || window.closing > candidate) {
      candidate = window.closing;
    }
  }

  return candidate;
}

export function deriveMarketScheduleState(
  schedule: Pick<MarketSchedule, 'days'>,
  nowMs = Date.now()
): MarketScheduleState {
  const liquidWindows = schedule.days.flatMap((day) => day.liquidHours);
  const extendedWindows = schedule.days.flatMap((day) => day.extendedHours);

  if (liquidWindows.length === 0 && extendedWindows.length === 0) {
    return {
      phase: 'unknown',
      isOpen: false,
      isExtendedHours: false,
      nextChangeAt: null,
      nextRegularOpen: null,
      nextRegularClose: null,
      nextExtendedOpen: null,
      nextExtendedClose: null,
      lastRegularClose: null,
    };
  }

  const activeLiquidWindow =
    liquidWindows.find((window) => window.opening <= nowMs && nowMs < window.closing) ??
    null;
  const activeExtendedWindow =
    activeLiquidWindow == null
      ? extendedWindows.find(
          (window) => window.opening <= nowMs && nowMs < window.closing
        ) ?? null
      : null;

  const phase =
    activeLiquidWindow != null
      ? 'regular'
      : activeExtendedWindow != null
        ? 'extended'
        : 'closed';

  const nextRegularOpen = earliestAfter(liquidWindows, nowMs);
  const nextRegularClose = activeLiquidWindow?.closing ?? null;
  const nextExtendedOpen = earliestAfter(extendedWindows, nowMs);
  const nextExtendedClose = activeExtendedWindow?.closing ?? null;
  const lastRegularClose = latestBefore(liquidWindows, nowMs);

  let nextChangeAt: number | null = null;
  if (activeLiquidWindow) {
    nextChangeAt = activeLiquidWindow.closing;
  } else if (activeExtendedWindow) {
    nextChangeAt = activeExtendedWindow.closing;
  } else {
    nextChangeAt =
      [nextExtendedOpen, nextRegularOpen]
        .filter((value): value is number => value != null)
        .sort((left, right) => left - right)[0] ?? null;
  }

  return {
    phase,
    isOpen: phase === 'regular' || phase === 'extended',
    isExtendedHours: phase === 'extended',
    nextChangeAt,
    nextRegularOpen,
    nextRegularClose,
    nextExtendedOpen,
    nextExtendedClose,
    lastRegularClose,
  };
}

export function normalizeMarketSchedule(
  raw: RawTradingScheduleResponse,
  conid: number,
  exchange?: string,
  nowMs = Date.now()
): MarketSchedule {
  const days = buildDays(raw);

  return {
    conid,
    exchange: exchange ?? null,
    timezone: raw.exchange_time_zone || 'UTC',
    source: 'contract/trading-schedule',
    fetchedAt: nowMs,
    days,
    state: deriveMarketScheduleState({ days }, nowMs),
  };
}

export function buildFallbackMarketSchedule(
  conid: number,
  exchange?: string,
  nowMs = Date.now()
): MarketSchedule {
  const days: MarketScheduleDay[] = [];
  return {
    conid,
    exchange: exchange ?? null,
    timezone: 'UTC',
    source: 'contract/trading-schedule',
    fetchedAt: nowMs,
    days,
    state: deriveMarketScheduleState({ days }, nowMs),
  };
}

function formatScheduleTime(timestampMs: number, timeZone?: string) {
  return new Date(timestampMs).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  });
}

function formatScheduleLocalDate(timestampMs: number, timeZone?: string) {
  return new Date(timestampMs).toLocaleDateString('en-CA', {
    ...(timeZone ? { timeZone } : {}),
  });
}

function formatScheduleDateTime(timestampMs: number, timeZone?: string) {
  return new Date(timestampMs).toLocaleString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    ...(timeZone ? { timeZone } : {}),
  });
}

function flattenSessionWindows(
  schedule: Pick<MarketSchedule, 'days'>
): SessionWindowDescriptor[] {
  return schedule.days
    .flatMap((day) => [
      ...day.liquidHours.map((window) => ({
        code: 'REG' as const,
        opening: window.opening,
        closing: window.closing,
        active: false,
      })),
      ...day.extendedHours.map((window) => ({
        code: 'EXT' as const,
        opening: window.opening,
        closing: window.closing,
        active: false,
      })),
    ])
    .sort((left, right) => left.opening - right.opening);
}

export function getRelevantSessionWindow(
  schedule: Pick<MarketSchedule, 'days'>,
  nowMs = Date.now()
): SessionWindowDescriptor | null {
  const windows = flattenSessionWindows(schedule);
  const activeRegular =
    windows.find(
      (window) =>
        window.code === 'REG' && window.opening <= nowMs && nowMs < window.closing
    ) ?? null;

  if (activeRegular) {
    return {
      ...activeRegular,
      active: true,
    };
  }

  const activeExtended =
    windows.find(
      (window) =>
        window.code === 'EXT' && window.opening <= nowMs && nowMs < window.closing
    ) ?? null;

  if (activeExtended) {
    return {
      ...activeExtended,
      active: true,
    };
  }

  const nextWindow =
    windows.find((window) => window.opening > nowMs) ?? null;

  if (nextWindow) {
    return {
      ...nextWindow,
      active: false,
    };
  }

  return null;
}

function formatCountdown(targetMs: number, nowMs: number) {
  const remainingMs = Math.max(0, targetMs - nowMs);
  const totalSeconds = Math.floor(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const hh = String(hours).padStart(2, '0');
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `T-${hh}:${mm}:${ss}`;
}

function isContinuousSession(window: SessionWindowDescriptor) {
  const durationMs = window.closing - window.opening;
  return durationMs >= 23.5 * 60 * 60 * 1000;
}

function formatSessionRangeText(
  openingMs: number,
  closingMs: number,
  displayTimeZone?: string
) {
  const openingText = formatScheduleTime(openingMs, displayTimeZone);
  const closingText = formatScheduleTime(closingMs, displayTimeZone);
  const openingDate = formatScheduleLocalDate(openingMs, displayTimeZone);
  const closingDate = formatScheduleLocalDate(closingMs, displayTimeZone);

  return openingDate !== closingDate
    ? `${openingText}-${closingText} (+1d)`
    : `${openingText}-${closingText}`;
}

export function getMarketSessionPresentation(
  schedule: Pick<MarketSchedule, 'days'> | null | undefined,
  nowMs = Date.now(),
  displayTimeZone?: string
): MarketSessionPresentation | null {
  if (!schedule) return null;

  const window = getRelevantSessionWindow(schedule, nowMs);
  if (!window) return null;

  const showCountdown = !isContinuousSession(window);
  const target = window.active ? window.closing : window.opening;
  return {
    code: window.code,
    rangeText: formatSessionRangeText(window.opening, window.closing, displayTimeZone),
    countdownText: showCountdown ? formatCountdown(target, nowMs) : null,
    countdownTone: showCountdown ? (window.active ? 'close' : 'open') : null,
  };
}

export function formatMarketSessionDetail(
  schedule: Pick<MarketSchedule, 'days'> | null | undefined,
  nowMs = Date.now(),
  displayTimeZone?: string
) {
  const presentation = getMarketSessionPresentation(schedule, nowMs, displayTimeZone);
  if (!presentation) return null;
  return presentation.countdownText
    ? `${presentation.rangeText} ${presentation.countdownText}`
    : presentation.rangeText;
}

export function formatMarketSessionHint(
  schedule: Pick<MarketSchedule, 'days'> | null | undefined,
  nowMs = Date.now(),
  displayTimeZone?: string
) {
  return formatMarketSessionDetail(schedule, nowMs, displayTimeZone);
}

export function getMarketSessionVerbosePresentation(
  schedule: Pick<MarketSchedule, 'days' | 'state' | 'timezone'> | null | undefined,
  nowMs = Date.now(),
  displayTimeZone?: string
): MarketSessionVerbosePresentation | null {
  if (!schedule) return null;

  const presentation = getMarketSessionPresentation(schedule, nowMs, displayTimeZone);
  const state = 'state' in schedule ? schedule.state : deriveMarketScheduleState(schedule, nowMs);

  let phaseLabel = 'Closed';
  let primaryBoundaryLabel: string | null = null;
  let primaryBoundaryText: string | null = null;
  let secondaryBoundaryLabel: string | null = null;
  let secondaryBoundaryText: string | null = null;

  if (state.phase === 'regular') {
    phaseLabel = 'Regular Session';
    if (state.nextRegularClose) {
      primaryBoundaryLabel = 'Regular closes';
      primaryBoundaryText = formatScheduleDateTime(state.nextRegularClose, displayTimeZone);
    }
    if (state.nextExtendedClose) {
      secondaryBoundaryLabel = 'Extended closes';
      secondaryBoundaryText = formatScheduleDateTime(state.nextExtendedClose, displayTimeZone);
    }
  } else if (state.phase === 'extended') {
    phaseLabel = 'Extended Session';
    if (state.nextExtendedClose) {
      primaryBoundaryLabel = 'Extended closes';
      primaryBoundaryText = formatScheduleDateTime(state.nextExtendedClose, displayTimeZone);
    }
    if (state.nextRegularOpen && state.nextRegularOpen > nowMs) {
      secondaryBoundaryLabel = 'Regular opens';
      secondaryBoundaryText = formatScheduleDateTime(state.nextRegularOpen, displayTimeZone);
    } else if (state.nextExtendedOpen) {
      secondaryBoundaryLabel = 'Next extended opens';
      secondaryBoundaryText = formatScheduleDateTime(state.nextExtendedOpen, displayTimeZone);
    }
  } else {
    if (state.nextExtendedOpen) {
      primaryBoundaryLabel = 'Extended opens';
      primaryBoundaryText = formatScheduleDateTime(state.nextExtendedOpen, displayTimeZone);
    } else if (state.nextRegularOpen) {
      primaryBoundaryLabel = 'Regular opens';
      primaryBoundaryText = formatScheduleDateTime(state.nextRegularOpen, displayTimeZone);
    }
    if (state.nextRegularOpen && primaryBoundaryLabel !== 'Regular opens') {
      secondaryBoundaryLabel = 'Regular opens';
      secondaryBoundaryText = formatScheduleDateTime(state.nextRegularOpen, displayTimeZone);
    } else if (state.lastRegularClose) {
      secondaryBoundaryLabel = 'Last regular close';
      secondaryBoundaryText = formatScheduleDateTime(state.lastRegularClose, displayTimeZone);
    }
  }

  return {
    phaseLabel,
    rangeLabel: state.phase === 'closed' ? 'Next session' : 'Local session',
    currentRangeText: presentation?.rangeText ?? null,
    primaryBoundaryLabel,
    primaryBoundaryText,
    secondaryBoundaryLabel,
    secondaryBoundaryText,
    exchangeTimezone: 'timezone' in schedule ? schedule.timezone : null,
  };
}
