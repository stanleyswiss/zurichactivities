const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
require('dotenv').config();

// Initialize Prisma
const prisma = new PrismaClient({
  log: ['error', 'warn']
});

/**
 * Comprehensive Municipal Scraper Architecture for Swiss Cities
 * Handles common patterns found in Swiss municipal websites
 */
class SwissMunicipalScraper {
  constructor() {
    this.schlierenLat = 47.396;
    this.schlierenLon = 8.447;
    this.maxDistanceKm = 200;
    
    // Define municipalities to scrape around Schlieren
    this.municipalities = [
      {
        name: 'Schlieren',
        urls: [
          'https://www.schlieren.ch/veranstaltungen',
          'https://www.schlieren.ch/events',
          'https://www.schlieren.ch/kultur/veranstaltungen'
        ],
        lat: 47.396,
        lon: 8.447,
        priority: 'high'
      },
      {
        name: 'Dietikon',
        urls: [
          'https://www.dietikon.ch/veranstaltungen',
          'https://www.dietikon.ch/leben/kultur-freizeit/veranstaltungen',
          'https://www.dietikon.ch/events'
        ],
        lat: 47.401,
        lon: 8.398,
        priority: 'high'
      },
      {
        name: 'Urdorf',
        urls: [
          'https://www.urdorf.ch/veranstaltungen',
          'https://www.urdorf.ch/leben/freizeit/veranstaltungen',
          'https://www.urdorf.ch/events'
        ],
        lat: 47.389,
        lon: 8.424,
        priority: 'high'
      },
      {
        name: 'Oberengstringen',
        urls: [
          'https://www.oberengstringen.ch/veranstaltungen',
          'https://www.oberengstringen.ch/kultur/events',
          'https://www.oberengstringen.ch/leben/veranstaltungen'
        ],
        lat: 47.410,
        lon: 8.397,
        priority: 'medium'
      },
      {
        name: 'Weiningen',
        urls: [
          'https://www.weiningen-zh.ch/veranstaltungen',
          'https://www.weiningen-zh.ch/kultur/events',
          'https://www.weiningen-zh.ch/leben/freizeit'
        ],
        lat: 47.418,
        lon: 8.427,
        priority: 'medium'
      },
      {
        name: 'Baden',
        urls: [
          'https://www.baden.ch/de/leben-wohnen/kultur-bildung-sport/veranstaltungen',
          'https://www.baden.ch/de/tourismus/events',
          'https://www.baden.ch/veranstaltungen'
        ],
        lat: 47.473,
        lon: 8.304,
        priority: 'medium'
      },
      {
        name: 'Wohlen',
        urls: [
          'https://www.wohlen-ag.ch/leben/kultur-freizeit-sport/veranstaltungen',
          'https://www.wohlen-ag.ch/events',
          'https://www.wohlen-ag.ch/veranstaltungen'
        ],
        lat: 47.358,
        lon: 8.279,
        priority: 'medium'
      },
      {
        name: 'Bremgarten',
        urls: [
          'https://www.bremgarten.ch/leben/kultur-freizeit/veranstaltungen',
          'https://www.bremgarten.ch/events',
          'https://www.bremgarten.ch/de/leben/kultur-freizeit-sport/veranstaltungen.html'
        ],
        lat: 47.351,
        lon: 8.338,
        priority: 'low'
      },
      {
        name: 'Birmensdorf',
        urls: [
          'https://www.birmensdorf.ch/leben/kultur/veranstaltungen',
          'https://www.birmensdorf.ch/events'
        ],
        lat: 47.356,
        lon: 8.443,
        priority: 'low'
      },
      {
        name: 'Uitikon',
        urls: [
          'https://www.uitikon.ch/leben-wohnen/kultur-freizeit/veranstaltungen',
          'https://www.uitikon.ch/events'
        ],
        lat: 47.368,
        lon: 8.454,
        priority: 'low'
      }
    ];

    // Common selectors found in Swiss municipal websites
    this.eventSelectors = {
      containers: [
        '.event', '.veranstaltung', '.event-item', '.veranstaltung-item',
        '.event-card', '.event-container', '.calendar-event',
        '[class*="event"]', '[class*="veranstaltung"]',
        'article', '.teaser', '.card', '.news-item'
      ],
      titles: [
        'h1', 'h2', 'h3', 'h4', '.title', '.event-title', '.veranstaltung-titel',
        '.headline', '.event-name', '[class*="title"]', '[class*="headline"]'
      ],
      dates: [
        '.date', '.datum', '.event-date', '.veranstaltung-datum',
        '[class*="date"]', '[class*="datum"]', 'time', '.time'
      ],
      locations: [
        '.location', '.ort', '.venue', '.veranstaltungsort',
        '.event-location', '[class*="location"]', '[class*="ort"]'
      ],
      descriptions: [
        '.description', '.beschreibung', '.content', '.text',
        '.event-description', '.abstract', '.summary', 'p'
      ]
    };

    // Common Swiss date patterns
    this.datePatterns = [
      /(\d{1,2})\.(\d{1,2})\.(\d{4})/,                    // 15.09.2025
      /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i,
      /(\w+),?\s+(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i,
      /(\d{1,2})\/(\d{1,2})\/(\d{4})/,                   // 15/09/2025
      /(\d{4})-(\d{1,2})-(\d{1,2})/                      // 2025-09-15
    ];

    this.germanMonths = {
      'januar': 0, 'februar': 1, 'märz': 2, 'april': 3, 'mai': 4, 'juni': 5,
      'juli': 6, 'august': 7, 'september': 8, 'oktober': 9, 'november': 10, 'dezember': 11
    };
  }

  async scrapeAllMunicipalities() {
    console.log('Starting Comprehensive Municipal Scraper...');
    
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const allEvents = [];

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      });

