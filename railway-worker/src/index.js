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
    
    // Fetch municipalities from official Swiss GeoAdmin API
    const response = await fetch(
      'https://api3.geo.admin.ch/rest/services/api/MapServer/ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill?geometryType=esriGeometryEnvelope&geometry=485000,75000,835000,300000&outFields=*&returnGeometry=true&f=geojson&where=jahr=2024'
    );
    
    if (!response.ok) {
      throw new Error(`GeoAdmin API error: ${response.status}`);
    }

    const data = await response.json();
    
    const schlierenLat = 47.396;
    const schlierenLon = 8.447;
    
    let stored = 0;
    let skipped = 0;
    
    // Process GeoJSON features
    for (const feature of data.features) {
      const props = feature.properties;
      const geometry = feature.geometry;
      
      if (!geometry || !geometry.coordinates) {
        skipped++;
        continue;
      }
      
      // Calculate centroid for polygon geometry
      let centerLat, centerLon;
      if (geometry.type === 'Polygon') {
        const coords = geometry.coordinates[0]; // First ring of polygon
        let latSum = 0, lonSum = 0;
        for (const coord of coords) {
          lonSum += coord[0];
          latSum += coord[1];
        }
        centerLat = latSum / coords.length;
        centerLon = lonSum / coords.length;
        
        // Convert Swiss coordinates to WGS84 (approximate)
        const lat = 46.95240 + ((centerLat - 200000) * 10.82e-6);
        const lon = 2.67825 + ((centerLon - 600000) * 10.90e-6);
        centerLat = lat;
        centerLon = lon;
      } else {
        skipped++;
        continue;
      }
      
      // Calculate distance using simple formula
      const distance = Math.sqrt(
        Math.pow((centerLat - schlierenLat) * 111, 2) + 
        Math.pow((centerLon - schlierenLon) * 111 * Math.cos(centerLat * Math.PI / 180), 2)
      );
      
      if (distance <= maxDistance) {
        // Extract BFS number from ID field (format: "bfsnr-year")
        const bfsNumber = parseInt(props.id.split('-')[0]);
        
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
            district: null, // Not available in this dataset
            lat: centerLat,
            lon: centerLon,
            distanceFromHome: distance,
            scrapeStatus: 'pending',
          },
          update: {
            name: props.gemname,
            nameNorm,
            canton: props.kanton,
            lat: centerLat,
            lon: centerLon,
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