# Backend Documentation

## Overview
Spring Boot 3.5 / Java 21 REST API that periodically scans EVE Online market orders via the public ESI API, persists them to PostgreSQL, and exposes endpoints for filtered/sorted order browsing, deal detection, inter-regional arbitrage analysis, and favourite item management. Supports EVE SSO OAuth2 login to fetch the authenticated character's (and their corporation's) active sell orders.

---

## Running

```bash
# From the backend/ directory
./mvnw spring-boot:run
```

Starts on **http://localhost:8080**.

---

## Configuration (`src/main/resources/application.properties`)

Copy `application.properties.example` and fill in secrets.

| Key | Default | Description |
|-----|---------|-------------|
| `spring.datasource.url` | `jdbc:postgresql://localhost:5432/evemarket` | PostgreSQL connection |
| `spring.datasource.username` | `postgres` | DB user |
| `spring.datasource.password` | `postgres` | DB password |
| `app.scanner.region-ids` | 5 hub regions | Comma-separated EVE region IDs to scan |
| `app.scanner.poll-interval-ms` | `300000` | Scan interval (5 min = ESI cache TTL) |
| `app.scanner.initial-delay-ms` | `10000` | Delay before first scan after startup |
| `app.scanner.good-deal-threshold-percent` | `20.0` | Min discount % to flag as a good deal |
| `app.scanner.retention-hours` | `24` | Hours before old order snapshots are purged |
| `app.scanner.staleness-threshold-hours` | `1` | Skip ESI fetch if region data is fresher than this |
| `eve.sso.client-id` | — | EVE developer app Client ID |
| `eve.sso.client-secret` | — | EVE developer app Secret Key |
| `eve.sso.redirect-uri` | `http://localhost:8080/api/auth/callback` | OAuth2 callback URL |
| `app.cors.allowed-origins` | `http://localhost:4200` | CORS allowed origins |

---

## Package Structure

```
com.evemarket.backend
├── EveMarketBackendApplication.java
│
├── config/
│   ├── EveSsoConfig.java              @ConfigurationProperties for eve.sso.*
│   ├── WebClientConfig.java           WebClient bean with timeouts + User-Agent
│   └── CorsConfig.java                CORS for /api/** → localhost:4200
│
├── model/
│   ├── MarketOrder.java               JPA entity — one row per sell order per scan
│   ├── ItemType.java                  JPA entity — cached ESI type metadata
│   └── Favourite.java                 JPA entity — starred items (typeId PK)
│
├── dto/
│   ├── EsiMarketOrderDto.java         Maps raw ESI JSON (snake_case) to Java
│   ├── MarketOfferDto.java            API response DTO for individual orders
│   ├── ArbitrageOpportunityDto.java   API response DTO for arbitrage results
│   ├── FavouriteDto.java              { typeId, typeName }
│   ├── MyOrderDto.java                Character/corp active sell order
│   ├── TransactionDto.java            Corporation transaction entry
│   └── WalletDto.java                 Wallet balance summary
│
├── repository/
│   ├── MarketOrderRepository.java     Filtered/sorted queries + arbitrage aggregation
│   ├── ItemTypeRepository.java        Category enrichment queries
│   └── FavouriteRepository.java       CRUD for starred items
│
├── service/
│   ├── EsiService.java                ESI API calls: orders, prices, names, categories
│   ├── MarketScannerService.java      @Scheduled scan loop
│   ├── ArbitrageService.java          Cross-region price gap analysis
│   ├── CharacterSession.java          Singleton: logged-in character token + info
│   └── EveSsoService.java             OAuth2 exchange, refresh, char/corp orders
│
└── controller/
    ├── MarketController.java          Orders, arbitrage, stats, scan trigger
    ├── FavouriteController.java       Favourite CRUD
    ├── AuthController.java            Login, callback, logout, status
    ├── TransactionController.java     Corp transaction history
    └── WalletController.java          Wallet balance
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

### `item_types`
| Column | Type | Notes |
|--------|------|-------|
| `type_id` | INT PK | ESI type ID |
| `type_name` | VARCHAR | Item name |
| `group_id` | INT | ESI group ID |
| `group_name` | VARCHAR | Group name |
| `category_id` | INT | ESI category ID |
| `category_name` | VARCHAR | Populated async after each scan |

### `favourites`
| Column | Type | Notes |
|--------|------|-------|
| `type_id` | INT PK | EVE type ID (natural key) |
| `type_name` | VARCHAR | Item name (denormalised for display) |

---

## Scan Lifecycle (`MarketScannerService`)

```
1. AtomicBoolean guard — skip if already scanning
2. Fetch ESI average prices for all items
3. For each configured region:
   a. Check staleness — skip ESI fetch if data is fresh enough
   b. Fetch all sell orders (paginated, up to 5 concurrent pages via WebFlux)
   c. Batch-resolve type names (POST /universe/names/, 1000 IDs per call)
   d. Batch-resolve system names
   e. Compute discountPercent + isGoodDeal flags
   f. Save in batches of 5000
4. Purge orders older than retention-hours
5. Spawn virtual thread → enrich item categories (type → group → category)
```

---

## REST API

### `GET /api/market/orders`
Paginated, filterable, sortable list of market orders.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `regionId` | int | — | EVE region ID (omit for all regions) |
| `typeId` | int | — | Exact item type ID |
| `goodDealsOnly` | bool | false | Only flagged good deals |
| `isBuyOrder` | bool | — | true=buy, false=sell, omit=both |
| `minAveragePrice` | decimal | — | Min ESI average price (ISK) |
| `maxAveragePrice` | decimal | — | Max ESI average price (ISK) |
| `typeName` | string | — | Partial case-insensitive name match |
| `categoryName` | string | — | Exact category name |
| `page` | int | 0 | Page number (0-based) |
| `size` | int | 50 | Page size |
| `sortBy` | string | `discountPercent` | Column: `typeName`, `price`, `discountPercent`, `discoveredAt`, `volumeRemain` |
| `sortDir` | string | `desc` | `asc` or `desc` |

Returns: Spring Data `Page<MarketOfferDto>`

---

### `GET /api/market/arbitrage`
Inter-regional arbitrage opportunities.

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `minAveragePrice` | decimal | — | Min ESI average price |
| `maxAveragePrice` | decimal | — | Max ESI average price |
| `typeName` | string | — | Partial name match |
| `categoryName` | string | — | Exact category match |
| `minGapPercent` | double | 5.0 | Minimum price gap % |
| `limit` | int | 100 | Max results |
| `typeIds` | int list | — | Comma-separated type IDs; bypasses limit when set (used by Fav Arbitrage tab) |

Returns: `List<ArbitrageOpportunityDto>`

**`alreadyListed` flag:** set when the logged-in character (or their corp) has an active sell order for that `typeId` in the sell region.

---

### `GET /api/favourites`
Returns `List<FavouriteDto>` of starred items.

### `POST /api/favourites`
Body: `{ typeId, typeName }`. Adds a favourite (upsert by PK).

### `DELETE /api/favourites/{typeId}`
Removes a favourite.

---

### `GET /api/auth/login` / `GET /api/auth/callback` / `POST /api/auth/logout` / `GET /api/auth/status`
Standard EVE SSO OAuth2 flow. `status` returns `{ loggedIn, characterName }`.

---

### `POST /api/market/scan`
Triggers an immediate scan on a background thread.

---

## Adding a New Scanned Region

1. In `application.properties`: append the region ID to `app.scanner.region-ids`
2. Add the region name to `ArbitrageService.REGION_NAMES` map
3. Restart backend
