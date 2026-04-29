# Frontend Documentation

## Overview
Angular 20 standalone-component SPA. Displays EVE Online market data from the Spring Boot backend. Features a persistent toolbar with centralised EVE SSO login, and six tabs: All Orders, Arbitrage, Fav Arbitrage, Capital Contracts, My Orders / Buy Orders, Corp Transactions, and Wallet.

---

## Running

```bash
# From the frontend/ directory
npx ng serve --open
```

Starts on **http://localhost:4200** with hot-reload. Requires backend on **http://localhost:8080**.

---

## Project Structure

```
src/app/
├── app.ts                          Root — toolbar (auth) + mat-tab-group
├── app.config.ts                   Angular providers (HttpClient, animations)
│
├── models/
│   ├── market-offer.model.ts       TypeScript interfaces for market/arbitrage API responses
│   └── capital-contract.model.ts   TypeScript interfaces for capital contract API responses
│
├── services/
│   ├── market.service.ts           HTTP client for /api/market/* endpoints
│   ├── auth.service.ts             HTTP client for /api/auth/* + BehaviorSubject auth state
│   ├── contract.service.ts         HTTP client for /api/contracts/* endpoints
│   └── favourites.service.ts       BehaviorSubject-backed favourites state + HTTP
│
└── components/
    ├── market-table/               All Orders tab
    ├── arbitrage/                  Arbitrage tab
    ├── favourite-arbitrage/        Fav Arbitrage tab
    ├── capital-contracts/          Capital Contracts tab
    ├── my-orders/                  My Sell Orders tab
    ├── my-buy-orders/              My Buy Orders tab
    ├── corp-transactions/          Corp Transactions tab
    ├── wallet/                     Wallet tab
    ├── stats-bar/                  (unused — kept for reference)
    └── top-deals/                  (unused — kept for reference)
```

---

## Models (`models/market-offer.model.ts`)

**`market-offer.model.ts`**
```typescript
MarketOffer           // Single market order
Page<T>               // Spring Data page: { content, page: { totalElements, ... } }
MarketStats           // { totalOrders, goodDeals, regionId }
ArbitrageOpportunity  // Cross-region price gap result
ArbitrageFilter       // Filter params for the arbitrage endpoint
Favourite             // { typeId, typeName }
MyOrder               // Active sell/buy order for logged-in character
```

**`capital-contract.model.ts`**
```typescript
CapitalContract       // Full contract record incl. effective price fields + location
CapitalContractItem   // Single item within a contract
CapitalContractFilter // Filter + pagination params for /api/contracts/capitals
CapitalContractPage   // Spring Data page wrapper for CapitalContract
```

---

## Services

### `MarketService`

| Method | Description |
|--------|-------------|
| `getOrders(filter)` | Paginated orders with optional sort (`sortBy`, `sortDir`) |
| `getCategories()` | List of known category names |
| `triggerScan()` | Trigger immediate backend scan |
| `getArbitrageOpportunities(filter)` | Arbitrage results (supports `typeIds` for favourites) |
| `getMyOrders()` | Character's active sell orders |
| `getMyBuyOrders()` | Character's active buy orders |
| `getWallet()` | Wallet balance |
| `getCorpTransactions()` | Corp transaction history |

**`OrderFilter` interface:**
```typescript
{
  regionId?: number;           // omit = all regions
  typeId?: number | null;
  goodDealsOnly?: boolean;
  isBuyOrder?: boolean | null;
  minAveragePrice?: number | null;   // absolute ISK
  maxAveragePrice?: number | null;
  typeName?: string | null;
  categoryName?: string | null;
  page?: number;
  size?: number;
  sortBy?: string;             // typeName | price | discountPercent | discoveredAt | volumeRemain
  sortDir?: string;            // asc | desc
}
```

---

### `AuthService`

| Method | Description |
|--------|-------------|
| `getStatus()` | `Observable<{ loggedIn, characterName }>` |
| `login()` | `window.location.href` redirect to backend SSO endpoint |
| `logout()` | POST `/api/auth/logout` |

---

### `FavouritesService`

Maintains a `BehaviorSubject<Favourite[]>` so all components see live favourite state.

| Member | Description |
|--------|-------------|
| `favourites$` | Observable of current favourite list |
| `favouriteTypeIds` | `Set<number>` of starred type IDs (computed getter) |
| `load()` | Fetch favourites from backend and push to subject |
| `add(typeId, typeName)` | POST to backend + update subject |
| `remove(typeId)` | DELETE on backend + update subject |
| `isFavourite(typeId)` | Synchronous check |

---

## Components

### `App` (`app.ts`)
Root shell. Toolbar contains:
- App title
- Login button (gold, shown when logged out)
- Character name chip + logout icon (shown when logged in)

Content: `<mat-tab-group>` with all feature tabs. Auth status is checked once in `ngOnInit`; per-tab components check it independently for content guards only.

---

