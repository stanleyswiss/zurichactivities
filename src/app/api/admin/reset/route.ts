import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { eventScheduler } from '@/lib/scheduler';

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
  const sourcesToRun = sources.length > 0 ? sources : ['ST', 'LIMMATTAL'];

  const deletedEvents = await db.event.deleteMany({});
  let deletedCache = { count: 0 } as { count: number };
  try {
    if (clearCache) {
      // @ts-ignore - model exists if migration ran
      deletedCache = await (db as any).geocodeCache.deleteMany({});
    }
  } catch {}

  const results = await eventScheduler.runAllScrapers(sourcesToRun, true);
  const totalFound = results.reduce((s, r) => s + r.eventsFound, 0);
  const totalSaved = results.reduce((s, r) => s + r.eventsSaved, 0);

  return NextResponse.json({
    success: true,
    deleted_events: deletedEvents.count,
    deleted_cache: deletedCache.count,
    scrape: {
      sources: sourcesToRun,
      found: totalFound,
      saved: totalSaved,
      per_source: results.map(r => ({ source: r.source, found: r.eventsFound, saved: r.eventsSaved, ok: r.success, ms: r.duration, error: r.error }))
    }
  });
}

export async function POST(request: NextRequest) { return handle(request); }
export async function GET(request: NextRequest) { return handle(request); }

