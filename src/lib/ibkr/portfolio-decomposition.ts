import type {
  AccountSummary,
  CashBalance,
  PortfolioDecompositionBucket,
  PortfolioDecompositionResponse,
  Position,
  SecurityDefinition,
} from './types';

interface BuildPortfolioDecompositionParams {
  accountId: string;
  baseCurrency: string | null;
  summary: AccountSummary | null;
  positions: Position[];
  cashBalances: CashBalance[];
  securityDefinitions: SecurityDefinition[];
}

function buildBuckets(
  entries: Map<string, { label: string; value: number; positions: number }>
): PortfolioDecompositionBucket[] {
  const total = Array.from(entries.values()).reduce(
    (sum, entry) => sum + Math.abs(entry.value),
    0
  );

  return Array.from(entries.entries())
    .map(([key, entry]) => ({
      key,
      label: entry.label,
      value: entry.value,
      weight: total > 0 ? Math.abs(entry.value) / total : 0,
      positions: entry.positions,
    }))
    .sort((left, right) => Math.abs(right.value) - Math.abs(left.value));
}

function upsertBucket(
  buckets: Map<string, { label: string; value: number; positions: number }>,
  key: string,
  label: string,
  value: number,
  positions = 0
) {
  const existing = buckets.get(key) ?? { label, value: 0, positions: 0 };
  existing.value += value;
  existing.positions += positions;
  buckets.set(key, existing);
}

export function buildPortfolioDecomposition({
  accountId,
  baseCurrency,
  summary,
  positions,
  cashBalances,
  securityDefinitions,
}: BuildPortfolioDecompositionParams): PortfolioDecompositionResponse {
  const assetClasses = new Map<string, { label: string; value: number; positions: number }>();
  const currencies = new Map<string, { label: string; value: number; positions: number }>();
  const sectors = new Map<string, { label: string; value: number; positions: number }>();
  const groups = new Map<string, { label: string; value: number; positions: number }>();
  const secDefsByConid = new Map(
    securityDefinitions.map((definition) => [definition.conid, definition] as const)
  );

  for (const position of positions) {
    const secdef = secDefsByConid.get(position.conid) ?? null;
    const sector = secdef?.sector || 'Unclassified';
    const group = secdef?.sectorGroup || secdef?.group || 'Unclassified';

    upsertBucket(assetClasses, position.assetClass || 'Other', position.assetClass || 'Other', position.marketValue, 1);
    upsertBucket(currencies, position.currency || '—', position.currency || '—', position.marketValue, 1);
    upsertBucket(sectors, sector, sector, position.marketValue, 1);
    upsertBucket(groups, group, group, position.marketValue, 1);
  }

  let cashTotal = 0;
  for (const balance of cashBalances) {
    cashTotal += balance.baseEquivalent;
    upsertBucket(currencies, balance.currency, balance.currency, balance.baseEquivalent, 1);
  }

  if (Math.abs(cashTotal) > 0.000001) {
    upsertBucket(assetClasses, 'CASH', 'Cash', cashTotal, cashBalances.length);
  }

  const grossExposure =
    buildBuckets(assetClasses).reduce((sum, bucket) => sum + Math.abs(bucket.value), 0);

  return {
    accountId,
    baseCurrency,
    netLiquidity:
      summary?.netLiquidity ??
      positions.reduce((sum, position) => sum + position.marketValue, 0) + cashTotal,
    grossExposure,
    assetClasses: buildBuckets(assetClasses),
    currencies: buildBuckets(currencies),
    sectors: buildBuckets(sectors),
    groups: buildBuckets(groups),
  };
}
