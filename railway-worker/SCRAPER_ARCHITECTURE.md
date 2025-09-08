# Advanced Alpsabzug Scraping Architecture

## Overview

This document describes the comprehensive scraping solution designed to dramatically improve the quality and quantity of Swiss Alpsabzug (alpine cattle descent) event data collection. The architecture addresses the original problems of poor data quality and minimal event discovery through multiple complementary scraping strategies.

## Problem Analysis

### Original Issues
- **Poor Data Quality**: Only finding 1 generic event with default dates
- **Limited Coverage**: Simple text-based search missing structured event data
- **No Real Dates**: Events defaulting to September 15th instead of actual dates
- **Missing Details**: No proper locations, descriptions, or contact information
- **Single Source**: Relying only on basic text scraping

### Root Causes
1. Swiss tourism websites use heavy JavaScript rendering
2. Event data is often embedded in JSON-LD structured data
3. Dynamic content loading requires sophisticated Playwright handling
4. Swiss date formats need specialized parsing
5. Alpsabzug events require contextual understanding, not just keyword matching

## Architecture Components

### 1. Advanced Multi-Source Scraper (`scraper-advanced.js`)

**Purpose**: Primary scraper using multiple data sources and extraction strategies

**Key Features**:
- **Multi-Source Support**: 7+ Swiss tourism websites including:
  - MySwitzerland Tourism APIs
  - Regional tourism boards (Graubünden, Valais, Bernese Oberland)
  - Municipal tourism sites
  - Specialized Alpine event sources

- **Intelligent Classification**: Enhanced Alpsabzug detection with:
  - Primary terms (exact matches): `alpabzug`, `désalpe`, `viehscheid`
  - Secondary terms (contextual): `älplerfest`, `sennen`, `cattle descent`
  - Contextual validation using temporal and geographic markers

- **Swiss Date Parser**: Comprehensive date parsing for:
  - Standard Swiss formats: `DD.MM.YYYY`, `DD.MM.YY`
  - German month names: `15. September 2025`
  - French month names: `15 septembre 2025`
  - Alternative formats with validation

- **Enhanced Geocoding**: Swiss-specific geocoding with:
  - Cached results to minimize API calls
  - Swiss address format handling
  - Fallback mechanisms for location resolution

**Data Sources**:
```javascript
const ADVANCED_SOURCES = [
  {
    name: 'MySwitzerland Events API',
    type: 'api',
    url: 'https://opendata.myswitzerland.io/v1/attractions',
    method: 'api_call'
  },
  {
    name: 'MySwitzerland Alpine Festivals',
    type: 'scrape',
    url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/',
    method: 'dynamic_scraping'
  },
  // ... 5 more sources
];
```

### 2. Structured Data Scraper (`structured-data-scraper.js`)

**Purpose**: Extract events from JSON-LD and Microdata embedded in Swiss tourism websites

**Key Features**:
- **JSON-LD Extraction**: Automated detection and parsing of Schema.org Event data
- **Microdata Support**: Fallback extraction from HTML microdata attributes
- **Semantic Analysis**: Enhanced Alpsabzug detection using structured event properties
- **Multi-Site Coverage**: Comprehensive scraping of regional tourism portals

**Structured Data Processing**:
```javascript
class StructuredDataExtractor {
  static async extractJsonLd(page) {
    // Extract all JSON-LD scripts from page
    // Parse and validate event schema
    // Return structured event data
  }
  
  static isAlpsabzugRelated(data) {
    // Multi-level confidence scoring
    // Contextual keyword analysis
    // Temporal validation
  }
}
```

**Data Sources**:
- MySwitzerland regional event pages
- Cantonal tourism websites (Graubünden, Valais, Bern, Appenzell)
- Municipal tourism portals (Zermatt, St. Moritz, Interlaken, Davos)

### 3. Scraping Strategies

#### A. API Integration
- **Switzerland Tourism OpenData API**: Official tourism data with structured responses
- **Rate Limiting**: Respectful 0.5 requests/second with burst handling
- **Authentication**: API key management with fallback mechanisms

#### B. Dynamic Content Scraping
- **Playwright Automation**: Full JavaScript rendering support
- **Cookie Banner Handling**: Automated dismissal of privacy popups
- **Content Waiting**: Smart delays for dynamic content loading
- **Selector Strategies**: Multiple fallback selectors for robustness

#### C. Semantic Content Analysis
- **Context-Aware Extraction**: Understanding Alpsabzug cultural context
- **Temporal Validation**: Events must occur in appropriate seasons
- **Geographic Validation**: Events must be in Swiss Alpine regions

### 4. Data Quality Improvements

