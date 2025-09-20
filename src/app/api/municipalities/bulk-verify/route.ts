import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

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
    
    if (result.eventPageUrl) {
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

async function verifyMunicipalityEventPage(municipality: any) {
  const eventPatterns = [
    '/veranstaltungen',
    '/events',
    '/agenda',
    '/anlaesse',
    '/kalender',
    '/termine',
    '/event',
    '/veranstaltung'
  ];

  let eventPageUrl = null;
  let eventPagePattern = null;
  let cmsType = null;
  let error = null;

  for (const pattern of eventPatterns) {
    const url = municipality.websiteUrl + pattern;
    
    try {
      console.log(`Testing event page: ${url}`);
      
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 8000);
      
      const response = await fetch(url, {
        signal: controller.signal,
      });
      
      if (response.ok) {
        const html = await response.text();
        
        // Detect CMS type from HTML
        cmsType = detectCMSType(html, url);
        
        eventPageUrl = url;
        eventPagePattern = pattern;
        
        // Update in database
        await db.municipality.update({
          where: { id: municipality.id },
          data: { 
            eventPageUrl: url,
            eventPagePattern: pattern,
            cmsType: cmsType || 'unknown',
          },
        });
        
        console.log(`✓ Found event page for ${municipality.name}: ${url} (${cmsType})`);
        break;
      }
    } catch (e) {
      error = e instanceof Error ? e.message : 'Unknown error';
      // Try next pattern
    }
  }

  return {
    success: eventPageUrl !== null,
    eventPageUrl,
    eventPagePattern,
    cmsType,
    error: eventPageUrl ? null : error
  };
}

function detectCMSType(html: string, url: string): string {
  const htmlLower = html.toLowerCase();
  
  // Check for common CMS signatures
  if (htmlLower.includes('drupal') || htmlLower.includes('drupal.js')) return 'drupal';
  if (htmlLower.includes('wordpress') || htmlLower.includes('wp-content') || htmlLower.includes('wp-includes')) return 'wordpress';
  if (htmlLower.includes('typo3') || htmlLower.includes('typo3conf')) return 'typo3';
  if (htmlLower.includes('joomla') || htmlLower.includes('joomla!')) return 'joomla';
  
  // Check for Swiss municipal CMS patterns
  if (url.includes('i-web') || htmlLower.includes('i-web') || htmlLower.includes('iweb')) return 'i-web';
  if (htmlLower.includes('govis') || htmlLower.includes('gov-is')) return 'govis';
  if (htmlLower.includes('cmsbox') || htmlLower.includes('cms-box')) return 'cmsbox';
  
  // Check for frameworks
  if (htmlLower.includes('react') && htmlLower.includes('next')) return 'nextjs';
  if (htmlLower.includes('vue.js') || htmlLower.includes('vuejs')) return 'vue';
  if (htmlLower.includes('angular')) return 'angular';
  
  return 'unknown';
}