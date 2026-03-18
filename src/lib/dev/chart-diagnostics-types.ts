export type ChartDiagnosticEvent =
  | 'chart-feed:bootstrap'
  | 'chart-feed:stream'
  | 'chart-feed:liveline'
  | 'price-chart:render';

export interface ChartDiagnosticEntry {
  seq: number;
  event: ChartDiagnosticEvent;
  scope: string;
  signature: string;
  count: number;
  firstAt: number;
  lastAt: number;
  summary: unknown;
  latestDetail: unknown;
}

export interface ChartDiagnosticRecord {
  event: ChartDiagnosticEvent;
  scope: string;
  signature?: string;
  summary: unknown;
  detail: unknown;
}
