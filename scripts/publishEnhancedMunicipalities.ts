import 'dotenv/config';

import fs from 'fs/promises';
import path from 'path';

const DEFAULT_SOURCE_FILE = 'real_municipalities.json';
const DEFAULT_BATCH_SIZE = 200;

interface RealMunicipality {
  bfsNumber: number;
  name: string;
  canton: string;
  district: string | null;
  lat: number;
  lon: number;
  distanceFromHome: number;
  websiteUrl: string | null;
  eventPageUrl: string | null;
  eventPagePattern: string | null;
  cmsType: string | null;
  cmsVersion: string | null;
  hasEvents: boolean;
  scrapingMethod: string | null;
  eventSelectors: Record<string, unknown> | null;
  dateFormat: string | null;
  timeFormat: string | null;
  language: string;
  multilingual: boolean;
  apiEndpoint: string | null;
  requiresJavascript: boolean;
  ajaxPagination: boolean;
  structuredData: boolean;
  robotsTxtCompliant: boolean;
  updateFrequency: string | null;
  averageEventsMonthly: number | null;
  enhancedNotes: string | null;
  population: number | null;
}

interface RealMunicipalityPayload {
  generatedAt: string;
  municipalityCount: number;
  municipalities: RealMunicipality[];
}

function resolveSourcePath(): string {
  const override = process.env.MUNICIPALITY_PUBLISH_SOURCE?.trim();
  const target = override && override.length > 0 ? override : DEFAULT_SOURCE_FILE;
  return path.resolve(process.cwd(), target);
}

function resolveBatchSize(): number {
  const override = Number.parseInt(process.env.MUNICIPALITY_PUBLISH_BATCH ?? '', 10);
  return Number.isFinite(override) && override > 0 ? override : DEFAULT_BATCH_SIZE;
}

type EnhancedMunicipalityRow = {
  bfs_number: string;
  name: string;
  canton: string;
  profile?: string;
  website_url: string | null;
  event_page_url: string | null;
  cms_type?: string;
  scraping_method?: string;
  event_selectors?: Record<string, unknown>;
  date_format?: string;
  time_format?: string;
  language?: string[];
  requires_javascript?: boolean;
  ajax_pagination?: boolean;
  structured_data?: boolean;
  notes?: string;
  [key: string]: unknown;
};

type DatasetPayload =
  | RealMunicipalityPayload
  | {
      municipalities: EnhancedMunicipalityRow[];
      errors?: unknown[];
      generatedAt?: string;
      municipalityCount?: number;
    };

async function readMunicipalityDataset(filePath: string): Promise<DatasetPayload> {
  const raw = await fs.readFile(filePath, 'utf-8');
  return JSON.parse(raw);
}

function isRealMunicipality(entry: any): entry is RealMunicipality {
  return typeof entry?.bfsNumber === 'number';
}

