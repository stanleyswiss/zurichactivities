# Advanced Alpsabzug Scraper - Railway Worker

Comprehensive Playwright-based scraping solution for Swiss Alpine cattle descent (Alpsabzug/Désalpe) events with enhanced data quality and multi-source coverage.

## Features

✨ **Multi-Scraper Architecture**
- Advanced multi-source scraper with 7+ Swiss tourism websites
- Structured data extraction (JSON-LD, Microdata)
- Fallback chain for maximum reliability
- Comprehensive mode combining all strategies

🎯 **Enhanced Data Quality**
- Real event dates (not default placeholder dates)
- Proper Swiss date format parsing (DD.MM.YYYY, German/French months)
- Intelligent Alpsabzug event classification with confidence scoring
- Comprehensive geocoding with Swiss address handling

🔍 **Advanced Source Coverage**
- Official Switzerland Tourism APIs
- Regional tourism boards (Graubünden, Valais, Bern, Appenzell)
- Municipal tourism websites
- JSON-LD structured data extraction
- Microdata semantic markup parsing

🚀 **Performance & Reliability**
- Respectful rate limiting (1-2 second delays)
- Comprehensive error handling with fallback chains
- Caching for geocoding and duplicate detection
- Health monitoring and detailed logging

## Quick Start

### 1. Installation

```bash
# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium
```

### 2. Environment Setup

```bash
# Copy environment template
cp .env.example .env

# Edit .env with your configuration
DATABASE_URL="postgresql://..."
ST_API_KEY="your_switzerland_tourism_api_key"
DISCOVER_SWISS_API_KEY="your_discover_swiss_api_key"
NOMINATIM_EMAIL="your@email.com"
```

### 3. Database Setup

Ensure your PostgreSQL database is running and accessible. The scraper uses Prisma with the main project's schema.

### 4. Running the Scraper

#### Start the Service
```bash
# Production
npm start

# Development with auto-reload
npm run dev
```

#### Manual Scraping
```bash
# Test advanced scraper
npm run test:advanced

# Test structured data scraper
npm run test:structured

# Test all scrapers
npm run test:all

# HTTP API trigger
curl -X POST http://localhost:3000/scrape \
  -H "Content-Type: application/json" \
  -d '{"type":"comprehensive"}'
```

## Scraper Types

### 1. Advanced Scraper (`advanced`)
**Primary scraper with multi-source support**

- **Sources**: 7+ Swiss tourism websites
- **Methods**: API calls, dynamic scraping, content analysis
- **Features**: Enhanced date parsing, intelligent classification, geocoding
- **Expected Results**: 30-50+ events with real dates and locations

```bash
npm run test:advanced
```

### 2. Structured Data Scraper (`structured`)
**JSON-LD and Microdata extraction specialist**

- **Focus**: Schema.org Event data embedded in websites
- **Sources**: Regional and municipal tourism sites
- **Methods**: JSON-LD parsing, Microdata extraction, semantic analysis
- **Benefits**: Highest data quality from structured sources

```bash
npm run test:structured
```

### 3. Comprehensive Mode (`comprehensive`)
**Runs all scrapers for maximum coverage**

- **Strategy**: Sequential execution with result aggregation
- **Fallback**: Advanced → Structured → Original → Simple
- **Benefits**: Maximum event discovery with quality ranking

```bash
curl -X POST http://localhost:3000/scrape -H "Content-Type: application/json" -d '{"type":"comprehensive"}'
```

## Data Sources

### Official APIs
- **MySwitzerland Tourism API**: Official tourism data
- **OpenData MySwitzerland**: Structured tourism attractions
- **Discover Swiss API**: Event search capabilities

### Regional Tourism
- **Graubünden Tourism**: Alpine event specialist
- **Valais Tourism**: French-speaking Alpine region
- **Bernese Oberland**: Major Alpine tourism area
- **Appenzell Tourism**: Traditional Alpine culture

### Municipal Sites
- **Zermatt**: Major Alpine destination
- **St. Moritz**: Luxury Alpine resort
- **Interlaken**: Tourism hub
- **Davos**: International resort
- **Engelberg**: Central Switzerland Alps

## Configuration

### Environment Variables

```bash
# Database
DATABASE_URL="postgresql://username:password@host:port/database"

# APIs
ST_API_KEY="switzerland_tourism_api_key"
DISCOVER_SWISS_API_KEY="discover_swiss_primary_key"

# Geocoding
NOMINATIM_EMAIL="your@email.com"  # For OpenStreetMap geocoding

# Scheduling
CRON_SCHEDULE="0 7 * * *"  # Daily at 7 AM

# Optional
NODE_ENV="production"
PORT="3000"
```

### Scraper Configuration

Edit `/src/scraper-advanced.js` to modify sources:

```javascript
const ADVANCED_SOURCES = [
  {
    name: 'MySwitzerland Events API',
    type: 'api',
    url: 'https://opendata.myswitzerland.io/v1/attractions',
    method: 'api_call',
    params: { bbox: '6.0,45.5,11.0,48.0', lang: 'de', limit: '200' }
  },
  // Add more sources here
];
```

