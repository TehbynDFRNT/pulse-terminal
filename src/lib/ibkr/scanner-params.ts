import type { ScannerFilterOption, ScannerOption, ScannerParams } from './types';

const PREFERRED_SCAN_TYPES = [
  'TOP_PERC_GAIN',
  'TOP_PERC_LOSE',
  'MOST_ACTIVE',
  'MOST_ACTIVE_USD',
  'HOT_BY_VOLUME',
  'HOT_BY_PRICE',
  'TOP_VOLUME_RATE',
  'HIGH_STVOLUME_3MIN',
  'HIGH_STVOLUME_5MIN',
  'HIGH_STVOLUME_10MIN',
  'TOP_OPEN_PERC_GAIN',
  'TOP_OPEN_PERC_LOSE',
  'HIGH_OPEN_GAP',
  'LOW_OPEN_GAP',
  'TOP_AFTER_HOURS_PERC_GAIN',
  'TOP_AFTER_HOURS_PERC_LOSE',
  'HIGH_DIVIDEND_YIELD_IB',
  'HIGH_VS_52W_HL',
  'LOW_VS_52W_HL',
  'HIGH_PE_RATIO',
  'LOW_PE_RATIO',
  'HIGH_GROWTH_RATE',
  'LOW_GROWTH_RATE',
  'TOP_TRADE_COUNT',
  'TOP_TRADE_RATE',
  'TOP_PRICE_RANGE',
  'HOT_BY_PRICE_RANGE',
];

const COMMON_FILTER_CODES = [
  'priceAbove',
  'priceBelow',
  'usdPriceAbove',
  'usdPriceBelow',
  'volumeAbove',
  'avgVolumeAbove',
  'avgUsdVolumeAbove',
  'volumeVsAvgAbove',
  'volumeVsAvgBelow',
  'marketCapAbove1e6',
  'marketCapBelow1e6',
  'changePercAbove',
  'changePercBelow',
  'changeOpenPercAbove',
  'changeOpenPercBelow',
  'stVolume3minAbove',
  'stVolume5minAbove',
  'stVolume10minAbove',
  'floatSharesAbove',
  'floatSharesBelow',
  'avgRatingAbove',
  'avgRatingBelow',
  'dividendYieldFrdAbove',
  'dividendYieldFrdBelow',
];

const PREFERRED_LOCATION_CODES: Record<string, string[]> = {
  STK: ['STK.US.MAJOR', 'STK.US.MINOR'],
  'ETF.EQ.US': ['ETF.EQ.US.MAJOR'],
  'ETF.FI.US': ['ETF.FI.US.MAJOR'],
  'FUT.US': ['FUT.CME', 'FUT.CBOT', 'FUT.NYMEX', 'FUT.COMEX'],
  'IND.US': ['IND.US'],
  'STOCK.NA': ['STK.NA.CANADA', 'STK.NA.MEXI'],
  'FUT.NA': ['FUT.NA.CDE', 'FUT.NA.MEXDER'],
  'SSF.NA': ['SSF.NA.MEXDER'],
  'STOCK.EU': ['STK.EU.LSE', 'STK.EU.IBIS', 'STK.EU.EBS', 'STK.EU.BVME'],
  'FUT.EU': ['FUT.EU.EUREX', 'FUT.EU.IDEM', 'FUT.EU.UK'],
  'IND.EU': ['IND.EU.EUREX', 'IND.EU.ICEEU', 'IND.EU.IDEM'],
  'SSF.EU': ['SSF.EU.EUREX'],
  'STOCK.ME': ['STK.ME.TASE', 'STK.ME.TADAWUL', 'STK.ME.ADX', 'STK.ME.DFM'],
  'STOCK.HK': ['STK.HK.SEHK', 'STK.HK.ASX', 'STK.HK.TSE_JPN', 'STK.HK.NSE'],
  'FUT.HK': ['FUT.HK.HKFE', 'FUT.HK.ICEAU', 'FUT.HK.SGX'],
  'IND.HK': ['IND.HK.HKFE', 'IND.HK.ICEAU', 'IND.HK.SGX'],
  'SSF.HK': ['SSF.HK.HKFE', 'SSF.HK.SGX'],
};

export function getCompatibleScannerLocations(
  params: ScannerParams,
  instrument: string
): ScannerOption[] {
  const scoped = params.locations.filter((option) =>
    option.instrumentTypes.includes(instrument)
  );
  const runnable = scoped.filter((option) => option.isLeaf !== false);
  return rankByCode(
    runnable.length > 0 ? runnable : scoped,
    PREFERRED_LOCATION_CODES[instrument] ?? []
  );
}

export function getCompatibleScannerScanTypes(
  params: ScannerParams,
  instrument: string
): ScannerOption[] {
  return rankByCode(
    params.scanTypes.filter(
      (option) =>
        option.instrumentTypes.length === 0 ||
        option.instrumentTypes.includes(instrument)
    ),
    PREFERRED_SCAN_TYPES
  ).slice(0, 48);
}

export function getCompatibleScannerFilters(
  params: ScannerParams,
  instrument: string
): ScannerFilterOption[] {
  return rankByCode(
    params.filters.filter(
      (option) =>
        COMMON_FILTER_CODES.includes(option.code) &&
        (option.instrumentTypes.length === 0 ||
          option.instrumentTypes.includes(instrument))
    ),
    COMMON_FILTER_CODES
  );
}

export function compactScannerParams(
  params: ScannerParams,
  instrument: string
): ScannerParams {
  return {
    instruments: params.instruments,
    locations: getCompatibleScannerLocations(params, instrument),
    scanTypes: getCompatibleScannerScanTypes(params, instrument),
    filters: getCompatibleScannerFilters(params, instrument),
  };
}

export function isCompatibleScannerLocation(
  params: ScannerParams,
  instrument: string,
  location: string
): boolean {
  return getCompatibleScannerLocations(params, instrument).some(
    (option) => option.code === location
  );
}

export function isCompatibleScannerScanType(
  params: ScannerParams,
  instrument: string,
  scanType: string
): boolean {
  return getCompatibleScannerScanTypes(params, instrument).some(
    (option) => option.code === scanType
  );
}

function rankByCode<T extends { code: string; label: string }>(
  options: T[],
  preferredCodes: string[]
): T[] {
  const priority = new Map(preferredCodes.map((code, index) => [code, index]));
  return [...options].sort((left, right) => {
    const leftPriority = priority.get(left.code);
    const rightPriority = priority.get(right.code);

    if (leftPriority != null || rightPriority != null) {
      if (leftPriority == null) return 1;
      if (rightPriority == null) return -1;
      return leftPriority - rightPriority;
    }

    return left.label.localeCompare(right.label);
  });
}
