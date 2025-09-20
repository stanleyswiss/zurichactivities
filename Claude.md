# Swiss Municipal Events Dashboard - Claude Code Instructions

## Project Status: PRODUCTION READY ✅
**Last Updated**: December 2024

## Project Overview
A Next.js dashboard that aggregates events from ALL Swiss municipalities near Schlieren, ZH.

**Architecture**: Vercel deployment with PostgreSQL on Railway
- Comprehensive municipal event scraping system
- 1,800+ Swiss municipalities within 200km radius
- Progressive discovery and automated event page detection
- Distance-based filtering from Schlieren

## 🚀 DEPLOYMENT

### Vercel (Main App) - zurichactivities.vercel.app
- Next.js 14 with App Router
- Municipal event scrapers (GOViS CMS and others)
- PostgreSQL database via Railway
- Uses yarn for package management

### Database
- PostgreSQL on Railway
- Stores municipalities and their events
- Tracks scraping status and success rates

## 📊 DATABASE SCHEMA

```prisma
model Municipality {
  id                String    @id @default(cuid())
  bfsNumber         Int       @unique // Official Swiss BFS number
  name              String
  nameNorm          String    // Normalized for searching
  canton            String
  district          String?
  websiteUrl        String?
  eventPageUrl      String?
  eventPagePattern  String?   // Pattern that worked
  cmsType           String?   // GOViS, i-web, custom, etc.
  lat               Float
  lon               Float
  distanceFromHome  Float     // Distance from Schlieren in km
  population        Int?
  lastScraped       DateTime?
  lastSuccessful    DateTime?
  scrapeStatus      String    @default("pending")
  scrapeError       String?
  eventCount        Int       @default(0)
  events            Event[]
}

model Event {
  id               String        @id @default(cuid())
  source           String        // Always 'MUNICIPAL'
  sourceEventId    String?
  title            String
  titleNorm        String
  description      String?
  lang             String        @default("de")
  category         String?
  startTime        DateTime
  endTime          DateTime?
  venueName        String?
  street           String?
  postalCode       String?
  city             String?
  country          String        @default("CH")
  lat              Float?
  lon              Float?
  priceMin         Float?
  priceMax         Float?
  currency         String        @default("CHF")
  url              String?
  imageUrl         String?
  uniquenessHash   String        @unique
  municipalityId   String?
  municipality     Municipality?
}
```

## 🔧 ENVIRONMENT VARIABLES

```
DATABASE_URL="postgres://..."        # Railway PostgreSQL
NEXT_PUBLIC_SCHLIEREN_LAT="47.396"
NEXT_PUBLIC_SCHLIEREN_LON="8.447"
SCRAPE_TOKEN="<admin_token>"        # For protected endpoints
```

## 🌐 API ENDPOINTS

### `/api/events` (GET)
Query parameters:
- `from`, `to`: Date range filter
- `lat`, `lon`: Center coordinates (default: Schlieren)
- `radius`: Distance in km (default: 100)
- `category`: Event category filter
- `lang`: Language (de/en, default: de)

### `/api/scrape` (POST/GET)
Triggers municipal event scraping
- `limit`: Number of municipalities to scrape (default: 50)
- `maxDistance`: Maximum distance from Schlieren (default: 100)

### `/api/municipalities` (GET)
Lists all municipalities with statistics
- `maxDistance`: Filter by distance
- `canton`: Filter by canton
- `status`: Filter by scrape status
- `hasWebsite`: Filter by website presence
- `hasEventPage`: Filter by event page presence

### `/api/municipalities/seed` (GET/POST)
Seeds municipality data from Swiss Post API
- GET: `?maxDistance=200` - Seeds municipalities
- POST: `{"action": "findWebsites"}` - Detects municipality websites
- POST: `{"action": "findEventPages"}` - Finds event page URLs

### `/api/scrape/municipal` (GET/POST)
Scrapes events from municipality websites
- GET: Batch scraping with `limit` and `maxDistance`
- POST: Single municipality with `municipalityId` or `bfsNumber`

### `/api/migrate` (GET)
Creates/updates database tables

### `/api/admin/reset` (GET)
Clears all events: `?token=<SCRAPE_TOKEN>&clearCache=1`

## ✨ KEY FEATURES

### Municipality Discovery
- Fetches all Swiss municipalities from Swiss Post API
- Calculates distances from Schlieren
- Stores official BFS numbers and coordinates

### Smart URL Detection
- Automatically finds municipality websites
- Detects event pages using common patterns:
  - `/veranstaltungen`
  - `/agenda`
  - `/events`
  - `/anlaesse`
  - `/kalender`

### CMS-Specific Scrapers
- **GOViS** (450+ municipalities) - Implemented
- **i-web** (200+ municipalities) - Planned
- **Generic scraper** - Fallback for custom sites

### Quality Tracking
- Success/failure rates per municipality
- Event counts
- Error logging
- Last successful scrape timestamp

## 🚀 SETUP WORKFLOW

1. **Run Database Migration**
   ```
   https://zurichactivities.vercel.app/api/migrate?token=YOUR_TOKEN
   ```

2. **Seed Municipalities**
   ```
   https://zurichactivities.vercel.app/api/municipalities/seed?token=YOUR_TOKEN&maxDistance=200
   ```

3. **Find Municipality Websites**
   ```bash
   curl -X POST https://zurichactivities.vercel.app/api/municipalities/seed?token=YOUR_TOKEN \
     -H "Content-Type: application/json" \
     -d '{"action": "findWebsites"}'
   ```

4. **Detect Event Pages**
   ```bash
   curl -X POST https://zurichactivities.vercel.app/api/municipalities/seed?token=YOUR_TOKEN \
     -H "Content-Type: application/json" \
     -d '{"action": "findEventPages"}'
   ```

5. **Start Scraping**
   ```
   https://zurichactivities.vercel.app/api/scrape/municipal?token=YOUR_TOKEN&limit=10&maxDistance=50
   ```

## 📈 PROGRESSIVE ROLLOUT STRATEGY

1. **Phase 1**: Start with municipalities within 50km
2. **Phase 2**: Expand to 100km after validating quality
3. **Phase 3**: Full 200km coverage
4. **Continuous**: Add new CMS scrapers as patterns emerge

## 🐛 TROUBLESHOOTING

### No Events Found
- Check if municipality has `eventPageUrl` set
- Verify the scraper supports the municipality's CMS
- Check `scrapeError` field for details

### Slow Scraping
- Reduce `limit` parameter
- Focus on closer municipalities first
- Check for timeout errors

## 🎯 CURRENT STATUS

- ✅ Municipality database schema
- ✅ Swiss Post API integration  
- ✅ URL pattern detection
- ✅ GOViS CMS scraper
- ✅ API endpoints
- ✅ Distance calculations
- 🔄 i-web CMS scraper (planned)
- 🔄 Generic AI scraper (planned)

The system now provides a unified, comprehensive view of ALL local Swiss events!