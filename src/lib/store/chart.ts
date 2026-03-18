import { create } from 'zustand';

type SharedChartMode = 'line' | 'candle';

interface SharedChartViewEntry {
  timeframeKey: string;
  resolutionKey: string;
  mode: SharedChartMode;
  resolutionByTimeframe?: Record<string, string>;
}

interface SharedChartViewState {
  entries: Record<string, SharedChartViewEntry>;
  setEntry: (key: string, entry: SharedChartViewEntry) => void;
}

export const useSharedChartViewStore = create<SharedChartViewState>((set) => ({
  entries: {},
  setEntry: (key, entry) =>
    set((state) => ({
      entries: {
        ...state.entries,
        [key]: entry,
      },
    })),
}));
