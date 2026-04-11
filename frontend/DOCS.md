# Frontend Documentation

## Overview
Angular 20 standalone-component SPA. Displays EVE Online market data fetched from the Spring Boot backend. Two main views: **All Orders** (paginated table with good-deal detection) and **Arbitrage** (inter-regional price gap finder with EVE SSO login integration).

---

## Running

```bash
# From the frontend/ directory
npx ng serve --open
```

Starts on **http://localhost:4200** with hot-reload. Requires backend running on **http://localhost:8080**.

---

## Project Structure

```
src/app/
├── app.ts                          Root component — toolbar + tab layout
├── app.config.ts                   Angular providers (HttpClient, animations)
├── app.routes.ts                   Routes (currently empty — SPA with no routing)
│
├── models/
│   └── market-offer.model.ts       TypeScript interfaces for all API responses
│
├── services/
│   ├── market.service.ts           HTTP client for all /api/market/* endpoints
│   └── auth.service.ts             HTTP client for /api/auth/* + login redirect
│
└── components/
    ├── stats-bar/
    │   └── stats-bar.ts            Total orders count + "Trigger Scan" button
    ├── top-deals/
    │   └── top-deals.ts            Sidebar: top 10 deals in The Forge
    ├── market-table/
    │   └── market-table.ts         All Orders tab — paginated filtered table
    └── arbitrage/
        └── arbitrage.ts            Arbitrage tab — cross-region opportunities + EVE login
```

---

## Models (`models/market-offer.model.ts`)

```typescript
MarketOffer          // Single market order (orders table + top-deals)
Page<T>              // Spring Data page wrapper
MarketStats          // { totalOrders, goodDeals, regionId }
ArbitrageOpportunity // One cross-region price gap result
ArbitrageFilter      // Filter params for the arbitrage endpoint
```

### `ArbitrageOpportunity`
```typescript
{
  typeId: number;
  typeName: string;
  buyRegionId: number;    // cheapest region
  buyRegionName: string;
  buyPrice: number;
  sellRegionId: number;   // most expensive region
  sellRegionName: string;
  sellPrice: number;
  gapPercent: number;     // (sell - buy) / buy × 100
  volumeAvailable: number;
  averagePrice: number | null;
  alreadyListed: boolean; // true if character has active sell order for this item
}
```

---

## Services

### `MarketService` (`services/market.service.ts`)

Base URL: `http://localhost:8080/api/market`

| Method | Endpoint | Description |
|--------|----------|-------------|
| `getOrders(filter)` | `GET /orders` | Paginated orders |
| `getTopDeals(regionId, min, max, name, cat)` | `GET /top-deals` | Top 10 deals |
| `getCategories()` | `GET /categories` | List of category names |
| `getStats(regionId)` | `GET /stats` | Order counts |
| `triggerScan()` | `POST /scan` | Force immediate scan |
| `getArbitrageOpportunities(filter)` | `GET /arbitrage` | Arbitrage results |

**`OrderFilter` interface:**
```typescript
{
  regionId?: number;
  typeId?: number | null;
  goodDealsOnly?: boolean;
  isBuyOrder?: boolean | null;
  minAveragePrice?: number | null;  // absolute ISK value
  maxAveragePrice?: number | null;
  typeName?: string | null;         // partial match
  categoryName?: string | null;
  page?: number;
  size?: number;
}
```

---

### `AuthService` (`services/auth.service.ts`)

Base URL: `http://localhost:8080/api/auth`

| Method | Description |
|--------|-------------|
| `getStatus()` | `Observable<{ loggedIn, characterName }>` |
| `login()` | `window.location.href` redirect to backend login |
| `logout()` | POST to clear server session |

---

## Components

### `App` (`app.ts`)
Root shell. Contains:
- Material toolbar with title
- `<app-stats-bar>` above the content grid
- Two-column layout: `<mat-tab-group>` (left) + `<app-top-deals>` sidebar (right)
- Tab 1: `<app-market-table>` — emits `minAvgPriceMillionChange` and `categoryNameChange` to keep top-deals in sync
- Tab 2: `<app-arbitrage>`

---

### `StatsBarComponent` (`components/stats-bar/stats-bar.ts`)
Shows total order count and number of good deals. Has a "Trigger Scan" button that calls `POST /api/market/scan`. Polls stats every 30 seconds.

---

### `TopDealsComponent` (`components/top-deals/top-deals.ts`)
Sidebar showing the top 10 discounted sell orders in **The Forge** (Jita). Receives `minAvgPriceMillion` and `categoryName` as `@Input()` from the root app and reloads via `ngOnChanges` when they change (only updates when the user clicks Apply in the All Orders tab).

