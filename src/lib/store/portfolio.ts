import { create } from 'zustand';
import type { Position, AccountSummary, PortfolioPnL } from '@/lib/ibkr/types';

interface PortfolioState {
  positions: Position[];
  summary: AccountSummary | null;
  pnl: PortfolioPnL | null;
  accountId: string;
  isConnected: boolean;
  isPaper: boolean;

  // Actions
  setPositions: (positions: Position[]) => void;
  setSummary: (summary: AccountSummary) => void;
  setPnL: (pnl: PortfolioPnL) => void;
  setAccountId: (id: string) => void;
  setConnected: (connected: boolean) => void;
  setIsPaper: (paper: boolean) => void;
  updatePnL: (update: Partial<PortfolioPnL>) => void;
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  positions: [],
  summary: null,
  pnl: null,
  accountId: '',
  isConnected: false,
  isPaper: false,

  setPositions: (positions) => set({ positions }),
  setSummary: (summary) => set({ summary }),
  setPnL: (pnl) => set({ pnl }),
  setAccountId: (accountId) => set({ accountId }),
  setConnected: (isConnected) => set({ isConnected }),
  setIsPaper: (isPaper) => set({ isPaper }),
  updatePnL: (update) =>
    set((s) => ({ pnl: s.pnl ? { ...s.pnl, ...update } : null })),
}));
