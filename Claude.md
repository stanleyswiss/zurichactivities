# Swiss Activities Dashboard - Claude Code Instructions

## Project Status: PRODUCTION DEPLOYED ✅
**Last Updated**: September 8, 2025

## Project Overview
✅ **COMPLETED**: Next.js dashboard aggregating events near Schlieren, ZH with daily + on-demand scraping from official Swiss sources.

**Current Status**: Production deployed on Vercel + Railway, real-data only, 200km coverage, English UI

## 🚀 DEPLOYMENT ARCHITECTURE

### Vercel (Main App) - zurichactivities.vercel.app
- Next.js 14 UI and API routes
- Switzerland Tourism API scraper (working with opendata.myswitzerland.io)
- Limmattal HTML scraper
- NO Playwright dependencies (removed to fix build issues)
- Uses yarn for package management

### Railway (Worker Service) - alpsabzug-scraper
- Playwright-based scraper for JavaScript-heavy sites
- Runs in Docker container with full browser support
- Scrapes Alpsabzug/Alpine cattle descent events
- Daily cron at 7 AM + manual HTTP trigger
- Shares same PostgreSQL database with Vercel

### Database
- PostgreSQL on Railway
- Shared between Vercel and Railway worker
- Connection via DATABASE_URL environment variable

## 🔥 CRITICAL: Development & Testing Guidelines

### DO NOT TEST LOCALLY
- **Playwright does NOT work on macOS/Windows** without complex setup
- **All Playwright testing happens on Railway** in production
- **Vercel deployment uses yarn** (NOT npm) - package-lock.json warnings are expected

### Known Working Configuration
```
Switzerland Tourism API Key: [REDACTED - See environment variables]
Endpoint: https://opendata.myswitzerland.io/v1/attractions
Header: x-api-key
Rate limit: 0.5 req/s (safe for production)
```

## Tech Stack
- **Next.js 14** (app router)
- **Prisma** + **SQLite** (dev) → **PostgreSQL** (prod)
- **TypeScript**
- **Tailwind CSS**
- **Cheerio** (HTML scraping)
- **node-cron** (daily scraper)

## Project Structure
```
activities/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── events/route.ts
│   │   │   ├── scrape/route.ts
│   │   │   └── health/route.ts
│   │   ├── components/
│   │   │   ├── EventCard.tsx
│   │   │   ├── EventFilters.tsx
│   │   │   └── EventList.tsx
│   │   ├── lib/
│   │   │   ├── db.ts
│   │   │   ├── scrapers/
│   │   │   │   ├── switzerland-tourism.ts
│   │   │   │   ├── limmattal.ts
│   │   │   │   ├── zurich-tourism.ts
│   │   │   │   └── municipal-scraper.ts
│   │   │   ├── utils/
│   │   │   │   ├── geocoding.ts
│   │   │   │   ├── deduplication.ts
│   │   │   │   └── distance.ts
│   │   │   └── scheduler.ts
│   │   ├── types/
│   │   │   └── event.ts
│   │   ├── page.tsx
│   │   └── layout.tsx
│   └── prisma/
│       ├── schema.prisma
│       └── migrations/
├── .env.local
├── package.json
└── README.md
```

## Database Schema (Prisma)
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model Event {
  id               String   @id @default(cuid())
  source           String   // 'ST', 'ZURICH', 'LIMMATTAL', 'MUNICIPAL'
  sourceEventId    String?
  title            String
  titleNorm        String   // normalized for dedup
  description      String?
  lang             String   @default("de")
  category         String?
  startTime        DateTime
  endTime          DateTime?
  venueName        String?
  street           String?
  postalCode       String?
  city             String?
  country          String   @default("CH")
  lat              Float?
  lon              Float?
  priceMin         Float?
  priceMax         Float?
  currency         String   @default("CHF")
  url              String?
  imageUrl         String?
  uniquenessHash   String   @unique
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  @@index([startTime])
  @@index([lat, lon])
  @@index([source])
  @@index([category])
}
```

## Environment Variables (.env.local / Vercel)
```
DATABASE_URL="postgres://..."             # Railway connection
DATABASE_PUBLIC_URL="postgres://..."       # Pooled/public URL for Vercel
ST_API_KEY="<your_key>"                   # set in env only
RAILWAY_WORKER_URL="https://..."          # Railway worker endpoint (e.g., https://alpsabzug-scraper.up.railway.app)
NEXT_PUBLIC_SCHLIEREN_LAT="47.396"
NEXT_PUBLIC_SCHLIEREN_LON="8.447"
SCRAPE_TOKEN="<admin_token_optional>"     # required for /api/migrate; used by /api/scrape if set
NOMINATIM_EMAIL="you@example.com"         # optional, appended to UA for geocoding
GEOCODE_CACHE_TTL_DAYS="365"             # optional cache TTL in days
SCRAPE_PUBLIC="false"                    # if "true", allow UI to trigger /api/scrape without token (testing only)
SOURCES_ENABLED="ST,LIMMATTAL"           # default Vercel sources (Railway sources added automatically when UI triggers)
ST_EVENTS_URL="https://opendata.myswitzerland.io/v1/attractions"  # Events are nested in attractions (x-api-key)
ST_SEARCH_URL="https://api.discover.swiss/info/v2/search"  # If using POST search API (Ocp-Apim-Subscription-Key)
ST_SUBSCRIPTION_KEY="<subscription_key_if_needed>"        # Key for ST_SEARCH_URL
DISCOVER_SWISS_API_KEY="<discover_swiss_primary_key>"     # Primary key for Discover Swiss API
ST_BBOX="7.0,46.0,10.5,48.5"            # Expanded bbox for Alpine regions (Alpsabzug events)
ST_LANG="de"                              # Optional
ST_LIMIT="100"                            # Optional
```

## Active Scrapers (September 2025)

### ✅ 1. Switzerland Tourism API (`lib/scrapers/switzerland-tourism.ts`) - VERCEL
- **Status**: WORKING IN PRODUCTION
- **Endpoint**: `https://opendata.myswitzerland.io/v1/attractions` 
- **Auth**: x-api-key header with provided key
- **Data**: Returns tourist attractions (treated as events)
- **Rate limit**: 0.5 req/s

