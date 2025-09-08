const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
require('dotenv').config();

// Initialize Prisma
const prisma = new PrismaClient({
  log: ['error', 'warn']
});

// MySwitzerland-specific event scraper with proper data extraction
class MySwitzerlandEventScraper {
  constructor() {
    this.baseUrl = 'https://www.myswitzerland.com';
  }

  async scrapeAlpsabzugEvents() {
    console.log('Starting MySwitzerland Alpsabzug scraper...');
    
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });

      const page = await context.newPage();
      const events = [];

      // Search for Alpsabzug events
      const searchUrl = 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/?rubrik=alpabzuegeaelplerfeste';
      console.log('Loading MySwitzerland Alpsabzug search page...');
      
      await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(3000);

      // Check for "Load More" or pagination buttons and click them
      try {
        // Try to load all results by clicking "Show More" or similar buttons
        let loadMoreButton = await page.$('.load-more, [data-load-more], .show-more, .mehr-anzeigen');
        let clicks = 0;
        while (loadMoreButton && clicks < 5) { // Max 5 clicks to prevent infinite loops
          console.log('Found "Load More" button, clicking...');
          await loadMoreButton.click();
          await page.waitForTimeout(2000);
          loadMoreButton = await page.$('.load-more, [data-load-more], .show-more, .mehr-anzeigen');
          clicks++;
        }
      } catch (error) {
        console.log('No pagination found or error clicking:', error.message);
      }

      // Find event links (now after loading all content)
      const eventLinks = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="/veranstaltungen/"], a[href*="/event"]'));
        return links
          .map(link => ({
            href: link.href,
            title: link.textContent?.trim() || ''
          }))
          .filter(link => 
            link.title.toLowerCase().includes('alpabzug') ||
            link.title.toLowerCase().includes('alpsabzug') ||
            link.title.toLowerCase().includes('désalpe') ||
            link.title.toLowerCase().includes('desalpe') ||
            link.href.includes('alpabzug') ||
            link.href.includes('alpsabzug')
          );
      });

      console.log(`Found ${eventLinks.length} potential Alpsabzug event links`);

      // Visit each event page to extract detailed data
      for (const eventLink of eventLinks.slice(0, 50)) { // Increased limit to 50 events
        try {
          console.log(`Scraping event: ${eventLink.title}`);
          await page.goto(eventLink.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
          await page.waitForTimeout(2000);

          // Extract JSON-LD structured data
          const eventData = await this.extractEventData(page, eventLink.href);
          
          if (eventData) {
            events.push(eventData);
            console.log(`✓ Extracted: ${eventData.title} on ${eventData.startTime.toLocaleDateString()}`);
          }

        } catch (error) {
          console.error(`Error scraping ${eventLink.href}:`, error.message);
        }
      }

      await context.close();
      return events;

    } finally {
      await browser.close();
    }
  }

  async extractEventData(page, url) {
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

      let title, startTime, endTime, location, description, venueName;

      if (eventStructuredData) {
        // Extract from JSON-LD
        title = eventStructuredData.name || eventStructuredData.title || '';
        
        // Parse dates from JSON-LD
        if (eventStructuredData.startDate) {
          startTime = new Date(eventStructuredData.startDate);
        }
        if (eventStructuredData.endDate) {
          endTime = new Date(eventStructuredData.endDate);
        }

        // Extract location
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
      }

      // Fallback to HTML extraction if no structured data
      if (!title || !startTime) {
        const htmlData = await page.evaluate(() => {
          const titleElement = document.querySelector('h1, .event-title, .title');
          const dateElement = document.querySelector('.date, .event-date, [class*="date"]');
          const timeElement = document.querySelector('.time, .event-time, [class*="time"]');
          const locationElement = document.querySelector('.location, .event-location, [class*="location"]');
          const descElement = document.querySelector('.description, .event-description, .content');

          return {
            title: titleElement?.textContent?.trim() || '',
            dateText: dateElement?.textContent?.trim() || '',
            timeText: timeElement?.textContent?.trim() || '',
            locationText: locationElement?.textContent?.trim() || '',
            descriptionText: descElement?.textContent?.trim() || ''
          };
        });

        title = title || htmlData.title;
        description = description || htmlData.descriptionText;
        venueName = venueName || htmlData.locationText;

        // Parse Swiss date formats if not found in JSON-LD
        if (!startTime && htmlData.dateText) {
          startTime = this.parseSwissDate(htmlData.dateText);
        }
      }

      // Geocode the venue/location to get coordinates for distance calculation
      let lat, lon, city;
      if (venueName) {
        try {
          const coords = await this.geocodeAddress(venueName);
          if (coords) {
            lat = coords.lat;
            lon = coords.lon;
          }
          // Extract city from venue name
          city = venueName.split(',')[0].trim();
        } catch (error) {
          console.log(`Geocoding failed for ${venueName}:`, error.message);
        }
      }

      // Skip events without valid data
      if (!title || !startTime) {
        console.log(`⚠ Skipping event - missing title or date`);
        return null;
      }

      // Skip events that are clearly not Alpsabzug
      if (!this.isAlpsabzugEvent(title, description)) {
        console.log(`⚠ Skipping non-Alpsabzug event: ${title}`);
        return null;
      }

      return {
        source: 'ALPSABZUG',
        sourceEventId: this.generateEventId(url, title, startTime),
        title: title.substring(0, 200),
        description: description?.substring(0, 500) || `Alpsabzug event from MySwitzerland: ${title}`,
        lang: 'de',
        category: 'alpsabzug',
        startTime,
        endTime: endTime || undefined,
        venueName: venueName?.substring(0, 200) || undefined,
        city: city || undefined,
        country: 'CH',
        lat: lat || undefined,
        lon: lon || undefined,
        url: url
      };

    } catch (error) {
      console.error('Error extracting event data:', error);
      return null;
    }
  }

  parseSwissDate(dateText) {
    if (!dateText) return null;

    const cleaned = dateText.trim().toLowerCase();
    
    // Swiss date patterns
    const patterns = [
      // Saturday 20. September 2025
      /(\w+)\s+(\d{1,2})\.\s*(\w+)\s+(\d{4})/,
      // 20.09.2025
      /(\d{1,2})\.(\d{1,2})\.(\d{4})/,
      // 20. September 2025
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
            // Format with weekday: Saturday 20. September 2025
            const day = parseInt(match[2]);
            const monthName = match[3];
            const year = parseInt(match[4]);
            const month = monthNames[monthName];
            
            if (month !== undefined) {
              return new Date(year, month, day);
            }
          } else if (match.length === 4) {
            if (match[2].match(/\d+/)) {
              // Format: 20.09.2025
              const day = parseInt(match[1]);
              const month = parseInt(match[2]) - 1;
              const year = parseInt(match[3]);
              return new Date(year, month, day);
            } else {
              // Format: 20. September 2025
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

  isAlpsabzugEvent(title, description = '') {
    const text = `${title} ${description}`.toLowerCase();
    const alpsabzugTerms = [
      'alpabzug', 'alpsabzug', 'alpabfahrt', 'alpsabfahrt',
      'viehscheid', 'viehschied', 'désalpe', 'desalpe', 'cattle descent',
      'älplerfest', 'alpfest', 'sennen', 'sennerei',
      'alpaufzug', 'alpauftrieb', 'inalpe', 'monté à l\'alpage',
      'transhumance', 'almabtrieb', 'decorated cows', 'geschmückte kühe',
      'vaches décorées', 'bergbauern', 'alpwirtschaft', 'alpweide'
    ];
    
    return alpsabzugTerms.some(term => text.includes(term));
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
          'User-Agent': `SwissActivitiesDashboard/1.0 (${email})`
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
        console.error('Error saving event:', error.message);
      }
    }

    console.log(`✓ MySwitzerland scraper saved ${saved} events`);
    return { eventsFound: events.length, eventsSaved: saved };
  }
}

// Export for use in main scraper
const mySwitzerlandScraper = new MySwitzerlandEventScraper();

async function runMySwitzerlandScraper() {
  try {
    const events = await mySwitzerlandScraper.scrapeAlpsabzugEvents();
    return await mySwitzerlandScraper.saveEvents(events);
  } catch (error) {
    console.error('MySwitzerland scraper failed:', error);
    return { eventsFound: 0, eventsSaved: 0 };
  }
}

module.exports = { runMySwitzerlandScraper, MySwitzerlandEventScraper };

// Run if called directly
if (require.main === module) {
  runMySwitzerlandScraper()
    .then(result => {
      console.log('MySwitzerland scraping complete:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('MySwitzerland scraping failed:', error);
      process.exit(1);
    });
}