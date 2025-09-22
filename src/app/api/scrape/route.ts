import { NextRequest, NextResponse } from 'next/server';
import { eventScheduler } from '@/lib/scheduler';

function isAuthorized(request: NextRequest) {
  const token = process.env.SCRAPE_TOKEN;
  const isVercelCron = request.headers.has('x-vercel-cron');
  
  // Allow Vercel cron
  if (isVercelCron) return true;
  
  // Allow UI requests from the same domain (zurichactivities.vercel.app)
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  const isUIRequest = origin && host && (
    origin.includes(host) || 
    origin.includes('zurichactivities.vercel.app') ||
    host.includes('zurichactivities.vercel.app')
  );
  
  if (isUIRequest) return true;
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
    
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const limit = Math.min(parseInt(body?.limit ?? '0', 10) || 5, 10);
    const maxDistance = parseInt(body?.maxDistance ?? '100', 10) || 100;
    
    // Run municipal scrapers
    const results = await eventScheduler.runMunicipalScrapers(limit, maxDistance);

    const totalFound = results.reduce((sum, r) => sum + r.eventsFound, 0);
    const totalSaved = results.reduce((sum, r) => sum + r.eventsSaved, 0);
    const successfulSources = results.filter(r => r.success).length;

    return NextResponse.json({
      success: successfulSources > 0,
      results,
      summary: {
        sources_attempted: results.length,
        sources_successful: successfulSources,
        total_events_found: totalFound,
        total_events_saved: totalSaved,
        municipalities_scraped: results[0]?.municipalitiesScraped || 0
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
    const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10), 10);
    const maxDistance = parseInt(searchParams.get('maxDistance') || '100', 10);

    const results = await eventScheduler.runMunicipalScrapers(limit, maxDistance);

    const totalFound = results.reduce((sum, r) => sum + r.eventsFound, 0);
    const totalSaved = results.reduce((sum, r) => sum + r.eventsSaved, 0);
    const successfulSources = results.filter(r => r.success).length;

    return NextResponse.json({
      success: successfulSources > 0,
      results,
      summary: {
        sources_attempted: results.length,
        sources_successful: successfulSources,
        total_events_found: totalFound,
        total_events_saved: totalSaved,
        municipalities_scraped: results[0]?.municipalitiesScraped || 0
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