#### Enhanced Date Handling
```javascript
class SwissDateParser {
  static parseSwissDate(dateText) {
    // Handle DD.MM.YYYY, DD. Month YYYY formats
    // German and French month names
    // 2-digit year conversion
    // Date validation and range checking
  }
}
```

#### Event Classification
```javascript
class AlpsabzugClassifier {
  static isAlpsabzugEvent(title, description, additionalText) {
    // Multi-tier confidence scoring:
    // - Primary terms: 95% confidence
    // - Secondary + temporal: 75% confidence  
    // - Contextual combinations: 60% confidence
  }
}
```

#### Geocoding Enhancement
```javascript
class GeocodingService {
  static async geocodeAddress(address) {
    // Swiss-specific address formatting
    // Cached results with TTL
    // Rate limiting for external APIs
    // Fallback strategies
  }
}
```

### 5. Integration Architecture

#### Railway Worker Integration
- **Main Entry Point**: `index.js` orchestrates all scrapers
- **Fallback Chain**: Advanced → Structured → Original → Simple
- **Comprehensive Mode**: Runs all scrapers for maximum coverage
- **Scheduling**: Daily cron job with error handling

#### HTTP API Endpoints
```javascript
POST /scrape
Body: { "type": "advanced|structured|comprehensive" }

// Response includes:
{
  "success": true,
  "scraperType": "advanced",
  "eventsFound": 45,
  "uniqueEvents": 38,
  "eventsSaved": 35
}
```

### 6. Performance Optimizations

#### Rate Limiting
- Respectful delays between requests (1-2 seconds)
- Source-specific rate limiting
- Burst protection mechanisms
- User-Agent rotation

#### Caching Strategies
- Geocoding result caching (365 days TTL)
- Duplicate event detection
- Source-specific retry logic
- Database connection pooling

#### Error Handling
- Graceful degradation between scraper types
- Detailed logging with source attribution
- Circuit breaker patterns for failing sources
- Automatic fallback chains

## Expected Improvements

### Data Quality Metrics
- **Before**: 1 generic event with default date
- **After**: 30-50+ specific events with real dates and locations

### Coverage Improvements
- **Geographic**: All major Swiss Alpine regions
- **Temporal**: September-October 2025 with specific dates
- **Detail Level**: Event names, descriptions, locations, prices, images

### Source Diversity
- **APIs**: Official Switzerland Tourism data
- **Regional**: Cantonal tourism websites
- **Municipal**: Local tourism portals
- **Structured Data**: JSON-LD and Microdata extraction

## Usage Instructions

### Running Individual Scrapers
```bash
# Advanced multi-source scraper
node src/scraper-advanced.js

# Structured data scraper
node src/structured-data-scraper.js

# Comprehensive (all scrapers)
curl -X POST http://localhost:3000/scrape -H "Content-Type: application/json" -d '{"type":"comprehensive"}'
```

### Environment Variables
```bash
ST_API_KEY="your_switzerland_tourism_api_key"
DISCOVER_SWISS_API_KEY="your_discover_swiss_api_key"
NOMINATIM_EMAIL="your@email.com"
CRON_SCHEDULE="0 7 * * *"  # Daily at 7 AM
```

### Database Schema
Events are saved with enhanced metadata:
- `source`: 'ALPSABZUG'
- `category`: 'alpsabzug' 
- `confidence`: Scraping confidence score
- `extractionMethod`: 'api_call', 'dynamic_scraping', 'structured_data'

## Monitoring and Maintenance

### Health Checks
- `/health` endpoint for service status
- Detailed logging with structured output
- Error tracking with source attribution
- Performance metrics collection

### Data Validation
- Date range validation (not too far past/future)
- Geographic validation (within Switzerland)
- Event title uniqueness checking
- Confidence score thresholds

### Maintenance Tasks
- Regular API key rotation
- Source website structure monitoring
- Geocoding cache management
- Database cleanup and optimization

## Future Enhancements

### Additional Sources
- Eventbrite Swiss events
- Facebook Events API
- Regional newspaper event listings
- Municipal calendar integrations

### Advanced Features
- Machine learning event classification
- Natural language processing for descriptions
- Image recognition for event validation
- Real-time event monitoring

### Performance Improvements
- Distributed scraping across multiple workers
- Redis caching layer
- Message queue for asynchronous processing
- CDN integration for image handling

## Compliance and Ethics

### Rate Limiting
- Respectful crawling with appropriate delays
- robots.txt compliance checking
- Terms of service adherence
- GDPR compliance for data processing

### Data Usage
- Attribution to original sources
- No commercial resale of scraped data
- Educational and tourism promotion focus
- Regular data freshness validation

---

**Implementation Status**: Complete
**Last Updated**: September 2025
**Maintenance**: Active monitoring and updates