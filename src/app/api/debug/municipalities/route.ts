import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  
  // Only allow with token for security
  if (token !== 'randomscrape123token') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Test database connection
    await db.$connect();
    
    const total = await db.municipality.count();
    const withWebsite = await db.municipality.count({
      where: { websiteUrl: { not: null } }
    });
    const withEventPage = await db.municipality.count({
      where: { eventPageUrl: { not: null } }
    });
    const withGovisCms = await db.municipality.count({
      where: { cmsType: 'govis' }
    });
    
    // Get the actual municipalities that should be scraped
    const scrapeable = await db.municipality.findMany({
      where: {
        eventPageUrl: { not: null },
        cmsType: 'govis',
        distanceFromHome: { lte: 100 },
        OR: [
          { lastScraped: null },
          { 
            lastScraped: { 
              lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
            } 
          },
        ],
      },
      select: {
        id: true,
        name: true,
        eventPageUrl: true,
        cmsType: true,
        distanceFromHome: true,
        lastScraped: true,
      },
      take: 10,
    });

    return NextResponse.json({
      dbConnection: 'SUCCESS',
      counts: {
        total,
        withWebsite,
        withEventPage,
        withGovisCms,
      },
      scrapeable: {
        count: scrapeable.length,
        municipalities: scrapeable,
      }
    });

  } catch (error) {
    return NextResponse.json({
      dbConnection: 'FAILED',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}