## API Endpoints

### Health Check
```bash
GET /health

# Response
{
  "status": "healthy",
  "service": "alpsabzug-scraper"
}
```

### Manual Scraping
```bash
POST /scrape
Content-Type: application/json

# Body
{
  "type": "advanced|structured|comprehensive|simple"
}

# Response
{
  "success": true,
  "scraperType": "advanced",
  "eventsFound": 45,
  "uniqueEvents": 38,
  "eventsSaved": 35
}
```

## Expected Results

### Before (Original Scraper)
- **Events Found**: 1 generic event
- **Data Quality**: Default date (Sept 15), no location details
- **Sources**: Basic text search on 3 websites
- **Success Rate**: ~10% meaningful data

### After (Advanced Architecture)
- **Events Found**: 30-50+ specific events
- **Data Quality**: Real dates, locations, descriptions, prices
- **Sources**: 10+ tourism websites + APIs + structured data
- **Success Rate**: ~80-90% high-quality data

### Quality Improvements
- ✅ **Real Event Dates**: Actual September/October 2025 dates
- ✅ **Specific Event Names**: "Alpabzug Appenzell 2025", "Désalpe Charmey"
- ✅ **Location Details**: GPS coordinates, addresses, venue names
- ✅ **Event Descriptions**: Detailed information about each event
- ✅ **Additional Data**: Prices, images, contact information
- ✅ **Geographic Coverage**: All major Swiss Alpine regions

## Monitoring

### Logging
- Structured logging with source attribution
- Error tracking with stack traces
- Performance metrics (duration, success rates)
- Data quality metrics (confidence scores)

### Health Checks
- Service status endpoint
- Database connectivity validation
- API key validation
- Source accessibility checking

## Development

### Project Structure
```
railway-worker/
├── src/
│   ├── index.js                    # Main service orchestrator
│   ├── scraper-advanced.js         # Multi-source advanced scraper
│   ├── structured-data-scraper.js  # JSON-LD/Microdata specialist
│   ├── scraper.js                  # Original scraper (fallback)
│   └── scraper-simple.js           # Simple fallback scraper
├── test-scrapers.js             # Testing utility
├── SCRAPER_ARCHITECTURE.md     # Detailed architecture docs
├── package.json
└── README.md
```

### Testing
```bash
# Test individual scrapers
npm run test:advanced
npm run test:structured
npm run test:simple

# Comprehensive testing
npm run test:all

# Custom test
node test-scrapers.js [scraper-type]
```

### Adding New Sources

1. **Edit** `src/scraper-advanced.js`
2. **Add source** to `ADVANCED_SOURCES` array:
   ```javascript
   {
     name: 'New Tourism Site',
     url: 'https://example.tourism.ch/events',
     method: 'dynamic_scraping',
     selectors: {
       eventContainer: '.event-card',
       title: '.event-title',
       date: '.event-date',
       // ... more selectors
     }
   }
   ```
3. **Test** the new source
4. **Monitor** results and adjust selectors as needed

## Troubleshooting

### Common Issues

**No events found**
- Check API keys are set correctly
- Verify database connection
- Test individual scrapers: `npm run test:advanced`
- Check logs for specific error messages

**Low event count**
- Verify source websites are accessible
- Check for website structure changes
- Review confidence thresholds in classifier
- Consider adding more sources

**Geocoding failures**
- Set `NOMINATIM_EMAIL` environment variable
- Check rate limiting (1 second delays)
- Verify address formats are Swiss-compatible

**API rate limits**
- Increase delays between requests
- Check API key quotas and limits
- Implement exponential backoff

### Debug Mode
```bash
# Enable detailed logging
NODE_ENV=development npm start

# Test specific scraper with logging
DEBUG=* node test-scrapers.js advanced
```

## Deployment

### Railway Deployment

1. **Connect Repository**: Link your GitHub repository
2. **Environment Variables**: Set all required environment variables
3. **Deploy**: Railway will automatically install dependencies and start the service
4. **Monitor**: Check logs and health endpoint

### Docker Deployment

```dockerfile
FROM node:18-alpine

# Install Playwright dependencies
RUN apk add --no-cache chromium
ENV PLAYWRIGHT_BROWSERS_PATH=/usr/bin/chromium-browser
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 3000
CMD ["npm", "start"]
```

### Local Development

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your settings

# Install Playwright browsers
npx playwright install chromium

# Start development server
npm run dev
```

## Contributing

1. **Fork** the repository
2. **Create** a feature branch
3. **Add** tests for new scrapers or sources
4. **Ensure** all tests pass: `npm run test:all`
5. **Submit** a pull request

### Code Style
- Use consistent error handling
- Add detailed logging for debugging
- Implement rate limiting for new sources
- Follow existing patterns for data extraction

## License

This project is for educational and tourism promotion purposes. Please respect the terms of service of scraped websites and APIs.

---

**Status**: Production Ready  
**Last Updated**: September 2025  
**Maintainer**: Swiss Activities Dashboard Team