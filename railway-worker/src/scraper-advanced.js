const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
require('dotenv').config();

// Initialize Prisma
let prisma;
try {
  prisma = new PrismaClient({
    log: ['error', 'warn']
  });
  console.log('Advanced scraper: Prisma client initialized');
} catch (err) {
  console.error('Failed to initialize Prisma client:', err);
  process.exit(1);
}

// Advanced Alpsabzug-specific terms with improved matching
const ALPSABZUG_TERMS = {
  primary: [
    'alpabzug', 'alpsabzug', 'alpabfahrt', 'alpsabfahrt',
    'viehscheid', 'viehschied', 'désalpe', 'desalpe'
  ],
  secondary: [
    'alpfest', 'älplerfest', 'sennen', 'sennerei',
    'alpaufzug', 'alpauftrieb', 'tierumfahrt',
    'alpweide', 'almabtrieb', 'cattle descent',
    'alpbetrieb', 'alpwirtschaft', 'bergbauern',
    'transhumance', 'inalpe', 'monté à l\'alpage'
  ],
  contextual: [
    'kühe kommen heim', 'cows come home', 'retour des vaches',
    'alpine cattle', 'bergkäse', 'alpkäse', 'herdsmen',
    'decorated cows', 'geschmückte kühe', 'vaches décorées'
  ]
};

// Enhanced data sources with specific scraping strategies
const ADVANCED_SOURCES = [
  {
    name: 'MySwitzerland Events API',
    type: 'api',
    url: 'https://opendata.myswitzerland.io/v1/attractions',
    method: 'api_call',
    params: {
      bbox: '6.0,45.5,11.0,48.0', // Expanded Swiss Alps region
      lang: 'de',
      limit: '500'
    },
    headers: {
      'x-api-key': process.env.ST_API_KEY || 'TaX5CpphzS32bCUNPAfog465D6RtYgO1191X2CZ2'
    }
  },
  {
    name: 'MySwitzerland Alpine Festivals',
    type: 'scrape',
    url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/',
    searchParams: '?rubrik=alpabzuegeaelplerfeste',
    method: 'dynamic_scraping',
    selectors: {
      eventContainer: '.GridTeaser--grid--item, .EventTeaser',
      title: '.GridTeaser--title, .teaser-title, h3, h4',
      description: '.GridTeaser--text, .teaser-description, .description',
      date: '.date, .event-date, .GridTeaser--date',
      location: '.location, .venue, .GridTeaser--location',
      link: 'a[href]',
      image: 'img[src], img[data-src]'
    }
  },
  {
    name: 'Regional Tourism Graubünden',
    type: 'scrape',
    url: 'https://www.graubuenden.ch/de/aktivitaeten-und-erlebnisse/veranstaltungen',
    searchTerm: 'alpabzug',
    method: 'search_and_extract'
  },
  {
    name: 'Switzerland Tourism Official',
    type: 'scrape',
    url: 'https://www.myswitzerland.com/en-us/experiences/events/events-search/',
    searchParams: '?rubrik=alpinefestivals',
    method: 'dynamic_scraping'
  },
  {
    name: 'Appenzell Tourism',
    type: 'scrape',
    url: 'https://appenzellerland.ch/de/erleben/veranstaltungen',
    method: 'content_analysis',
    fallback: true
  },
  {
    name: 'Bernese Oberland Tourism',
    type: 'scrape',
    url: 'https://www.berneroberland.ch/de/veranstaltungen',
    method: 'content_analysis'
  },
  {
    name: 'Valais Tourism',
    type: 'scrape',
    url: 'https://www.valais.ch/de/aktivitaeten/veranstaltungen',
    method: 'content_analysis'
  }
];

