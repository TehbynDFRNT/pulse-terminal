import type {
  ContractOrderInfo,
  ContractOrderRuleSet,
  OrderParams,
  OrderTicket,
  OrderType,
  OrderTypeOption,
  TimeInForce,
  TimeInForceOption,
} from './types';

const ORDER_TYPE_META: Record<
  string,
  Omit<OrderTypeOption, 'supportsOutsideRth' | 'supportsCashQuantity' | 'raw'>
> = {
  MKT: {
    code: 'MKT',
    label: 'Market',
    requiresLimitPrice: false,
    requiresStopPrice: false,
    priceLabel: null,
    priceRequired: false,
    priceAllowsZero: false,
    priceOptional: false,
    auxPriceLabel: null,
    auxPriceRequired: false,
    trailingLabel: null,
    trailingRequired: false,
    supportsTrailingPercent: false,
    uiSupported: true,
  },
  LMT: {
    code: 'LMT',
    label: 'Limit',
    requiresLimitPrice: true,
    requiresStopPrice: false,
    priceLabel: 'Limit Price',
    priceRequired: true,
    priceAllowsZero: false,
    priceOptional: false,
    auxPriceLabel: null,
    auxPriceRequired: false,
    trailingLabel: null,
    trailingRequired: false,
    supportsTrailingPercent: false,
    uiSupported: true,
  },
  STP: {
    code: 'STP',
    label: 'Stop',
    requiresLimitPrice: true,
    requiresStopPrice: false,
    priceLabel: 'Stop / Trigger',
    priceRequired: true,
    priceAllowsZero: false,
    priceOptional: false,
    auxPriceLabel: null,
    auxPriceRequired: false,
    trailingLabel: null,
    trailingRequired: false,
    supportsTrailingPercent: false,
    uiSupported: true,
  },
  STOP_LIMIT: {
    code: 'STOP_LIMIT',
    label: 'Stop Limit',
    requiresLimitPrice: true,
    requiresStopPrice: true,
    priceLabel: 'Limit Price',
    priceRequired: true,
    priceAllowsZero: false,
    priceOptional: false,
    auxPriceLabel: 'Stop / Trigger',
    auxPriceRequired: true,
    trailingLabel: null,
    trailingRequired: false,
    supportsTrailingPercent: false,
    uiSupported: true,
  },
  MIDPRICE: {
    code: 'MIDPRICE',
    label: 'Midprice',
    requiresLimitPrice: true,
    requiresStopPrice: false,
    priceLabel: 'Price Cap',
    priceRequired: true,
    priceAllowsZero: true,
    priceOptional: false,
    auxPriceLabel: null,
    auxPriceRequired: false,
    trailingLabel: null,
    trailingRequired: false,
    supportsTrailingPercent: false,
    uiSupported: true,
  },
  TRAIL: {
    code: 'TRAIL',
    label: 'Trailing Stop',
    requiresLimitPrice: false,
    requiresStopPrice: false,
    priceLabel: 'Initial Stop',
    priceRequired: false,
    priceAllowsZero: false,
    priceOptional: true,
    auxPriceLabel: null,
    auxPriceRequired: false,
    trailingLabel: 'Trailing Amount',
    trailingRequired: true,
    supportsTrailingPercent: true,
    uiSupported: true,
  },
  TRAILLMT: {
    code: 'TRAILLMT',
    label: 'Trailing Stop Limit',
    requiresLimitPrice: false,
    requiresStopPrice: true,
    priceLabel: 'Initial Stop',
    priceRequired: false,
    priceAllowsZero: false,
    priceOptional: true,
    auxPriceLabel: 'Limit Offset',
    auxPriceRequired: true,
    trailingLabel: 'Trailing Amount',
    trailingRequired: true,
    supportsTrailingPercent: true,
    uiSupported: true,
  },
  MIT: {
    code: 'MIT',
    label: 'Market If Touched',
    requiresLimitPrice: false,
    requiresStopPrice: true,
    priceLabel: null,
    priceRequired: false,
    priceAllowsZero: false,
    priceOptional: false,
    auxPriceLabel: 'Trigger Price',
    auxPriceRequired: true,
    trailingLabel: null,
    trailingRequired: false,
    supportsTrailingPercent: false,
    uiSupported: true,
  },
  LIT: {
    code: 'LIT',
    label: 'Limit If Touched',
    requiresLimitPrice: true,
    requiresStopPrice: true,
    priceLabel: 'Limit Price',
    priceRequired: true,
    priceAllowsZero: false,
    priceOptional: false,
    auxPriceLabel: 'Trigger Price',
    auxPriceRequired: true,
    trailingLabel: null,
    trailingRequired: false,
    supportsTrailingPercent: false,
    uiSupported: true,
  },
  REL: {
    code: 'REL',
    label: 'Relative',
    requiresLimitPrice: false,
    requiresStopPrice: true,
    priceLabel: 'Price Cap',
    priceRequired: false,
    priceAllowsZero: false,
    priceOptional: true,
    auxPriceLabel: 'Offset',
    auxPriceRequired: true,
    trailingLabel: null,
    trailingRequired: false,
    supportsTrailingPercent: false,
    uiSupported: true,
  },
  MOC: {
    code: 'MOC',
    label: 'Market on Close',
    requiresLimitPrice: false,
    requiresStopPrice: false,
    priceLabel: null,
    priceRequired: false,
    priceAllowsZero: false,
    priceOptional: false,
    auxPriceLabel: null,
    auxPriceRequired: false,
    trailingLabel: null,
    trailingRequired: false,
    supportsTrailingPercent: false,
    uiSupported: true,
  },
  LOC: {
    code: 'LOC',
    label: 'Limit on Close',
    requiresLimitPrice: true,
    requiresStopPrice: false,
    priceLabel: 'Limit Price',
    priceRequired: true,
    priceAllowsZero: false,
    priceOptional: false,
    auxPriceLabel: null,
    auxPriceRequired: false,
    trailingLabel: null,
    trailingRequired: false,
    supportsTrailingPercent: false,
    uiSupported: true,
  },
};

