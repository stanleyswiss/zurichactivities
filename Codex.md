# Project Codex

**Last Updated:** September 22, 2025

## Current State
- **Frontend:** Next.js app on Vercel now routes the municipal scrape endpoint (`/api/scrape` and admin reset) to the Railway worker instead of running locally. The UI “Update Now” button triggers the worker with small batches (default 5 municipalities).
- **Railway Worker:** Running on Node 20, using the precompiled scraper bundle in `railway-worker/shared-lib`. Endpoints include `POST /scrape-municipalities`, `POST /find-websites`, `POST /find-event-pages`, and `POST /seed-municipalities`. Worker authentication uses `WORKER_TOKEN` / `RAILWAY_WORKER_TOKEN`.
- **Shared Library:** Scraper logic is compiled ahead of time via `node build-shared-lib.js`. Artifacts live under `dist/shared-lib` and are vendored into the worker.
- **Dataset:** Prisma contains 2,058 municipalities with website/event-page metadata imported from the enriched JSON. Many entries still have stale event URLs (404 responses) or missing selectors, so the current scrape success rate is low.
- **Events:** Successful scrapes persist to PostgreSQL via `AIMunicipalScraper`. The code no longer writes non-existent fields (`apiEndpoint`, `scrapingMethod`) to older schemas.

## Outstanding Issues
- Numerous `eventPageUrl` values in the database return HTTP 404. These require verification or replacement.
- Selectors for many municipalities are missing or incorrect, resulting in zero extracted events.
- No cron jobs are yet configured to run discovery/scraping automatically.
- Logs do not currently collect a structured list of failed municipalities for follow-up.

## Next Actions
1. **Run validation endpoints regularly**
   - `POST /find-websites` and `POST /find-event-pages` (via worker) to refresh website/event-page URLs.
   - Integrate these into a Railway cron job or GitHub Action.
2. **Schedule scraping batches**
   - Add a recurring job hitting `POST /scrape-municipalities` with appropriate `limit`/`maxDistance` so events stay current without manual clicks.
3. **Clean the dataset**
   - For municipalities that still 404 after automated discovery, update `enhanced_full.json` (or its generator) with working URLs or mark them as unknown.
   - Capture selectors for validated pages and feed them back into the enrichment flow.
4. **Monitor failures**
   - Extend the worker to log failed municipalities (404s, zero events) into a table or log stream for prioritised manual review.
5. **Regenerate and publish data**
   - Once URLs/selectors are updated, re-run `yarn seed:municipalities`, `node build-shared-lib.js`, and `yarn publish:municipalities` to keep Vercel and Railway in sync.
6. **Optional improvements**
   - Add reporting UI for scrape status metrics.
   - Introduce throttling/backoff when repeated 404s occur to avoid wasted requests.

Keep this file updated as the source of truth before each development session.
