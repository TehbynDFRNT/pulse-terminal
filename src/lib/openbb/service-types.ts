export type OpenBBServiceState = 'connected' | 'starting' | 'offline';

export interface OpenBBServiceStatus {
  state: OpenBBServiceState;
  connected: boolean;
  running: boolean;
  pid: number | null;
  url: string;
  datasets: string[];
  error: string | null;
  checkedAt: number;
}
