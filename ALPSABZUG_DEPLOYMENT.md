# Alpsabzug Scraper - Vercel + Railway Deployment Guide

## Overview

The Playwright-based Alpsabzug scraper is optimized for Vercel's serverless environment with Railway PostgreSQL database integration. It scrapes authentic Swiss Alpine cattle descent events from official tourism websites.

## Architecture

- **Primary Deployment**: Vercel serverless functions (10-second timeout)
- **Database**: Railway PostgreSQL with connection pooling
- **Browser Automation**: Playwright Chromium with serverless optimizations
- **Rate Limiting**: Respects robots.txt and implements 1-2 second delays
- **Error Handling**: Circuit breakers and graceful degradation

## Target Sources

1. **Graubünden Tourism** - `graubuenden.ch/de/veranstaltungen`
2. **Valais Tourism** - `valais.ch/de/aktivitaeten/veranstaltungen`
3. **Appenzell Tourism** - `appenzell.ch/de/erleben/veranstaltungen`
4. **Uri Tourism** - `uri.swiss/de/erleben/veranstaltungen`
5. **Schwyz Tourism** - `schwyz-tourismus.ch/de/veranstaltungen`

## Vercel Configuration

### Environment Variables

```bash
# Database
DATABASE_URL="postgres://..." # Railway connection string
DATABASE_PUBLIC_URL="postgres://..." # Railway public URL for connection pooling

# Scraping
SOURCES_ENABLED="LIMMATTAL,ALPSABZUG,ST"
SCRAPE_TOKEN="your_secure_admin_token"

# Geocoding
NOMINATIM_EMAIL="your_email@example.com"
GEOCODE_CACHE_TTL_DAYS="365"

# Discover Swiss API (Optional - paid subscription required for events)
DISCOVER_SWISS_API_KEY="37747c97733b44d68e44ff0f0189e08b"
DISCOVER_SWISS_PROJECT="dsod-content"
USE_DISCOVER_SWISS_API="false" # Set to "true" only if you have a paid subscription with event access
```

### Function Configuration

```json
// vercel.json
{
  "functions": {
    "src/app/api/scrape/route.ts": {
      "maxDuration": 10
    }
  },
  "crons": [
    {
      "path": "/api/scrape",
      "schedule": "0 6 * * *"
    }
  ]
}
```

## Playwright Serverless Optimizations

### Browser Launch Arguments
- `--no-sandbox` - Required for serverless environments
- `--disable-dev-shm-usage` - Reduces memory usage
- `--disable-gpu` - Serverless environments don't have GPU
- `--max_old_space_size=256` - Memory limit for Vercel

### Resource Blocking
- Images, fonts, media, and stylesheets are blocked
- Only HTML and JavaScript are loaded for faster scraping