const RAW_TO_ORDER_TYPE: Record<string, OrderType> = {
  market: 'MKT',
  limit: 'LMT',
  stop: 'STP',
  stop_limit: 'STOP_LIMIT',
  stoplimit: 'STOP_LIMIT',
  stp_limit: 'STOP_LIMIT',
  stop_limit_on_quote: 'STOP_LIMIT',
  midprice: 'MIDPRICE',
  trailing_stop: 'TRAIL',
  trailing_stop_limit: 'TRAILLMT',
  traillmt: 'TRAILLMT',
  trail: 'TRAIL',
  mit: 'MIT',
  lit: 'LIT',
  relative: 'REL',
  rel: 'REL',
  marketonclose: 'MOC',
  moc: 'MOC',
  limitonclose: 'LOC',
  loc: 'LOC',
  mkt: 'MKT',
  lmt: 'LMT',
  stp: 'STP',
  stop_limit_order: 'STOP_LIMIT',
};

function decimalsForStep(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 2;
  const text = step.toString();
  const expMatch = text.match(/e-(\d+)$/i);
  if (expMatch) {
    return Number(expMatch[1]);
  }
  const decimal = text.split('.')[1];
  return decimal ? decimal.length : 0;
}

function quantityLabelForType(type: string): string {
  switch (type) {
    case 'CASH':
      return 'Units';
    case 'FUT':
    case 'FOP':
    case 'OPT':
    case 'WAR':
      return 'Contracts';
    default:
      return 'Quantity';
  }
}

export function canonicalizeOrderType(input: string): OrderType {
  const normalized = RAW_TO_ORDER_TYPE[input.toLowerCase()];
  return normalized ?? (input.toUpperCase() as OrderType);
}

export function canonicalizeTimeInForce(input: string): TimeInForce {
  return input.toUpperCase() as TimeInForce;
}

function buildOrderTypeOption(
  raw: string,
  rules: ContractOrderRuleSet,
  contract: ContractOrderInfo
): OrderTypeOption {
  const code = canonicalizeOrderType(raw);
  const meta = ORDER_TYPE_META[code] ?? {
    code,
    label: code,
    requiresLimitPrice: false,
    requiresStopPrice: false,
    priceLabel: null,
    priceRequired: false,
    priceAllowsZero: false,
    priceOptional: false,
    auxPriceLabel: null,
    auxPriceRequired: false,
    trailingLabel: null,
    trailingRequired: false,
    supportsTrailingPercent: false,
    uiSupported: false,
  };

  const supportsCashQuantity =
    (contract.instrumentType === 'CASH' || contract.instrumentType === 'CRYPTO') &&
    rules.cqtTypes.some((candidate) => canonicalizeOrderType(candidate) === code);

  return {
    code,
    label: meta.label,
    raw,
    supportsOutsideRth: rules.orderTypesOutside.some(
      (candidate) => canonicalizeOrderType(candidate) === code
    ),
    supportsCashQuantity,
    requiresLimitPrice: meta.requiresLimitPrice,
    requiresStopPrice: meta.requiresStopPrice,
    priceLabel: meta.priceLabel,
    priceRequired: meta.priceRequired,
    priceAllowsZero: meta.priceAllowsZero,
    priceOptional: meta.priceOptional,
    auxPriceLabel: meta.auxPriceLabel,
    auxPriceRequired: meta.auxPriceRequired,
    trailingLabel: meta.trailingLabel,
    trailingRequired: meta.trailingRequired,
    supportsTrailingPercent: meta.supportsTrailingPercent,
    uiSupported: meta.uiSupported,
  };
}

