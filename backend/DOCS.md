# Backend Documentation

## Overview
Spring Boot 3.5 / Java 21 REST API that periodically scans EVE Online market orders via the ESI public API, persists them to an H2 file database, and exposes endpoints for filtered order browsing, deal detection, and inter-regional arbitrage analysis. Supports EVE SSO OAuth2 login to fetch the authenticated character's (and their corporation's) active sell orders.

---

## Running

```bash
# From the backend/ directory
./mvnw spring-boot:run
```

Starts on **http://localhost:8080**. H2 console available at **http://localhost:8080/h2-console** (JDBC URL: `jdbc:h2:file:./data/evemarket`, user: `sa`, password: empty).

---

## Configuration (`src/main/resources/application.properties`)

| Key | Default | Description |
|-----|---------|-------------|
| `app.scanner.region-ids` | 4 hub regions | Comma-separated EVE region IDs to scan |
| `app.scanner.poll-interval-ms` | `300000` | Scan interval (5 min = ESI cache TTL) |
| `app.scanner.initial-delay-ms` | `10000` | Delay before first scan after startup |
| `app.scanner.good-deal-threshold-percent` | `20.0` | Min discount % to flag as a good deal |
| `app.scanner.retention-hours` | `24` | Hours before old order snapshots are deleted |
| `eve.sso.client-id` | — | EVE developer app Client ID |
| `eve.sso.client-secret` | — | EVE developer app Secret Key |
| `eve.sso.redirect-uri` | `http://localhost:8080/api/auth/callback` | OAuth2 callback URL |
| `app.cors.allowed-origins` | `http://localhost:4200` | CORS allowed origins |

---

## Package Structure

```
com.evemarket.backend
├── EveMarketBackendApplication.java   Entry point — enables scheduling + SSO config
│
├── config/
│   ├── EveSsoConfig.java              @ConfigurationProperties for eve.sso.*
│   ├── WebClientConfig.java           WebClient bean with timeouts + User-Agent header
│   └── CorsConfig.java                CORS for /api/** → localhost:4200
│
├── model/
│   ├── MarketOrder.java               JPA entity — one row per sell order per scan
│   └── ItemType.java                  JPA entity — cached ESI item type metadata
│
├── dto/
│   ├── EsiMarketOrderDto.java         Maps raw ESI JSON (snake_case) to Java
│   ├── MarketOfferDto.java            API response DTO for individual orders
│   └── ArbitrageOpportunityDto.java   API response DTO for arbitrage results
│
├── repository/
│   ├── MarketOrderRepository.java     JPA queries: findFiltered, findTopDeals, findMinSellPrice
│   └── ItemTypeRepository.java        findByCategoryNameIsNull, findDistinctCategoryNames
│
├── service/
│   ├── EsiService.java                ESI API calls: orders, prices, names, categories
│   ├── MarketScannerService.java      @Scheduled scan loop — orchestrates full scan cycle
│   ├── ArbitrageService.java          Cross-region price gap analysis
│   ├── CharacterSession.java          Singleton: holds logged-in character's token + info
│   └── EveSsoService.java             OAuth2 exchange, token refresh, character/corp orders
│
└── controller/
    ├── MarketController.java          REST endpoints: orders, arbitrage, stats, scan trigger
    └── AuthController.java            REST endpoints: login, callback, logout, status
```

---

## Database Schema

### `market_orders`
| Column | Type | Notes |
|--------|------|-------|
| `order_id` | BIGINT PK | EVE order ID |
| `type_id` | INT | Item type |
| `type_name` | VARCHAR | Resolved item name |
| `region_id` | INT | EVE region |
| `location_id` | BIGINT | Station/structure |
| `system_id` | BIGINT | Solar system |
| `system_name` | VARCHAR | Resolved system name |
| `price` | DECIMAL | Order price (ISK) |
| `average_price` | DECIMAL | ESI market average (ISK) |
| `discount_percent` | DOUBLE | `(avg - price) / avg × 100` |
| `volume_total` | INT | Original volume |
| `volume_remain` | INT | Remaining units |
| `is_buy_order` | BOOLEAN | true = buy order |
| `is_good_deal` | BOOLEAN | discount ≥ threshold |
| `range` | VARCHAR | Order range |
| `issued` | TIMESTAMP | When EVE created the order |
| `discovered_at` | TIMESTAMP | When this app first saw it |

Indexes: `(type_id, region_id, discovered_at)`, `(is_buy_order, type_id, region_id, price)`

### `item_types`
| Column | Type | Notes |
|--------|------|-------|
| `type_id` | INT PK | ESI type ID |
| `type_name` | VARCHAR | Item name |
| `group_id` | INT | ESI group ID |
| `group_name` | VARCHAR | Group name |
| `category_id` | INT | ESI category ID |
| `category_name` | VARCHAR | Category name (populated async) |

