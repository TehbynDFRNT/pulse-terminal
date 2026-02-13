import { create } from 'zustand';
import type { Order, OrderSide, OrderType, TimeInForce } from '@/lib/ibkr/types';

interface OrderFormState {
  side: OrderSide;
  orderType: OrderType;
  quantity: number;
  price: number | null;
  tif: TimeInForce;
}

interface OrdersState {
  orders: Order[];
  isSubmitting: boolean;
  orderForm: OrderFormState;

  // Actions
  setOrders: (orders: Order[]) => void;
  updateOrder: (order: Partial<Order> & { orderId: number }) => void;
  removeOrder: (orderId: number) => void;
  setSubmitting: (submitting: boolean) => void;

  // Order form
  setSide: (side: OrderSide) => void;
  setOrderType: (type: OrderType) => void;
  setQuantity: (qty: number) => void;
  setPrice: (price: number | null) => void;
  setTif: (tif: TimeInForce) => void;
  resetForm: () => void;
}

const DEFAULT_FORM: OrderFormState = {
  side: 'BUY',
  orderType: 'MKT',
  quantity: 100,
  price: null,
  tif: 'DAY',
};

export const useOrdersStore = create<OrdersState>((set) => ({
  orders: [],
  isSubmitting: false,
  orderForm: { ...DEFAULT_FORM },

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
    set((s) => ({ orderForm: { ...s.orderForm, orderType } })),
  setQuantity: (quantity) =>
    set((s) => ({ orderForm: { ...s.orderForm, quantity } })),
  setPrice: (price) =>
    set((s) => ({ orderForm: { ...s.orderForm, price } })),
  setTif: (tif) =>
    set((s) => ({ orderForm: { ...s.orderForm, tif } })),
  resetForm: () => set({ orderForm: { ...DEFAULT_FORM } }),
}));
