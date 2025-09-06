import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    // Check if Event table exists and count records
    const eventCount = await db.event.count();
    
    // Get a sample of events if any exist
    const sampleEvents = await db.event.findMany({
      take: 3,
      select: {
        id: true,
        title: true,
        source: true,
        startTime: true,
        city: true
      }
    });
    
    return NextResponse.json({
      success: true,
      eventCount,
      sampleEvents,
      message: `Found ${eventCount} events in database`
    });
  } catch (error) {
    console.error('Debug error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  }
}