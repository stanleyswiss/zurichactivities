import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { verifyMunicipalityEventPage } from './helpers';

function isAuthorized(request: NextRequest) {
  const token = process.env.SCRAPE_TOKEN;
  if (!token) return false;
  const urlToken = request.nextUrl.searchParams.get('token');
  return urlToken === token;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { 
      type = 'websites', // 'websites' or 'event-pages'
      limit = 10,
      maxDistance = 50 
    } = await request.json();

    console.log(`Starting bulk ${type} verification for ${limit} municipalities...`);

    if (type === 'websites') {
      return await verifyWebsites(limit, maxDistance);
    } else if (type === 'event-pages') {
      return await verifyEventPages(limit, maxDistance);
    } else {
      return NextResponse.json({
        success: false,
        error: 'Invalid type. Use "websites" or "event-pages"'
      }, { status: 400 });
    }

  } catch (error) {
    console.error('Bulk verification error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}

async function verifyWebsites(limit: number, maxDistance: number) {
  // Get municipalities that need website verification
  const municipalities = await db.municipality.findMany({
    where: {
      distanceFromHome: { lte: maxDistance },
      OR: [
        { websiteUrl: null },
        { 
          // Re-verify websites that might have changed
          updatedAt: { 
            lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // 7 days ago
          }
        }
      ]
    },
    orderBy: { distanceFromHome: 'asc' },
    take: limit,
  });

  const results = {
    processed: 0,
    verified: 0,
    found: 0,
    failed: 0,
    municipalities: [] as any[]
  };

  console.log(`Verifying websites for ${municipalities.length} municipalities...`);

  for (const muni of municipalities) {
    const result = await verifyMunicipalityWebsite(muni);
    results.processed++;
    
    if (result.success) {
      results.verified++;
      if (result.websiteUrl) {
        results.found++;
      }
    } else {
      results.failed++;
    }
    
    results.municipalities.push({
      name: muni.name,
      canton: muni.canton,
      distance: muni.distanceFromHome,
      ...result
    });

    // Be polite to servers
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  return NextResponse.json({
    success: true,
    type: 'websites',
    results
  });
}

async function verifyEventPages(limit: number, maxDistance: number) {
  // Get municipalities with websites but no event pages
  const municipalities = await db.municipality.findMany({
    where: {
      websiteUrl: { not: null },
      eventPageUrl: null,
      distanceFromHome: { lte: maxDistance },
    },
    orderBy: { distanceFromHome: 'asc' },
    take: limit,
  });

  const results = {
    processed: 0,
    found: 0,
    failed: 0,
    municipalities: [] as any[]
  };

  console.log(`Verifying event pages for ${municipalities.length} municipalities...`);

  for (const muni of municipalities) {
    const result = await verifyMunicipalityEventPage(muni);
    results.processed++;
    
    if (result.success) {
      results.found++;
    } else {
      results.failed++;
    }
    
    results.municipalities.push({
      name: muni.name,
      canton: muni.canton,
      distance: muni.distanceFromHome,
      websiteUrl: muni.websiteUrl,
      ...result
    });

    // Be polite to servers
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  return NextResponse.json({
    success: true,
    type: 'event-pages',
    results
  });
}

async function verifyMunicipalityWebsite(municipality: any) {
  const patterns = [
    `https://www.${municipality.nameNorm}.ch`,
    `https://${municipality.nameNorm}.ch`,
    `https://www.gemeinde-${municipality.nameNorm}.ch`,
    `https://www.stadt-${municipality.nameNorm}.ch`,
    // Use existing URL if available
    municipality.websiteUrl
  ].filter(Boolean);

  let websiteUrl = null;
  let error = null;

  for (const url of patterns) {
    try {
      console.log(`Testing ${municipality.name}: ${url}`);
      
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch(url, { 
        method: 'HEAD',
        signal: controller.signal,
      });
      
      if (response.ok) {
        websiteUrl = url;
        
        // Update in database
        await db.municipality.update({
          where: { id: municipality.id },
          data: { websiteUrl: url },
        });
        
        console.log(`✓ Verified website for ${municipality.name}: ${url}`);
        break;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
      // Try next pattern
    }
  }

  return {
    success: websiteUrl !== null,
    websiteUrl,
    error: websiteUrl ? null : error
  };
}