### `MarketTableComponent` — All Orders tab

Paginated, server-side sorted table of market orders across all regions (or a selected region).

**Filters (applied on "Apply" click):**
| Control | Description |
|---------|-------------|
| Search Item Name | Partial case-insensitive match |
| Type ID | Exact match |
| Region | All Regions or a specific trade hub |
| Order Type | Both / Sell / Buy |
| Category | From `/api/market/categories` |
| Good Deals Only | ≥20% below ESI average |
| Avg. Price Range | Slider 0–1B ISK (1B = no limit) |

**Sortable columns** (click header to toggle ASC/DESC):
- Item (name)
- Price
- Discount

Default sort: Discount descending. Sort triggers a fresh server fetch (no client-side reorder).

**Star column:** click ★ to add/remove from favourites. Filled gold star = currently favourited.

**Pagination:** 25 / 50 / 100 rows per page.

---

### `ArbitrageComponent` — Arbitrage tab

Finds items where the minimum sell price in one region is significantly lower than in another.

**Filters:** Name search, Category, Min Gap %, Avg. Price Range slider.

**Table columns:** Item, Buy In (region badge), Buy Price, Sell In (region badge), Sell Price, Gap %, Volume

**Visual cues:**
- Region badges: gold=The Forge, red=Domain, blue=Sinq Laison, green=Heimatar, purple=Metropolis
- Gap colours: orange ≥5%, green ≥20%, bright green ≥100%
- Already-listed rows: greyed out with `opacity: 0.3` + tooltip (requires EVE login)

---

### `FavouriteArbitrageComponent` — Fav Arbitrage tab

Shows arbitrage opportunities only for starred items. Already-listed rows are hidden entirely (not just greyed).

- Watched items shown as removable chips at the top
- Default min gap: **35%**
- Default sort: **Buy In descending**
- Opportunity counter shows only visible (non-hidden) rows
- Passes `typeIds` to backend so the limit/ranking problem doesn't affect results

---

### `CapitalContractsComponent` — Capital Contracts tab

Paginated, server-side sorted table of public capital ship contracts from configured low-sec regions.

**Filters (applied on "Apply" click; dropdowns apply immediately):**
| Control | Description |
|---------|-------------|
| Region | Derelik or Domain (or both) |
| Ship Class | Filter by capital group (Carrier, Dreadnought, etc.) |
| Max Price (B ISK) | Upper bound on contract asking price |
| Full pricing only | Hide contracts where extras had no market price data |

**Columns:**
| Column | Description |
|--------|-------------|
| Class | Colour-coded ship class badge (Titan, Carrier, etc.) |
| Ship | Primary capital ship name; ×N badge for multiple; "mixed" if multiple types |
| Region | Derelik / Domain badge |
| Location | NPC station name resolved via `/universe/stations/{id}/` |
| Contract Price | Full asking price |
| Extras Value | ESI average value of non-capital items in the contract |
| Effective Cap Price | `Contract Price − Extras Value` (per unit if qty > 1); ⚠ icon if incomplete |
| Title | Truncated seller note; hover for full text via tooltip |
| Expires | Contract expiry date |
| Expand | Expand row to see full item list with estimated values |

**Effective Cap Price** is sortable (default: ascending). Click the column header to toggle sort direction.

**Scan Now** button triggers an immediate contract scan; **Apply** re-fetches with current filter state.

---

### Auth-gated tabs (My Orders, My Buy Orders, Corp Transactions, Wallet)

All follow the same pattern:
- `ngOnInit` calls `authService.getStatus()` → sets `isLoggedIn`
- If logged in: load data immediately
- Template: shows "Please log in" empty state when `!isLoggedIn`, otherwise shows data table + Refresh button
- No login/logout UI in these tabs — auth is handled by the toolbar

---

## EVE SSO Login Flow (Frontend)

```
1. User clicks "Login with EVE Online" in toolbar
2. authService.login() → window.location.href = 'http://localhost:8080/api/auth/login'
3. Browser navigates through EVE SSO (handled by backend)
4. Browser lands on http://localhost:4200?login=success
5. app.ts ngOnInit → getStatus() → isLoggedIn = true, characterName shown in toolbar
6. Auth-gated tabs check status independently and load their data
7. Arbitrage tab re-fetches to get alreadyListed flags
```

---

## Slider Convention

Slider values are stored in **millions of ISK** in the form controls. They are multiplied by `1_000_000` before being sent to the API. The max value (1000 = 1B ISK) is treated as "no upper limit" — `maxAveragePrice` is not sent to the backend.

---

## Adding a New Filter to All Orders

1. Add form control to `filterForm` in `market-table.ts`
2. Add the UI control in the template
3. Read the value in `loadOrders()` and add it to the `OrderFilter`
4. Add the field to `OrderFilter` in `market.service.ts` and pass it as an `HttpParams` entry
5. Add `@RequestParam` to the backend controller and wire it into the repository query
