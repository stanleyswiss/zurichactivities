const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
require('dotenv').config();

const prisma = new PrismaClient({
  log: ['error', 'warn']
});

// Fast MySwitzerland scraper optimized for speed
class FastMySwitzerlandScraper {
  constructor() {
    this.baseUrl = 'https://www.myswitzerland.com';
    this.categories = [
      { name: 'Festivals', path: '/?rubrik=festivals' },
      { name: 'Markets', path: '/?rubrik=maerkte' },
      { name: 'Culture', path: '/?rubrik=kultur' },
      { name: 'Music', path: '/?rubrik=musik' },
      { name: 'Family', path: '/?rubrik=familie' },
      { name: 'Sports', path: '/?rubrik=sport' },
      { name: 'Alpsabzug', path: '/?rubrik=alpabzuegeaelplerfeste' }
    ];
  }

  async scrapeAllCategories() {
    console.log('Starting FAST MySwitzerland comprehensive scraper...');
    
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const allEvents = [];

    try {
      // Process categories in parallel for speed
      const categoryPromises = this.categories.map(category => 
        this.scrapeCategoryFast(browser, category)
      );
      
      const categoryResults = await Promise.all(categoryPromises);
      
      // Combine all events
      for (const events of categoryResults) {
        allEvents.push(...events);
      }

      console.log(`\n✓ Fast scraping complete: ${allEvents.length} total events found`);
      
    } finally {
      await browser.close();
    }

    return this.saveEvents(allEvents);
  }

  async scrapeCategoryFast(browser, category) {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    const events = [];
    
    try {
      const searchUrl = `${this.baseUrl}/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche${category.path}`;
      console.log(`\n=== Fast scraping ${category.name} ===`);
      
      await page.goto(searchUrl, { 
        waitUntil: 'domcontentloaded', // Faster than networkidle
        timeout: 30000 
      });
      
      // Quick wait for initial content
      await page.waitForTimeout(1000);
      
      // Try to load more results quickly
      try {
        const loadMoreButton = await page.$('.load-more, [data-load-more], .mehr-anzeigen');
        if (loadMoreButton) {
          await loadMoreButton.click();
          await page.waitForTimeout(1000); // Quick wait for new content
        }
      } catch (e) {
        // Ignore if no load more button
      }

      // Debug: First let's see what's on the page
      const debugInfo = await page.evaluate(() => {
        return {
          title: document.title,
          url: window.location.href,
          bodyText: document.body.textContent.substring(0, 500),
          totalLinks: document.querySelectorAll('a').length,
          totalElements: document.querySelectorAll('*').length
        };
      });
      
      console.log(`Debug ${category.name}:`, debugInfo);
      
      // Extract all event data from the listing page directly (no detail page visits)
      const pageEvents = await page.evaluate(() => {
        const events = [];
        
        // Much broader search - try to find ANY links that might be events
        const allLinks = Array.from(document.querySelectorAll('a[href*="/veranstaltungen/"], a[href*="/event"], a[href*="/erlebnis"]'));
        
        console.log(`Found ${allLinks.length} potential event links`);
        
        allLinks.forEach(link => {
          try {
            const title = link.textContent?.trim();
            if (!title || title.length < 3) return;
            
            // Get the link's parent container to find more info
            let container = link.closest('article, .item, .card, .result, .event, .box, div[class*="item"]') || link;
            
            // Look for date anywhere in the container
            const allText = container.textContent;
            const dateMatch = allText.match(/\d{1,2}\.\d{1,2}\.\d{4}|\d{1,2}\.\s*\w+\s+\d{4}/);
            const dateText = dateMatch ? dateMatch[0] : '';
            
            // Look for location hints
            const locationMatch = allText.match(/\b\w+(?:strasse|platz|weg|gasse|hof|berg|dorf|stadt)\b|\b\d{4}\s+\w+/i);
            const location = locationMatch ? locationMatch[0] : '';
            
            events.push({
              title: title.substring(0, 200),
              url: link.href,
              dateText,
              location,
              description: allText.substring(0, 300),
              category: ''
            });
          } catch (e) {
            // Skip invalid events
          }
        });
        
        // If no specific event links, try to find ANY content that looks like events
        if (events.length === 0) {
          const possibleEvents = Array.from(document.querySelectorAll('h1, h2, h3, h4, strong, .title'));
          
          possibleEvents.forEach(element => {
            const title = element.textContent?.trim();
            if (!title || title.length < 5) return;
            
            // Look for event-like keywords
            if (/fest|markt|konzert|show|ausstellung|workshop|kurs|event|veranstaltung|festival/i.test(title)) {
              const container = element.closest('article, .item, .card, div') || element;
              const allText = container.textContent;
              
              events.push({
                title: title.substring(0, 200),
                url: window.location.href,
                dateText: '',
                location: '',
                description: allText.substring(0, 300),
                category: ''
              });
            }
          });
        }
        
        return events;
      });

      console.log(`Found ${pageEvents.length} events in ${category.name}`);
      
      // Process each event quickly
      for (const eventData of pageEvents) {
        const startTime = this.parseSwissDateFast(eventData.dateText) || new Date();
        
        // Basic geocoding from location text (no API calls)
        const { city, venueName } = this.parseLocationFast(eventData.location);
        
        const event = {
          source: 'ST',
          sourceEventId: this.generateEventId(eventData.url || eventData.title, eventData.title, startTime),
          title: eventData.title.substring(0, 200),
          description: eventData.description || `${category.name} event: ${eventData.title}`,
          lang: 'de',
          category: this.mapCategory(eventData.category || category.name),
          startTime,
          venueName,
          city,
          country: 'CH',
          url: eventData.url || searchUrl
        };
        
        events.push(event);
      }
      
    } catch (error) {
      console.error(`Error scraping ${category.name}:`, error.message);
    } finally {
      await context.close();
    }
    
    return events;
  }

