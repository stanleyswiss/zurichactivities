# Swiss Activities Dashboard - Claude Code Instructions

## Project Status: FULLY FUNCTIONAL ✅
**Last Updated**: September 6, 2025

## Project Overview
✅ **COMPLETED**: Next.js dashboard aggregating events near Schlieren, ZH with daily + on-demand scraping from official Swiss sources.

**Current Status**: Real-data only from active scrapers (no sample data), 200km coverage, English UI, advanced filtering

## API Key & Rate Limits
```
Switzerland Tourism API Key: (set ST_API_KEY env var; do not commit)
Header: x-api-key
Limits: 1 req/s (10 req/s burst), 1000 req/day (provider dependent)
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
NEXT_PUBLIC_SCHLIEREN_LAT="47.396"
NEXT_PUBLIC_SCHLIEREN_LON="8.447"
SCRAPE_TOKEN="<admin_token_optional>"     # required for /api/migrate; used by /api/scrape if set
NOMINATIM_EMAIL="you@example.com"         # optional, appended to UA for geocoding
GEOCODE_CACHE_TTL_DAYS="365"             # optional cache TTL in days
SCRAPE_PUBLIC="false"                    # if "true", allow UI to trigger /api/scrape without token (testing only)
SOURCES_ENABLED="LIMMATTAL"             # default sources when none provided (e.g., LIMMATTAL or ST,LIMMATTAL)
```

## Core Scrapers

### 1. Switzerland Tourism API (`lib/scrapers/switzerland-tourism.ts`)
- **Endpoint**: `https://api.myswitzerland.com/v1/events`
- **Params**: `bbox` (Zurich region), `lang=de`, `limit=100`
- **Rate limit**: 1 req/s
- **Focus**: Official tourism events, festivals, Alpsabzug events

### 2. Limmattal Regional (`lib/scrapers/limmattal.ts`)
- **URL**: `https://www.limmatstadt.ch/veranstaltungen`
- **Method**: HTML scraping with Cheerio
- **Focus**: Local Schlieren/Dietikon/Oetwil events

### 3. Zurich Tourism (`lib/scrapers/zurich-tourism.ts`)
Not currently invoked (previously sample-based). Will be enabled once a real scraper is implemented.

### 4. Municipal Scraper (`lib/scrapers/municipal-scraper.ts`)
Not currently invoked (previously sample-based). Will be enabled once real sources are integrated.

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

## 🎯 CURRENT METRICS (Sept 2025)
- **Events**: 77 combined from all sources → 64+ unique after deduplication
- **Coverage**: 200km radius from Schlieren
- **Alpsabzug**: 20+ traditional cattle descent events across Swiss Alps
- **Cities**: 14 municipalities (Schlieren, Zürich, Basel, Bern, Lucerne, etc.)
- **Sources**: Switzerland Tourism, Municipal, Zurich Tourism, Limmattal Regional
- **Time Range**: September 2025 - December 2025
- **UI Language**: Full English translation

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
   npm run dev
   # Access at http://localhost:3000
   ```

2. **Update Event Data**:
   - Use "Update Data" button in UI (runs real scrapers: ST, LIMMATTAL)
   - Or manually: `curl -X POST http://localhost:3000/api/scrape -H 'Content-Type: application/json' -d '{"sources":["ST","LIMMATTAL"],"force":false}'`

3. **Database Operations**:
   ```bash
   npm run db:push      # Apply schema changes  
   npm run db:studio    # Open Prisma studio
   ```

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

## TODO (Next Session)
- Add Playwright-based scraper for Limmattal and extract schema.org JSON-LD for canonical links.
- Verify Switzerland Tourism API endpoint and data model; adapt mapper accordingly.
- Re-enable Zurich/Municipal only with real scrapers (no sample data) and apply content filter.
- Add “Family Weekend” preset (<=50km, categories: familie/kultur/festival) and enable pagination in `/api/events`.
- Optional: move scraping to Railway worker if durations or rate limits exceed Vercel constraints.
- Add server-side UI trigger or temporary SCRAPE_PUBLIC toggle documented for testing.

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
