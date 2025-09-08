const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
require('dotenv').config();

// Initialize Prisma
const prisma = new PrismaClient({
  log: ['error', 'warn']
});

// Structured data sources with JSON-LD extraction capabilities
const STRUCTURED_DATA_SOURCES = [
  {
    name: 'MySwitzerland Events',
    url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/',
    searchUrls: [
      'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/?rubrik=alpabzuegeaelplerfeste',
      'https://www.myswitzerland.com/en-us/experiences/events/events-search/?rubrik=alpinefestivals'
    ],
    structuredDataTypes: ['Event', 'Festival'],
    priority: 'high'
  },
  {
    name: 'Swiss Tourism Regional',
    baseUrls: [
      'https://www.graubuenden.ch',
      'https://www.valais.ch',
      'https://www.berneroberland.ch',
      'https://appenzellerland.ch'
    ],
    searchPaths: ['/veranstaltungen', '/events', '/erleben/veranstaltungen'],
    structuredDataTypes: ['Event', 'Organization'],
    priority: 'medium'
  },
  {
    name: 'Municipal Tourism Sites',
    urls: [
      'https://www.zermatt.ch/de/veranstaltungen',
      'https://www.stmoritz.ch/de/events',
      'https://www.interlaken.ch/de/veranstaltungen',
      'https://www.davos.ch/sommer/veranstaltungen/',
      'https://www.engelberg.ch/de/sommer/events/'
    ],
    structuredDataTypes: ['Event', 'TouristAttraction'],
    priority: 'medium'
  }
];

// Alpsabzug-specific terms for enhanced matching
const ALPSABZUG_KEYWORDS = {
  exact: [
    'alpabzug', 'alpsabzug', 'désalpe', 'desalpe',
    'viehscheid', 'alpabfahrt', 'alpsabfahrt'
  ],
  contextual: [
    'cattle descent', 'cow parade', 'alpine cattle',
    'transhumance', 'bergbauern', 'alpwirtschaft',
    'decorated cows', 'geschmückte kühe', 'vaches décorées',
    'sennen', 'älplerfest', 'alpfest', 'sennerei'
  ],
  temporal: [
    'september', 'oktober', 'october', 'septembre', 'octobre',
    'herbst', 'autumn', 'automne'
  ]
};

/**
 * Extract and parse JSON-LD structured data from a page
 */
class StructuredDataExtractor {
  static async extractJsonLd(page) {
    try {
      const jsonLdData = await page.evaluate(() => {
        const scripts = Array.from(document.querySelectorAll('script[type="application/ld+json"]'));
        return scripts.map(script => {
          try {
            return JSON.parse(script.textContent);
          } catch (e) {
            return null;
          }
        }).filter(data => data !== null);
      });
      
      return jsonLdData.flat(); // Flatten arrays
    } catch (error) {
      console.error('Error extracting JSON-LD:', error);
      return [];
    }
  }
  