  parseSwissDateFast(dateText) {
    if (!dateText) return new Date();
    
    const cleaned = dateText.trim();
    
    // Quick patterns for common Swiss date formats
    const patterns = [
      /(\d{1,2})\.(\d{1,2})\.(\d{4})/, // 20.09.2025
      /(\d{1,2})\.\s*(\w+)\s+(\d{4})/, // 20. September 2025
    ];
    
    for (const pattern of patterns) {
      const match = cleaned.match(pattern);
      if (match) {
        try {
          if (match[2].length <= 2) {
            // Numeric month
            return new Date(parseInt(match[3]), parseInt(match[2]) - 1, parseInt(match[1]));
          }
        } catch (e) {
          // Fall through
        }
      }
    }
    
    // Default to a date in the near future
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 7);
    return futureDate;
  }

  parseLocationFast(locationText) {
    if (!locationText) return { city: 'Switzerland', venueName: 'Switzerland' };
    
    const parts = locationText.split(',').map(s => s.trim());
    
    return {
      city: parts[parts.length - 1] || 'Switzerland',
      venueName: parts[0] || locationText
    };
  }

  mapCategory(text) {
    const mapping = {
      'festival': 'festival',
      'markt': 'market',
      'märkte': 'market',
      'kultur': 'culture',
      'musik': 'music',
      'familie': 'family',
      'sport': 'sports',
      'alp': 'alpsabzug'
    };
    
    const lower = text.toLowerCase();
    for (const [key, value] of Object.entries(mapping)) {
      if (lower.includes(key)) return value;
    }
    
    return 'event';
  }

  generateEventId(url, title, startTime) {
    const baseData = `${url}-${title}-${startTime.getTime()}`;
    return crypto.createHash('md5').update(baseData).digest('hex');
  }

  async saveEvents(events) {
    console.log(`\nSaving ${events.length} events to database...`);
    let saved = 0;

    // Save in batches for speed
    const batchSize = 10;
    for (let i = 0; i < events.length; i += batchSize) {
      const batch = events.slice(i, i + batchSize);
      
      const savePromises = batch.map(async event => {
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
              venueName: event.venueName,
              city: event.city,
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
          // Skip duplicates
        }
      });
      
      await Promise.all(savePromises);
    }

    console.log(`✓ Saved ${saved} events`);
    return { eventsFound: events.length, eventsSaved: saved };
  }
}

async function runFastMySwitzerlandScraper() {
  const scraper = new FastMySwitzerlandScraper();
  return await scraper.scrapeAllCategories();
}

module.exports = { runFastMySwitzerlandScraper, FastMySwitzerlandScraper };

// Run if called directly
if (require.main === module) {
  runFastMySwitzerlandScraper()
    .then(result => {
      console.log('Fast scraping complete:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Fast scraping failed:', error);
      process.exit(1);
    });
}