### Timeouts
- Overall scraper timeout: 8 seconds (2s buffer for Vercel's 10s limit)
- Individual source timeout: 2 seconds per website
- Page navigation timeout: 2 seconds

## Data Extraction Strategy

### Primary: Discover Swiss API (Paid Tier)
```javascript
// Uses official Swiss tourism API for comprehensive event data
https://api.discover.swiss/info/v2/events?project={project}&resultsPerPage=100
```

**Advantages:**
- Structured, reliable data format
- Comprehensive coverage of Swiss events
- Real-time updates from official sources
- Faster processing (no browser automation needed)

**Requirements:**
- Paid Discover Swiss subscription with event access
- `USE_DISCOVER_SWISS_API="true"` environment variable

### Secondary: JSON-LD Structured Data
```javascript
// Searches for schema.org Event markup on tourism websites
script[type="application/ld+json"]
```

### Fallback: Semantic HTML
```javascript
// Site-specific selectors for each tourism website
{
  events: '.event-item, .veranstaltung, [data-event]',
  title: 'h3, .title, .event-title',
  date: '.date, .datum, time, [datetime]',
  location: '.location, .ort, .venue',
  description: '.description, .text, p'
}
```

## Event Filtering

### Alpsabzug Keywords
- `alpabzug`, `alpsabzug`, `alpabfahrt`
- `viehscheid`, `désalpe`, `desalpe`
- `älplerfest`, `sennen`, `sennerei`
- `alpaufzug`, `alpauftrieb`, `almabtrieb`

### Content Filtering
- Excludes political/administrative events
- Validates date ranges (past year to next year)
- Requires minimum title length and valid dates

## Database Integration

### Event Model
```prisma
model Event {
  id               String   @id @default(cuid())
  source           String   // 'ALPSABZUG'
  sourceEventId    String?
  title            String
  titleNorm        String   // normalized for dedup
  description      String?
  lang             String   @default("de")
  category         String?  // 'alpsabzug'
  startTime        DateTime
  endTime          DateTime?
  venueName        String?
  city             String?
  country          String   @default("CH")
  lat              Float?
  lon              Float?
  url              String?
  imageUrl         String?
  uniquenessHash   String   @unique
  // ... other fields
}
```

### Deduplication
- SHA1 hash based on title, start time, and coordinates
- Prevents duplicate events across sources
- Handles updates with force parameter

## Deployment Steps

### 1. Vercel Deployment
```bash
# Deploy to Vercel
vercel --prod

# Set environment variables
vercel env add DATABASE_URL
vercel env add DATABASE_PUBLIC_URL
vercel env add SOURCES_ENABLED
vercel env add SCRAPE_TOKEN
vercel env add NOMINATIM_EMAIL
```

### 2. Railway Database Setup
```bash
# Connect to Railway PostgreSQL
railway login
railway link
railway run npx prisma db push
```

### 3. Testing
```bash
# Test scraper endpoint (requires SCRAPE_TOKEN)
curl -X POST https://your-app.vercel.app/api/scrape \
  -H "Authorization: Bearer YOUR_SCRAPE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sources": ["ALPSABZUG"], "force": false}'
```

## Monitoring and Debugging

### Logs
- Vercel Function Logs: Monitor timeout and memory usage
- Railway Logs: Database connection and performance
- Console Output: Scraper progress and error details

### Performance Metrics
- Events found per source
- Processing time per website
- Database save success rate
- Memory usage and timeout incidents

### Common Issues

1. **Timeout Errors**
   - Solution: Reduce number of target sources or implement pagination
   - Monitor: Function execution time vs 10s limit

2. **Memory Limits**
   - Solution: Close browser contexts properly, reduce concurrent operations
   - Monitor: Memory usage in Vercel dashboard

3. **Database Connection Limits**
   - Solution: Use Railway's connection pooling URL
   - Monitor: Database connection count in Railway dashboard

4. **Rate Limiting**
   - Solution: Respect robots.txt, implement exponential backoff
   - Monitor: 429 responses from target websites

## Scaling Options

### Option 1: Railway Workers (for longer scraping)
- Deploy full scraper to Railway with longer timeout limits
- Use Railway Cron to trigger scraping
- Vercel serves API and UI only

### Option 2: Background Jobs
- Implement queue system with Railway workers
- Vercel triggers jobs, Railway processes them
- Results stored in shared PostgreSQL database

### Option 3: Multiple Vercel Functions
- Split scraping across multiple functions by region
- Each function handles 1-2 tourism websites
- Parallel execution with coordination

## Maintenance

### Weekly Tasks
- Monitor scraper success rates
- Check for changes in target website structure
- Update selectors if extraction fails
- Review and clean duplicate events

### Monthly Tasks
- Analyze event quality and coverage
- Update Alpsabzug keyword list based on findings
- Performance optimization based on metrics
- Security review of scraping practices

## Security Considerations

### Respectful Scraping
- Always check robots.txt before scraping
- Implement delays between requests (1-2 seconds minimum)
- Use descriptive User-Agent string with contact information
- Monitor for rate limiting and back off appropriately

### Data Privacy
- Only scrape publicly available event information
- Store minimal personal data (avoid contact details)
- Implement data retention policies
- Regular cleanup of old events

### Access Control
- Secure scrape API with SCRAPE_TOKEN
- Limit public access to scraping endpoints
- Monitor for unauthorized usage
- Implement IP-based rate limiting if needed