import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function isAuthorized(request: NextRequest) {
  const token = process.env.SCRAPE_TOKEN;
  if (!token) return true; // If no token configured, allow for now
  
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

  try {
    await db.$connect();
    
    const municipalities = await db.municipality.findMany({
      select: {
        id: true,
        bfsNumber: true,
        name: true,
        canton: true,
        distanceFromHome: true,
        websiteUrl: true,
        eventPageUrl: true,
        eventPagePattern: true,
        cmsType: true,
        scrapeStatus: true,
        lastScraped: true,
        eventCount: true,
        scrapeError: true,
      },
      orderBy: [
        { distanceFromHome: 'asc' },
      ],
    });

    return NextResponse.json({
      success: true,
      municipalities,
      total: municipalities.length,
    });

  } catch (error) {
    console.error('Municipality list error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}