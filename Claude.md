# Swiss Activities Dashboard - Claude Code Instructions

## Project Status: PRODUCTION DEPLOYED ✅
**Last Updated**: September 9, 2025

## Project Overview
✅ **COMPLETED**: Next.js dashboard aggregating events near Schlieren, ZH with daily scraping from official Swiss sources.

**Current Status**: Production deployed on Vercel + Railway
- Clean data from MySwitzerland API + Limmattal HTML scraping
- Railway worker disabled from auto-scraping (manual triggers only)
- 200km coverage around Schlieren with distance calculations

## 🚀 DEPLOYMENT ARCHITECTURE

### Vercel (Main App) - zurichactivities.vercel.app
- Next.js 14 UI and API routes
- Switzerland Tourism API scraper using offers endpoint with `expand=true`
- Limmattal HTML scraper for local events
- Uses yarn for package management
- PostgreSQL database connection via Railway

### Railway (Worker Service) - alpsabzug-scraper
**⚠️ DISABLED AUTO-SCRAPING**
- Playwright-based scrapers available but NOT auto-running
- No cron schedule active
- No startup scraping
- Only responds to manual HTTP POST /scrape requests
- Shares same PostgreSQL database with Vercel

### Database
- PostgreSQL on Railway
- Shared between Vercel and Railway worker
- Connection via DATABASE_URL environment variable

## 🔥 CURRENT WORKING CONFIGURATION

### Switzerland Tourism API
```
Endpoint: https://opendata.myswitzerland.io/v1/offers
Parameters:
- expand=true (CRITICAL - provides full location data)
- bbox=7.0,46.0,10.5,48.5
- lang=de
- limit=100
- validFrom/validThrough for date filtering

Header: x-api-key (set in environment only)
Rate limit: 0.5 req/s
```

### Data Sources
1. **ST (Switzerland Tourism)**: Clean API data with locations
2. **LIMMATTAL**: Local HTML scraping for Schlieren/Dietikon events
3. **RAILWAY**: DISABLED - No automatic web scraping

## Tech Stack
- **Next.js 14** (app router)
- **Prisma** + **PostgreSQL** 
- **TypeScript**
- **Tailwind CSS**
- **Cheerio** (HTML scraping for Limmattal)
- **node-cron** (disabled on Vercel, uses Vercel Cron instead)

## Database Schema (Prisma)
```prisma
model Event {
  id               String   @id @default(cuid())
  source           String   // 'ST', 'LIMMATTAL' only
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

## Environment Variables (Vercel)
```
DATABASE_URL="postgres://..."             # Railway connection
ST_API_KEY="<your_key>"                  # REQUIRED - MySwitzerland API key
RAILWAY_WORKER_URL="https://..."         # Railway worker endpoint (optional)
NEXT_PUBLIC_SCHLIEREN_LAT="47.396"
NEXT_PUBLIC_SCHLIEREN_LON="8.447"
SCRAPE_TOKEN="<admin_token>"             # For admin endpoints
SOURCES_ENABLED="ST,LIMMATTAL"           # Active sources
ST_BBOX="7.0,46.0,10.5,48.5"           # Coverage area
ST_LANG="de"                            
ST_LIMIT="100"                          
```

## API Endpoints

### `/api/events` (GET)
Query params:
- `from`, `to`: Date range
- `lat`, `lon`: Center coordinates (default: Schlieren)
- `radius`: km (default: 100)
- `category`, `source`: Filters
- `lang`: de/en (default: de)

### `/api/scrape` (POST/GET)
- Triggers ST + LIMMATTAL scrapers only
- Railway scrapers NOT included by default
- Requires SCRAPE_TOKEN if configured

### `/api/admin/reset` (GET)
- `?token=<SCRAPE_TOKEN>&clearCache=1`
- Clears all events from database

## ✅ WORKING FEATURES

### Switzerland Tourism Scraper
- Uses offers API with `expand=true` for complete data
- Single API call gets all location data
- Proper event date extraction (validFrom/validThrough)
- Location coordinates from areaServed.geo
- Category mapping and filtering
- Accepts events up to 90 days duration

### Limmattal Scraper  
- HTML scraping with Cheerio
- Title cleaning (removes excess whitespace)
- Local event focus
- German date parsing

### Distance Calculation
- Haversine formula from Schlieren coordinates
- Shows "XX km away" when location data available
- Filters events within specified radius

## ❌ DISABLED FEATURES

### Railway Worker
- Cron scheduling: DISABLED
- Startup auto-scrape: DISABLED  
- Web scrapers: Available but not auto-running
- Only responds to manual HTTP triggers

## 🎯 HOW TO USE

### Update Event Data
1. Click "Update Data" button in UI
2. Runs ST (API) + LIMMATTAL (HTML) scrapers
3. Does NOT run Railway web scrapers

### Clear Database
```
https://zurichactivities.vercel.app/api/admin/reset?token=YOUR_TOKEN&clearCache=1
```

### Manual Railway Scrape (if needed)
```bash
curl -X POST https://alpsabzug-scraper.up.railway.app/scrape \
  -H 'Content-Type: application/json' \
  -d '{"type": "myswitzerland"}'
```

## ⚠️ CRITICAL NOTES

1. **API Key Security**: Never commit ST_API_KEY to code
2. **Railway Auto-Scrape**: Disabled - it was adding trash data on every deployment
3. **Use expand=true**: Critical for getting location data in one API call
4. **Event Filtering**: Accepts events up to 90 days to be inclusive

## 🐛 RECENT FIXES

1. **Railway Auto-Scraping**: Disabled setTimeout and cron that were polluting data
2. **ST API Optimization**: Added expand=true to get all data in one call
3. **Location Data**: Fixed extraction from areaServed.geo fields
4. **Event Filtering**: Made more inclusive (was too restrictive)
5. **Title Cleaning**: Fixed LIMMATTAL whitespace issues

## 📊 CURRENT DATA QUALITY

- **ST Events**: Clean API data with dates, locations, categories
- **LIMMATTAL Events**: Local events with cleaned titles
- **No Trash Data**: Railway scrapers disabled from auto-running
- **Distance Calculations**: Working when coordinates available

The system now provides clean, properly formatted events with accurate dates, locations, and categories from official Swiss sources.