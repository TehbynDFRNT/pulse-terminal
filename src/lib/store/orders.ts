import { create } from 'zustand';
import { canonicalizeOrderType, canonicalizeTimeInForce } from '@/lib/ibkr/order-ticket';
import type { Order, OrderSide, OrderType, TimeInForce, TrailingType } from '@/lib/ibkr/types';

interface OrderFormState {
  side: OrderSide;
  orderType: OrderType;
  quantityMode: 'units' | 'cash' | 'exposure';
  quantity: number;
  cashQty: number | null;
  exposureAmount: number | null;
  price: number | null;
  auxPrice: number | null;
  trailingAmt: number | null;
  trailingType: TrailingType;
  tif: TimeInForce;
  outsideRTH: boolean;
  listingExchange: string | null;
}

interface PreparedOrderDraft {
  conid: number;
  quantityMode: 'units' | 'cash' | 'exposure';
  quantity: number;
  cashQty: number | null;
  exposureAmount: number | null;
}

interface OrdersState {
  orders: Order[];
  isSubmitting: boolean;
  orderForm: OrderFormState;
  preparedDraft: PreparedOrderDraft | null;

  // Actions
  setOrders: (orders: Order[]) => void;
  updateOrder: (order: Partial<Order> & { orderId: number }) => void;
  removeOrder: (orderId: number) => void;
  setSubmitting: (submitting: boolean) => void;

  // Order form
  setSide: (side: OrderSide) => void;
  setOrderType: (type: OrderType) => void;
  setQuantityMode: (mode: 'units' | 'cash' | 'exposure') => void;
  setQuantity: (qty: number) => void;
  setCashQty: (qty: number | null) => void;
  setExposureAmount: (amount: number | null) => void;
  setPrice: (price: number | null) => void;
  setAuxPrice: (price: number | null) => void;
  setTrailingAmt: (amount: number | null) => void;
  setTrailingType: (kind: TrailingType) => void;
  setTif: (tif: TimeInForce) => void;
  setOutsideRTH: (value: boolean) => void;
  setListingExchange: (value: string | null) => void;
  setPreparedDraft: (draft: PreparedOrderDraft | null) => void;
  clearPreparedDraft: () => void;
  resetForm: () => void;
}

const DEFAULT_FORM: OrderFormState = {
  side: 'BUY',
  orderType: 'MKT',
  quantityMode: 'units',
  quantity: 100,
  cashQty: null,
  exposureAmount: null,
  price: null,
  auxPrice: null,
  trailingAmt: null,
  trailingType: 'amt',
  tif: 'DAY',
  outsideRTH: false,
  listingExchange: null,
};

export const useOrdersStore = create<OrdersState>((set) => ({
  orders: [],
  isSubmitting: false,
  orderForm: { ...DEFAULT_FORM },
  preparedDraft: null,

  setOrders: (orders) => set({ orders }),

  updateOrder: (update) => {
    set((s) => ({
      orders: s.orders.map((o) =>
        o.orderId === update.orderId ? { ...o, ...update } : o
      ),
    }));
  },

  removeOrder: (orderId) => {
    set((s) => ({
      orders: s.orders.filter((o) => o.orderId !== orderId),
    }));
  },

  setSubmitting: (isSubmitting) => set({ isSubmitting }),

  setSide: (side) =>
    set((s) => ({ orderForm: { ...s.orderForm, side } })),
  setOrderType: (orderType) =>
    set((s) => ({ orderForm: { ...s.orderForm, orderType: canonicalizeOrderType(orderType) } })),
  setQuantityMode: (quantityMode) =>
    set((s) => ({ orderForm: { ...s.orderForm, quantityMode } })),
  setQuantity: (quantity) =>
    set((s) => ({ orderForm: { ...s.orderForm, quantity } })),
  setCashQty: (cashQty) =>
    set((s) => ({ orderForm: { ...s.orderForm, cashQty } })),
  setExposureAmount: (exposureAmount) =>
    set((s) => ({ orderForm: { ...s.orderForm, exposureAmount } })),
  setPrice: (price) =>
    set((s) => ({ orderForm: { ...s.orderForm, price } })),
  setAuxPrice: (auxPrice) =>
    set((s) => ({ orderForm: { ...s.orderForm, auxPrice } })),
  setTrailingAmt: (trailingAmt) =>
    set((s) => ({ orderForm: { ...s.orderForm, trailingAmt } })),
  setTrailingType: (trailingType) =>
    set((s) => ({ orderForm: { ...s.orderForm, trailingType } })),
  setTif: (tif) =>
    set((s) => ({ orderForm: { ...s.orderForm, tif: canonicalizeTimeInForce(tif) } })),
  setOutsideRTH: (outsideRTH) =>
    set((s) => ({ orderForm: { ...s.orderForm, outsideRTH } })),
  setListingExchange: (listingExchange) =>
    set((s) => ({ orderForm: { ...s.orderForm, listingExchange } })),
  setPreparedDraft: (preparedDraft) => set({ preparedDraft }),
  clearPreparedDraft: () => set({ preparedDraft: null }),
  resetForm: () => set({ orderForm: { ...DEFAULT_FORM } }),
}));
