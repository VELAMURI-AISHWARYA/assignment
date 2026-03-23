# Solution — Secondary Marketplace

## What I Built

A fully functional secondary marketplace for trading digital securities, integrated into the existing Next.js 14 / SQLite application. Users can browse assets, place buy/sell limit orders, cancel orders, view their positions, and see portfolio-level summaries.

### Features Implemented

**1. Asset Listing Page (`/investing/secondary-trading`)**
- Displays all 5 trading assets as cards with symbol, price, performance %, volume, and category
- Real-time search filtering (by title, symbol, category)
- Category filter chips (All, Tech, Healthcare, Energy, Consumer, Finance)
- Sort options (name, price high/low, gainers/losers)
- Loading skeletons during initial render
- Responsive grid layout (1/2/3 columns)

**2. Asset Detail Page (`/investing/secondary-trading/[id]`)**
- Full asset header with symbol badge, price, change %, volume, market cap
- 30-day SVG price chart built from the `dailyHistory` template data using `buildSecondaryTradingDailyHistory()`
- Two-sided order book (asks/bids) generated from `templates.orderBook` × `basePrice`. Clicking a price auto-fills the order form.
- Company info section with P/E ratio, dividend yield, revenue, price range, avg volume, employees
- Tabbed section: Open Orders (with cancel), Order History, and My Position (shares, avg cost, market value, unrealized P&L)
- Sticky order form (right column) with buy/sell toggle, quantity, limit price, cost summary, balance display, and validation warnings
- Confirmation dialog for order cancellation
- Snackbar notifications for order outcomes

**3. Trading API Routes**
- `GET /api/trading/assets` — enhanced with `?search=`, `?category=`, `?sort=`, and `?id=` query params
- `POST /api/trading/orders` — places a limit order with full validation:
  - Auth check, input validation (symbol, side, quantity, price, timeInForce)
  - Buy orders: checks `trading_balances` for sufficient cash, deducts upfront, refunds price improvement
  - Sell orders: checks `trading_holdings` for sufficient shares, credits proceeds after match
  - Calls `matchOrder()` from the provided matching engine
- `GET /api/trading/orders` — returns user's orders with optional `?symbol=` and `?status=` filters
- `DELETE /api/trading/orders/[id]` — cancels an open order, refunds reserved cash for buy orders
- `GET /api/trading/holdings` — returns user's current positions
- `GET /api/trading/balance` — returns user's trading cash balance

**4. Portfolio Integration**
- Updated `Portfolio.tsx` to show:
  - Trading Account summary (trading cash, holdings value, total)
  - Holdings table with symbol, shares, avg cost, current price, and P&L (clickable to navigate to asset detail)
  - Recent orders table (last 10) with side, qty, price, status, and date

**5. UX Enhancements**
- Loading skeletons on all data-dependent sections
- Inline validation warnings (insufficient funds, exceeds holdings)
- Smooth hover transitions on asset cards
- Order book prices are clickable to auto-fill the order form
- Confirmation dialog before cancelling orders
- Snackbar feedback with success/error messages and order fill details
- Responsive design throughout

## Key Technical Decisions

- **Cash reservation model**: Buy orders deduct cash upfront when placed (not just when filled). This prevents over-spending with multiple open orders. Cash is refunded on cancellation or price improvement.
- **Sell proceeds on fill**: Sell orders credit cash only for filled portions, using actual trade prices from `trading_trades`.
- **Client-side filtering**: The asset listing uses client-side filtering since there are only 5 assets — no need for server roundtrips. The API still supports server-side filtering for completeness.
- **SVG chart**: Used a lightweight inline SVG polyline chart instead of a charting library to avoid extra dependencies. It shows the 30-day close price with gradient fill.
- **Order book from templates**: The order book is generated client-side by multiplying `priceMultiplier × basePrice` as specified in the data file.
- **GTC default**: Orders default to `gtc` (good-til-cancelled) to make the demo more useful since there's no real market session.

## Trade-offs & What I'd Improve With More Time

- **No WebSocket / real-time updates**: Orders and positions refresh after actions but don't live-update. Would add polling or SSE for a production app.
- **No market orders**: Only limit orders are supported. Would add market order type that matches immediately at best available price.
- **No partial fill cash handling for sells**: If a sell order is partially filled, proceeds are credited once; subsequent fills from the same order aren't tracked separately. Would add a trade settlement job.
- **Chart is basic**: Would use a proper charting library (e.g., Recharts or Chart.js) for candlestick charts, tooltips, and time range selectors.
- **No order amendment**: Can only cancel, not modify price/quantity of open orders.
- **Testing**: Would add unit tests for the matching engine integration, API validation, and balance logic.

## Files Changed / Created

### New Files
- `app/api/trading/orders/route.ts` — GET + POST for orders
- `app/api/trading/orders/[id]/route.ts` — DELETE for cancel
- `app/api/trading/holdings/route.ts` — GET holdings
- `app/api/trading/balance/route.ts` — GET trading cash balance

### Modified Files
- `app/api/trading/assets/route.ts` — added filtering, search, sort, single-asset lookup
- `app/investing/secondary-trading/page.tsx` — full asset listing with search/filter/sort
- `app/investing/secondary-trading/[id]/page.tsx` — full detail page with chart, order book, order form, positions
- `components/portfolio/Portfolio.tsx` — added trading account summary, holdings table, recent orders
