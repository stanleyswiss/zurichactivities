import { NextRequest, NextResponse } from 'next/server';
import { eventScheduler } from '@/lib/scheduler';

interface ScrapeResult {
  source: string;
  success: boolean;
  events_found: number;
  events_saved: number;
  error?: string;
  duration_ms: number;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sources, force } = body;
    
    const requestedSources = sources || ['ST', 'LIMMATTAL'];
    
    // Use the scheduler to run scrapers
    const results = await eventScheduler.runAllScrapers(requestedSources, force);

    // Transform results to match expected format
    const transformedResults = results.map(result => ({
      source: result.source,
      success: result.success,
      events_found: result.eventsFound,
      events_saved: result.eventsSaved,
      duration_ms: result.duration,
      error: result.error
    }));

    const totalFound = results.reduce((sum, r) => sum + r.eventsFound, 0);
    const totalSaved = results.reduce((sum, r) => sum + r.eventsSaved, 0);
    const successfulSources = results.filter(r => r.success).length;

    return NextResponse.json({
      success: successfulSources > 0,
      results: transformedResults,
      summary: {
        sources_attempted: requestedSources.length,
        sources_successful: successfulSources,
        total_events_found: totalFound,
        total_events_saved: totalSaved
      }
    });
  } catch (error) {
    console.error('Scrape API error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to scrape events' },
      { status: 500 }
    );
  }
}