  static async extractMicrodata(page) {
    try {
      const microdataItems = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('[itemscope]'));
        return items.map(item => {
          const type = item.getAttribute('itemtype');
          if (!type) return null;
          
          const props = {};
          const propElements = item.querySelectorAll('[itemprop]');
          
          propElements.forEach(el => {
            const propName = el.getAttribute('itemprop');
            const propValue = el.getAttribute('content') || 
                             el.getAttribute('href') || 
                             el.getAttribute('src') || 
                             el.textContent?.trim();
            
            if (propName && propValue) {
              props[propName] = propValue;
            }
          });
          
          return {
            '@type': type.split('/').pop(), // Get the last part of schema URL
            ...props
          };
        }).filter(item => item !== null);
      });
      
      return microdataItems;
    } catch (error) {
      console.error('Error extracting Microdata:', error);
      return [];
    }
  }
  
  static isEventData(data) {
    if (!data || !data['@type']) return false;
    
    const type = Array.isArray(data['@type']) ? data['@type'] : [data['@type']];
    return type.some(t => 
      t.includes('Event') || 
      t.includes('Festival') || 
      t.includes('SocialEvent') ||
      t.includes('MusicEvent') ||
      t.includes('SportsEvent')
    );
  }
  
  static isAlpsabzugRelated(data) {
    if (!data) return { isAlpsabzug: false, confidence: 0 };
    
    const searchText = [
      data.name,
      data.description,
      data.alternateName,
      data.summary,
      Array.isArray(data.keywords) ? data.keywords.join(' ') : data.keywords
    ].filter(Boolean).join(' ').toLowerCase();
    
    // Exact matches - high confidence
    const exactMatches = ALPSABZUG_KEYWORDS.exact.filter(keyword => 
      searchText.includes(keyword.toLowerCase())
    ).length;
    
    if (exactMatches > 0) {
      return { isAlpsabzug: true, confidence: 0.95 };
    }
    
    // Contextual matches - medium confidence
    const contextualMatches = ALPSABZUG_KEYWORDS.contextual.filter(keyword => 
      searchText.includes(keyword.toLowerCase())
    ).length;
    
    const temporalMatches = ALPSABZUG_KEYWORDS.temporal.filter(keyword => 
      searchText.includes(keyword.toLowerCase())
    ).length;
    
    if (contextualMatches >= 2 && temporalMatches >= 1) {
      return { isAlpsabzug: true, confidence: 0.80 };
    }
    
    if (contextualMatches >= 3) {
      return { isAlpsabzug: true, confidence: 0.70 };
    }
    
    if (contextualMatches >= 1 && temporalMatches >= 1) {
      return { isAlpsabzug: true, confidence: 0.60 };
    }
    
    return { isAlpsabzug: false, confidence: 0 };
  }
  
  static parseStructuredEvent(data) {
    if (!data) return null;
    
    const name = data.name || data.title;
    if (!name) return null;
    
    // Parse dates
    let startDate = null;
    let endDate = null;
    
    if (data.startDate) {
      startDate = new Date(data.startDate);
    }
    
    if (data.endDate) {
      endDate = new Date(data.endDate);
    }
    
    // Parse location
    let location = null;
    let address = null;
    let lat = null;
    let lon = null;
    
    if (data.location) {
      if (typeof data.location === 'string') {
        location = data.location;
      } else if (data.location.name) {
        location = data.location.name;
        
        if (data.location.address) {
          if (typeof data.location.address === 'string') {
            address = data.location.address;
          } else {
            address = [
              data.location.address.streetAddress,
              data.location.address.postalCode,
              data.location.address.addressLocality
            ].filter(Boolean).join(', ');
          }
        }
        
        if (data.location.geo) {
          lat = parseFloat(data.location.geo.latitude);
          lon = parseFloat(data.location.geo.longitude);
        }
      }
    }
    
    // Parse price information
    let priceMin = null;
    let priceMax = null;
    let currency = 'CHF';
    
    if (data.offers) {
      const offers = Array.isArray(data.offers) ? data.offers : [data.offers];
      const prices = offers.map(offer => {
        const price = parseFloat(offer.price || offer.lowPrice || offer.highPrice);
        return isNaN(price) ? null : price;
      }).filter(p => p !== null);
      
      if (prices.length > 0) {
        priceMin = Math.min(...prices);
        priceMax = Math.max(...prices);
      }
      
      // Get currency
      const firstOffer = offers[0];
      if (firstOffer && firstOffer.priceCurrency) {
        currency = firstOffer.priceCurrency;
      }
    }
    
    return {
      name,
      description: data.description || data.summary,
      startDate,
      endDate,
      location,
      address,
      lat,
      lon,
      priceMin,
      priceMax,
      currency,
      url: data.url,
      image: data.image?.url || (Array.isArray(data.image) ? data.image[0]?.url : data.image),
      organizer: data.organizer?.name,
      eventType: data['@type'],
      keywords: Array.isArray(data.keywords) ? data.keywords.join(', ') : data.keywords
    };
  }
}

/**
 * Enhanced geocoding with Swiss address handling
 */
class SwissGeocodingService {
  static cache = new Map();
  
  static async geocodeAddress(address) {
    if (!address) return null;
    
    const cacheKey = address.toLowerCase().trim();
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    try {
      // First try with Swiss-specific search
      let searchQuery = address;
      if (!address.toLowerCase().includes('switzerland') && !address.toLowerCase().includes('schweiz')) {
        searchQuery += ', Switzerland';
      }
      
      const email = process.env.NOMINATIM_EMAIL || 'activities@example.com';
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.append('q', searchQuery);
      url.searchParams.append('format', 'json');
      url.searchParams.append('limit', '10');
      url.searchParams.append('countrycodes', 'ch');
      url.searchParams.append('addressdetails', '1');
      
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': `SwissActivitiesDashboard/2.0 (${email})`
        }
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();
      
      // Find best match (prefer cities/towns over generic locations)
      const bestMatch = data.find(item => 
        item.type === 'city' || 
        item.type === 'town' || 
        item.type === 'village' ||
        item.class === 'place'
      ) || data[0];
      
      const result = bestMatch ? {
        lat: parseFloat(bestMatch.lat),
        lon: parseFloat(bestMatch.lon),
        displayName: bestMatch.display_name
      } : null;
      
      // Cache result
      this.cache.set(cacheKey, result);
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return result;
    } catch (error) {
      console.error('Geocoding error:', error);
      return null;
    }
  }
}

/**
 * Main structured data scraper
 */
