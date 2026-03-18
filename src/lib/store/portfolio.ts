import { create } from 'zustand';
import type { CashBalance, Position, AccountSummary, PortfolioPnL } from '@/lib/ibkr/types';

interface PortfolioState {
  positions: Position[];
  cashBalances: CashBalance[];
  baseCurrency: string | null;
  summary: AccountSummary | null;
  pnl: PortfolioPnL | null;
  accountId: string;
  isConnected: boolean;
  isPaper: boolean;
  updatedAt: number | null;

  // Actions
  setPositions: (positions: Position[]) => void;
  setCashBalances: (cashBalances: CashBalance[], baseCurrency: string | null) => void;
  setSummary: (summary: AccountSummary) => void;
  setPnL: (pnl: PortfolioPnL) => void;
  setAccountId: (id: string) => void;
  setConnected: (connected: boolean) => void;
  setIsPaper: (paper: boolean) => void;
  updatePnL: (update: Partial<PortfolioPnL>) => void;
}

export const usePortfolioStore = create<PortfolioState>((set) => ({
  positions: [],
  cashBalances: [],
  baseCurrency: null,
  summary: null,
  pnl: null,
  accountId: '',
  isConnected: false,
  isPaper: false,
  updatedAt: null,

  setPositions: (positions) => set({ positions, updatedAt: Date.now() }),
  setCashBalances: (cashBalances, baseCurrency) =>
    set({ cashBalances, baseCurrency, updatedAt: Date.now() }),
  setSummary: (summary) => set({ summary, updatedAt: Date.now() }),
  setPnL: (pnl) => set({ pnl, updatedAt: Date.now() }),
  setAccountId: (accountId) => set({ accountId }),
  setConnected: (isConnected) => set({ isConnected }),
  setIsPaper: (isPaper) => set({ isPaper }),
  updatePnL: (update) =>
    set((s) => ({ pnl: s.pnl ? { ...s.pnl, ...update } : null, updatedAt: Date.now() })),
}));
