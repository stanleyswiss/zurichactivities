import { eventScheduler } from './scheduler';

export interface MunicipalScrapeResult {
  results: any[];
  summary: {
    sources_attempted: number;
    sources_successful: number;
    total_events_found: number;
    total_events_saved: number;
    municipalities_scraped: number;
  };
}

async function fetchWorker(limit: number, maxDistance: number): Promise<MunicipalScrapeResult | null> {
  const workerUrl = process.env.RAILWAY_WORKER_URL;
  if (!workerUrl) {
    return null;
  }

  const token = process.env.RAILWAY_WORKER_TOKEN || process.env.WORKER_TOKEN;

  const response = await fetch(`${workerUrl.replace(/\/$/, '')}/scrape-municipalities`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { 'x-worker-token': token } : {}),
    },
    body: JSON.stringify({ limit, maxDistance }),
  });

  const text = await response.text();

  let payload: any;
  try {
    payload = JSON.parse(text);
  } catch (error) {
    throw new Error(`Worker response not JSON: ${text.slice(0, 200)}`);
  }

  if (!response.ok || payload?.success === false) {
    const message = payload?.error || `Worker scrape failed (${response.status})`;
    throw new Error(message);
  }

  if (!payload.results || !payload.summary) {
    throw new Error('Worker response missing results/summary');
  }

  return {
    results: payload.results,
    summary: payload.summary,
  };
}

function summarizeResults(results: any[]): MunicipalScrapeResult['summary'] {
  const sources_attempted = results.length;
  const sources_successful = results.filter((r) => r.success).length;
  const total_events_found = results.reduce((sum, r) => sum + (r.eventsFound || 0), 0);
  const total_events_saved = results.reduce((sum, r) => sum + (r.eventsSaved || 0), 0);
  const municipalities_scraped = results.reduce((sum, r) => sum + (r.municipalitiesScraped || 0), 0);

  return {
    sources_attempted,
    sources_successful,
    total_events_found,
    total_events_saved,
    municipalities_scraped,
  };
}

export async function runMunicipalScrape(limit: number, maxDistance: number): Promise<MunicipalScrapeResult> {
  const workerResult = await fetchWorker(limit, maxDistance);
  if (workerResult) {
    return workerResult;
  }

  const results = await eventScheduler.runMunicipalScrapers(limit, maxDistance);
  return {
    results,
    summary: summarizeResults(results),
  };
}
