import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { filterByDistance, calculateDistance } from '@/lib/utils/distance';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = request.nextUrl;
    
    // Parse query parameters
    const from = searchParams.get('from') || new Date().toISOString().split('T')[0];
    const to = searchParams.get('to') || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const lat = parseFloat(searchParams.get('lat') || process.env.NEXT_PUBLIC_SCHLIEREN_LAT || '47.396');
    const lon = parseFloat(searchParams.get('lon') || process.env.NEXT_PUBLIC_SCHLIEREN_LON || '8.447');
    const radius = parseFloat(searchParams.get('radius') || '100');
    // Support multi-select filters
    const categories = searchParams.getAll('category').filter(Boolean);
    const sources = searchParams.getAll('source').filter(s => s !== 'COMPREHENSIVE');
    const lang = searchParams.get('lang') || 'de';

    // Build where clause
    const whereClause: any = {
      startTime: {
        gte: new Date(from),
        lte: new Date(to + 'T23:59:59.999Z')
      }
    };

    if (categories.length > 0) {
      whereClause.category = { in: categories };
    }

    if (sources.length > 0) {
      whereClause.source = { in: sources };
    }

    if (lang) {
      whereClause.lang = lang;
    }

    // Fetch events from database
    const events = await db.event.findMany({
      where: whereClause,
      orderBy: {
        startTime: 'asc'
      }
    });

    // Filter by distance if coordinates are provided
    const filteredEvents = filterByDistance(events, lat, lon, radius);

    // Add distance to each event
    const eventsWithDistance = filteredEvents.map(event => ({
      ...event,
      distance: event.lat && event.lon 
        ? Math.round(calculateDistance(lat, lon, event.lat, event.lon) * 10) / 10 
        : null
    }));

    return NextResponse.json({
      events: eventsWithDistance,
      total: eventsWithDistance.length,
      center: { lat, lon },
      radius
    });
  } catch (error) {
    console.error('Events API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch events' },
      { status: 500 }
    );
  }
}
