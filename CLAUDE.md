# EVE Market Scanner — Project Overview for Claude

## What This Is
A local dev tool that scans EVE Online market orders across 4 major trade hub regions via the public ESI API and surfaces inter-regional arbitrage opportunities. A logged-in EVE character's personal and corporation sell orders are fetched to grey out already-listed items in the arbitrage view.

## Tech Stack
- **Backend**: Java 21, Spring Boot 3.5, Maven (`./mvnw`), Spring Data JPA, H2 file-based DB, Spring WebFlux (WebClient for reactive ESI calls)
- **Frontend**: Angular 20 standalone components, Angular Material dark theme, Reactive Forms, `ng serve` dev server
- **Database**: H2 file DB at `backend/data/evemarket` — persists between restarts
- **ESI API**: `https://esi.evetech.net/latest` — all public endpoints except character/corp orders which require Bearer tokens

## Starting the App
```bash
# Backend (from backend/)
./mvnw spring-boot:run

# Frontend (from frontend/)
npx ng serve --open
```
Backend: `http://localhost:8080` | Frontend: `http://localhost:4200`

**First scan takes ~90s** (4 regions × ~280k orders each). Watch backend.log for 4× "Saved X sell orders" lines.

## EVE SSO Credentials
Stored in `backend/src/main/resources/application.properties`:
```
eve.sso.client-id=6c88304b01e54baba3d1f43b44cffd52
eve.sso.client-secret=eat_IR9AC0uf0vjkFjgiumJeVxgTvxJSx6Qs_1MfCwU
eve.sso.redirect-uri=http://localhost:8080/api/auth/callback
```
Registered at https://developers.eveonline.com/ with scopes:
- `esi-markets.read_character_orders.v1`
- `esi-markets.read_corporation_orders.v1`

## Key Architecture Decisions

### Scanning
- `@Scheduled(fixedDelay=300000)` with 10s initial delay
- `AtomicBoolean` guard prevents concurrent scans
- All 4 regions scanned sequentially; type names and system names batch-resolved via `POST /universe/names/` (1000 IDs per call) **before** any DB save
- Orders saved in batches of 5000 to avoid huge transactions
- Category enrichment runs on a virtual thread **after** each scan (non-blocking)
- Old orders purged after 24h

### Arbitrage
- Native SQL `GROUP BY (type_id, region_id)` returns min sell price per item per region
- Java-side pairing: finds cheapest and priciest region for each item, computes gap %
- `alreadyListed` flag set if character/corp has an active sell order for that typeId

### Auth (EVE SSO)
- Standard OAuth2 Authorization Code flow — backend-side only
- `CharacterSession` is a singleton `@Component` (single user, local tool)
- `window.location.href` redirect for login (not XHR), so no CORS complications
- After login: fetches corporation ID from public ESI, stores in session
- Corp orders endpoint returns 403 if character lacks Accountant/Trader role — handled gracefully

### Filters
- All filters applied **only on button click** (no reactive debounce) to avoid excessive requests
- Price slider values are in **millions of ISK**; multiplied by 1,000,000 before sending to backend
- Slider at max (1000) = no upper limit (null sent to backend)

## Package Structure
```
com.evemarket.backend
├── config/       EveSsoConfig, WebClientConfig, CorsConfig
├── controller/   MarketController, AuthController
├── dto/          EsiMarketOrderDto, MarketOfferDto, ArbitrageOpportunityDto
├── model/        MarketOrder, ItemType
├── repository/   MarketOrderRepository, ItemTypeRepository
└── service/      EsiService, MarketScannerService, ArbitrageService,
                  EveSsoService, CharacterSession
```

## Common Issues
- **H2 file lock on restart**: `taskkill //F //IM java.exe` (Windows)
- **Backend "failed" task notification**: usually the previously-killed process — verify with `curl http://localhost:8080/api/auth/status`
- **Corp orders 403**: character needs Accountant or Trader role in-game — personal orders still work
- **New SSO scope**: after adding a scope to the dev app, user must logout + re-login to get a token with the new scope
- **First scan slow**: normal — ~90s for 4 regions. Arbitrage tab shows no data until at least one full scan completes

## API Endpoints Quick Reference
```
GET  /api/market/orders       paginated orders with filters
GET  /api/market/top-deals    top 10 deals by discount %
GET  /api/market/arbitrage    inter-regional arbitrage opportunities
GET  /api/market/categories   list of known item categories
GET  /api/market/stats        total order count + good deal count
POST /api/market/scan         trigger immediate scan

GET  /api/auth/login          redirect to EVE SSO
GET  /api/auth/callback       OAuth2 callback (EVE redirects here)
POST /api/auth/logout         clear character session
GET  /api/auth/status         { loggedIn, characterName }
```
