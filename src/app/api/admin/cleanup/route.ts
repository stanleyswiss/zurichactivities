import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

function isAuthorized(request: NextRequest) {
  const token = process.env.SCRAPE_TOKEN;
  if (!token) return false;
  
  const urlToken = request.nextUrl.searchParams.get('token');
  const authHeader = request.headers.get('authorization');
  
  return urlToken === token || (authHeader && authHeader === `Bearer ${token}`);
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    // Count existing events by source
    const eventCounts = await db.event.groupBy({
      by: ['source'],
      _count: {
        id: true
      }
    });
    
    console.log('Current events by source:', eventCounts);
    
    // Delete all events that came from Railway web scraping
    // Keep only ST (API) and LIMMATTAL (HTML) events
    const deleteResult = await db.event.deleteMany({
      where: {
        NOT: {
          source: {
            in: ['ST', 'LIMMATTAL']
          }
        }
      }
    });
    
    // Also delete any ST events that look like they came from web scraping
    const deleteWebScrapedST = await db.event.deleteMany({
      where: {
        source: 'ST',
        OR: [
          { description: { contains: 'Mehr erfahren über:' } },
          { description: { contains: 'Title not found' } },
          { title: { contains: 'Mehr erfahren über:' } }
        ]
      }
    });
    
    // Count remaining events
    const remainingCounts = await db.event.groupBy({
      by: ['source'],
      _count: {
        id: true
      }
    });
    
    // Get sample of remaining events to verify
    const sampleEvents = await db.event.findMany({
      where: { source: 'ST' },
      select: {
        title: true,
        category: true,
        city: true,
        startTime: true
      },
      take: 10,
      orderBy: { startTime: 'asc' }
    });
    
    return NextResponse.json({
      success: true,
      before: eventCounts,
      deleted: {
        nonApiEvents: deleteResult.count,
        webScrapedST: deleteWebScrapedST.count
      },
      after: remainingCounts,
      sampleEvents: sampleEvents.map(e => ({
        title: e.title,
        category: e.category,
        city: e.city,
        date: e.startTime.toISOString().split('T')[0]
      }))
    });
    
  } catch (error) {
    console.error('Cleanup error:', error);
    return NextResponse.json(
      { error: 'Failed to cleanup database', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}