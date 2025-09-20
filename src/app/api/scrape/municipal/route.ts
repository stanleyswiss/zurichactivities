import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { GOViSScraper } from '@/lib/scrapers/govis-scraper';

function isAuthorized(request: NextRequest) {
  const token = process.env.SCRAPE_TOKEN;
  if (!token) return true; // Allow if no token configured
  
  const auth = request.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7) === token;
  }
  
  const urlToken = request.nextUrl.searchParams.get('token');
  return urlToken === token;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '10');
  const maxDistance = parseInt(searchParams.get('maxDistance') || '50');
  const cmsType = searchParams.get('cmsType') || 'govis';
  
  let prisma: PrismaClient | null = null;
  
  try {
    const internalUrl = process.env.DATABASE_URL;
    const publicUrl = process.env.DATABASE_PUBLIC_URL;
    
    const dbUrl = internalUrl || publicUrl;
    
    if (!dbUrl) {
      throw new Error('No database URL available');
    }
    
    prisma = new PrismaClient({
      datasources: { db: { url: dbUrl } }
    });
    
    await prisma.$connect();
    
    let results;
    
    switch (cmsType) {
      case 'govis':
        const govisScraper = new GOViSScraper(prisma);
        results = await govisScraper.scrapeMultipleMunicipalities(limit, maxDistance);
        break;
        
      case 'all':
        // For now, only GOViS is implemented
        const allScraper = new GOViSScraper(prisma);
        results = await allScraper.scrapeMultipleMunicipalities(limit, maxDistance);
        break;
        
      default:
        return NextResponse.json({
          success: false,
          error: `Unknown CMS type: ${cmsType}. Supported: govis, all`
        }, { status: 400 });
    }
    
    return NextResponse.json({
      ...results,
      success: true,
      message: `Municipal scraping completed`
    });
    
  } catch (error) {
    console.error('Municipal scrape error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let prisma: PrismaClient | null = null;
  
  try {
    const body = await request.json();
    const { municipalityId, bfsNumber } = body;
    
    if (!municipalityId && !bfsNumber) {
      return NextResponse.json({
        success: false,
        error: 'Either municipalityId or bfsNumber is required'
      }, { status: 400 });
    }
    
    const internalUrl = process.env.DATABASE_URL;
    const publicUrl = process.env.DATABASE_PUBLIC_URL;
    
    const dbUrl = internalUrl || publicUrl;
    
    if (!dbUrl) {
      throw new Error('No database URL available');
    }
    
    prisma = new PrismaClient({
      datasources: { db: { url: dbUrl } }
    });
    
    await prisma.$connect();
    
    // Find the municipality
    const municipality = await prisma.municipality.findFirst({
      where: municipalityId ? { id: municipalityId } : { bfsNumber: parseInt(bfsNumber) }
    });
    
    if (!municipality) {
      return NextResponse.json({
        success: false,
        error: 'Municipality not found'
      }, { status: 404 });
    }
    
    if (!municipality.eventPageUrl) {
      return NextResponse.json({
        success: false,
        error: `No event page URL configured for ${municipality.name}`
      }, { status: 400 });
    }
    
    // Determine CMS type if not set
    let scraper;
    if (!municipality.cmsType || municipality.cmsType === 'govis') {
      scraper = new GOViSScraper(prisma);
    } else {
      // For now, default to GOViS
      scraper = new GOViSScraper(prisma);
    }
    
    const events = await scraper.scrapeMunicipality(municipality);
    
    return NextResponse.json({
      success: true,
      municipality: {
        id: municipality.id,
        name: municipality.name,
        canton: municipality.canton,
        eventPageUrl: municipality.eventPageUrl,
      },
      eventsFound: events.length,
      message: `Successfully scraped ${events.length} events from ${municipality.name}`
    });
    
  } catch (error) {
    console.error('Single municipality scrape error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}