async function runStructuredDataScraper() {
  console.log('Starting Structured Data Alpsabzug Scraper...');
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-web-security',
      '--disable-features=VizDisplayCompositor'
    ]
  });
  
  const allEvents = [];
  let totalPagesScraped = 0;
  
  try {
    for (const source of STRUCTURED_DATA_SOURCES) {
      console.log(`\n=== Processing ${source.name} ===`);
      
      let urlsToScrape = [];
      
      // Collect all URLs to scrape
      if (source.searchUrls) {
        urlsToScrape.push(...source.searchUrls);
      }
      
      if (source.baseUrls && source.searchPaths) {
        for (const baseUrl of source.baseUrls) {
          for (const path of source.searchPaths) {
            urlsToScrape.push(baseUrl + path);
          }
        }
      }
      
      if (source.urls) {
        urlsToScrape.push(...source.urls);
      }
      
      // Scrape each URL
      for (const url of urlsToScrape) {
        try {
          console.log(`Scraping: ${url}`);
          
          const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
          });
          
          const page = await context.newPage();
          
          try {
            await page.goto(url, { 
              waitUntil: 'networkidle', 
              timeout: 30000 
            });
            
            // Wait for dynamic content
            await page.waitForTimeout(3000);
            
            // Extract JSON-LD structured data
            const jsonLdData = await StructuredDataExtractor.extractJsonLd(page);
            console.log(`Found ${jsonLdData.length} JSON-LD items`);
            
            // Extract Microdata
            const microdataItems = await StructuredDataExtractor.extractMicrodata(page);
            console.log(`Found ${microdataItems.length} Microdata items`);
            
            // Combine all structured data
            const allStructuredData = [...jsonLdData, ...microdataItems];
            
            // Process structured data for events
            for (const item of allStructuredData) {
              if (StructuredDataExtractor.isEventData(item)) {
                const alpsabzugCheck = StructuredDataExtractor.isAlpsabzugRelated(item);
                
                if (alpsabzugCheck.isAlpsabzug && alpsabzugCheck.confidence >= 0.5) {
                  const parsedEvent = StructuredDataExtractor.parseStructuredEvent(item);
                  
                  if (parsedEvent && parsedEvent.name) {
                    // Geocode if needed
                    if (!parsedEvent.lat && !parsedEvent.lon && parsedEvent.address) {
                      const coords = await SwissGeocodingService.geocodeAddress(parsedEvent.address);
                      if (coords) {
                        parsedEvent.lat = coords.lat;
                        parsedEvent.lon = coords.lon;
                      }
                    }
                    
                    allEvents.push({
                      ...parsedEvent,
                      confidence: alpsabzugCheck.confidence,
                      sourceName: source.name,
                      sourceUrl: url,
                      extractionMethod: 'structured_data'
                    });
                    
                    console.log(`✓ Found Alpsabzug event: ${parsedEvent.name.substring(0, 60)}...`);
                  }
                }
              }
            }
            
            // If no structured data found, try semantic extraction
            if (allStructuredData.length === 0) {
              console.log('No structured data found, trying semantic extraction...');
              const semanticEvents = await extractSemanticEvents(page, source, url);
              allEvents.push(...semanticEvents);
            }
            
            totalPagesScraped++;
            
          } catch (error) {
            console.error(`Error scraping ${url}:`, error.message);
          } finally {
            await context.close();
          }
          
          // Rate limiting between requests
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (error) {
          console.error(`Failed to process ${url}:`, error.message);
        }
      }
      
      // Delay between sources
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    console.log(`\n=== STRUCTURED DATA SCRAPER RESULTS ===`);
    console.log(`Pages scraped: ${totalPagesScraped}`);
    console.log(`Total events found: ${allEvents.length}`);
    
    // Remove duplicates
    const uniqueEvents = removeDuplicateEvents(allEvents);
    console.log(`Unique events: ${uniqueEvents.length}`);
    
    // Save to database
    let savedCount = 0;
    for (const event of uniqueEvents) {
      try {
        const dbEvent = await saveEventToDatabase(event);
        if (dbEvent) {
          savedCount++;
          console.log(`✓ Saved: ${event.name.substring(0, 50)}...`);
        }
      } catch (error) {
        console.error(`Error saving event: ${error.message}`);
      }
    }
    
    console.log(`\nEvents saved to database: ${savedCount}`);
    
    return {
      pagesScraped: totalPagesScraped,
      eventsFound: allEvents.length,
      uniqueEvents: uniqueEvents.length,
      eventsSaved: savedCount
    };
    
  } finally {
    await browser.close();
  }
}

/**
 * Semantic event extraction fallback
 */
