const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
require('dotenv').config();

// Initialize Prisma with minimal configuration
let prisma;

try {
  prisma = new PrismaClient({
    log: ['error', 'warn']
  });
  console.log('Prisma client initialized');
} catch (err) {
  console.error('Failed to initialize Prisma client:', err);
  console.error('DATABASE_URL:', process.env.DATABASE_URL ? 'Set (length: ' + process.env.DATABASE_URL.length + ')' : 'Not set');
  process.exit(1);
}

// Alpsabzug-specific terms for filtering
const ALPSABZUG_TERMS = [
  'alpabzug', 'alpsabzug', 'alpabfahrt', 'alpsabfahrt',
  'viehscheid', 'viehschied', 'désalpe', 'desalpe',
  'alpfest', 'älplerfest', 'sennen', 'sennerei',
  'alpaufzug', 'alpauftrieb', 'tierumfahrt',
  'alpweide', 'almabtrieb', 'cattle descent',
  'alpbetrieb', 'alpwirtschaft', 'bergbauern'
];

// Target sources for Alpsabzug events - updated selectors
const SOURCES = [
  {
    name: 'MySwitzerland Events',
    url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/?q=alpabzug',
    selectors: {
      container: '[data-testid="event-card"], .event-card, .result-item',
      title: 'h3, h4, .title, [data-testid="event-title"]',
      date: '.date, time, [data-testid="event-date"]',
      location: '.location, .venue, [data-testid="event-location"]',
      description: '.description, .summary, p',
      link: 'a'
    },
    waitFor: 3000 // Wait for dynamic content
  },
  {
    name: 'Graubünden',
    url: 'https://www.graubuenden.ch/de/suche?q=alpabzug&type=events',
    selectors: {
      container: 'article, .search-result, .teaser',
      title: 'h2, h3, .headline',
      date: '.date, time, .event-date',
      location: '.location, .place',
      description: '.text, .summary',
      link: 'a'
    }
  },
  {
    name: 'Appenzell Direct',
    url: 'https://www.appenzell.ch/de/suche.html?q=alpabzug',
    selectors: {
      container: '.search-item, .result, article',
      title: 'h3, .title',
      date: '.date, .when',
      location: '.where, .location',
      description: '.text, .desc',
      link: 'a'
    }
  }
];

async function isAlpsabzugEvent(title, description = '') {
  const combinedText = `${title} ${description}`.toLowerCase();
  return ALPSABZUG_TERMS.some(term => combinedText.includes(term));
}