### ✅ 2. Limmattal Regional (`lib/scrapers/limmattal.ts`) - VERCEL
- **Status**: WORKING (HTML scraping)
- **URL**: `https://www.limmatstadt.ch/veranstaltungen`
- **Method**: Cheerio HTML parsing
- **Focus**: Local Schlieren/Dietikon events

### ✅ 3. Alpsabzug Events - RAILWAY WORKER ONLY
- **Status**: DEPLOYED ON RAILWAY (separate service)
- **Location**: `/railway-worker` directory
- **Method**: Playwright browser automation
- **Scrapers Available**:
  - **MySwitzerland Scraper**: Extracts JSON-LD structured data from event pages
  - **Advanced Scraper**: Multi-source scraper with 7+ Swiss tourism APIs
  - **Structured Data Scraper**: Extracts Schema.org Event data
  - **Simple Scraper**: Fallback text-based scraper
- **Access**: Via HTTP POST to `{RAILWAY_WORKER_URL}/scrape`
- **Integration**: Automatically triggered when UI "Update Now" button is clicked
- **Note**: REMOVED from main app due to Vercel limitations

### ❌ 4. Zurich Tourism - DISABLED
- No real implementation yet

### ❌ 5. Municipal Scraper - DISABLED  
- No real implementation yet

## Key Functions

### Deduplication (`lib/utils/deduplication.ts`)
```typescript
export function generateUniquenessHash(event: RawEvent): string {
  const normalized = {
    title: event.title.toLowerCase().trim(),
    startTime: Math.round(event.startTime.getTime() / 60000), // minute precision
    lat: event.lat ? Math.round(event.lat * 10000) / 10000 : null,
    lon: event.lon ? Math.round(event.lon * 10000) / 10000 : null
  };
  return createHash('sha1')
    .update(JSON.stringify(normalized))
    .digest('hex');
}
```

### Distance Filtering (`lib/utils/distance.ts`)
```typescript
export function calculateDistance(
  lat1: number, lon1: number, 
  lat2: number, lon2: number
): number {
  // Haversine formula - return km
}

export function filterByDistance(
  events: Event[], 
  centerLat: number, 
  centerLon: number, 
  maxDistanceKm: number = 100
): Event[] {
  // Filter events within radius
}
```

### Geocoding (`lib/utils/geocoding.ts`)
```typescript
export async function geocodeAddress(address: string): Promise<{lat: number, lon: number} | null> {
  // Use Swiss geocoding service or fallback to OpenStreetMap Nominatim
  // Prefer Swiss addresses format
}
```

## API Endpoints

### `/api/events` (GET)
**Query params:**
- `from`: ISO date (default: today)
- `to`: ISO date (default: +30 days)
- `lat`, `lon`: center coordinates (default: Schlieren)
- `radius`: km (default: 100)
- `category`: filter by category
- `source`: filter by source
- `lang`: de/en (default: de)

### `/api/scrape` (POST)
**Body:**
```json
{
  "sources": ["ST", "LIMMATTAL", "ZURICH", "MUNICIPAL"],
  "force": true
}
```

### `/api/health` (GET)
Returns scraper status, last run times, event counts per source.

## UI Components

