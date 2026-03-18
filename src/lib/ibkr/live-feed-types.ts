export interface StreamingPrice {
  conid: number;
  last: number;
  lastSize: number;
  displayPrice: number;
  displayChange: number;
  displayChangePct: string;
  displaySource: 'mid' | 'last' | 'bid' | 'ask' | 'none';
  chartPrice: number;
  chartSource: 'mid' | 'last' | 'bid' | 'ask' | 'none';
  bid: number;
  bidSize: number;
  ask: number;
  askSize: number;
  change: number;
  changePct: string;
  volume: number;
  dayLow: number;
  dayHigh: number;
  updated: number;
}

export interface StreamingChartBeat {
  timeMs: number;
  value: number;
  source: 'mid' | 'last' | 'bid' | 'ask' | 'none';
}

export interface LiveFeedState {
  connected: boolean;
  source: 'snapshot-daemon';
  updatedAt: number;
  lastSuccessAt: number;
  error: string | null;
  prices: Record<string, StreamingPrice>;
  chartBeats: Record<string, StreamingChartBeat[]>;
}

export interface LiveFeedResponse {
  connected: boolean;
  source: 'snapshot-daemon';
  updatedAt: number;
  lastSuccessAt: number;
  error: string | null;
  prices: StreamingPrice[];
  chartBeats: Record<string, StreamingChartBeat[]>;
}

export interface LiveFeedQuery {
  beatsSince: Record<number, number>;
}