      const page = await context.newPage();

      for (const municipality of this.municipalities) {
        console.log(`\n=== Scraping ${municipality.name} ===`);
        
        try {
          const municipalityEvents = await this.scrapeMunicipality(page, municipality);
          allEvents.push(...municipalityEvents);
          
          console.log(`✓ Found ${municipalityEvents.length} events in ${municipality.name}`);
          
          // Respectful delay between municipalities
          await page.waitForTimeout(2000);
          
        } catch (error) {
          console.error(`Error scraping ${municipality.name}:`, error.message);
        }
      }

      await context.close();
      
      console.log(`\n✓ Total events found: ${allEvents.length}`);
      return allEvents;

    } finally {
      await browser.close();
    }
  }

  async scrapeMunicipality(page, municipality) {
    const events = [];

    for (const url of municipality.urls) {
      try {
        console.log(`  Checking URL: ${url}`);
        
        // Check if URL exists
        const response = await fetch(url, { method: 'HEAD' });
        if (!response.ok) {
          console.log(`    URL not accessible (${response.status}), skipping...`);
          continue;
        }

        await page.goto(url, { 
          waitUntil: 'networkidle', 
          timeout: 45000 
        });

        // Wait for content to load
        try {
          await page.waitForSelector(this.eventSelectors.containers.join(', '), { timeout: 8000 });
        } catch (error) {
          console.log('    No event containers found, trying generic content...');
          await page.waitForTimeout(3000);
        }

        // Extract events from this page
        const pageEvents = await this.extractEventsFromPage(page, municipality, url);
        events.push(...pageEvents);

        console.log(`    Found ${pageEvents.length} events`);

        // Rate limiting
        await page.waitForTimeout(1500);

      } catch (error) {
        console.log(`    Error accessing ${url}: ${error.message}`);
      }
    }

    return events;
  }

  async extractEventsFromPage(page, municipality, sourceUrl) {
    try {
      // First try to extract JSON-LD structured data
      const structuredEvents = await this.extractStructuredData(page, municipality, sourceUrl);
      if (structuredEvents.length > 0) {
        console.log(`    Found ${structuredEvents.length} events from structured data`);
        return structuredEvents;
      }

      // Fallback to HTML parsing
      const htmlEvents = await this.extractHtmlEvents(page, municipality, sourceUrl);
      console.log(`    Found ${htmlEvents.length} events from HTML parsing`);
      return htmlEvents;

    } catch (error) {
      console.error('Error extracting events from page:', error);
      return [];
    }
  }

  async extractStructuredData(page, municipality, sourceUrl) {
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

      const events = [];
      
      for (const data of jsonLdData.flat()) {
        if (this.isEventData(data)) {
          const event = await this.parseStructuredEvent(data, municipality, sourceUrl);
          if (event) events.push(event);
        }
      }

      return events;
    } catch (error) {
      console.error('Structured data extraction error:', error);
      return [];
    }
  }

  async extractHtmlEvents(page, municipality, sourceUrl) {
    try {
      const eventData = await page.evaluate((selectors) => {
        const containers = document.querySelectorAll(selectors.containers.join(', '));
        const events = [];

        containers.forEach(container => {
          try {
            // Extract title
            let title = '';
            for (const selector of selectors.titles) {
              const element = container.querySelector(selector);
              if (element && element.textContent.trim()) {
                title = element.textContent.trim();
                break;
              }
            }

            if (!title || title.length < 5) return;

            // Extract date
            let dateText = '';
            for (const selector of selectors.dates) {
              const element = container.querySelector(selector);
              if (element && element.textContent.trim()) {
                dateText = element.textContent.trim();
                break;
              }
            }

            // Extract location
            let locationText = '';
            for (const selector of selectors.locations) {
              const element = container.querySelector(selector);
              if (element && element.textContent.trim()) {
                locationText = element.textContent.trim();
                break;
              }
            }

            // Extract description
            let description = '';
            for (const selector of selectors.descriptions) {
              const element = container.querySelector(selector);
              if (element && element.textContent.trim() && element.textContent.trim().length > title.length) {
                description = element.textContent.trim();
                break;
              }
            }

            // Look for event links
            let eventUrl = '';
            const link = container.querySelector('a[href]');
            if (link) {
              eventUrl = link.href;
            }

            events.push({
              title,
              dateText,
              locationText,
              description,
              eventUrl,
              containerHtml: container.outerHTML.substring(0, 500) // For debugging
            });

          } catch (e) {
            // Skip this container
          }
        });

        return events;
      }, this.eventSelectors);

      const processedEvents = [];

      for (const rawEvent of eventData) {
        try {
          const processedEvent = await this.processRawEvent(rawEvent, municipality, sourceUrl);
          if (processedEvent) {
            processedEvents.push(processedEvent);
          }
        } catch (error) {
          console.log('Error processing raw event:', error.message);
        }
      }

      return processedEvents;
    } catch (error) {
      console.error('HTML extraction error:', error);
      return [];
    }
  }

  async processRawEvent(rawEvent, municipality, sourceUrl) {
    // Parse date
    const startTime = this.parseSwissDate(rawEvent.dateText);
    if (!startTime) {
      console.log(`    Skipping event - no valid date: ${rawEvent.title}`);
      return null;
    }

    // Skip past events
    const now = new Date();
    if (startTime < now) {
      return null;
    }

    // Parse location and geocode
    let lat = municipality.lat; // Default to municipality center
    let lon = municipality.lon;
    let city = municipality.name;
    let street, postalCode;

    if (rawEvent.locationText) {
      const locationInfo = await this.parseSwissAddress(rawEvent.locationText);
      if (locationInfo.city) city = locationInfo.city;
      if (locationInfo.street) street = locationInfo.street;
      if (locationInfo.postalCode) postalCode = locationInfo.postalCode;

      // Try to geocode the specific location
      const coords = await this.geocodeAddress(rawEvent.locationText + `, ${municipality.name}, Switzerland`);
      if (coords) {
        lat = coords.lat;
        lon = coords.lon;
      }
    }

    // Categorize event
    const category = this.categorizeEvent(rawEvent.title, rawEvent.description);

    // Filter out administrative events
    if (this.shouldExcludeEvent(rawEvent.title, rawEvent.description)) {
      return null;
    }

    return {
      source: 'MUNICIPAL',
      sourceEventId: this.generateEventId(sourceUrl, rawEvent.title, startTime),
      title: rawEvent.title.substring(0, 200),
      description: rawEvent.description?.substring(0, 500) || `Event from ${municipality.name}`,
      lang: 'de',
      category,
      startTime,
      endTime: undefined,
      venueName: rawEvent.locationText || municipality.name,
      street,
      postalCode,
      city,
      country: 'CH',
      lat,
      lon,
      url: rawEvent.eventUrl || sourceUrl
    };
  }

  parseSwissDate(dateText) {
    if (!dateText) return null;

    const cleaned = dateText.trim().toLowerCase();

    for (const pattern of this.datePatterns) {
      const match = cleaned.match(pattern);
      if (match) {
        try {
          if (pattern.source.includes('Januar')) {
            // German month name format
            let day, monthName, year;
            if (match.length === 4) {
              [, day, monthName, year] = match;
            } else if (match.length === 5) {
              [, , day, monthName, year] = match; // Skip weekday
            } else {
              continue;
            }

            const month = this.germanMonths[monthName.toLowerCase()];
            if (month !== undefined) {
              return new Date(parseInt(year), month, parseInt(day));
            }
          } else if (pattern.source.includes('\\d{4}-\\d{1,2}-\\d{1,2}')) {
            // ISO format YYYY-MM-DD
            const [, year, month, day] = match;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          } else {
            // DD.MM.YYYY or DD/MM/YYYY format
            const [, day, month, year] = match;
            return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
          }
        } catch (e) {
          continue;
        }
      }
    }

    return null;
  }

  async parseSwissAddress(addressText) {
    const result = { street: null, postalCode: null, city: null };

    // Try to extract Swiss postal code (4 digits)
    const postalMatch = addressText.match(/(\d{4})\s+([A-Za-zÄäÖöÜü\s]+)/);
    if (postalMatch) {
      result.postalCode = postalMatch[1];
      result.city = postalMatch[2].trim();
    }

    // Try to extract street (everything before postal code or city)
    const parts = addressText.split(',').map(p => p.trim());
    if (parts.length >= 2 && !postalMatch) {
      result.street = parts[0];
      result.city = parts[parts.length - 1];
    }

    return result;
  }

  categorizeEvent(title, description) {
    const text = `${title} ${description || ''}`.toLowerCase();
    
    if (text.includes('fest') || text.includes('festival')) return 'festival';
    if (text.includes('konzert') || text.includes('musik')) return 'musik';
    if (text.includes('markt')) return 'markt';
    if (text.includes('familie') || text.includes('kinder')) return 'familie';
    if (text.includes('sport')) return 'sport';
    if (text.includes('kultur') || text.includes('theater')) return 'kultur';
    if (text.includes('gemeinde') || text.includes('versammlung')) return 'gemeinde';
    if (text.includes('weihnacht') || text.includes('advent')) return 'saisonal';
    
    return undefined;
  }

  shouldExcludeEvent(title, description) {
    const text = `${title} ${description || ''}`.toLowerCase();
    const excludeTerms = [
      'gemeindeversammlung', 'wahlen', 'abstimmung', 'verwaltung',
      'stadtrat', 'gemeinderatssitzung', 'budget', 'rechnung',
      'bürgerversammlung', 'politisch', 'administrativ',
      'steueramt', 'bauamt', 'einwohneramt'
    ];
    
    return excludeTerms.some(term => text.includes(term));
  }

  async geocodeAddress(address) {
    try {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limiting
      
      const email = process.env.NOMINATIM_EMAIL || 'activities@example.com';
      const url = new URL('https://nominatim.openstreetmap.org/search');
      url.searchParams.append('q', address);
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
      if (data && data[0]) {
        return {
          lat: parseFloat(data[0].lat),
          lon: parseFloat(data[0].lon)
        };
      }
    } catch (error) {
      console.error('Geocoding error:', error);
    }
    return null;
  }

  isEventData(data) {
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

  async parseStructuredEvent(data, municipality, sourceUrl) {
    const name = data.name || data.title;
    if (!name) return null;
    
    let startDate = null;
    if (data.startDate) {
      startDate = new Date(data.startDate);
    }
    
    if (!startDate) return null;

    let location = null;
    let lat = municipality.lat;
    let lon = municipality.lon;
    
    if (data.location) {
      if (typeof data.location === 'string') {
        location = data.location;
      } else if (data.location.name) {
        location = data.location.name;
        if (data.location.geo) {
          lat = parseFloat(data.location.geo.latitude);
          lon = parseFloat(data.location.geo.longitude);
        }
      }
    }

    return {
      source: 'MUNICIPAL',
      sourceEventId: this.generateEventId(sourceUrl, name, startDate),
      title: name.substring(0, 200),
      description: data.description || `Structured data event from ${municipality.name}`,
      lang: 'de',
      category: this.categorizeEvent(name, data.description),
      startTime: startDate,
      endTime: data.endDate ? new Date(data.endDate) : undefined,
      venueName: location || municipality.name,
      city: municipality.name,
      country: 'CH',
      lat,
      lon,
      url: data.url || sourceUrl
    };
  }

  generateEventId(url, title, startTime) {
    const baseData = `${url}-${title}-${startTime.getTime()}`;
    return crypto.createHash('md5').update(baseData).digest('hex');
  }

  async saveEvents(events) {
    console.log(`\nSaving ${events.length} municipal events...`);
    let saved = 0;

    for (const event of events) {
      try {
        const uniquenessHash = crypto
          .createHash('sha1')
          .update(JSON.stringify({
            title: event.title.toLowerCase(),
            startTime: Math.round(event.startTime.getTime() / 60000)
          }))
          .digest('hex');

        await prisma.event.upsert({
          where: { uniquenessHash },
          update: {
            description: event.description,
            endTime: event.endTime,
            venueName: event.venueName,
            street: event.street,
            postalCode: event.postalCode,
            city: event.city,
            lat: event.lat,
            lon: event.lon,
            url: event.url,
            updatedAt: new Date()
          },
          create: {
            ...event,
            titleNorm: event.title.toLowerCase(),
            uniquenessHash
          }
        });

        saved++;
      } catch (error) {
        console.error('Error saving municipal event:', error.message);
      }
    }

    console.log(`✓ Municipal scraper saved ${saved} events`);
    return { eventsFound: events.length, eventsSaved: saved };
  }
}

const municipalScraper = new SwissMunicipalScraper();

async function runMunicipalScraper() {
  try {
    const events = await municipalScraper.scrapeAllMunicipalities();
    return await municipalScraper.saveEvents(events);
  } catch (error) {
    console.error('Municipal scraper failed:', error);
    return { eventsFound: 0, eventsSaved: 0 };
  }
}

module.exports = { runMunicipalScraper, SwissMunicipalScraper };

// Run if called directly
if (require.main === module) {
  runMunicipalScraper()
    .then(result => {
      console.log('Municipal scraping complete:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Municipal scraping failed:', error);
      process.exit(1);
    });
}