function buildEnhancedPayload(dataset: DatasetPayload) {
  const list = dataset.municipalities ?? [];

  if (list.length === 0) {
    return [];
  }

  if (isRealMunicipality(list[0])) {
    const municipalities = list as RealMunicipality[];
    return municipalities.map((muni) => ({
      bfs_number: String(muni.bfsNumber),
      name: muni.name,
      canton: muni.canton,
      district: muni.district ?? undefined,
      latitude: muni.lat,
      longitude: muni.lon,
      population: muni.population ?? undefined,
      website_url: muni.websiteUrl ?? undefined,
      event_page_url: muni.eventPageUrl ?? undefined,
      event_page_pattern: muni.eventPagePattern ?? undefined,
      cms_type: muni.cmsType ?? 'unknown',
      cms_version: muni.cmsVersion ?? undefined,
      has_events: muni.hasEvents,
      scraping_method: muni.scrapingMethod ?? 'unknown',
      event_selectors: muni.eventSelectors ?? undefined,
      date_format: muni.dateFormat ?? undefined,
      time_format: muni.timeFormat ?? undefined,
      language: muni.language ?? 'de',
      multilingual: muni.multilingual ?? false,
      api_endpoint: muni.apiEndpoint ?? undefined,
      requires_javascript: muni.requiresJavascript,
      ajax_pagination: muni.ajaxPagination,
      structured_data: muni.structuredData,
      robots_txt_compliant: muni.robotsTxtCompliant,
      update_frequency: muni.updateFrequency ?? undefined,
      average_events_monthly: muni.averageEventsMonthly ?? undefined,
      notes: muni.enhancedNotes ?? undefined,
    }));
  }

  const enhanced = list as EnhancedMunicipalityRow[];
  return enhanced.map((muni) => ({
    bfs_number: String(muni.bfs_number),
    name: muni.name,
    canton: muni.canton,
    website_url: muni.website_url ?? undefined,
    event_page_url: muni.event_page_url ?? undefined,
    cms_type: muni.cms_type ?? 'unknown',
    scraping_method: muni.scraping_method ?? muni.profile ?? 'unknown',
    event_selectors: muni.event_selectors ?? undefined,
    date_format: muni.date_format ?? undefined,
    time_format: muni.time_format ?? undefined,
    language:
      typeof muni.language === 'string'
        ? muni.language
        : Array.isArray(muni.language) && muni.language.length > 0
        ? muni.language[0]
        : 'de',
    multilingual: Array.isArray(muni.language) ? muni.language.length > 1 : false,
    requires_javascript: Boolean(muni.requires_javascript),
    ajax_pagination: Boolean(muni.ajax_pagination),
    structured_data: Boolean(muni.structured_data),
    notes: muni.notes ?? undefined,
    has_events: Boolean(muni.event_page_url && Object.keys(muni.event_selectors ?? {}).length > 0),
    profile: muni.profile,
  }));
}

async function pushBatch(baseUrl: string, token: string, batch: unknown[], index: number, total: number) {
  const targetUrl = new URL('/api/municipalities/enhanced-import', baseUrl);
  targetUrl.searchParams.set('token', token);

  const response = await fetch(targetUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ municipalities: batch }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Failed to publish batch ${index + 1}/${total}: ${response.status} ${response.statusText} – ${errorBody}`);
  }

  const payload = await response.json();

  if (payload?.success === false) {
    throw new Error(
      `Batch ${index + 1}/${total} failed: ${payload.error ?? 'unknown error'} ` +
        `${payload.details ? JSON.stringify(payload.details) : ''}`
    );
  }

  console.log(
    `Published batch ${index + 1}/${total}: ${payload.imported ?? 0} imported, ${payload.updated ?? 0} updated, ${payload.skipped ?? 0} skipped`
  );
  if (index === 0) {
    console.log('Sample response payload:', JSON.stringify(payload));
  }
}

async function main() {
  const baseUrl = process.env.MUNICIPALITY_PUBLISH_URL;
  if (!baseUrl) {
    throw new Error('MUNICIPALITY_PUBLISH_URL must be set to the Vercel deployment (e.g. https://your-app.vercel.app).');
  }

  const token = process.env.MUNICIPALITY_PUBLISH_TOKEN ?? process.env.SCRAPE_TOKEN;
  if (!token) {
    throw new Error('Set MUNICIPALITY_PUBLISH_TOKEN or SCRAPE_TOKEN so the enhanced import endpoint authorises the request.');
  }

  const sourcePath = resolveSourcePath();
  const batchSize = resolveBatchSize();

  console.log(`Loading municipality dataset from ${sourcePath}...`);
  const dataset = await readMunicipalityDataset(sourcePath);
  const normalized = buildEnhancedPayload(dataset);
  const total = normalized.length;
  console.log(`Preparing ${total} municipalities for publish...`);

  const totalBatches = Math.ceil(total / batchSize);
  for (let index = 0; index < totalBatches; index++) {
    const start = index * batchSize;
    const end = Math.min(start + batchSize, total);
    const batch = normalized.slice(start, end);
    await pushBatch(baseUrl, token, batch, index, totalBatches);
  }

  console.log('All municipality batches published successfully.');
}

main().catch((error) => {
  console.error('Failed to publish enhanced municipalities', error);
  process.exitCode = 1;
});