async function extractSemanticEvents(page, source, url) {
  try {
    const events = [];
    
    // Look for event-like containers
    const eventContainers = await page.$$(
      '.event, .veranstaltung, [class*="event"], [class*="veranstaltung"], ' +
      '.card, .teaser, [itemscope], article'
    );
    
    for (const container of eventContainers) {
      try {
        const text = await container.textContent();
        if (!text) continue;
        
        // Check if text contains Alpsabzug terms
        const lowerText = text.toLowerCase();
        const isAlpsabzug = ALPSABZUG_KEYWORDS.exact.some(term => 
          lowerText.includes(term.toLowerCase())
        ) || (
          ALPSABZUG_KEYWORDS.contextual.some(term => lowerText.includes(term.toLowerCase())) &&
          ALPSABZUG_KEYWORDS.temporal.some(term => lowerText.includes(term.toLowerCase()))
        );
        
        if (isAlpsabzug) {
          // Extract title
          const titleElement = await container.$('h1, h2, h3, h4, h5, .title, .headline') || container;
          const title = await titleElement.textContent();
          
          // Extract date
          const dateMatch = text.match(/(\d{1,2}[\.\/-]\d{1,2}[\.\/-]\d{2,4})/);
          let eventDate = null;
          if (dateMatch) {
            eventDate = new Date(dateMatch[1].replace(/[\.\/-]/g, '/'));
            if (isNaN(eventDate.getTime())) {
              eventDate = inferAlpsabzugDate();
            }
          } else {
            eventDate = inferAlpsabzugDate();
          }
          
          events.push({
            name: title?.trim() || text.substring(0, 100).trim(),
            description: text.substring(0, 300).trim(),
            startDate: eventDate,
            sourceName: source.name,
            sourceUrl: url,
            extractionMethod: 'semantic',
            confidence: 0.6
          });
        }
      } catch (error) {
        // Skip this container
        continue;
      }
    }
    
    return events;
  } catch (error) {
    console.error('Semantic extraction error:', error);
    return [];
  }
}

/**
 * Remove duplicate events based on title and date
 */
function removeDuplicateEvents(events) {
  const unique = [];
  const seen = new Set();
  
  for (const event of events) {
    const key = `${event.name?.toLowerCase().trim()}-${event.startDate?.getTime() || 0}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(event);
    }
  }
  
  return unique;
}

/**
 * Save event to database
 */
async function saveEventToDatabase(event) {
  if (!event.name) return null;
  
  try {
    const uniquenessHash = crypto
      .createHash('sha1')
      .update(JSON.stringify({
        title: event.name.toLowerCase().trim(),
        startTime: Math.round((event.startDate?.getTime() || 0) / 60000),
        lat: event.lat ? Math.round(event.lat * 10000) / 10000 : null,
        lon: event.lon ? Math.round(event.lon * 10000) / 10000 : null
      }))
      .digest('hex');
    
    const dbEvent = await prisma.event.upsert({
      where: { uniquenessHash },
      update: {
        description: event.description,
        endTime: event.endDate,
        venueName: event.location,
        street: event.address,
        city: event.location,
        lat: event.lat,
        lon: event.lon,
        priceMin: event.priceMin,
        priceMax: event.priceMax,
        currency: event.currency || 'CHF',
        url: event.url || event.sourceUrl,
        imageUrl: event.image,
        updatedAt: new Date()
      },
      create: {
        source: 'ALPSABZUG',
        sourceEventId: `structured-${crypto.createHash('md5').update(event.name + (event.sourceUrl || '')).digest('hex')}`,
        title: event.name,
        titleNorm: event.name.toLowerCase().trim(),
        description: event.description || `Structured data event from ${event.sourceName}`,
        lang: 'de',
        category: 'alpsabzug',
        startTime: event.startDate || inferAlpsabzugDate(),
        endTime: event.endDate,
        venueName: event.location,
        street: event.address,
        city: event.location,
        country: 'CH',
        lat: event.lat,
        lon: event.lon,
        priceMin: event.priceMin,
        priceMax: event.priceMax,
        currency: event.currency || 'CHF',
        url: event.url || event.sourceUrl,
        imageUrl: event.image,
        uniquenessHash
      }
    });
    
    return dbEvent;
  } catch (error) {
    console.error('Database save error:', error);
    return null;
  }
}

/**
 * Infer Alpsabzug date based on current time
 */
function inferAlpsabzugDate() {
  const now = new Date();
  const year = now.getFullYear();
  
  if (now.getMonth() <= 8) { // Before September
    return new Date(year, 8, 15); // September 15th this year
  } else if (now.getMonth() >= 11) { // After November
    return new Date(year + 1, 8, 15); // September 15th next year
  } else {
    return new Date(year, 8, 15); // September 15th this year
  }
}

module.exports = { runStructuredDataScraper };

// Run if called directly
if (require.main === module) {
  runStructuredDataScraper()
    .then(result => {
      console.log('\n=== SCRAPING COMPLETE ===');
      console.log(JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(error => {
      console.error('Structured data scraping failed:', error);
      process.exit(1);
    });
}