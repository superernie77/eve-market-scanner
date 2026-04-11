# EVE Market Scanner

A local dev tool that scans EVE Online market orders across the 4 major trade hub regions via the public ESI API and surfaces inter-regional arbitrage opportunities.

![Java](https://img.shields.io/badge/Java-21-orange) ![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5-brightgreen) ![Angular](https://img.shields.io/badge/Angular-20-red) ![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-blue)

## Features

- **Multi-region scanning** — fetches sell orders from The Forge (Jita), Domain (Amarr), Sinq Laison (Dodixie), Heimatar (Rens), and Metropolis (Hek) every 5 minutes
- **Arbitrage view** — finds the cheapest buy region and most expensive sell region for each item, ranked by gap %
- **Favourites** — star items to track them in a dedicated Fav Arbitrage tab with persistent DB storage
- **Already-listed overlay** — log in with EVE SSO to grey out items you already have sell orders for
- **All Orders tab** — browse all market orders with filters for region, category, price range, and good deals
- **Corp order support** — fetches corporation sell orders if your character has the Accountant or Trader role

## Tech Stack

| Layer | Tech |
|---|---|
| Backend | Java 21, Spring Boot 3.5, Spring Data JPA, Spring WebFlux |
| Frontend | Angular 20 standalone components, Angular Material (dark theme) |
| Database | PostgreSQL 16 |
| Auth | EVE SSO (OAuth2 Authorization Code) |
| ESI | `https://esi.evetech.net/latest` |

## Prerequisites

- Java 21+
- Node.js 20+
- PostgreSQL 16 running locally on port 5432

## Setup

### 1. Database

Create the database:

```sql
CREATE DATABASE evemarket;
```

### 2. Backend configuration

Copy the example config and fill in your credentials:

```bash
cp backend/src/main/resources/application.properties.example \
   backend/src/main/resources/application.properties
```

Set your PostgreSQL password and EVE SSO credentials (see below).

### 3. EVE SSO

Register an application at [developers.eveonline.com](https://developers.eveonline.com/) with:

- **Callback URL**: `http://localhost:8080/api/auth/callback`
- **Scopes**: `esi-markets.read_character_orders.v1`, `esi-markets.read_corporation_orders.v1`

Then add the client ID and secret to `application.properties`.

## Running

```bash
# Backend (from backend/)
./mvnw spring-boot:run

# Frontend (from frontend/)
npx ng serve --open
```

| Service | URL |
|---|---|
| Frontend | http://localhost:4200 |
| Backend API | http://localhost:8080 |

> **First scan takes ~90 seconds** — the app fetches ~280k orders per region. The Arbitrage tab shows no data until the first full scan completes.

## API Endpoints

```
GET  /api/market/orders       Paginated orders with filters
GET  /api/market/arbitrage    Inter-regional arbitrage opportunities
GET  /api/market/categories   List of known item categories
GET  /api/market/stats        Total order count + good deal count
POST /api/market/scan         Trigger an immediate scan

GET  /api/favourites          List favourited items
POST /api/favourites          Add a favourite
DELETE /api/favourites/{id}   Remove a favourite

GET  /api/auth/login          Redirect to EVE SSO
GET  /api/auth/callback       OAuth2 callback
POST /api/auth/logout         Clear session
GET  /api/auth/status         { loggedIn, characterName }
```

## Common Issues

| Problem | Fix |
|---|---|
| Backend won't start — port in use | `taskkill /F /IM java.exe` |
| Frontend port 4200 in use | `taskkill /F /IM node.exe` |
| Corp orders return 403 | Character needs Accountant or Trader role in-game |
| Arbitrage tab empty after startup | Normal — wait for the first scan to complete (~90s) |
| Added a new SSO scope | Logout and re-login to get a token with the new scope |

## Docker

A `docker-compose.yml` is included to run PostgreSQL locally:

```bash
docker compose up -d
```