// Advanced date parsing for Swiss formats
class SwissDateParser {
  static parseSwissDate(dateText) {
    if (!dateText) return null;
    
    const cleaned = dateText.trim().replace(/\s+/g, ' ');
    const currentYear = new Date().getFullYear();
    
    const patterns = [
      // Standard Swiss formats
      /(?:(\d{1,2})\.(\d{1,2})\.(\d{4}))/,  // DD.MM.YYYY
      /(?:(\d{1,2})\.(\d{1,2})\.(\d{2}))/,   // DD.MM.YY
      /(?:(\d{1,2})\.\s*(\w+)\s+(\d{4}))/,  // DD. Month YYYY
      /(?:(\d{1,2})\.\s*(\w+))/,            // DD. Month (current year)
      
      // Alternative formats
      /(\d{4})-(\d{2})-(\d{2})/,            // YYYY-MM-DD
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,      // DD/MM/YYYY
      
      // German month names
      /(\d{1,2})\.?\s+(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i,
      /(\d{1,2})\.?\s+(Jan|Feb|Mär|Apr|Mai|Jun|Jul|Aug|Sep|Okt|Nov|Dez)\.?\s+(\d{4})/i,
      
      // French month names
      /(\d{1,2})\s+(janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre)\s+(\d{4})/i
    ];
    
    const monthMap = {
      'januar': 1, 'jan': 1, 'janvier': 1,
      'februar': 2, 'feb': 2, 'février': 2,
      'märz': 3, 'mär': 3, 'mars': 3,
      'april': 4, 'apr': 4, 'avril': 4,
      'mai': 5, 'mai': 5,
      'juni': 6, 'jun': 6, 'juin': 6,
      'juli': 7, 'jul': 7, 'juillet': 7,
      'august': 8, 'aug': 8, 'août': 8,
      'september': 9, 'sep': 9, 'septembre': 9,
      'oktober': 10, 'okt': 10, 'octobre': 10,
      'november': 11, 'nov': 11, 'novembre': 11,
      'dezember': 12, 'dez': 12, 'décembre': 12
    };
    
    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        try {
          let day, month, year;
          
          if (match[2] && isNaN(match[2])) {
            // Month name format
            day = parseInt(match[1]);
            month = monthMap[match[2].toLowerCase()] || 1;
            year = match[3] ? parseInt(match[3]) : currentYear;
          } else if (pattern.source.includes('YYYY-MM-DD')) {
            // ISO format
            year = parseInt(match[1]);
            month = parseInt(match[2]);
            day = parseInt(match[3]);
          } else {
            // Standard DD.MM.YYYY format
            day = parseInt(match[1]);
            month = parseInt(match[2]);
            year = match[3] ? parseInt(match[3]) : currentYear;
            
            // Handle 2-digit years
            if (year < 100) {
              year += year < 50 ? 2000 : 1900;
            }
          }
          
          const date = new Date(year, month - 1, day);
          
          // Validate date is reasonable (not too far in past/future)
          const now = new Date();
          const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          const twoYearsFromNow = new Date(now.getTime() + 2 * 365 * 24 * 60 * 60 * 1000);
          
          if (date >= oneYearAgo && date <= twoYearsFromNow) {
            return date;
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    return null;
  }
  
  static extractDateFromText(text) {
    if (!text) return null;
    
    const lines = text.split(/[\n\r]/);
    for (const line of lines) {
      const date = this.parseSwissDate(line);
      if (date) return date;
    }
    
    return null;
  }
}

// Enhanced event classification
class AlpsabzugClassifier {
  static isAlpsabzugEvent(title, description = '', additionalText = '') {
    const combinedText = `${title} ${description} ${additionalText}`.toLowerCase();
    
    // Primary terms - high confidence
    const primaryMatch = ALPSABZUG_TERMS.primary.some(term => 
      combinedText.includes(term.toLowerCase())
    );
    
    if (primaryMatch) return { isAlpsabzug: true, confidence: 0.95 };
    
    // Secondary terms - medium confidence
    const secondaryMatch = ALPSABZUG_TERMS.secondary.some(term => 
      combinedText.includes(term.toLowerCase())
    );
    
    if (secondaryMatch) return { isAlpsabzug: true, confidence: 0.75 };
    
    // Contextual terms - need additional validation
    const contextualMatches = ALPSABZUG_TERMS.contextual.filter(term => 
      combinedText.includes(term.toLowerCase())
    ).length;
    
    if (contextualMatches >= 2) return { isAlpsabzug: true, confidence: 0.60 };
    if (contextualMatches >= 1 && (combinedText.includes('september') || combinedText.includes('oktober'))) {
      return { isAlpsabzug: true, confidence: 0.50 };
    }
    
    return { isAlpsabzug: false, confidence: 0 };
  }
}

// Enhanced geocoding with caching
class GeocodingService {
  static cache = new Map();
  
  static async geocodeAddress(address) {
    if (!address) return null;
    
    // Check cache first
    const cacheKey = address.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    try {
      const email = process.env.NOMINATIM_EMAIL || 'activities@example.com';
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.append('q', address + ', Switzerland');
      url.searchParams.append('format', 'json');
      url.searchParams.append('limit', '1');
      url.searchParams.append('countrycodes', 'ch');
      
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': `SwissActivitiesDashboard/2.0 (${email})`
        }
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();
      const result = data && data[0] ? {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon)
      } : null;
      
      // Cache result
      this.cache.set(cacheKey, result);
      return result;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }
}

// Advanced scraping strategies
class AdvancedScrapingStrategies {
  static async apiCall(source, browser = null) {
    try {
      const url = new URL(source.url);
      
      // Add parameters
      if (source.params) {
        Object.entries(source.params).forEach(([key, value]) => {
          url.searchParams.append(key, value);
        });
      }
      
      console.log(`API call to: ${url.toString()}`);
      
      const response = await fetch(url.toString(), {
        headers: {
          ...source.headers,
          'Accept': 'application/json',
          'User-Agent': 'SwissActivitiesDashboard/2.0'
        }
      });
      
      if (!response.ok) {
        console.error(`API error: ${response.status} ${response.statusText}`);
        return [];
      }
      
      const data = await response.json();
      const items = Array.isArray(data) ? data : (data.data || data.items || []);
      
      console.log(`API response: ${items.length} items found`);
      
      const events = [];
      for (const item of items) {
        const event = await this.transformApiItem(item, source);
        if (event) events.push(event);
      }
      
      return events;
    } catch (error) {
      console.error(`API call failed for ${source.name}:`, error);
      return [];
    }
  }
  
  static async dynamicScraping(source, browser) {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
    const events = [];
    
    try {
      const fullUrl = source.url + (source.searchParams || '');
      console.log(`Dynamic scraping: ${fullUrl}`);
      
      await page.goto(fullUrl, { waitUntil: 'networkidle', timeout: 30000 });
      
      // Wait for content to load
      await page.waitForTimeout(3000);
      
      // Try to handle cookie banners or popups
      await page.evaluate(() => {
        const selectors = [
          '[data-accept]', '.accept-cookies', '.cookie-accept',
          '.modal-close', '.popup-close', '[aria-label*="close"]'
        ];
        
        selectors.forEach(selector => {
          const elements = document.querySelectorAll(selector);
          elements.forEach(el => {
            try { el.click(); } catch (e) {}
          });
        });
      });
      
      await page.waitForTimeout(1000);
      
      // Extract events using selectors
      if (source.selectors) {
        const eventElements = await page.$$(source.selectors.eventContainer);
        console.log(`Found ${eventElements.length} event containers`);
        
        for (const element of eventElements) {
          try {
            const eventData = await this.extractEventData(page, element, source.selectors);
            if (eventData) {
              const classification = AlpsabzugClassifier.isAlpsabzugEvent(
                eventData.title, 
                eventData.description
              );
              
              if (classification.isAlpsabzug && classification.confidence >= 0.5) {
                events.push({
                  ...eventData,
                  source: source.name,
                  confidence: classification.confidence
                });
              }
            }
          } catch (error) {
            console.error('Error extracting event data:', error);
          }
        }
      }
      
      // Fallback: search page content for Alpsabzug terms
      if (events.length === 0) {
        const content = await this.contentAnalysis(source, page);
        events.push(...content);
      }
      
    } catch (error) {
      console.error(`Dynamic scraping failed for ${source.name}:`, error);
    } finally {
      await context.close();
    }
    
    return events;
  }
  
  static async contentAnalysis(source, page) {
    try {
      const pageText = await page.evaluate(() => document.body.innerText);
      const lines = pageText.split('\n').filter(line => line.trim().length > 10);
      
      const events = [];
      const processedTitles = new Set();
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        const classification = AlpsabzugClassifier.isAlpsabzugEvent(line);
        
        if (classification.isAlpsabzug && !processedTitles.has(line)) {
          processedTitles.add(line);
          
          // Look for date in surrounding lines
          let eventDate = null;
          for (let j = Math.max(0, i - 3); j < Math.min(lines.length, i + 4); j++) {
            eventDate = SwissDateParser.parseSwissDate(lines[j]);
            if (eventDate) break;
          }
          
          // Look for location information
          let location = null;
          const locationPattern = /\b([A-Z][a-zäöü]+(?:\s+[A-Z][a-zäöü]+)*)\s*,?\s*(\d{4})?\b/;
          for (let j = Math.max(0, i - 2); j < Math.min(lines.length, i + 3); j++) {
            const match = lines[j].match(locationPattern);
            if (match && match[1] && match[1].length > 2) {
              location = match[0].trim();
              break;
            }
          }
          
          events.push({
            title: line,
            description: `${source.name}: ${line}`,
            startTime: eventDate || this.inferAlpsabzugDate(),
            location: location,
            url: source.url,
            confidence: classification.confidence,
            source: source.name
          });
        }
      }
      
      return events;
    } catch (error) {
      console.error(`Content analysis failed for ${source.name}:`, error);
      return [];
    }
  }
  
  static async extractEventData(page, element, selectors) {
    try {
      const title = await this.getTextFromSelectors(element, selectors.title);
      const description = await this.getTextFromSelectors(element, selectors.description);
      const dateText = await this.getTextFromSelectors(element, selectors.date);
      const locationText = await this.getTextFromSelectors(element, selectors.location);
      const link = await this.getLinkFromSelectors(element, selectors.link);
      const imageUrl = await this.getImageFromSelectors(element, selectors.image);
      
      if (!title) return null;
      
      const startTime = SwissDateParser.parseSwissDate(dateText) || this.inferAlpsabzugDate();
      
      return {
        title: title.trim(),
        description: description?.trim(),
        startTime,
        location: locationText?.trim(),
        url: link,
        imageUrl: imageUrl
      };
    } catch (error) {
      console.error('Error extracting event data:', error);
      return null;
    }
  }
  
  static async getTextFromSelectors(element, selectors) {
    if (!selectors) return null;
    
    const selectorList = Array.isArray(selectors) ? selectors : [selectors];
    
    for (const selector of selectorList) {
      try {
        const subElement = await element.$(selector);
        if (subElement) {
          const text = await subElement.textContent();
          if (text && text.trim()) return text.trim();
        }
      } catch (error) {
        continue;
      }
    }
    
    return null;
  }
  
  static async getLinkFromSelectors(element, selectors) {
    if (!selectors) return null;
    
    try {
      const linkElement = await element.$(selectors);
      if (linkElement) {
        return await linkElement.getAttribute('href');
      }
    } catch (error) {
      // Ignore
    }
    
    return null;
  }
  
  static async getImageFromSelectors(element, selectors) {
    if (!selectors) return null;
    
    try {
      const imgElement = await element.$(selectors);
      if (imgElement) {
        const src = await imgElement.getAttribute('src') || await imgElement.getAttribute('data-src');
        return src;
      }
    } catch (error) {
      // Ignore
    }
    
    return null;
  }
  
  static async transformApiItem(item, source) {
    if (!item) return null;
    
    const title = item.name || item.title;
    const description = item.abstract || item.description || '';
    
    if (!title) return null;
    
    const classification = AlpsabzugClassifier.isAlpsabzugEvent(title, description);
    if (!classification.isAlpsabzug || classification.confidence < 0.5) {
      return null;
    }
    
    let startTime = null;
    if (item.startDate) {
      startTime = new Date(item.startDate);
    } else if (item.validFrom) {
      startTime = new Date(item.validFrom);
    }
    
    if (!startTime) {
      startTime = this.inferAlpsabzugDate();
    }
    
    // Extract location data
    let lat = item.geo?.latitude;
    let lon = item.geo?.longitude;
    let location = null;
    
    if (item.location) {
      location = item.location.name || item.location.address;
      if (!lat && !lon && location) {
        const coords = await GeocodingService.geocodeAddress(location);
        if (coords) {
          lat = coords.lat;
          lon = coords.lon;
        }
      }
    }
    
    return {
      title,
      description,
      startTime,
      endTime: item.endDate ? new Date(item.endDate) : null,
      location,
      lat,
      lon,
      url: item.url || source.url,
      imageUrl: item.image || item.photo,
      confidence: classification.confidence,
      source: source.name
    };
  }
  
  static inferAlpsabzugDate() {
    const now = new Date();
    const year = now.getFullYear();
    
    // Alpsabzug typically happens in September/October
    if (now.getMonth() <= 8) { // Before September
      return new Date(year, 8, 15); // September 15th
    } else if (now.getMonth() >= 11) { // After November
      return new Date(year + 1, 8, 15); // Next year September 15th
    } else {
      return new Date(year, 8, 15); // This year September 15th
    }
  }
}

// Main advanced scraper function
async function runAdvancedAlpsabzugScraper() {
  console.log('Starting Advanced Alpsabzug scraper...');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-web-security']
  });
  
  try {
    const allEvents = [];
    
    for (const source of ADVANCED_SOURCES) {
      try {
        console.log(`\n--- Processing ${source.name} (${source.type}) ---`);
        
        let events = [];
        
        switch (source.method) {
          case 'api_call':
            events = await AdvancedScrapingStrategies.apiCall(source, browser);
            break;
            
          case 'dynamic_scraping':
            events = await AdvancedScrapingStrategies.dynamicScraping(source, browser);
            break;
            
          case 'content_analysis':
            const context = await browser.newContext();
            const page = await context.newPage();
            try {
              await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
              await page.waitForTimeout(2000);
              events = await AdvancedScrapingStrategies.contentAnalysis(source, page);
            } catch (error) {
              console.error(`Content analysis failed for ${source.name}:`, error);
            } finally {
              await context.close();
            }
            break;
        }
        
        console.log(`${source.name}: Found ${events.length} Alpsabzug events`);
        
        // Enhance events with additional processing
        for (const event of events) {
          // Geocode location if needed
          if (event.location && !event.lat && !event.lon) {
            const coords = await GeocodingService.geocodeAddress(event.location);
            if (coords) {
              event.lat = coords.lat;
              event.lon = coords.lon;
            }
          }
          
          // Standardize event data
          event.source = 'ALPSABZUG';
          event.sourceEventId = crypto.createHash('md5')
            .update(`${event.title}-${event.source}-${event.startTime?.getTime() || 0}`)
            .digest('hex');
          event.lang = 'de';
          event.category = 'alpsabzug';
          event.country = 'CH';
        }
        
        allEvents.push(...events);
        
        // Rate limiting between sources
        await new Promise(resolve => setTimeout(resolve, 2000));
        
      } catch (error) {
        console.error(`Failed to process ${source.name}:`, error);
      }
    }
    
    console.log(`\n=== ADVANCED SCRAPER RESULTS ===`);
    console.log(`Total events found: ${allEvents.length}`);
    
    // Deduplication by title and date
    const uniqueEvents = [];
    const seen = new Set();
    
    for (const event of allEvents) {
      const key = `${event.title.toLowerCase().trim()}-${event.startTime?.getTime() || 0}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueEvents.push(event);
      }
    }
    
    console.log(`Unique events after deduplication: ${uniqueEvents.length}`);
    
    // Save to database
    let savedCount = 0;
    for (const event of uniqueEvents) {
      try {
        const uniquenessHash = crypto
          .createHash('sha1')
          .update(JSON.stringify({
            title: event.title.toLowerCase().trim(),
            startTime: Math.round((event.startTime?.getTime() || 0) / 60000),
            lat: event.lat ? Math.round(event.lat * 10000) / 10000 : null,
            lon: event.lon ? Math.round(event.lon * 10000) / 10000 : null
          }))
          .digest('hex');
        
        await prisma.event.upsert({
          where: { uniquenessHash },
          update: {
            description: event.description,
            endTime: event.endTime,
            venueName: event.location,
            city: event.city,
            lat: event.lat,
            lon: event.lon,
            url: event.url,
            imageUrl: event.imageUrl,
            updatedAt: new Date()
          },
          create: {
            source: event.source,
            sourceEventId: event.sourceEventId,
            title: event.title,
            titleNorm: event.title.toLowerCase().trim(),
            description: event.description || `Alpsabzug event from ${event.source}`,
            lang: event.lang,
            category: event.category,
            startTime: event.startTime || new Date(),
            endTime: event.endTime,
            venueName: event.location,
            city: event.city,
            country: event.country,
            lat: event.lat,
            lon: event.lon,
            url: event.url,
            imageUrl: event.imageUrl,
            uniquenessHash
          }
        });
        
        savedCount++;
        console.log(`✓ Saved: ${event.title.substring(0, 60)}...`);
        
      } catch (error) {
        console.error(`Error saving event "${event.title}": ${error.message}`);
      }
    }
    
    console.log(`\n=== SCRAPING COMPLETED ===`);
    console.log(`Events found: ${allEvents.length}`);
    console.log(`Unique events: ${uniqueEvents.length}`);
    console.log(`Events saved: ${savedCount}`);
    
    return {
      eventsFound: allEvents.length,
      uniqueEvents: uniqueEvents.length,
      eventsSaved: savedCount,
      sources: ADVANCED_SOURCES.length
    };
    
  } finally {
    await browser.close();
  }
}

module.exports = { runAdvancedAlpsabzugScraper };

// Run if called directly
if (require.main === module) {
  runAdvancedAlpsabzugScraper()
    .then(result => {
      console.log('Advanced scraping complete:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Advanced scraping failed:', error);
      process.exit(1);
    });
}