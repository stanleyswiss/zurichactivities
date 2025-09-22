require('ts-node/register');

const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { AIMunicipalScraper } = require('../../src/lib/scrapers/ai-municipal-scraper');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Prisma
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Helper to authorise worker-triggered requests
function isWorkerAuthorized(req) {
  const expected = process.env.WORKER_TOKEN || process.env.RAILWAY_WORKER_TOKEN;
  if (!expected) return true;
  const headerToken = req.headers['x-worker-token'];
  const bodyToken = req.body && req.body.token;
  return headerToken === expected || bodyToken === expected;
}

function parsePositiveInt(value, fallback) {
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

app.post('/scrape-municipalities', async (req, res) => {
  if (!isWorkerAuthorized(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  const limit = Math.max(1, Math.min(parsePositiveInt(req.body?.limit, 10), 50));
  const maxDistance = parsePositiveInt(req.body?.maxDistance, 200);

  const scraper = new AIMunicipalScraper(prisma);
  const started = Date.now();

  try {
    const result = await scraper.scrapeMultipleMunicipalities(limit, maxDistance);
    const duration = Date.now() - started;

    res.json({
      success: true,
      totalEvents: result.totalEvents,
      succeeded: result.success,
      failed: result.failed,
      municipalitiesScraped: result.success + result.failed,
      duration,
      results: [
        {
          source: 'MUNICIPAL',
          success: result.success > 0,
          eventsFound: result.totalEvents,
          eventsSaved: result.totalEvents,
          duration,
          municipalitiesScraped: result.success + result.failed,
          failed: result.failed,
        },
      ],
      summary: {
        sources_attempted: 1,
        sources_successful: result.success > 0 ? 1 : 0,
        total_events_found: result.totalEvents,
        total_events_saved: result.totalEvents,
        municipalities_scraped: result.success + result.failed,
      },
    });
  } catch (error) {
    console.error('Worker municipal scrape failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    service: 'Municipal Scraper',
    timestamp: new Date().toISOString()
  });
});

// Simple seed municipalities endpoint
app.post('/seed-municipalities', async (req, res) => {
  try {
    const { maxDistance = 200 } = req.body;
    
    console.log(`Starting municipality seeding within ${maxDistance}km...`);
    
    // For now, create a simple dataset manually with some municipalities near Schlieren
    // This can be replaced with a proper API call once we find a reliable source
    const data = {
      features: [
        { properties: { id: '261', gemname: 'Schlieren', kanton: 'ZH' }, geometry: { coordinates: [[8.447, 47.396]] } },
        { properties: { id: '243', gemname: 'Dietikon', kanton: 'ZH' }, geometry: { coordinates: [[8.400, 47.402]] } },
        { properties: { id: '247', gemname: 'Urdorf', kanton: 'ZH' }, geometry: { coordinates: [[8.424, 47.386]] } },
        { properties: { id: '246', gemname: 'Unterengstringen', kanton: 'ZH' }, geometry: { coordinates: [[8.433, 47.410]] } },
        { properties: { id: '244', gemname: 'Oberengstringen', kanton: 'ZH' }, geometry: { coordinates: [[8.446, 47.423]] } },
        { properties: { id: '241', gemname: 'Weiningen ZH', kanton: 'ZH' }, geometry: { coordinates: [[8.430, 47.427]] } },
        { properties: { id: '245', gemname: 'Geroldswil', kanton: 'ZH' }, geometry: { coordinates: [[8.413, 47.419]] } },
        { properties: { id: '248', gemname: 'Uitikon', kanton: 'ZH' }, geometry: { coordinates: [[8.456, 47.366]] } },
        { properties: { id: '191', gemname: 'Zürich', kanton: 'ZH' }, geometry: { coordinates: [[8.541, 47.376]] } },
        { properties: { id: '2581', gemname: 'Baden', kanton: 'AG' }, geometry: { coordinates: [[8.306, 47.477]] } },
      ]
    };
    
    const schlierenLat = 47.396;
    const schlierenLon = 8.447;
    
    let stored = 0;
    let skipped = 0;
    
    // Process municipality features
    for (const feature of data.features) {
      const props = feature.properties;
      const geometry = feature.geometry;
      
      if (!geometry || !geometry.coordinates) {
        skipped++;
        continue;
      }
      
      // Simple point coordinates (WGS84)
      const lat = geometry.coordinates[0][1];
      const lon = geometry.coordinates[0][0];
      
      // Calculate distance using simple formula
      const distance = Math.sqrt(
        Math.pow((lat - schlierenLat) * 111, 2) + 
        Math.pow((lon - schlierenLon) * 111 * Math.cos(lat * Math.PI / 180), 2)
      );
      
      if (distance <= maxDistance) {
        const bfsNumber = parseInt(props.id);
        
        const nameNorm = props.gemname
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '');
        
        await prisma.municipality.upsert({
          where: { bfsNumber },
          create: {
            bfsNumber,
            name: props.gemname,
            nameNorm,
            canton: props.kanton,
            district: null,
            lat,
            lon,
            distanceFromHome: distance,
            scrapeStatus: 'pending',
          },
          update: {
            name: props.gemname,
            nameNorm,
            canton: props.kanton,
            lat,
            lon,
            distanceFromHome: distance,
          },
        });
        stored++;
      }
    }
    
    console.log(`Seeded ${stored} municipalities (skipped ${skipped} without coordinates)`);
    
    res.json({
      success: true,
      stored,
      skipped,
      total: data.features.length,
      message: `Seeded ${stored} municipalities within ${maxDistance}km`
    });
    
  } catch (error) {
    console.error('Municipality seeding error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Find municipality websites
app.post('/find-websites', async (req, res) => {
  try {
    const { limit = 10 } = req.body;
    
    const municipalities = await prisma.municipality.findMany({
      where: { 
        websiteUrl: null,
        distanceFromHome: { lte: 50 }
      },
      orderBy: { distanceFromHome: 'asc' },
      take: limit,
    });
    
    const patterns = [
      (name) => `https://www.${name.toLowerCase()}.ch`,
      (name) => `https://${name.toLowerCase()}.ch`,
      (name) => `https://www.gemeinde-${name.toLowerCase()}.ch`,
      (name) => `https://www.stadt-${name.toLowerCase()}.ch`,
    ];
    
    let found = 0;
    
    for (const muni of municipalities) {
      for (const pattern of patterns) {
        const url = pattern(muni.name);
        
        try {
          console.log(`Testing ${url}...`);
          const controller = new AbortController();
          setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(url, { 
            method: 'HEAD',
            signal: controller.signal,
          });
          
          if (response.ok) {
            await prisma.municipality.update({
              where: { id: muni.id },
              data: { websiteUrl: url },
            });
            console.log(`✓ Found website for ${muni.name}: ${url}`);
            found++;
            break;
          }
        } catch (error) {
          // Try next pattern
        }
      }
    }
    
    res.json({
      success: true,
      processed: municipalities.length,
      found,
      message: `Found ${found} websites out of ${municipalities.length} municipalities`
    });
    
  } catch (error) {
    console.error('Website detection error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Find event pages
app.post('/find-event-pages', async (req, res) => {
  try {
    const { limit = 10 } = req.body;
    
    const municipalities = await prisma.municipality.findMany({
      where: { 
        websiteUrl: { not: null },
        eventPageUrl: null,
        distanceFromHome: { lte: 50 }
      },
      orderBy: { distanceFromHome: 'asc' },
      take: limit,
    });
    
    const eventPatterns = [
      '/veranstaltungen',
      '/events',
      '/agenda',
      '/anlaesse',
      '/kalender',
      '/termine',
    ];

    function detectCms(html, url) {
      const lower = html.toLowerCase();
      // Quick URL-based hints
      if (/onegov|winterthur/.test(url)) return 'onegov_cloud';
      if (/localcities|lc-/.test(lower)) return 'localcities';

      // Generator/meta and markup heuristics
      if (lower.includes('meta name="generator" content="typo3') || lower.includes('class="tx-')) {
        return 'typo3';
      }
      if (lower.includes('wp-content') || lower.includes('wp-includes') || lower.includes('meta name="generator" content="wordpress')) {
        return 'wordpress';
      }
      if (lower.includes('drupal-settings-json') || lower.includes('data-drupal-selector') || lower.includes('meta name="generator" content="drupal')) {
        return 'drupal';
      }
      if (lower.includes('onegov') || lower.includes('data-event-id')) {
        return 'onegov_cloud';
      }
      if (lower.includes('govis') || lower.includes('content-teaser') || lower.includes('veranstaltung-item')) {
        return 'govis';
      }
      return 'custom';
    }
    
    let found = 0;
    
    for (const muni of municipalities) {
      for (const pattern of eventPatterns) {
        // Try with and without language prefixes
        const candidates = [
          muni.websiteUrl + pattern,
          muni.websiteUrl + '/de' + pattern,
          muni.websiteUrl + '/en' + pattern,
          muni.websiteUrl + '/fr' + pattern,
          muni.websiteUrl + '/it' + pattern,
        ];

        for (const url of candidates) {
          try {
            console.log(`Testing ${url}...`);
            const controller = new AbortController();
            setTimeout(() => controller.abort(), 7000);

            const response = await fetch(url, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MunicipalFinder/1.0)'
              },
              redirect: 'follow',
              signal: controller.signal,
            });

            if (response.ok) {
              const html = await response.text();
              const cmsType = detectCms(html, url);

              await prisma.municipality.update({
                where: { id: muni.id },
                data: {
                  eventPageUrl: url,
                  eventPagePattern: pattern,
                  cmsType,
                },
              });
              console.log(`✓ Found event page for ${muni.name}: ${url} (cms=${cmsType})`);
              found++;
              throw new Error('__break_patterns');
            }
          } catch (error) {
            if (error && error.message === '__break_patterns') {
              break; // Break out of candidates loop, continue next municipality
            }
            // Try next candidate or next pattern
          }
        }
        // If we found one, skip remaining patterns
        // This is handled by the special break above
      }
    }
    
    res.json({
      success: true,
      processed: municipalities.length,
      found,
      message: `Found ${found} event pages out of ${municipalities.length} municipalities`
    });
    
  } catch (error) {
    console.error('Event page detection error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Scrape a single municipality with Playwright (for JS-heavy pages)
app.post('/scrape-municipality-playwright', async (req, res) => {
  const { municipalityId, bfsNumber, waitSelector } = req.body || {};
  try {
    // Load municipality
    let municipality = null;
    if (municipalityId) {
      municipality = await prisma.municipality.findUnique({ where: { id: municipalityId } });
    } else if (bfsNumber) {
      municipality = await prisma.municipality.findUnique({ where: { bfsNumber: parseInt(bfsNumber) } });
    }
    if (!municipality) {
      return res.status(404).json({ success: false, error: 'Municipality not found' });
    }
    if (!municipality.eventPageUrl) {
      return res.status(400).json({ success: false, error: 'Municipality has no eventPageUrl' });
    }

    // Launch headless Chromium
    const browser = await chromium.launch({ args: ['--no-sandbox','--disable-setuid-sandbox'] });
    const context = await browser.newContext({ locale: municipality.language || 'de-CH' });
    const page = await context.newPage();

    const targetUrl = municipality.eventPageUrl;
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    // allow network settle
    try { await page.waitForLoadState('networkidle', { timeout: 10000 }); } catch {}
    if (waitSelector) {
      try { await page.waitForSelector(waitSelector, { timeout: 8000 }); } catch {}
    }

    // Evaluate DOM and extract
    const cmsType = municipality.cmsType || 'custom';
    const events = await page.evaluate((cmsType) => {
      function pick(sel, root) {
        const el = (root || document).querySelector(sel);
        return el ? el.textContent.trim() : null;
      }
      function text(el, selList) {
        for (const sel of selList) {
          const v = pick(sel, el);
          if (v) return v;
        }
        return null;
      }
      function parseDateText(t) {
        if (!t) return null;
        const m = t.match(/(\d{1,2})[\.\/-](\d{1,2})[\.\/-](\d{2,4})/);
        if (m) {
          const d = parseInt(m[1],10), mo = parseInt(m[2],10)-1, y = parseInt(m[3].length===2?('20'+m[3]):m[3],10);
          const dt = new Date(Date.UTC(y,mo,d,12,0,0));
          return dt.toISOString();
        }
        return null;
      }
      const configs = {
        govis: {
          container: '.content-teaser, .veranstaltung-item, .event-item, article',
          title: ['.event-title','h3','h2'],
          date: ['.event-date','.datum','.date-display-single','time'],
          venue: ['.event-location','.ort','.location']
        },
        onegov_cloud: {
          container: '.onegov-event, article[data-event-id]',
          title: ['.event-title','h2','h3'],
          date: ['time','.event-date','.date','[datetime]'],
          venue: ['.event-location','.location']
        },
        typo3: {
          container: '.tx-news-article, .news-list-item, .event, article',
          title: ['.news-list-header h3','h3','.title'],
          date: ['.news-list-date','.date','time'],
          venue: ['.location','.event-location']
        },
        drupal: {
          container: '.node-event, .views-row, article',
          title: ['.field-name-title a','h3','h2'],
          date: ['.date-display-single','time','.field--name-field-date'],
          venue: ['.field--name-field-location','.event-location']
        },
        wordpress: {
          container: '.tribe-events-calendar-list__event, .event, article',
          title: ['.tribe-events-calendar-list__event-title','h3','h2','.entry-title'],
          date: ['time','.event-date','.updated'],
          venue: ['.tribe-events-calendar-list__event-venue-title','.event-location']
        },
        localcities: {
          container: '.localcities-event, .lc-event-card, [data-municipality-id]',
          title: ['.event-title','h3'],
          date: ['time','.event-date','.date'],
          venue: ['.event-location','.location']
        },
        custom: {
          container: '.event, .veranstaltung, .agenda-item, article, .post, .entry',
          title: ['.event-title','h3','h2','.title'],
          date: ['time','.event-date','.datum','.date'],
          venue: ['.event-location','.location','.ort']
        }
      };
      const cfg = configs[cmsType] || configs.custom;
      const nodes = Array.from(document.querySelectorAll(cfg.container));
      const out = [];
      for (const el of nodes.slice(0, 200)) {
        const title = text(el, cfg.title);
        const dateText = text(el, cfg.date);
        if (!title || !dateText) continue;
        const startIso = parseDateText(dateText);
        out.push({
          title,
          dateText,
          startIso,
          venueName: text(el, cfg.venue),
          url: (el.querySelector('a') && el.querySelector('a').href) || null
        });
      }
      return out;
    }, cmsType);

    await browser.close();

    // Upsert into DB with uniqueness hash
    let saved = 0;
    for (const ev of events) {
      if (!ev.startIso) continue;
      const normalizedTitle = ev.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const dateKey = ev.startIso.split('T')[0];
      const venueKey = (ev.venueName || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const composite = `${municipality.id}-${normalizedTitle}-${dateKey}-${venueKey}`;
      const uniquenessHash = crypto.createHash('sha256').update(composite).digest('hex');
      try {
        await prisma.event.upsert({
          where: { uniquenessHash },
          create: {
            source: 'MUNICIPAL',
            sourceEventId: null,
            title: ev.title,
            titleNorm: normalizedTitle,
            description: null,
            lang: municipality.language || 'de',
            category: null,
            startTime: new Date(ev.startIso),
            endTime: null,
            venueName: ev.venueName || null,
            street: null,
            postalCode: null,
            city: municipality.name,
            country: 'CH',
            lat: null,
            lon: null,
            priceMin: null,
            priceMax: null,
            currency: 'CHF',
            url: ev.url || municipality.eventPageUrl,
            imageUrl: null,
            uniquenessHash,
            municipalityId: municipality.id,
          },
          update: {
            title: ev.title,
            startTime: new Date(ev.startIso),
            venueName: ev.venueName || null,
            url: ev.url || municipality.eventPageUrl,
          },
        });
        saved++;
      } catch (e) {
        // continue on individual errors
      }
    }

    await prisma.municipality.update({
      where: { id: municipality.id },
      data: {
        lastScraped: new Date(),
        lastSuccessful: saved > 0 ? new Date() : municipality.lastSuccessful,
        eventCount: saved,
        scrapeStatus: saved > 0 ? 'active' : 'failed',
        scrapeError: saved === 0 ? 'No events found (playwright)' : null,
      }
    });

    return res.json({ success: true, municipality: { id: municipality.id, name: municipality.name }, found: events.length, saved });
  } catch (error) {
    console.error('Playwright scrape error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// Update existing municipalities to set cmsType
app.post('/update-cms-types', async (req, res) => {
  try {
    const updated = await prisma.municipality.updateMany({
      where: {
        eventPageUrl: { not: null },
        cmsType: null
      },
      data: {
        cmsType: 'govis'
      }
    });
    
    res.json({
      success: true,
      updated: updated.count,
      message: `Updated ${updated.count} municipalities with cmsType: govis`
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get municipality stats
app.get('/municipalities/stats', async (req, res) => {
  try {
    const total = await prisma.municipality.count();
    const withWebsite = await prisma.municipality.count({
      where: { websiteUrl: { not: null } }
    });
    const withEventPage = await prisma.municipality.count({
      where: { eventPageUrl: { not: null } }
    });
    const withGovisCms = await prisma.municipality.count({
      where: { cmsType: 'govis' }
    });
    
    res.json({
      total,
      withWebsite,
      withEventPage,
      withGovisCms,
      websitePercentage: Math.round((withWebsite / total) * 100),
      eventPagePercentage: Math.round((withEventPage / total) * 100),
      govisPercentage: Math.round((withGovisCms / total) * 100)
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

app.listen(port, () => {
  console.log(`Municipal Scraper Service running on port ${port}`);
  console.log('Endpoints:');
  console.log('  POST /seed-municipalities - Seed municipality data');
  console.log('  POST /find-websites - Find municipality websites');
  console.log('  POST /find-event-pages - Find event page URLs');
  console.log('  POST /update-cms-types - Update municipalities with cmsType: govis');
  console.log('  GET /municipalities/stats - Get statistics');
  console.log('  GET /health - Health check');
});