### EventCard (`components/EventCard.tsx`)
- Event title, date/time, venue
- Distance from Schlieren
- Source badge
- "Add to Calendar" button
- Price indicator
- Category tag

### EventFilters (`components/EventFilters.tsx`)
- Date range picker
- Distance slider (10-100km)
- Category checkboxes
- Quick filters: "Today", "Tomorrow", "This Weekend", "Free Events"
- Language toggle (DE/EN)

### EventList (`components/EventList.tsx`)
- Virtualized list for performance
- Infinite scroll
- Sort options: Date, Distance, Relevance

## Scheduler & Cron
On Vercel, the in-process cron is disabled; use Vercel Cron (see vercel.json) which calls `GET /api/scrape` daily. The `/api/scrape` route now supports GET (for Vercel Cron) and POST (for manual/admin triggers) and accepts an optional `SCRAPE_TOKEN`.

## Priority Categories
```typescript
export const CATEGORIES = {
  ALPSABZUG: 'alpsabzug', // Cattle descent from Alps
  FESTIVAL: 'festival',
  MUSIC: 'musik',
  MARKET: 'markt',
  FAMILY: 'familie',
  SPORTS: 'sport',
  CULTURE: 'kultur',
  COMMUNITY: 'gemeinde',
  SEASONAL: 'saisonal' // Christmas markets, etc.
} as const;
```

## Geographic Focus
**Primary (±15km):** Schlieren, Dietikon, Zurich, Urdorf, Oberengstringen, Weiningen
**Secondary (±50km):** Basel, Lucerne, Bern events (major only)
**Special (±100km):** Alpsabzug events, major festivals

## Special Event Patterns
- **Alpsabzug**: Search for "Alpabzug", "Alpabfahrt", "Viehscheid", "Désalpe"
- **Christmas Markets**: "Weihnachtsmarkt", "Christkindlmärkt" (seasonal)
- **Folk Festivals**: "Volksfest", "Chilbi", "Fest"

## ✅ COMPLETED IMPLEMENTATION
1. ✅ **Setup**: Next.js 14, Prisma + SQLite, Tailwind CSS UI
2. ✅ **Comprehensive Scraper**: All sources combined (ST, Limmattal, Municipal, Zurich)
3. ✅ **Deduplication**: SHA1 hash-based system with uniqueness detection
4. ✅ **Advanced UI**: English interface, reset filters, municipality sub-filters
5. ✅ **Scheduler**: Daily cron + on-demand API with rate limiting
6. ✅ **Distance**: 200km coverage with Haversine calculation
7. ✅ **Filtering**: Categories, sources, municipalities, price, distance, search
8. ✅ **Error Handling**: Comprehensive logging, health checks, graceful degradation

## 🎯 DEPLOYMENT & OPERATIONS (Sept 2025)

### Vercel Deployment
- **URL**: https://zurichactivities.vercel.app (or custom domain)
- **Build**: `yarn install && yarn build` (uses Next.js)
- **Environment Variables Required**:
  ```
  DATABASE_URL=<Railway PostgreSQL external URL>
  ST_API_KEY=<Your Switzerland Tourism API key>
  RAILWAY_WORKER_URL=https://alpsabzug-scraper.up.railway.app
  SOURCES_ENABLED=LIMMATTAL,ST
  ```

### Railway Worker Deployment
- **Service**: alpsabzug-scraper
- **Root Directory**: `/railway-worker` (set in Railway settings)
- **Build**: Docker (automatic from Dockerfile)
- **Port**: 8080 (set automatically by Railway)
- **Environment Variables Required**:
  ```
  DATABASE_URL=${{Postgres.DATABASE_URL}}  # Internal Railway connection
  NOMINATIM_EMAIL=your_email@example.com
  ```

### Common Issues & Solutions
1. **Vercel build fails with Playwright**: Already fixed - Playwright removed from main app
2. **Railway Prisma crash**: Fixed with Prisma 5.22.0 and binary targets
3. **Scraper selectors outdated**: Normal - websites change, update selectors in railway-worker
4. **504 timeouts**: Increased Vercel timeout to 30s, Railway handles long-running scrapers

## Error Handling
- Exponential backoff for failed requests
- Circuit breaker for consistently failing sources
- Graceful degradation (show cached events if scraper fails)
- Detailed logging with source attribution

## Performance
- Index on `startTime`, `lat/lon`, `source`
- Lazy load images
- Cache API responses (5-minute TTL)
- Virtualized lists for large result sets

## 🚀 HOW TO RUN THE PROJECT

1. **Start Development Server**:
   ```bash
   yarn dev
   # Access at http://localhost:3000
   ```

