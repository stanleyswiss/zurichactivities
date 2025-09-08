const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
require('dotenv').config();

// Initialize Prisma
const prisma = new PrismaClient({
  log: ['error', 'warn']
});

// Comprehensive MySwitzerland event scraper for all categories
class ComprehensiveMySwitzerlandScraper {
  constructor() {
    this.baseUrl = 'https://www.myswitzerland.com';
    this.schlierenLat = 47.396;
    this.schlierenLon = 8.447;
    this.maxDistanceKm = 200;
  }

  async scrapeAllEvents() {
    console.log('Starting Comprehensive MySwitzerland scraper...');
    
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      const page = await context.newPage();
      const allEvents = [];

      // Define all event categories to scrape
      const eventCategories = [
        {
          name: 'Festivals',
          url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/?rubrik=festivals',
          category: 'festival'
        },
        {
          name: 'Markets',
          url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/?rubrik=maerkte',
          category: 'markt'
        },
        {
          name: 'Culture',
          url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/?rubrik=kultur',
          category: 'kultur'
        },
        {
          name: 'Music',
          url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/?rubrik=musik',
          category: 'musik'
        },
        {
          name: 'Family',
          url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/?rubrik=familie',
          category: 'familie'
        },
        {
          name: 'Sports',
          url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/?rubrik=sport',
          category: 'sport'
        },
        {
          name: 'Alpsabzug',
          url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/?rubrik=alpabzuegeaelplerfeste',
          category: 'alpsabzug'
        }
      ];

      // Scrape each category
      for (const eventCategory of eventCategories) {
        console.log(`\n=== Scraping ${eventCategory.name} Events ===`);
        
        try {
          const categoryEvents = await this.scrapeCategoryEvents(page, eventCategory);
          allEvents.push(...categoryEvents);
          
          console.log(`✓ Found ${categoryEvents.length} ${eventCategory.name} events`);
          
          // Delay between categories to be respectful
          await page.waitForTimeout(3000);
          
        } catch (error) {
          console.error(`Error scraping ${eventCategory.name}:`, error.message);
        }
      }

      await context.close();

      // Filter events by distance from Schlieren
      const nearbyEvents = this.filterEventsByDistance(allEvents);
      console.log(`\n✓ Found ${nearbyEvents.length} events within ${this.maxDistanceKm}km of Schlieren`);

      return nearbyEvents;

    } finally {
      await browser.close();
    }
  }

  async scrapeCategoryEvents(page, eventCategory) {
    const events = [];

    try {
      console.log(`Loading ${eventCategory.name} search page...`);
      
      await page.goto(eventCategory.url, { 
        waitUntil: 'networkidle', 
        timeout: 60000 
      });
      
      // Wait for content to load
      try {
        await page.waitForSelector('.event, .veranstaltung, [class*="event"], article', { timeout: 10000 });
      } catch (error) {
        console.log('Event containers not found, waiting for general content...');
        await page.waitForTimeout(5000);
      }

      // Load more results by clicking pagination
      await this.loadAllResults(page);

      // Find event links
      const eventLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/veranstaltungen/"], a[href*="/event"]'));
        return links
          .map(link => ({
            href: link.href,
            title: link.textContent?.trim() || ''
          }))
          .filter(link => link.title && link.title.length > 5)
          .slice(0, 30); // Limit per category to prevent overwhelming
      });

      console.log(`Found ${eventLinks.length} event links for ${eventCategory.name}`);

      // Visit each event page to extract detailed data
      for (const eventLink of eventLinks) {
        try {
          await page.waitForTimeout(1000); // Rate limiting
          
          const eventData = await this.extractEventDataFromPage(page, eventLink, eventCategory);
          
          if (eventData) {
            events.push(eventData);
            console.log(`✓ Extracted: ${eventData.title.substring(0, 50)}...`);
          }

        } catch (error) {
          console.error(`Error scraping ${eventLink.href}:`, error.message);
        }
      }

    } catch (error) {
      console.error(`Error in scrapeCategoryEvents for ${eventCategory.name}:`, error.message);
    }

    return events;
  }

  async loadAllResults(page) {
    try {
      let loadMoreButton = await page.$('.load-more, [data-load-more], .show-more, .mehr-anzeigen');
      let clicks = 0;
      
      while (loadMoreButton && clicks < 3) { // Max 3 clicks to prevent infinite loops
        console.log('Found "Load More" button, clicking...');
        await loadMoreButton.click();
        await page.waitForTimeout(3000);
        loadMoreButton = await page.$('.load-more, [data-load-more], .show-more, .mehr-anzeigen');
        clicks++;
      }
    } catch (error) {
      console.log('No pagination found or error clicking:', error.message);
    }
  }

  async extractEventDataFromPage(page, eventLink, eventCategory) {
    // Enhanced page loading with retry logic
    let retries = 0;
    const maxRetries = 2;
    let pageLoaded = false;
    
    while (!pageLoaded && retries < maxRetries) {
      try {
        await page.goto(eventLink.href, { 
          waitUntil: 'networkidle', 
          timeout: 45000 // Slightly shorter timeout per page
        });
        
        try {
          await page.waitForSelector('h1, .title, .event-title, [class*="title"]', { timeout: 8000 });
          pageLoaded = true;
        } catch (error) {
          await page.waitForTimeout(2000);
          pageLoaded = true; // Continue anyway
        }
        
      } catch (error) {
        retries++;
        console.log(`Page load attempt ${retries} failed: ${error.message}`);
        if (retries < maxRetries) {
          await page.waitForTimeout(3000);
        }
      }
    }
    
    if (!pageLoaded) {
      console.log(`⚠ Skipping ${eventLink.href} after failed attempts`);
      return null;
    }

    return await this.extractEventData(page, eventLink.href, eventCategory);
  }

  async extractEventData(page, url, eventCategory) {
    try {
      // First try JSON-LD extraction
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

      // Look for Event type in JSON-LD
      let eventStructuredData = null;
      for (const data of jsonLdData.flat()) {
        if (data['@type'] === 'Event' || (Array.isArray(data['@type']) && data['@type'].includes('Event'))) {
          eventStructuredData = data;
          break;
        }
      }

      let title, startTime, endTime, location, description, venueName, imageUrl;

      if (eventStructuredData) {
        // Extract from JSON-LD
        title = eventStructuredData.name || eventStructuredData.title || '';
        
        if (eventStructuredData.startDate) {
          startTime = new Date(eventStructuredData.startDate);
        }
        if (eventStructuredData.endDate) {
          endTime = new Date(eventStructuredData.endDate);
        }

        if (eventStructuredData.location) {
          if (typeof eventStructuredData.location === 'string') {
            venueName = eventStructuredData.location;
          } else if (eventStructuredData.location.name) {
            venueName = eventStructuredData.location.name;
          } else if (eventStructuredData.location.address) {
            venueName = eventStructuredData.location.address;
          }
        }

        description = eventStructuredData.description || '';
        imageUrl = eventStructuredData.image?.url || eventStructuredData.image;
      }

      // Fallback to HTML extraction if no structured data
      if (!title || !startTime) {
        const htmlData = await page.evaluate(() => {
          const titleElement = document.querySelector('h1, .event-title, .title');
          const dateElement = document.querySelector('.date, .event-date, [class*="date"]');
          const timeElement = document.querySelector('.time, .event-time, [class*="time"]');
          const locationElement = document.querySelector('.location, .event-location, [class*="location"]');
          const descElement = document.querySelector('.description, .event-description, .content');
          const imgElement = document.querySelector('img[src*="event"], .event-image img, .hero-image img');

          return {
            title: titleElement?.textContent?.trim() || '',
            dateText: dateElement?.textContent?.trim() || '',
            timeText: timeElement?.textContent?.trim() || '',
            locationText: locationElement?.textContent?.trim() || '',
            descriptionText: descElement?.textContent?.trim() || '',
            imageUrl: imgElement?.src || ''
          };
        });

        title = title || htmlData.title;
        description = description || htmlData.descriptionText;
        venueName = venueName || htmlData.locationText;
        imageUrl = imageUrl || htmlData.imageUrl;

        if (!startTime && htmlData.dateText) {
          startTime = this.parseSwissDate(htmlData.dateText);
        }
      }

      // Enhanced geocoding with better address parsing
      let lat, lon, city, street, postalCode;
      if (venueName) {
        try {
          const addressParts = venueName.split(',').map(part => part.trim());
          
          // Try to identify postal code and city
          for (const part of addressParts) {
            const postalMatch = part.match(/(\d{4})\s+(.+)/);
            if (postalMatch) {
              postalCode = postalMatch[1];
              city = postalMatch[2];
              break;
            }
          }
          
          if (!city && addressParts.length > 0) {
            city = addressParts[addressParts.length - 1];
            if (addressParts.length > 1) {
              street = addressParts.slice(0, -1).join(', ');
            }
          }
          
          const coords = await this.geocodeAddress(venueName);
          if (coords) {
            lat = coords.lat;
            lon = coords.lon;
          } else if (city) {
            const cityCoords = await this.geocodeAddress(city + ', Switzerland');
            if (cityCoords) {
              lat = cityCoords.lat;
              lon = cityCoords.lon;
            }
          }
          
        } catch (error) {
          console.log(`Geocoding failed for ${venueName}:`, error.message);
        }
      }

      // Skip events without valid data
      if (!title || !startTime) {
        return null;
      }

      // Apply content filter to exclude administrative events
      if (this.shouldExcludeEvent(title, description)) {
        return null;
      }

      return {
        source: 'MYSWITZERLAND',
        sourceEventId: this.generateEventId(url, title, startTime),
        title: title.substring(0, 200),
        description: description?.substring(0, 500) || `${eventCategory.name} event from MySwitzerland`,
        lang: 'de',
        category: eventCategory.category,
        startTime,
        endTime: endTime || undefined,
        venueName: venueName?.substring(0, 200) || undefined,
        street: street || undefined,
        postalCode: postalCode || undefined,
        city: city || undefined,
        country: 'CH',
        lat: lat || undefined,
        lon: lon || undefined,
        url: url,
        imageUrl: imageUrl || undefined
      };

    } catch (error) {
      console.error('Error extracting event data:', error);
      return null;
    }
  }

  shouldExcludeEvent(title, description) {
    const text = `${title} ${description || ''}`.toLowerCase();
    const excludeTerms = [
      'gemeindeversammlung', 'wahlen', 'abstimmung', 'verwaltung',
      'stadtrat', 'gemeinderatssitzung', 'budget', 'rechnung',
      'bürgerversammlung', 'politisch', 'administrativ'
    ];
    
    return excludeTerms.some(term => text.includes(term));
  }

  parseSwissDate(dateText) {
    if (!dateText) return null;

    const cleaned = dateText.trim().toLowerCase();
    
    const patterns = [
      /(\w+)\s+(\d{1,2})\.\s*(\w+)\s+(\d{4})/,
      /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
      /(\d{1,2})\.\s*(\w+)\s+(\d{4})/
    ];

    const monthNames = {
      'januar': 0, 'februar': 1, 'märz': 2, 'april': 3, 'mai': 4, 'juni': 5,
      'juli': 6, 'august': 7, 'september': 8, 'oktober': 9, 'november': 10, 'dezember': 11
    };

    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        try {
          if (match.length === 5) {
            const day = parseInt(match[2]);
            const monthName = match[3];
            const year = parseInt(match[4]);
            const month = monthNames[monthName];
            
            if (month !== undefined) {
              return new Date(year, month, day);
            }
          } else if (match.length === 4) {
            if (match[2].match(/\d+/)) {
              const day = parseInt(match[1]);
              const month = parseInt(match[2]) - 1;
              const year = parseInt(match[3]);
              return new Date(year, month, day);
            } else {
              const day = parseInt(match[1]);
              const monthName = match[2];
              const year = parseInt(match[3]);
              const month = monthNames[monthName];
              
              if (month !== undefined) {
                return new Date(year, month, day);
              }
            }
          }
        } catch (e) {
          continue;
        }
      }
    }

    return null;
  }

  async geocodeAddress(address) {
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
      if (data && data[0]) {
        // Rate limiting for Nominatim
        await new Promise(resolve => setTimeout(resolve, 1000));
        
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

  filterEventsByDistance(events) {
    return events.filter(event => {
      if (!event.lat || !event.lon) {
        return true; // Keep events without coordinates (they might be important)
      }
      
      const distance = this.calculateDistance(
        this.schlierenLat, 
        this.schlierenLon, 
        event.lat, 
        event.lon
      );
      
      return distance <= this.maxDistanceKm;
    });
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in kilometers
    const dLat = this.toRadians(lat2 - lat1);
    const dLon = this.toRadians(lon2 - lon1);
    
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(this.toRadians(lat1)) * Math.cos(this.toRadians(lat2)) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
              
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRadians(degrees) {
    return degrees * (Math.PI / 180);
  }

  generateEventId(url, title, startTime) {
    const baseData = `${url}-${title}-${startTime.getTime()}`;
    return crypto.createHash('md5').update(baseData).digest('hex');
  }

  async saveEvents(events) {
    console.log(`\nSaving ${events.length} MySwitzerland events...`);
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
            imageUrl: event.imageUrl,
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
        console.error('Error saving event:', error.message);
      }
    }

    console.log(`✓ Comprehensive MySwitzerland scraper saved ${saved} events`);
    return { eventsFound: events.length, eventsSaved: saved };
  }
}

const comprehensiveScraper = new ComprehensiveMySwitzerlandScraper();

async function runComprehensiveMySwitzerlandScraper() {
  try {
    const events = await comprehensiveScraper.scrapeAllEvents();
    return await comprehensiveScraper.saveEvents(events);
  } catch (error) {
    console.error('Comprehensive MySwitzerland scraper failed:', error);
    return { eventsFound: 0, eventsSaved: 0 };
  }
}

module.exports = { runComprehensiveMySwitzerlandScraper, ComprehensiveMySwitzerlandScraper };

// Run if called directly
if (require.main === module) {
  runComprehensiveMySwitzerlandScraper()
    .then(result => {
      console.log('Comprehensive MySwitzerland scraping complete:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Comprehensive MySwitzerland scraping failed:', error);
      process.exit(1);
    });
}