# Swiss Activities Dashboard

**Production Status**: ✅ DEPLOYED (Vercel + Railway)

A distributed Next.js application that aggregates events near Schlieren, Switzerland using a dual-service architecture for maximum scraping capabilities.

## Features

- **Multi-source Event Aggregation**: Switzerland Tourism API, Limmattal regional site, and more
- **Smart Deduplication**: Hash-based system to prevent duplicate events
- **Location-based Filtering**: Distance-based event filtering from Schlieren
- **Advanced Search & Filters**: Date range, categories, sources, price filtering
- **Automated Scraping**: Daily scheduled data collection at 6 AM
- **Rate Limiting**: Respects API limits (1 req/s for Switzerland Tourism)
- **Responsive Design**: Mobile-friendly interface with Tailwind CSS

## Architecture

### Vercel (Main App)
- **Next.js 14** with App Router
- **TypeScript** for type safety  
- **Prisma** with PostgreSQL
- **Tailwind CSS** for styling
- **Cheerio** for HTML scraping
- **Active Scrapers**: Switzerland Tourism API, Limmattal

### Railway (Worker Service)
- **Playwright** for browser automation
- **Docker** container deployment
- **Express** API for triggers
- **Active Scraper**: Alpsabzug events
- **Separate service** at `/railway-worker`

## Production Deployment

### Prerequisites

- Vercel account (for main app)
- Railway account (for Playwright worker + PostgreSQL)
- Node.js 18+ and yarn (NOT npm)

### Vercel Setup

1. Connect GitHub repository
2. Set environment variables:
```env
DATABASE_URL=<Railway PostgreSQL external URL>
ST_API_KEY=<Your Switzerland Tourism API key>
RAILWAY_WORKER_URL=<Your Railway worker URL>
SOURCES_ENABLED=LIMMATTAL,ST
```
3. Deploy (automatic on push to main)

### Railway Setup

1. Create PostgreSQL database
2. Create new service for worker:
   - Set root directory: `/railway-worker`
   - Add environment variables:
   ```env
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   NOMINATIM_EMAIL=your@email.com
   ```
3. Deploy (automatic on push)

### Local Development

⚠️ **IMPORTANT**: Playwright scraping does NOT work locally. Test on Railway only.

```bash
yarn install
yarn dev
```

2. Set up environment variables:
```bash
cp .env.local.example .env.local
```

3. Set up database:
```bash
npx prisma generate
npx prisma db push
```

4. Run development server:
```bash
npm run dev
# or
yarn dev
```

Open [http://localhost:3000](http://localhost:3000) to see the dashboard.

## API Endpoints

### `GET /api/events`
Fetch filtered events with query parameters:
- `from`, `to`: Date range (ISO format)
- `lat`, `lon`: Center coordinates (defaults to Schlieren)
- `radius`: Distance in km (default: 100)
- `category`: Filter by category
- `source`: Filter by source (ST, LIMMATTAL, etc.)
- `lang`: Language (de, en)

### `POST /api/scrape`
Manually trigger event scraping:
```json
{
  "sources": ["ST", "LIMMATTAL"],
  "force": true
}
```

### `GET /api/health`
System health check showing database stats and scraper status.

## Event Sources

### Implemented
- **Switzerland Tourism (ST)**: Official Swiss tourism events via API
- **Limmattal (LIMMATTAL)**: Regional events via web scraping

### Planned
- **Zurich Tourism**: Major Zurich city events
- **Municipal**: Local municipality websites (Schlieren, Dietikon, etc.)

## Event Categories

- **Alpsabzug**: Traditional cattle descent events
- **Festival**: General festivals and celebrations
- **Music**: Concerts and music events
- **Market**: Markets and fairs
- **Family**: Family-friendly activities
- **Sports**: Sports events
- **Culture**: Cultural events and theater
- **Community**: Municipal and community events
- **Seasonal**: Christmas markets, seasonal events

## Geographic Coverage

- **Primary (±15km)**: Schlieren, Dietikon, Zurich, Urdorf, Oberengstringen
- **Secondary (±50km)**: Basel, Lucerne, Bern (major events only)
- **Special (±100km)**: Alpsabzug events, major festivals

## Development

### Database Operations
```bash
# Generate Prisma client
npm run db:generate

# Push schema changes
npm run db:push

# Create migration
npm run db:migrate

# Open database studio
npm run db:studio
```

### Scraping
The system automatically scrapes events daily at 6 AM. For manual scraping, use the admin panel in the UI or call the API directly.

Admin endpoints (protected by SCRAPE_TOKEN):
- `GET /api/migrate?token=...` ensures the GeocodeCache table exists.
- `GET /api/admin/reset?token=...&clearCache=1` clears events (and cache if requested) and re-scrapes real sources.

Testing the UI Update button:
- Temporarily set `SCRAPE_PUBLIC=true` in Vercel env to allow the UI button to trigger `/api/scrape` without a token. Turn off afterwards.

## Environment Variables

```env
# Database (PostgreSQL on Railway)
DATABASE_URL="postgres://..."
DATABASE_PUBLIC_URL="postgres://..." # pooled/public URL recommended for Vercel

# Upstream APIs (do not commit secrets)
ST_API_KEY="your_switzerland_tourism_api_key"
DISCOVER_SWISS_API_KEY="your_discover_swiss_primary_key"  # Primary key for Discover Swiss API
NOMINATIM_EMAIL="you@example.com"           # optional, appended to User-Agent for geocoding
GEOCODE_CACHE_TTL_DAYS="365"               # optional, days to keep cached coordinates
ST_EVENTS_URL="https://opendata.myswitzerland.io/v1/attractions"  # Events are nested in attractions API
ST_SEARCH_URL="https://api.discover.swiss/info/v2/search"  # if using Discover Swiss POST search API
ST_SUBSCRIPTION_KEY="your_subscription_key_if_required"   # used for ST_SEARCH_URL (fallback to DISCOVER_SWISS_API_KEY)
ST_BBOX="8.0,47.0,9.0,48.0"                # optional Zurich-region bbox
ST_LANG="de"                                # optional (de/en)
ST_LIMIT="100"                              # optional

# App config
NEXT_PUBLIC_SCHLIEREN_LAT="47.396"
NEXT_PUBLIC_SCHLIEREN_LON="8.447"

# Admin/auth
SCRAPE_TOKEN="your_admin_token" # optional: required for /api/migrate and /api/scrape if set
SCRAPE_PUBLIC="false"           # set to "true" to let the UI Update button call /api/scrape without a token (testing only)
SOURCES_ENABLED="LIMMATTAL"     # comma-separated list of sources to run by default (e.g., LIMMATTAL or ST,LIMMATTAL)
```

## Deployment

For production deployment:

1. Use Railway Postgres; set `DATABASE_URL` and `DATABASE_PUBLIC_URL` in Vercel
2. Set `ST_API_KEY` and optionally `SCRAPE_TOKEN` in Vercel (never in repo)
3. Run Prisma migrations or `db push` from CI/local against Railway
4. Deploy frontend on Vercel; Vercel Cron will call `GET /api/scrape` daily

### Geocoding Cache
- After deployment, run a Prisma push against Railway to create the cache table:
  - Locally: set `DATABASE_URL` to your Railway Postgres and run `npm run db:push`.
  - Or apply via CI.
- Optional envs: `NOMINATIM_EMAIL`, `GEOCODE_CACHE_TTL_DAYS`.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is intended for educational and non-commercial use.

## Support

For issues and questions, please check the existing documentation or create an issue in the repository.
