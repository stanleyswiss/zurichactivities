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

// Target sources for Alpsabzug events - simplified approach
const SOURCES = [
  {
    name: 'MySwitzerland Simple',
    url: 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/',
    searchTerm: 'alpabzug',
    fallbackOnly: true // Use link search only
  },
  {
    name: 'Appenzell Tourism',  
    url: 'https://appenzellerland.ch/de/erleben/veranstaltungen',
    searchTerm: 'alpabzug',
    fallbackOnly: true
  },
  {
    name: 'Bern Tourism',
    url: 'https://www.bern.com/de/veranstaltungen',
    searchTerm: 'alpabzug',
    fallbackOnly: true
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
    
    // Wait for content to load
    await page.waitForTimeout(3000);
    
    // For simplified approach, just search all text
    if (source.fallbackOnly) {
      console.log(`Using simplified search for ${source.name}`);
      
      // Get all text content
      const pageText = await page.evaluate(() => document.body.innerText);
      
      // Search for Alpsabzug events in the text
      const lines = pageText.split('\n').filter(line => line.trim());
      let foundEvents = 0;
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (await isAlpsabzugEvent(line)) {
          foundEvents++;
          // Look for date in nearby lines
          let dateText = '';
          for (let j = Math.max(0, i-2); j < Math.min(lines.length, i+3); j++) {
            if (lines[j].match(/\d{1,2}\.\d{1,2}\.\d{4}|\d{1,2}\.\s*\w+\s+\d{4}/)) {
              dateText = lines[j];
              break;
            }
          }
          
          const startTime = parseSwissDate(dateText) || new Date('2025-09-15'); // Default date
          
          events.push({
            source: 'ALPSABZUG',
            sourceEventId: `${source.name}-${line.substring(0, 50)}-${startTime.getTime()}`,
            title: line.trim(),
            description: `Gefunden auf ${source.name}`,
            lang: 'de', 
            category: 'alpsabzug',
            startTime,
            country: 'CH',
            url: source.url,
            venueName: source.name
          });
          
          console.log(`Found event: ${line.substring(0, 80)}...`);
        }
      }
      
      console.log(`Found ${foundEvents} Alpsabzug mentions on ${source.name}`);
      return events;
    }
    
    // Original selector-based approach would go here if we had selectors
    
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