function mergeTifOptions(rawTifs: string[]): TimeInForceOption[] {
  const merged = new Map<TimeInForce, TimeInForceOption>();

  for (const raw of rawTifs) {
    const [prefix, rest = ''] = raw.split('/');
    const code = canonicalizeTimeInForce(prefix);
    const allowedOrderTypes = rest
      .split(',')
      .map((value) => value.trim())
      .filter((value) => value && value !== 'o' && value !== 'a')
      .map(canonicalizeOrderType);

    const existing = merged.get(code);
    if (!existing) {
      merged.set(code, {
        code,
        label: code,
        raw,
        allowedOrderTypes,
      });
      continue;
    }

    const mergedAllowed = new Set([...existing.allowedOrderTypes, ...allowedOrderTypes]);
    existing.allowedOrderTypes = Array.from(mergedAllowed);
    existing.raw = `${existing.raw} | ${raw}`;
  }

  return Array.from(merged.values());
}

function inferDefaultQuantity(contract: ContractOrderInfo, rules: ContractOrderRuleSet): number {
  if (contract.instrumentType === 'FUT' || contract.instrumentType === 'FOP' || contract.instrumentType === 'OPT') {
    return 1;
  }

  const sizeFromDefaults = Number(rules.tifDefaults.SIZE);
  if (Number.isFinite(sizeFromDefaults) && sizeFromDefaults > 0) {
    return sizeFromDefaults;
  }

  if (rules.defaultSize != null && rules.defaultSize > 0) {
    return rules.defaultSize;
  }

  return contract.instrumentType === 'CASH' ? 1000 : 1;
}

export function buildOrderTicket(
  contract: ContractOrderInfo,
  rules: ContractOrderRuleSet
): OrderTicket {
  const rawOrderTypes = Array.from(new Set(rules.orderTypes));
  const allOrderTypes = rawOrderTypes.map((raw) => buildOrderTypeOption(raw, rules, contract));
  const orderTypes = allOrderTypes.filter((option) => option.uiSupported);
  const unsupportedOrderTypes = allOrderTypes.filter((option) => !option.uiSupported);
  const tifOptions = mergeTifOptions(rules.tifTypes);
  const priceStep = rules.increment && rules.increment > 0 ? rules.increment : 0.01;
  const priceDigits =
    rules.incrementDigits != null && rules.incrementDigits >= 0
      ? rules.incrementDigits
      : decimalsForStep(priceStep);

  const defaultOrderType =
    orderTypes.find((option) => option.code === 'MKT')?.code ?? orderTypes[0]?.code ?? 'MKT';
  const defaultTif = canonicalizeTimeInForce(rules.tifDefaults.TIF || 'DAY');

  return {
    contract,
    rules: {
      ...rules,
      tifDefaults: rules.tifDefaults,
    },
    orderTypes,
    unsupportedOrderTypes,
    tifOptions,
    defaultOrderType,
    defaultTif,
    defaultQuantity: inferDefaultQuantity(contract, rules),
    quantityLabel: quantityLabelForType(contract.instrumentType),
    quantityStep:
      contract.instrumentType === 'CASH' && rules.sizeIncrement && rules.sizeIncrement > 0
        ? rules.sizeIncrement
        : 1,
    priceStep,
    priceDigits,
    supportsCashQuantity:
      (contract.instrumentType === 'CASH' || contract.instrumentType === 'CRYPTO') &&
      rules.cqtTypes.length > 0,
  };
}

export function getAllowedTifsForOrderType(
  ticket: OrderTicket,
  orderType: OrderType
): TimeInForceOption[] {
  return ticket.tifOptions.filter(
    (option) =>
      option.allowedOrderTypes.length === 0 || option.allowedOrderTypes.includes(orderType)
  );
}

export function normalizeOrderParamsForTicket(
  params: OrderParams,
  ticket: OrderTicket
): OrderParams {
  const orderType = canonicalizeOrderType(params.orderType);
  const tif = canonicalizeTimeInForce(params.tif || ticket.defaultTif);

  const normalized: OrderParams = {
    ...params,
    orderType,
    tif,
  };

  if (orderType === 'STP' && normalized.price == null && normalized.auxPrice != null) {
    normalized.price = normalized.auxPrice;
  }

  if (
    orderType === 'MIT' &&
    normalized.auxPrice == null &&
    normalized.price != null &&
    !ORDER_TYPE_META[orderType].priceRequired
  ) {
    normalized.auxPrice = normalized.price;
  }

  if (orderType === 'MKT' || orderType === 'MOC') {
    delete normalized.price;
    delete normalized.auxPrice;
    delete normalized.trailingAmt;
    delete normalized.trailingType;
  }

  if (orderType === 'LMT' || orderType === 'LOC') {
    delete normalized.auxPrice;
    delete normalized.trailingAmt;
    delete normalized.trailingType;
  }

  if (orderType === 'STP') {
    delete normalized.auxPrice;
    delete normalized.trailingAmt;
    delete normalized.trailingType;
  }

  if (orderType === 'STOP_LIMIT' || orderType === 'MIT' || orderType === 'LIT' || orderType === 'REL' || orderType === 'MIDPRICE') {
    delete normalized.trailingAmt;
    delete normalized.trailingType;
  }

  if (orderType === 'TRAIL' || orderType === 'TRAILLMT') {
    normalized.trailingType =
      normalized.trailingType === '%' ? '%' : 'amt';
  }

  return normalized;
}