---

## Scan Lifecycle (`MarketScannerService`)

```
1. AtomicBoolean guard — skip if already scanning
2. For each region:
   a. Fetch all sell orders (paginated via X-Pages header, max 5 concurrent pages)
   b. Fetch ESI average prices
   c. Compute discountPercent + isGoodDeal flags
3. Batch-resolve type names (POST /universe/names/, 1000 IDs per call)
4. Batch-resolve system names
5. Save in batches of 5000 (avoids huge transactions)
6. Delete orders older than retention-hours
7. Spawn virtual thread → enrich item categories (3-step: type→group→category)
```

---

## REST API

### `GET /api/market/orders`
Paginated, filterable list of market orders.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `regionId` | int | 10000002 | EVE region ID |
| `typeId` | int | — | Filter by exact item type ID |
| `goodDealsOnly` | bool | false | Only return flagged good deals |
| `isBuyOrder` | bool | — | true=buy, false=sell, omit=both |
| `minAveragePrice` | decimal | — | Min ESI average price (ISK) |
| `maxAveragePrice` | decimal | — | Max ESI average price (ISK) |
| `typeName` | string | — | Partial case-insensitive name match |
| `categoryName` | string | — | Exact category name match |
| `page` | int | 0 | Page number (0-based) |
| `size` | int | 50 | Page size |

Returns: Spring Data `Page<MarketOfferDto>`

---

### `GET /api/market/top-deals`
Top 10 orders by discount % in a region.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `regionId` | int | 10000002 | EVE region ID |
| `minAveragePrice` | decimal | — | Min ESI average price |
| `maxAveragePrice` | decimal | — | Max ESI average price |
| `typeName` | string | — | Partial name match |
| `categoryName` | string | — | Exact category match |

Returns: `List<MarketOfferDto>`

---

### `GET /api/market/arbitrage`
Inter-regional arbitrage opportunities — items with the biggest sell price gap between the 4 scanned regions.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `minAveragePrice` | decimal | — | Min ESI average price |
| `maxAveragePrice` | decimal | — | Max ESI average price |
| `typeName` | string | — | Partial name match |
| `categoryName` | string | — | Exact category match |
| `minGapPercent` | double | 5.0 | Minimum price gap % to include |
| `limit` | int | 100 | Max results returned |

Returns: `List<ArbitrageOpportunityDto>`

**Algorithm:**
1. Native SQL aggregates `MIN(price)` per `(type_id, region_id)` for sell orders
2. Java groups by typeId, finds cheapest and priciest region
3. Computes `gap = (max - min) / min × 100`
4. Filters by `minGapPercent`, sorts descending, truncates to `limit`
5. If a character is logged in: fetches their personal + corp sell orders, sets `alreadyListed = true` on matching rows

---

### `GET /api/market/categories`
Returns `List<String>` of distinct category names known from enriched item types. Populated progressively in the background after each scan.

---

### `GET /api/market/stats`
Returns `{ totalOrders, goodDeals, regionId }`.

---

### `POST /api/market/scan`
Triggers an immediate scan on a background thread. Returns `{ status: "scan triggered" }`.

---

### `GET /api/auth/login`
Redirects the browser to the EVE SSO authorization page. Stores a random `state` value in the HTTP session for CSRF protection.

---

### `GET /api/auth/callback?code=...&state=...`
EVE SSO redirects here after the user approves. Validates state, exchanges code for tokens, fetches corporation ID, then redirects to `http://localhost:4200?login=success`.

---

### `POST /api/auth/logout`
Clears the in-memory `CharacterSession`. Returns `{ status: "logged out" }`.

---

### `GET /api/auth/status`
Returns `{ loggedIn: bool, characterName: string }`. Used by the frontend on every load to check auth state.

---

## EVE SSO Flow

```
Browser                  Backend (:8080)              EVE SSO
  │── GET /api/auth/login ──>│                             │
  │<── 302 to SSO ───────────│── /oauth/authorize ────>    │
  │                          │                   <── 302 ──│
  │── GET /callback?code=X ─>│                             │
  │                          │── POST /oauth/token ────>   │
  │                          │<── { access_token, ... } ───│
  │                          │  decode JWT sub → charId    │
  │                          │── GET /characters/{id}/ ──> │ (ESI)
  │<── 302 to :4200 ─────────│                             │
```

Token is stored in `CharacterSession` singleton. On each arbitrage request, `refreshIfNeeded()` is called before fetching orders.

---

## Adding a New Scanned Region

In `application.properties`:
```properties
app.scanner.region-ids=10000002,10000043,10000032,10000030,YOUR_REGION_ID
```
Add the region name to `ArbitrageService.REGION_NAMES` map. Restart backend.
