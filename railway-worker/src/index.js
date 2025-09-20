const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const app = express();
const port = process.env.PORT || 3000;

// Initialize Prisma
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

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
    
    let found = 0;
    
    for (const muni of municipalities) {
      for (const pattern of eventPatterns) {
        const url = muni.websiteUrl + pattern;
        
        try {
          console.log(`Testing ${url}...`);
          const controller = new AbortController();
          setTimeout(() => controller.abort(), 5000);
          
          const response = await fetch(url, {
            signal: controller.signal,
          });
          
          if (response.ok) {
            await prisma.municipality.update({
              where: { id: muni.id },
              data: { 
                eventPageUrl: url,
                eventPagePattern: pattern,
              },
            });
            console.log(`✓ Found event page for ${muni.name}: ${url}`);
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
    
    res.json({
      total,
      withWebsite,
      withEventPage,
      websitePercentage: Math.round((withWebsite / total) * 100),
      eventPagePercentage: Math.round((withEventPage / total) * 100)
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
  console.log('  GET /municipalities/stats - Get statistics');
  console.log('  GET /health - Health check');
});