import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { runMunicipalScrape } from '@/lib/municipal-scrape-runner';

function isAuthorized(request: NextRequest) {
  const token = process.env.SCRAPE_TOKEN;
  if (!token) return false;
  const auth = request.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7) === token;
  }
  const urlToken = request.nextUrl.searchParams.get('token');
  return urlToken === token;
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const clearCache = request.nextUrl.searchParams.get('clearCache') === '1';
  const sources = request.nextUrl.searchParams.getAll('source');
  let sourcesToRun = sources;
  if (!sourcesToRun || sourcesToRun.length === 0) {
    const envList = process.env.SOURCES_ENABLED?.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
    sourcesToRun = (envList && envList.length > 0) ? envList : ['LIMMATTAL'];
  }

  const deletedEvents = await db.event.deleteMany({});
  let deletedCache = { count: 0 } as { count: number };
  try {
    if (clearCache) {
      // @ts-ignore - model exists if migration ran
      deletedCache = await (db as any).geocodeCache.deleteMany({});
    }
  } catch {}

  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10) || 10;
  const maxDistance = parseInt(request.nextUrl.searchParams.get('maxDistance') || '200', 10) || 200;

  const { results, summary } = await runMunicipalScrape(limit, maxDistance);

  return NextResponse.json({
    success: true,
    deleted_events: deletedEvents.count,
    deleted_cache: deletedCache.count,
    scrape: {
      sources: sourcesToRun,
      found: summary.total_events_found,
      saved: summary.total_events_saved,
      per_source: results.map(r => ({ source: r.source, found: r.eventsFound, saved: r.eventsSaved, ok: r.success, ms: r.duration, error: r.error }))
    }
  });
}

export async function POST(request: NextRequest) { return handle(request); }
export async function GET(request: NextRequest) { return handle(request); }
