export interface DisplayPriceInput {
  last?: number | null;
  bid?: number | null;
  ask?: number | null;
  prevClose?: number | null;
  change?: number | null;
  changePct?: string | null;
}

export interface DisplayPriceOutput {
  displayPrice: number;
  displayChange: number;
  displayChangePct: string;
  displaySource: 'mid' | 'last' | 'bid' | 'ask' | 'none';
}

export interface ChartBeatPriceOutput {
  chartPrice: number;
  chartSource: 'mid' | 'last' | 'bid' | 'ask' | 'none';
}

function isValidPrice(value: number | null | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function getDisplayPrice(input: DisplayPriceInput): DisplayPriceOutput {
  const bid = isValidPrice(input.bid) ? input.bid : null;
  const ask = isValidPrice(input.ask) ? input.ask : null;
  const last = isValidPrice(input.last) ? input.last : null;
  const prevClose = isValidPrice(input.prevClose) ? input.prevClose : null;

  let displayPrice = 0;
  let displaySource: DisplayPriceOutput['displaySource'] = 'none';

  if (bid != null && ask != null && ask >= bid) {
    displayPrice = (bid + ask) / 2;
    displaySource = 'mid';
  } else if (last != null) {
    displayPrice = last;
    displaySource = 'last';
  } else if (bid != null) {
    displayPrice = bid;
    displaySource = 'bid';
  } else if (ask != null) {
    displayPrice = ask;
    displaySource = 'ask';
  }

  if (displayPrice > 0 && prevClose != null) {
    const displayChange = displayPrice - prevClose;
    const displayChangePct = `${(displayChange / prevClose) * 100}%`;
    return {
      displayPrice,
      displayChange,
      displayChangePct,
      displaySource,
    };
  }

  return {
    displayPrice,
    displayChange:
      typeof input.change === 'number' && Number.isFinite(input.change)
        ? input.change
        : 0,
    displayChangePct: input.changePct ? String(input.changePct) : '0%',
    displaySource,
  };
}

export function getChartBeatPrice(
  input: DisplayPriceInput & { preferLast?: boolean }
): ChartBeatPriceOutput {
  const bid = isValidPrice(input.bid) ? input.bid : null;
  const ask = isValidPrice(input.ask) ? input.ask : null;
  const last = isValidPrice(input.last) ? input.last : null;

  if (input.preferLast && last != null) {
    return {
      chartPrice: last,
      chartSource: 'last',
    };
  }

  if (bid != null && ask != null && ask >= bid) {
    return {
      chartPrice: (bid + ask) / 2,
      chartSource: 'mid',
    };
  }

  if (last != null) {
    return {
      chartPrice: last,
      chartSource: 'last',
    };
  }

  if (bid != null) {
    return {
      chartPrice: bid,
      chartSource: 'bid',
    };
  }

  if (ask != null) {
    return {
      chartPrice: ask,
      chartSource: 'ask',
    };
  }

  return {
    chartPrice: 0,
    chartSource: 'none',
  };
}
