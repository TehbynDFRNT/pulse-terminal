# IBKR Trading — Order Management

## Prerequisites

Before placing any orders:
1. **Session must be authenticated** — check via `checkAuthStatus()`
2. **Must call `getAccounts()` first** — IBKR requires this before order operations
3. **Suppress reply messages** (optional) — for one-click trading experience
4. **Account is paper trading** — currently configured for paper, not live

## Place Order

```
POST /iserver/account/{accountId}/orders
```

### Request Body
```json
{
  "orders": [
    {
      "conid": 265598,
      "orderType": "LMT",
      "side": "BUY",
      "quantity": 100,
      "price": 165.00,
      "tif": "DAY",
      "outsideRTH": false,
      "cOID": "pulse-1709961234567",
      "listingExchange": "SMART"
    }
  ]
}
```

**Note:** Body must be wrapped in `"orders"` array, even for a single order.

### Response — Direct Success
```json
{
  "order_id": "987654",
  "order_status": "Submitted"
}
```

### Response — Needs Confirmation (Order Reply Message)
```json
[
  {
    "id": "07a13a5a-xxxx-xxxx-xxxx-xxxxxxxxxxxx",
    "message": ["Order price exceeds 3% constraint. Are you sure?"],
    "isSuppressed": false,
    "messageIds": ["o163"]
  }
]
```

### Existing Implementation

```typescript
// src/lib/ibkr/client.ts
export async function placeOrder(params: OrderParams): Promise<OrderResult> {
  const accountId = getConfig().accountId;
  const orderBody = {
    orders: [{
      conid: params.conid,
      orderType: params.orderType,
      side: params.side,
      quantity: params.quantity,
      tif: params.tif || 'DAY',
      outsideRTH: params.outsideRTH || false,
      cOID: `pulse-${Date.now()}`,
      ...(params.price != null && { price: params.price }),
      ...(params.auxPrice != null && { auxPrice: params.auxPrice }),
    }],
  };

  const res = await ibkrFetch<OrderResult | Array<{ id: string }>>(
    `/iserver/account/${accountId}/orders`,
    { method: 'POST', body: JSON.stringify(orderBody) }
  );

  // Handle order reply messages (confirmation needed)
  if (Array.isArray(res) && res[0]?.id) {
    return confirmOrderReply(res[0].id);
  }
  return res as OrderResult;
}
```

API route: `POST /api/ibkr/orders` with body `{ conid, side, orderType, quantity, price?, auxPrice?, tif?, outsideRTH? }`

## Confirm Order Reply (Cascade)

```
POST /iserver/reply/{replyId}
Body: { "confirmed": true }
```

Order reply messages can **cascade** — one confirmation may produce another. Always check if the response is another reply:

```typescript
async function confirmOrderReply(replyId: string): Promise<OrderResult> {
  const res = await ibkrFetch<OrderResult | Array<{ id: string }>>(
    `/iserver/reply/${replyId}`,
    { method: 'POST', body: JSON.stringify({ confirmed: true }) }
  );
  if (Array.isArray(res) && res[0]?.id) {
    return confirmOrderReply(res[0].id); // Recursive
  }
  return res as OrderResult;
}
```

## Suppress Order Reply Messages

```
POST /iserver/questions/suppress
Body: { "messageIds": ["o163", "o354", "o355"] }
```

Call at session start for zero-friction one-click trading. Common message IDs:

| ID | Message |
|----|---------|
| `o163` | Price exceeds percentage constraint |
| `o354` | Order size exceeds constraint |
| `o355` | Penny stock warning |

**Suppressed for current brokerage session only** — resets on re-auth.

Reset all: `POST /iserver/questions/suppress/reset`

Collect additional messageIds as you encounter them during testing — add them to the suppress list.

## Modify Order

```
POST /iserver/account/{accountId}/order/{orderId}
```

### ⚠️ Key Differences from Place Order
- Body is a **single object** (NOT wrapped in `"orders"` array)
- Must include **ALL original order parameters**, changing only what's different
- Can also receive order reply messages — handle same as place

```typescript
const modifyOrder = async (orderId: string, updates: Partial<OrderParams>) => {
  const accountId = getConfig().accountId;
  const existingOrder = useOrdersStore.getState().orders.find(o => String(o.orderId) === orderId);
  const body = {
    conid: existingOrder.conid,
    orderType: updates.orderType || existingOrder.orderType,
    side: existingOrder.side,
    quantity: updates.quantity || existingOrder.quantity,
    price: updates.price || existingOrder.price,
    tif: updates.tif || existingOrder.tif,
    // ... include all original fields
  };

  const res = await ibkrFetch(
    `/iserver/account/${accountId}/order/${orderId}`,
    { method: 'POST', body: JSON.stringify(body) }
  );

  if (Array.isArray(res) && res[0]?.id) {
    return confirmOrderReply(res[0].id);
  }
  return res;
};
```