export function validateOrderParamsForTicket(
  params: OrderParams,
  ticket: OrderTicket
): string[] {
  const errors: string[] = [];
  const normalized = normalizeOrderParamsForTicket(params, ticket);
  const orderType = canonicalizeOrderType(normalized.orderType);
  const orderTypeOption = ticket.orderTypes.find((option) => option.code === orderType);

  if (!orderTypeOption) {
    errors.push(`Order type ${orderType} is not supported for ${ticket.contract.symbol}.`);
  }

  const tif = canonicalizeTimeInForce(normalized.tif || ticket.defaultTif);
  const allowedTifs = getAllowedTifsForOrderType(ticket, orderType);
  if (allowedTifs.length > 0 && !allowedTifs.some((option) => option.code === tif)) {
    errors.push(`Time in force ${tif} is not allowed for ${orderType} on ${ticket.contract.symbol}.`);
  }

  if (normalized.cashQty != null) {
    if (!ticket.supportsCashQuantity) {
      errors.push(`Cash quantity orders are not supported for ${ticket.contract.symbol}.`);
    }
    if (!Number.isFinite(normalized.cashQty) || normalized.cashQty <= 0) {
      errors.push('Cash quantity must be greater than zero.');
    }
    if (normalized.quantity != null) {
      errors.push('Send either quantity or cash quantity, not both.');
    }
  } else if (!Number.isFinite(normalized.quantity) || (normalized.quantity ?? 0) <= 0) {
    errors.push(`${ticket.quantityLabel} must be greater than zero.`);
  }

  if (orderTypeOption?.priceRequired) {
    const minPrice = orderTypeOption.priceAllowsZero ? 0 : Number.EPSILON;
    if (!Number.isFinite(normalized.price) || normalized.price == null || normalized.price < minPrice) {
      errors.push(`Order type ${orderType} requires ${orderTypeOption.priceLabel?.toLowerCase() || 'a price'}.`);
    }
  }

  if (orderTypeOption?.auxPriceRequired) {
    const auxValue = normalized.auxPrice;
    const invalidAux =
      !Number.isFinite(auxValue) ||
      auxValue == null ||
      (orderType === 'REL' ? auxValue === 0 : auxValue <= 0);
    if (invalidAux) {
      errors.push(
        `Order type ${orderType} requires ${orderTypeOption.auxPriceLabel?.toLowerCase() || 'a secondary price'}.`
      );
    }
  }

  if (orderTypeOption?.trailingRequired) {
    if (!Number.isFinite(normalized.trailingAmt) || normalized.trailingAmt == null || normalized.trailingAmt <= 0) {
      errors.push(`Order type ${orderType} requires a trailing amount or percent.`);
    }
    if (normalized.trailingType !== 'amt' && normalized.trailingType !== '%') {
      errors.push(`Order type ${orderType} requires trailingType to be "amt" or "%".`);
    }
  }

  if (normalized.outsideRTH && !orderTypeOption?.supportsOutsideRth) {
    errors.push(`${orderType} cannot be submitted outside regular trading hours for this contract.`);
  }

  if (normalized.listingExchange) {
    const normalizedExchange = normalized.listingExchange.toUpperCase();
    const valid = new Set(
      [ticket.contract.exchange, ...ticket.contract.validExchanges].map((exchange) => exchange.toUpperCase())
    );
    if (!valid.has(normalizedExchange)) {
      errors.push(`Routing exchange ${normalized.listingExchange} is not valid for ${ticket.contract.symbol}.`);
    }
  }

  if (
    normalized.cashQty != null &&
    ticket.rules.cashQtyIncr != null &&
    ticket.rules.cashQtyIncr > 0
  ) {
    const remainder = normalized.cashQty % ticket.rules.cashQtyIncr;
    if (Math.abs(remainder) > 1e-9 && Math.abs(remainder - ticket.rules.cashQtyIncr) > 1e-9) {
      errors.push(`Cash quantity must be a multiple of ${ticket.rules.cashQtyIncr}.`);
    }
  }

  return errors;
}