2. **Update Event Data**:
   - Use "Update Data" button in UI (runs ALL scrapers: ST, LIMMATTAL + Railway MySwitzerland/Alpsabzug)
   - The UI automatically triggers Railway scrapers if RAILWAY_WORKER_URL is configured
   - Or manually for specific sources: 
     ```bash
     curl -X POST http://localhost:3000/api/scrape \
       -H 'Content-Type: application/json' \
       -d '{"sources":["ST","LIMMATTAL","RAILWAY_ALL"],"force":false}'
     ```

3. **Database Operations**:
   ```bash
   yarn db:push      # Apply schema changes  
   yarn db:studio    # Open Prisma studio
   ```

4. **Configure Railway Integration**:
   - Set `RAILWAY_WORKER_URL` in Vercel environment variables
   - Point it to your Railway worker deployment (e.g., https://alpsabzug-scraper.up.railway.app)
   - The UI will automatically include Railway scrapers when updating data

## 🎯 NEXT DEVELOPMENT PRIORITIES (Future Sessions)

1. **Real API Endpoints** (High Priority):
   - Verify Switzerland Tourism API endpoint and data model
   - Implement JavaScript-capable scraping for Limmattal site (Playwright), respecting robots and ToS
   - Connect to real municipal sources (replace sample data) and re-enable MUNICIPAL
   - Implement Zurich Tourism real scraper and re-enable ZURICH

2. **Enhanced Features** (Medium Priority):
   - Email notifications for new events
   - iCal export functionality  
   - User favoriting/bookmarking system
   - Admin dashboard for scraper management

3. **Production Ready** (Low Priority):
   - PostgreSQL migration for production
   - Docker containerization
   - CI/CD pipeline setup
   - Performance monitoring

## 🐛 KNOWN LIMITATIONS
- **Switzerland Tourism API**: URL `api.myswitzerland.com` doesn't exist (needs research)
- **Limmattal Website**: Uses JavaScript loading (needs Puppeteer/Playwright)
- **Municipal Data**: Currently sample data (need real municipal APIs)
- **Rate Limiting**: Implemented but not tested with real high-volume usage

**System is functional with test data, content filtering, Cron GET, and ready for real API integration.**

## Changes (Sept 2025)
- Removed hardcoded API key from docs; require `ST_API_KEY` in env.
- Added GET handler + auth to `/api/scrape`; accepts `x-vercel-cron` header.
- Disabled node-cron scheduling on Vercel; rely on Vercel Cron.
- Added political/administrative filter (drops Gemeindeversammlung, Wahlen, etc.).
- Fixed multi-select handling in `/api/events` (category/source `in` filters).
- UI: removed "COMPREHENSIVE" from source filters; corrected map colors for DE categories; event card shows source hostname.
- Removed all sample-data generation and disabled sample-based scrapers (ZURICH, MUNICIPAL, TEST, COMPREHENSIVE). Only real scrapers (ST, LIMMATTAL) run.
- Added geocoding cache (Prisma model `GeocodeCache`) with optional TTL; Nominatim calls are throttled and cached.

## 🎯 COMPLETED TASKS (Sept 8, 2025)

### ✅ Switzerland Tourism API
- Fixed endpoint: `https://opendata.myswitzerland.io/v1/attractions`
- Working with provided API key
- Returns tourist attractions (used as events)

### ✅ Playwright Deployment  
- Moved to Railway worker service (Vercel doesn't support Playwright)
- Created `/railway-worker` with Docker deployment
- Removed all Playwright imports from main app
- Fixed Prisma compatibility issues

### ✅ Production Architecture
- Vercel: UI + simple scrapers (ST, Limmattal)
- Railway: Playwright scraper (Alpsabzug) + PostgreSQL
- Both services share same database

## ⚠️ REMEMBER FOR NEXT SESSION

1. **DO NOT test Playwright locally** - Only works on Railway
2. **DO NOT add Playwright to main app** - Vercel can't run it
3. **Use yarn NOT npm** for Vercel (package-lock.json warnings are normal)
4. **ST API is WORKING** - Don't change the endpoint again
5. **Railway needs root directory** `/railway-worker` in settings
6. **Both services are SEPARATE** - Different repos in same GitHub

## Admin Token Setup
- Set `SCRAPE_TOKEN` in Vercel env to a long random string (32–64 chars). Examples to generate locally:
  - `openssl rand -hex 32` (hex, URL-safe)
  - `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
- Manual scrape:
  - `POST /api/scrape` with header `Authorization: Bearer <SCRAPE_TOKEN>` (body: `{ "sources": ["ST","LIMMATTAL"], "force": false }`)
- Create cache table (one-time):
  - Open in browser: `/api/migrate?token=<SCRAPE_TOKEN>` (returns success if created)
- Reset events and re-scrape:
  - Open in browser: `/api/admin/reset?token=<SCRAPE_TOKEN>&clearCache=1` (optional clearCache)