## Cancel Order

```
DELETE /iserver/account/{accountId}/order/{orderId}
→ { msg: "Request was submitted", order_id: 987654, conid: 265598 }
```

Response confirms the REQUEST was submitted, not that the order is cancelled. The order may already be filled.

```typescript
export async function cancelOrder(orderId: string): Promise<{ msg: string }> {
  const accountId = getConfig().accountId;
  return ibkrFetch(`/iserver/account/${accountId}/order/${orderId}`, {
    method: 'DELETE',
  });
}
```

API route: `DELETE /api/ibkr/orders?orderId=987654`

## Get Live Orders

```
GET /iserver/account/orders?force=true
```

**Rate limit: 1 req/5s** — use WebSocket for real-time updates instead of polling.

```typescript
export async function getLiveOrders(): Promise<Order[]> {
  const data = await ibkrFetch<{ orders: Array<Record<string, unknown>> }>(
    '/iserver/account/orders?force=true'
  );
  return (data.orders || []).map((o) => ({
    orderId: o.orderId as number,
    conid: o.conid as number,
    symbol: o.ticker as string,
    // ... see client.ts for full mapping
  }));
}
```

### Order Status Values
| Status | Description |
|--------|-------------|
| `Inactive` | Order not yet active |
| `PendingSubmit` | Being submitted to exchange |
| `PreSubmitted` | Accepted by IBKR, pending exchange |
| `Submitted` | Live at exchange |
| `Filled` | Completely filled |
| `Cancelled` | Cancelled |

## Get Trades/Executions

```
GET /iserver/account/trades
```

Returns actual fills (not pending orders). Rate limit: 1 req/5s.

```typescript
const getTrades = async () => {
  const trades = await ibkrFetch('/iserver/account/trades');
  return trades.map(t => ({
    executionId: t.execution_id,
    symbol: t.symbol,
    side: t.side,
    size: t.size,
    price: parseFloat(t.price),
    commission: parseFloat(t.commission),
    exchange: t.exchange,
    time: t.trade_time_r,
    orderRef: t.order_ref, // Matches cOID from place order
  }));
};
```

## Preview Order (What-If)

```
POST /iserver/account/{accountId}/orders/whatif
Body: { "orders": [{ same as place order }] }
```

Returns estimated commission, margin impact, and equity change without submitting.

```json
{
  "amount": { "amount": "16500.00", "commission": "0.35", "total": "16500.35" },
  "equity": { "current": "100000.00", "change": "-16500.35", "after": "83499.65" },
  "initial": { "current": "50000.00", "change": "8250.00", "after": "58250.00" },
  "maintenance": { "current": "25000.00", "change": "4125.00", "after": "29125.00" }
}
```

## Order Types Reference

| Order Type | `orderType` | Required Params | Description |
|-----------|-------------|-----------------|-------------|
| **Market** | `MKT` | side, quantity, tif | Execute immediately at best price |
| **Limit** | `LMT` | side, quantity, **price**, tif | Execute at specified price or better |
| **Stop** | `STP` | side, quantity, **auxPrice**, tif | Becomes market order when stop price hit |
| **Stop Limit** | `STP_LIMIT` | side, quantity, **price**, **auxPrice**, tif | Becomes limit when stop price hit |
| **Trailing Stop** | `TRAIL` | side, quantity, trailingAmt, trailingType, tif | Stop that follows price by fixed amt/% |
| **Trailing Stop Limit** | `TRAILLMT` | side, quantity, price, trailingAmt, trailingType, tif | Trailing stop → limit |
| **Market on Close** | `MOC` | side, quantity | Execute at market close |
| **Limit on Close** | `LOC` | side, quantity, price | Limit order at close |
| **Midprice** | `MIDPRICE` | side, quantity, price | Execute at bid/ask midpoint |

### Key Parameters

```typescript
// From src/lib/ibkr/types.ts
interface OrderParams {
  conid: number;              // Contract ID (required)
  side: 'BUY' | 'SELL';      // (required)
  orderType: OrderType;       // MKT, LMT, STP, etc. (required)
  quantity: number;           // (required)
  price?: number;             // Limit price (for LMT, STP_LIMIT)
  auxPrice?: number;          // Stop/trigger price (for STP, STP_LIMIT)
  tif?: TimeInForce;          // DAY, GTC, IOC, OPG (default: DAY)
  outsideRTH?: boolean;       // Allow outside regular trading hours
}
```

