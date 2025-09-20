# Swiss municipality scraping dataset overview

The `scripts/seedMunicipalities.ts` utility fetches the Swiss Post municipality catalogue (with automatic fallbacks for offline environments), upserts every commune within 200 km of Schlieren into Prisma, and exports a canonical dataset that powers the JSON artefacts checked into this repository. Run it locally or on Railway with `npm run seed:municipalities` once the `DATABASE_URL` environment variable points at your database.

## Latest snapshot

- **Data export:** `data/municipalities-2025-09-20T16-29-51-621Z.json`
- **Generated at:** 2025-09-20T16:29:51.621Z
- **Municipalities stored:** 28 (within 200 km of Schlieren)
- **Verified event sources (URL + selectors present):** 2

The `real_municipalities.json` file mirrors the latest snapshot so other tooling can depend on a stable path, while `verified_municipalities.json` isolates the communes that already have working event pages, CMS attribution, and selectors. A compact preview of those enriched rows lives in `municipality_sample_enhanced.json` for quick inspection and documentation examples.

## CMS distribution

| CMS type | Count | Share |
| --- | ---: | ---: |
| Unknown / not yet analysed | 26 | 92.9% |
| Custom | 1 | 3.6% |
| TYPO3 | 1 | 3.6% |

Two municipalities already have validated event pipelines (Schlieren on TYPO3 and the custom Zürich deployment). As additional communes are verified the script will automatically refresh these aggregates.

## Verified municipalities (excerpt)

| BFS number | Municipality | CMS | Event page |
| --- | --- | --- | --- |
| 247 | Schlieren (ZH) | TYPO3 | https://www.schlieren.ch/de/aktuelles/veranstaltungen/ |
| 261 | Zürich (ZH) | Custom | https://www.stadt-zuerich.ch/de/aktuell/veranstaltungen.html |

Refer to `verified_municipalities.json` for the full enriched payload (including scraping selectors, JS requirements, structured data flags, and update frequency metadata).

## Refresh workflow

1. Ensure `DATABASE_URL` is configured (locally or on Railway) and run `npm install` once to install dependencies.
2. Execute `npm run seed:municipalities` to fetch (or fall back to the bundled sample), upsert, and re-export the dataset.
3. Commit the regenerated JSON files under the repository root and `data/` together with any documentation updates so the statistics above always reflect the stored data.
