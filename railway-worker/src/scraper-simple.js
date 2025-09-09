const { chromium } = require('playwright');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
require('dotenv').config();

// Initialize Prisma
const prisma = new PrismaClient({
  log: ['error', 'warn']
});

// Alpsabzug-specific terms
const ALPSABZUG_TERMS = [
  'alpabzug', 'alpsabzug', 'alpabfahrt', 'alpsabfahrt',
  'viehscheid', 'désalpe', 'desalpe', 'alpfest', 'älplerfest'
];

// Simple event sources
const SOURCES = [
  {
    name: 'Alpabzug.ch',
    url: 'https://alpabzug.ch/',
    description: 'Dedicated Alpabzug events site'
  },
  {
    name: 'Schweizer Alpen',
    url: 'https://www.schweizeralpen.com/tradition/alpabzug',
    description: 'Swiss Alps traditions'
  },
  {
    name: 'Events Search',
    url: 'https://www.google.com/search?q=alpabzug+2025+schweiz+veranstaltungen',
    description: 'Google search results'
  }
];

function parseSwissDate(text) {
  if (!text) return null;
  
  // Try different date patterns
  const patterns = [
    /(\d{1,2})\.(\d{1,2})\.(\d{4})/,  // DD.MM.YYYY
    /(\d{1,2})\.\s*(\w+)\s+(\d{4})/,  // DD. Month YYYY
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      try {
        // Simple date parsing
        if (match[1] && match[2] && match[3]) {
          const day = parseInt(match[1]);
          const month = parseInt(match[2]) || 9; // Default September
          const year = parseInt(match[3]);
          return new Date(year, month - 1, day);
        }
      } catch {
        continue;
      }
    }
  }
  
  return null;
}

async function scrapeSimple() {
  console.log('Starting simplified Alpsabzug scraper...');
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const allEvents = [];
  
  for (const source of SOURCES) {
    try {
      console.log(`\nScraping ${source.name}...`);
      
      const context = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      });
      
      const page = await context.newPage();
      await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2000);
      
      // Get all text
      const pageText = await page.evaluate(() => document.body.innerText);
      const lines = pageText.split('\n').filter(line => line.trim().length > 0);
      
      // Search for Alpsabzug mentions
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].toLowerCase();
        
        if (ALPSABZUG_TERMS.some(term => line.includes(term))) {
          // Found a mention, create event
          let title = lines[i].trim();
          
          // Clean title by removing date patterns
          title = title.replace(/\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/g, '').trim();
          title = title.replace(/^\d{1,2}\s+(Sep|Sept|September|Okt|Oktober)\s*/i, '').trim();
          
          // Look for date nearby
          let eventDate = new Date('2025-09-15'); // Default date
          for (let j = Math.max(0, i-3); j < Math.min(lines.length, i+3); j++) {
            const date = parseSwissDate(lines[j]);
            if (date) {
              eventDate = date;
              break;
            }
          }
          
          // Create event with proper location fields
          const event = {
            source: 'ALPSABZUG',
            sourceEventId: crypto.createHash('md5').update(`${title}-${eventDate.getTime()}`).digest('hex'),
            title: title.substring(0, 100),
            description: `Alpabzug event found on ${source.name}`,
            lang: 'de',
            category: 'alpsabzug',
            startTime: eventDate,
            endTime: undefined,
            venueName: undefined,
            street: undefined,
            postalCode: undefined,
            city: undefined,
            country: 'CH',
            lat: undefined,
            lon: undefined,
            priceMin: undefined,
            priceMax: undefined,
            currency: 'CHF',
            url: source.url,
            imageUrl: undefined
          };
          
          allEvents.push(event);
          console.log(`Found: ${title.substring(0, 60)}... on ${eventDate.toLocaleDateString()}`);
        }
      }
      
      await context.close();
    } catch (error) {
      console.error(`Error scraping ${source.name}:`, error.message);
    }
  }
  
  await browser.close();
  
  // Save to database
  console.log(`\nTotal events found: ${allEvents.length}`);
  
  let saved = 0;
  for (const event of allEvents) {
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
  
  console.log(`Saved ${saved} events to database`);
  return { eventsFound: allEvents.length, eventsSaved: saved };
}

// Export for use in main app
module.exports = { scrapeSimple };

// Run if called directly
if (require.main === module) {
  scrapeSimple()
    .then(result => {
      console.log('Scraping complete:', result);
      process.exit(0);
    })
    .catch(error => {
      console.error('Scraping failed:', error);
      process.exit(1);
    });
}