## Time in Force (TIF)

| TIF | Description |
|-----|-------------|
| `DAY` | Expires end of trading day |
| `GTC` | Good til cancelled (persists across sessions) |
| `IOC` | Immediate or Cancel (fill what you can, cancel rest) |
| `OPG` | Execute at market open only |

## WebSocket Order Streaming

Subscribe: `sor+{}`
Filtered: `sor+{"filters":"Submitted"}`

```json
{
  "topic": "sor",
  "args": [{
    "orderId": 1234567890,
    "ticker": "AAPL",
    "side": "BUY",
    "totalSize": 100.0,
    "filledQuantity": 0.0,
    "remainingQuantity": 100.0,
    "status": "Submitted",
    "orderType": "Limit",
    "price": "165.00",
    "orderDesc": "Buy 100 Limit @ 165.00, DAY"
  }]
}
```

The existing `IBKRWebSocket` class subscribes to `sor+{}` automatically on connect and routes updates to the order handler.

## Get Trading Rules for a Contract

```
GET /iserver/contract/{conid}/info-and-rules?isBuy=true
```

Returns available order types, TIF types, min size increment, and min price increment for the specific contract. Call before showing the order panel to populate available options.

```typescript
const rules = await ibkrFetch(`/iserver/contract/${conid}/info-and-rules?isBuy=true`);
// rules.rules.orderTypes → ["LMT", "MKT", "STP", "STP_LIMIT", ...]
// rules.rules.tifTypes → ["DAY", "GTC", "IOC", "OPG"]
// rules.rules.limitPrice → 0.01 (min price increment)
// rules.rules.sizeIncrement → 1
```

## Snipe Orders (Pulse Terminal Custom Feature)

Snipe orders are a **Pulse Terminal concept** — not a native IBKR feature. They combine price monitoring with automatic order submission.

### Concept
```typescript
interface SnipeOrder {
  id: string;
  conid: number;
  symbol: string;
  side: 'BUY' | 'SELL';
  quantity: number;
  triggerPrice: number;    // Price that activates the snipe
  orderType: 'MKT' | 'LMT';
  limitPrice?: number;     // For limit orders after trigger
  stopLoss?: number;       // Optional stop-loss
  status: 'armed' | 'triggered' | 'filled' | 'cancelled';
}
```

### Implementation Approach 1: IBKR Native (Recommended for MVP)

Use IBKR's native stop-limit orders:

```typescript
const placeSnipeAsStopLimit = async (snipe: SnipeOrder) => {
  return placeOrder({
    conid: snipe.conid,
    side: snipe.side,
    orderType: 'STP_LIMIT',
    auxPrice: snipe.triggerPrice,   // Trigger/stop price
    price: snipe.limitPrice || snipe.triggerPrice, // Limit price
    quantity: snipe.quantity,
    tif: 'GTC',
    outsideRTH: true,              // Commodities trade ~23h/day
  });
};
```

### Implementation Approach 2: Client-Side Monitoring (More Control)

Monitor price via WebSocket, submit order when trigger hit. More flexible but requires Pulse Terminal to be running:

```typescript
// In WebSocket market data handler:
const handlePriceUpdate = (conid: number, price: number) => {
  for (const snipe of activeSnipes) {
    if (snipe.conid !== conid || snipe.status !== 'armed') continue;
    const triggered =
      (snipe.side === 'BUY' && price <= snipe.triggerPrice) ||
      (snipe.side === 'SELL' && price >= snipe.triggerPrice);
    if (triggered) {
      snipe.status = 'triggered';
      placeOrder({ conid: snipe.conid, side: snipe.side, orderType: snipe.orderType, quantity: snipe.quantity, price: snipe.limitPrice });
    }
  }
};
```

### Bracket Orders (Entry + Stop-Loss + Take-Profit)

IBKR supports bracket orders — parent order with attached child orders (stop-loss and take-profit). This is the ideal structure for snipe orders with risk management.

## Important Trading Notes

- **SMART routing:** Always use `"SMART"` as exchange for best execution unless a specific venue is needed
- **No fractional shares:** IBKR API doesn't support fractional shares for most products (except crypto/forex)
- **Order Efficiency Ratio:** High-frequency order submission/cancellation without fills can trigger IBKR restrictions
- **Paper account:** Execution simulation may not perfectly match live behavior
- **Canadian restrictions:** CIRO prohibits automated trading of Canadian-listed products (TSX/TSXV). Manual only.
