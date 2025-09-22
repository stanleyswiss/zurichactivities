"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMunicipalScrape = runMunicipalScrape;
const scheduler_1 = require("./scheduler");
async function fetchWorker(limit, maxDistance) {
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
    let payload;
    try {
        payload = JSON.parse(text);
    }
    catch (error) {
        throw new Error(`Worker response not JSON: ${text.slice(0, 200)}`);
    }
    if (!response.ok || (payload === null || payload === void 0 ? void 0 : payload.success) === false) {
        const message = (payload === null || payload === void 0 ? void 0 : payload.error) || `Worker scrape failed (${response.status})`;
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
function summarizeResults(results) {
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
async function runMunicipalScrape(limit, maxDistance) {
    const workerResult = await fetchWorker(limit, maxDistance);
    if (workerResult) {
        return workerResult;
    }
    const results = await scheduler_1.eventScheduler.runMunicipalScrapers(limit, maxDistance);
    return {
        results,
        summary: summarizeResults(results),
    };
}
