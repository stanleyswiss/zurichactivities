# Swiss municipality scraping dataset overview

The updated seeding workflow now pulls the authoritative Swiss Post catalogue directly instead of the bundled 28-row sample. When you run `yarn seed:municipalities` (locally or on Railway) the script will fetch every municipality, filter to the 200 km radius around Schlieren, upsert them into Prisma, and refresh the JSON artefacts.

## Expected snapshot after a successful run

- **Source API:** `https://public.opendatasoft.com` (`georef-switzerland-gemeinde` dataset, refined to year 2025)
- **Municipalities stored:** ~2,060 within 200 km of Schlieren (2,058 as of 2025-09-20)
- **Verified event sources (URL + selectors present):** 17 after the latest publish run – add more via `enhanced_sample.json`
- **Generated artefacts:**
  - `data/municipalities-<timestamp>.json`
  - `real_municipalities.json`
  - `verified_municipalities.json`
  - `municipality_sample_enhanced.json`

If the Swiss Post request fails the script now aborts rather than silently re-seeding the sample. You can temporarily set `ALLOW_MUNICIPALITY_FALLBACK=true` when you explicitly want to reuse the bundled 28-row dataset.

## Deploying the data to Vercel / Railway

1. **Seed the database** (with `DATABASE_URL` pointing at the target Postgres instance):
   ```bash
   yarn seed:municipalities
   ```
2. **Publish the enriched payload** to the hosted Next.js API once the seed completes:
   ```bash
   MUNICIPALITY_PUBLISH_URL="https://your-app.vercel.app" \
   MUNICIPALITY_PUBLISH_TOKEN="<SCRAPE_TOKEN>" \
   yarn publish:municipalities
   ```
   The script streams the payload in batches to `/api/municipalities/enhanced-import`, so Railway/Vercel receive the same canonical data stored locally.
3. **Verify counts** via the `/api/health` endpoint or Prisma studio – you should see ~2,060 municipalities with 17 verified event pages after the current run.

## Troubleshooting

- **Swiss Post outage / DNS issues:** Run the seed again once connectivity is restored. The deployment will now surface the failure instead of hiding it behind the sample dataset.
- **Body too large when publishing:** Adjust `MUNICIPALITY_PUBLISH_BATCH` (default 200) to send smaller chunks.
- **Need to work offline:** Set `ALLOW_MUNICIPALITY_FALLBACK=true` and optionally point `MUNICIPALITY_PUBLISH_SOURCE` at a cached JSON export.

## Verified municipalities (excerpt)

| BFS number | Municipality | CMS | Event page |
| --- | --- | --- | --- |
| 247 | Schlieren (ZH) | TYPO3 | https://www.schlieren.ch/de/aktuelles/veranstaltungen/ |
| 261 | Zürich (ZH) | Custom | https://www.stadt-zuerich.ch/de/aktuell/veranstaltungen.html |

Add additional selectors to `enhanced_sample.json` to expand the verified cohort – the seed script automatically incorporates any new BFS entries it finds there.
