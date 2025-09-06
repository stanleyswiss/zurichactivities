import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    // Check database connection
    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Get event counts by source
    const eventCounts = await db.event.groupBy({
      by: ['source'],
      _count: {
        id: true
      }
    });

    // Get recent events count
    const recentEventsCount = await db.event.count({
      where: {
        createdAt: {
          gte: oneDayAgo
        }
      }
    });

    // Get total events count
    const totalEventsCount = await db.event.count();

    // Get upcoming events count
    const upcomingEventsCount = await db.event.count({
      where: {
        startTime: {
          gte: now
        }
      }
    });

    // Get oldest and newest events
    const oldestEvent = await db.event.findFirst({
      orderBy: {
        startTime: 'asc'
      },
      select: {
        startTime: true,
        createdAt: true
      }
    });

    const newestEvent = await db.event.findFirst({
      orderBy: {
        startTime: 'desc'
      },
      select: {
        startTime: true,
        createdAt: true
      }
    });

    // Transform event counts for easier consumption
    const sourceStats = eventCounts.reduce((acc, item) => {
      acc[item.source] = item._count.id;
      return acc;
    }, {} as Record<string, number>);

    return NextResponse.json({
      status: 'healthy',
      timestamp: now.toISOString(),
      database: {
        connected: true,
        total_events: totalEventsCount,
        upcoming_events: upcomingEventsCount,
        recent_events_24h: recentEventsCount
      },
      events: {
        by_source: sourceStats,
        date_range: {
          earliest: oldestEvent?.startTime,
          latest: newestEvent?.startTime
        },
        last_created: newestEvent?.createdAt
      },
      scrapers: {
        // In a real implementation, you might store last run times in database
        last_run: {
          ST: 'Not tracked yet',
          LIMMATTAL: 'Not tracked yet',
          ZURICH: 'Not tracked yet',
          MUNICIPAL: 'Not tracked yet'
        },
        next_scheduled_run: 'Vercel Cron: Daily at 6:00 AM'
      }
    });
  } catch (error) {
    console.error('Health check error:', error);
    return NextResponse.json(
      { 
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
}