async function geocodeAddress(address) {
  try {
    const email = process.env.NOMINATIM_EMAIL || 'activities@example.com';
    const url = new URL('https://nominatim.openstreetmap.org/search');
    url.searchParams.append('q', address + ', Switzerland');
    url.searchParams.append('format', 'json');
    url.searchParams.append('limit', '1');
    
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

function parseSwissDate(dateText) {
  if (!dateText) return null;
  
  const cleaned = dateText.trim().replace(/\s+/g, ' ');
  const patterns = [
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/,  // DD.MM.YYYY
    /(\d{1,2})\.\s*(\w+)\s+(\d{4})/,  // DD. Month YYYY
    /(\d{4})-(\d{2})-(\d{2})/         // YYYY-MM-DD
  ];
  
  for (const pattern of patterns) {
    const match = cleaned.match(pattern);
    if (match) {
      try {
        return new Date(match[0]);
      } catch {
        continue;
      }
    }
  }
  
  return null;
}

async function scrapeSource(browser, source) {
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  const events = [];
  
  try {
    console.log(`Scraping ${source.name} from ${source.url}`);
    await page.goto(source.url, { waitUntil: 'networkidle', timeout: 30000 });
    
    // Wait for dynamic content if specified
    if (source.waitFor) {
      await page.waitForTimeout(source.waitFor);
    }
    
    // Try to wait for event containers, but don't fail if they don't exist
    try {
      await page.waitForSelector(source.selectors.container, { timeout: 5000 });
    } catch (e) {
      console.log(`No events found with selector ${source.selectors.container} on ${source.name}`);
      // Try alternative approach - look for any links with event keywords
      const links = await page.$$('a');
      console.log(`Found ${links.length} links to check for events`);
      
      for (const link of links.slice(0, 20)) { // Check first 20 links
        try {
          const text = await link.textContent();
          if (text && await isAlpsabzugEvent(text)) {
            const href = await link.getAttribute('href');
            events.push({
              source: 'ALPSABZUG',
              sourceEventId: href || `${source.name}-${Date.now()}`,
              title: text.trim(),
              description: `Found on ${source.name}`,
              lang: 'de',
              category: 'alpsabzug',
              startTime: new Date(), // Placeholder - would need to extract from page
              country: 'CH',
              url: href ? new URL(href, source.url).toString() : source.url
            });
          }
        } catch (err) {
          // Skip this link
        }
      }
      return events;
    }
    
    // Extract events
    const eventElements = await page.$$(source.selectors.container);
    console.log(`Found ${eventElements.length} potential events on ${source.name}`);
    
    for (const element of eventElements) {
      try {
        const title = await element.$eval(source.selectors.title, el => el.textContent?.trim());
        if (!title) continue;
        
        const description = await element.$eval(source.selectors.description, el => el.textContent?.trim()).catch(() => null);
        
        // Check if it's an Alpsabzug event
        if (!await isAlpsabzugEvent(title, description || '')) continue;
        
        const dateText = await element.$eval(source.selectors.date, el => el.textContent?.trim()).catch(() => null);
        const startTime = parseSwissDate(dateText);
        if (!startTime) continue;
        
        const location = await element.$eval(source.selectors.location, el => el.textContent?.trim()).catch(() => null);
        const link = await element.$eval(source.selectors.link, el => el.href).catch(() => null);
        
        // Geocode location
        let lat, lon, city;
        if (location) {
          const coords = await geocodeAddress(location);
          if (coords) {
            lat = coords.lat;
            lon = coords.lon;
          }
          // Extract city from location
          city = location.split(',')[0].trim();
        }
        
        events.push({
          source: 'ALPSABZUG',
          sourceEventId: link || `${title}-${startTime.toISOString()}`,
          title,
          description: description || undefined,
          lang: 'de',
          category: 'alpsabzug',
          startTime,
          venueName: location || undefined,
          city,
          country: 'CH',
          lat,
          lon,
          url: link || undefined
        });
        
        console.log(`Found Alpsabzug event: ${title} on ${startTime.toLocaleDateString()}`);
      } catch (error) {
        console.error('Error processing event:', error);
      }
    }
  } catch (error) {
    console.error(`Error scraping ${source.name}:`, error);
  } finally {
    await context.close();
  }
  
  return events;
}

async function runAlpsabzugScraper() {
  console.log('Starting Alpsabzug scraper...');
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  try {
    const allEvents = [];
    
    // Scrape all sources
    for (const source of SOURCES) {
      try {
        const events = await scrapeSource(browser, source);
        allEvents.push(...events);
      } catch (error) {
        console.error(`Failed to scrape ${source.name}:`, error);
      }
    }
    
    console.log(`Total Alpsabzug events found: ${allEvents.length}`);
    
    // Save to database
    let savedCount = 0;
    for (const event of allEvents) {
      try {
        // Generate uniqueness hash
        const uniquenessHash = require('crypto')
          .createHash('sha1')
          .update(JSON.stringify({
            title: event.title.toLowerCase().trim(),
            startTime: Math.round(event.startTime.getTime() / 60000),
            lat: event.lat ? Math.round(event.lat * 10000) / 10000 : null,
            lon: event.lon ? Math.round(event.lon * 10000) / 10000 : null
          }))
          .digest('hex');
        
        await prisma.event.upsert({
          where: { uniquenessHash },
          update: {
            description: event.description,
            endTime: event.endTime,
            venueName: event.venueName,
            city: event.city,
            lat: event.lat,
            lon: event.lon,
            url: event.url,
            imageUrl: event.imageUrl,
            updatedAt: new Date()
          },
          create: {
            ...event,
            titleNorm: event.title.toLowerCase().trim(),
            uniquenessHash
          }
        });
        
        savedCount++;
      } catch (error) {
        console.error('Error saving event:', error);
      }
    }
    
    console.log(`Alpsabzug scraper completed: ${savedCount} events saved`);
    return { eventsFound: allEvents.length, eventsSaved: savedCount };
  } finally {
    await browser.close();
  }
}

module.exports = { runAlpsabzugScraper };