---

### `MarketTableComponent` (`components/market-table/market-table.ts`)

**All Orders tab.** Paginated, sortable table of market orders.

**Filters (applied on "Apply" button click):**
| Control | Type | Description |
|---------|------|-------------|
| Search Item Name | text | Partial case-insensitive name match |
| Type ID | number | Exact type ID |
| Order Type | select | Both / Sell / Buy |
| Category | select | From `/api/market/categories` |
| Good Deals Only | checkbox | ≥20% below ESI average |
| Avg. Price Range | range slider | 0–1B ISK (1B = no upper limit) |

**Form controls (all in `filterForm`):**
- `typeNameSearch` — string
- `typeId` — number
- `isBuyOrder` — boolean | null
- `goodDealsOnly` — boolean (default false)
- `minAvgPriceMillion` — number (default 100)
- `maxAvgPriceMillion` — number (default 1000 = no limit)
- `categoryName` — string | null

**`applyFilters()` method** — resets page to 0, emits `@Output` events for sidebar sync, calls `loadOrders()`.

**Pagination** — `onPageChange()` triggers `loadOrders()` immediately (no button needed).

**Table columns:** Item, System, Price, Avg Price, Discount, Volume, Type (buy/sell badge), Range, Discovered

**Visual cues:**
- Discount ≥20%: green bold text + green row background
- Discount 10–19%: orange text
- Jita orders: gold system name

---

### `ArbitrageComponent` (`components/arbitrage/arbitrage.ts`)

**Arbitrage tab.** Finds items where the cheapest sell price in one region is significantly lower than in another — a "buy here, sell there" opportunity.

**Filters (applied on "Apply" button click):**
| Control | Type | Description |
|---------|------|-------------|
| Search Item Name | text | Partial name match |
| Category | select | From `/api/market/categories` |
| Min Gap % | number input | Minimum price gap (default 5%) |
| Avg. Price Range | range slider | 0–1B ISK (same as All Orders) |

**Authentication panel** (top-right of filter bar):
- Not logged in → "Login with EVE Online" button
- Logged in → character name chip + logout button

**`ngOnInit` sequence:**
1. Load categories
2. `checkAuth()` → calls `/api/auth/status`, stores `isLoggedIn` + `characterName`; if logged in, triggers a `load()` to get `alreadyListed` flags
3. Initial `load()`

**Table columns:** Item, Buy In (region badge), Buy Price, Sell In (region badge), Sell Price, Gap %, Volume, Avg Price

**Visual cues:**
- Region badges: gold=The Forge, red=Domain, blue=Sinq Laison, green=Heimatar
- Gap colour: orange ≥5%, green ≥20%, bright green ≥50%
- Already-listed rows: `opacity: 0.3`, `filter: grayscale(0.9)` — item greyed out with tooltip

---

## Filter → API Flow

```
User sets filters → clicks "Apply"
  → applyFilters() / load()
    → MarketService.getOrders() / getArbitrageOpportunities()
      → HttpParams built from non-null filter values
        → GET /api/market/orders?... (or /arbitrage?...)
          → Table updates
```

Slider values are stored as **millions of ISK** in the form, multiplied by `1_000_000` before sending to the API. Max slider (1000) sends no `maxAveragePrice` param (backend treats null as no limit).

---

## EVE SSO Login Flow (Frontend)

```
1. User clicks "Login with EVE Online"
2. authService.login() → window.location.href = 'http://localhost:8080/api/auth/login'
3. Browser navigates through EVE SSO (handled entirely by backend)
4. Browser lands on http://localhost:4200?login=success
5. ArbitrageComponent.checkAuth() → GET /api/auth/status → isLoggedIn = true
6. load() called → arbitrage results now include alreadyListed flags
7. Rows with alreadyListed=true rendered with grey-out CSS
```

---

## Styling Notes
- Uses Angular Material dark theme with cyan (`#4dd0e1`) accent
- All components use inline styles (no separate `.scss` files)
- `mat-slider` range variant: `matSliderStartThumb` + `matSliderEndThumb`
- Table row classes applied via `[class.deal-row]`, `[class.already-listed]`, `[class.high-gap]`

---

## Adding a New Filter

1. Add form control to `filterForm` in the component
2. Add the input element in the template
3. Read the value in `loadOrders()` / `load()` and pass it to the service method
4. Add the param to `OrderFilter` / `ArbitrageFilter` in `market-offer.model.ts`
5. Add `if (filter.newParam != null) params = params.set(...)` in `market.service.ts`
6. Add the `@RequestParam` + query condition in the backend repository + controller
