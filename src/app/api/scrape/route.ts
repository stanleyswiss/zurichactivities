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

function isAuthorized(request: NextRequest) {
  const token = process.env.SCRAPE_TOKEN;
  // Allow Vercel Cron GETs (has x-vercel-cron header)
  const isVercelCron = request.headers.has('x-vercel-cron');
  if (isVercelCron) return true;
  if (!token) return true; // If no token configured, allow for now
  const auth = request.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7) === token;
  }
  const urlToken = request.nextUrl.searchParams.get('token');
  return urlToken === token;
}

export async function POST(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
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

export async function GET(request: NextRequest) {
  try {
    if (!isAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const { searchParams } = request.nextUrl;
    const sources = searchParams.getAll('source');
    const forceParam = searchParams.get('force');
    const force = forceParam === '1' || forceParam === 'true';

    const requestedSources = sources.length > 0 ? sources : ['ST', 'LIMMATTAL'];

    const results = await eventScheduler.runAllScrapers(requestedSources, force);

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
    console.error('Scrape API GET error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to scrape events' },
      { status: 500 }
    );
  }
}
