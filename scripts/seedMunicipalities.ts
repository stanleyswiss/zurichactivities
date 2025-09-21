import 'dotenv/config';

import { PrismaClient } from '@prisma/client';
import fs from 'fs/promises';
import path from 'path';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

import { SwissMunicipalityService } from '../src/lib/scrapers/swiss-municipalities';
import { calculateDistance } from '../src/lib/utils/distance';

type EventSelectors = Record<string, unknown> | null;

type ExportedMunicipality = {
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
  eventSelectors: EventSelectors;
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
  lastScraped: string | null;
  lastSuccessful: string | null;
  scrapeStatus: string;
  scrapeError: string | null;
  eventCount: number;
  createdAt: string;
  updatedAt: string;
};

type ExportPayload = {
  generatedAt: string;
  municipalityCount: number;
  verifiedCount: number;
  cmsDistribution: Record<string, number>;
  municipalities: ExportedMunicipality[];
};

const proxyUrl = process.env.HTTPS_PROXY ?? process.env.HTTP_PROXY;
if (proxyUrl) {
  setGlobalDispatcher(new ProxyAgent(proxyUrl));
}

const prisma = new PrismaClient();

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL must be set to run the municipality seeding script.');
  }

  const service = new SwissMunicipalityService(prisma);

  const allowFallback = process.env.ALLOW_MUNICIPALITY_FALLBACK === 'true';

  console.log('Starting Swiss municipality seed with maxDistance=200km...');
  let seedResult;
  try {
    seedResult = await service.fetchAndStoreMunicipalities(200);
    console.log('Municipality seeding complete:', seedResult);
  } catch (error) {
    if (!allowFallback) {
      throw error;
    }

    console.warn(
      'Swiss municipality seed failed – attempting to fall back to bundled sample dataset because ALLOW_MUNICIPALITY_FALLBACK=true'
    );
    seedResult = await seedFromLocalDataset(200);
    console.log('Fallback seeding complete:', seedResult);
  }

  if ((!seedResult || seedResult.stored === 0) && !allowFallback) {
    throw new Error(
      'Swiss Post dataset returned no rows and fallback is disabled. Set ALLOW_MUNICIPALITY_FALLBACK=true to reuse the sample set temporarily.'
    );
  }

  const exportResult = await exportMunicipalities();
  console.log(
    `Exported ${exportResult.municipalityCount} municipalities ` +
      `(${exportResult.verifiedCount} with event pages) to ${exportResult.files.join(', ')}`
  );
}

type LocalMunicipality = {
  bfsNumber: number;
  name: string;
  canton: string;
  district?: string;
  lat: number;
  lon: number;
  websiteUrl?: string;
  population?: number;
};

type EnhancedMunicipality = {
  bfs_number: string;
  event_page_url?: string;
  event_page_pattern?: string;
  cms_type?: string;
  cms_version?: string;
  has_events?: boolean;
  scraping_method?: string;
  event_selectors?: Record<string, unknown>;
  date_format?: string;
  time_format?: string;
  language?: string;
  multilingual?: boolean;
  api_endpoint?: string | null;
  requires_javascript?: boolean;
  ajax_pagination?: boolean;
  structured_data?: boolean;
  robots_txt_compliant?: boolean;
  update_frequency?: string;
  average_events_monthly?: number;
  notes?: string;
};

async function seedFromLocalDataset(maxDistanceKm: number) {
  const rootDir = path.resolve(__dirname, '..');
  const basePath = path.join(rootDir, 'import_municipalities.json');
  const enhancedPath = path.join(rootDir, 'enhanced_sample.json');

  const [baseRaw, enhancedRaw] = await Promise.all([
    fs.readFile(basePath, 'utf-8'),
    fs.readFile(enhancedPath, 'utf-8').catch(() => 'null'),
  ]);

  const baseMunicipalities: LocalMunicipality[] = JSON.parse(baseRaw);
  const enhancedMunicipalities: EnhancedMunicipality[] = JSON.parse(enhancedRaw || 'null')?.municipalities ?? [];

  const enhancementsByBfs = new Map<number, EnhancedMunicipality>();
  for (const enhanced of enhancedMunicipalities) {
    const bfsNumber = Number.parseInt(enhanced.bfs_number, 10);
    if (Number.isFinite(bfsNumber)) {
      enhancementsByBfs.set(bfsNumber, enhanced);
    }
  }

  const schlierenLat = parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LAT ?? '47.396');
  const schlierenLon = parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LON ?? '8.447');

  let stored = 0;
  let skipped = 0;

  for (const municipality of baseMunicipalities) {
    if (!municipality.lat || !municipality.lon) {
      skipped++;
      continue;
    }

    const distance = calculateDistance(
      schlierenLat,
      schlierenLon,
      municipality.lat,
      municipality.lon
    );

    if (distance > maxDistanceKm) {
      skipped++;
      continue;
    }

    const enhancement = enhancementsByBfs.get(municipality.bfsNumber);

    await prisma.municipality.upsert({
      where: { bfsNumber: municipality.bfsNumber },
      create: {
        bfsNumber: municipality.bfsNumber,
        name: municipality.name,
        nameNorm: normalizeName(municipality.name),
        canton: municipality.canton,
        district: municipality.district ?? null,
        websiteUrl: municipality.websiteUrl ?? null,
        eventPageUrl: enhancement?.event_page_url ?? null,
        eventPagePattern: enhancement?.event_page_pattern ?? null,
        cmsType: enhancement?.cms_type ?? null,
        cmsVersion: enhancement?.cms_version ?? null,
        hasEvents: enhancement?.has_events ?? false,
        scrapingMethod: enhancement?.scraping_method ?? null,
        eventSelectors: enhancement?.event_selectors
          ? JSON.stringify(enhancement.event_selectors)
          : null,
        dateFormat: enhancement?.date_format ?? null,
        timeFormat: enhancement?.time_format ?? null,
        language: enhancement?.language ?? 'de',
        multilingual: enhancement?.multilingual ?? false,
        apiEndpoint: enhancement?.api_endpoint ?? null,
        requiresJavascript: enhancement?.requires_javascript ?? false,
        ajaxPagination: enhancement?.ajax_pagination ?? false,
        structuredData: enhancement?.structured_data ?? false,
        robotsTxtCompliant: enhancement?.robots_txt_compliant ?? true,
        updateFrequency: enhancement?.update_frequency ?? null,
        averageEventsMonthly: enhancement?.average_events_monthly ?? null,
        enhancedNotes: enhancement?.notes ?? null,
        population: municipality.population ?? null,
        lat: municipality.lat,
        lon: municipality.lon,
        distanceFromHome: distance,
        scrapeStatus: 'pending',
      },
      update: {
        name: municipality.name,
        nameNorm: normalizeName(municipality.name),
        canton: municipality.canton,
        district: municipality.district ?? null,
        websiteUrl: municipality.websiteUrl ?? null,
        eventPageUrl: enhancement?.event_page_url ?? null,
        eventPagePattern: enhancement?.event_page_pattern ?? null,
        cmsType: enhancement?.cms_type ?? null,
        cmsVersion: enhancement?.cms_version ?? null,
        hasEvents: enhancement?.has_events ?? false,
        scrapingMethod: enhancement?.scraping_method ?? null,
        eventSelectors: enhancement?.event_selectors
          ? JSON.stringify(enhancement.event_selectors)
          : null,
        dateFormat: enhancement?.date_format ?? null,
        timeFormat: enhancement?.time_format ?? null,
        language: enhancement?.language ?? 'de',
        multilingual: enhancement?.multilingual ?? false,
        apiEndpoint: enhancement?.api_endpoint ?? null,
        requiresJavascript: enhancement?.requires_javascript ?? false,
        ajaxPagination: enhancement?.ajax_pagination ?? false,
        structuredData: enhancement?.structured_data ?? false,
        robotsTxtCompliant: enhancement?.robots_txt_compliant ?? true,
        updateFrequency: enhancement?.update_frequency ?? null,
        averageEventsMonthly: enhancement?.average_events_monthly ?? null,
        enhancedNotes: enhancement?.notes ?? null,
        population: municipality.population ?? null,
        lat: municipality.lat,
        lon: municipality.lon,
        distanceFromHome: distance,
      },
    });

    stored++;
  }

  return { stored, skipped, total: baseMunicipalities.length };
}

async function exportMunicipalities(): Promise<ExportPayload & { files: string[] }> {
  const municipalities = await prisma.municipality.findMany({
    orderBy: [{ canton: 'asc' }, { name: 'asc' }],
  });

  const generatedAt = new Date().toISOString();

  const exportedMunicipalities: ExportedMunicipality[] = municipalities.map((municipality) => ({
    bfsNumber: municipality.bfsNumber,
    name: municipality.name,
    canton: municipality.canton,
    district: municipality.district ?? null,
    lat: municipality.lat,
    lon: municipality.lon,
    distanceFromHome: municipality.distanceFromHome,
    websiteUrl: municipality.websiteUrl ?? null,
    eventPageUrl: municipality.eventPageUrl ?? null,
    eventPagePattern: municipality.eventPagePattern ?? null,
    cmsType: municipality.cmsType ?? null,
    cmsVersion: municipality.cmsVersion ?? null,
    hasEvents: municipality.hasEvents,
    scrapingMethod: municipality.scrapingMethod ?? null,
    eventSelectors: parseEventSelectors(municipality.eventSelectors),
    dateFormat: municipality.dateFormat ?? null,
    timeFormat: municipality.timeFormat ?? null,
    language: municipality.language,
    multilingual: municipality.multilingual,
    apiEndpoint: municipality.apiEndpoint ?? null,
    requiresJavascript: municipality.requiresJavascript,
    ajaxPagination: municipality.ajaxPagination,
    structuredData: municipality.structuredData,
    robotsTxtCompliant: municipality.robotsTxtCompliant,
    updateFrequency: municipality.updateFrequency ?? null,
    averageEventsMonthly: municipality.averageEventsMonthly ?? null,
    enhancedNotes: municipality.enhancedNotes ?? null,
    population: municipality.population ?? null,
    lastScraped: municipality.lastScraped ? municipality.lastScraped.toISOString() : null,
    lastSuccessful: municipality.lastSuccessful ? municipality.lastSuccessful.toISOString() : null,
    scrapeStatus: municipality.scrapeStatus,
    scrapeError: municipality.scrapeError ?? null,
    eventCount: municipality.eventCount,
    createdAt: municipality.createdAt.toISOString(),
    updatedAt: municipality.updatedAt.toISOString(),
  }));

  const verifiedMunicipalities = exportedMunicipalities.filter(
    (municipality) => Boolean(municipality.eventPageUrl)
  );

  const cmsDistribution = exportedMunicipalities.reduce<Record<string, number>>((acc, muni) => {
    const key = muni.cmsType?.toLowerCase() ?? 'unknown';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  const exportPayload: ExportPayload = {
    generatedAt,
    municipalityCount: exportedMunicipalities.length,
    verifiedCount: verifiedMunicipalities.length,
    cmsDistribution,
    municipalities: exportedMunicipalities,
  };

  const versionedFilename = buildVersionedFilename(generatedAt);
  const rootDir = path.resolve(__dirname, '..');
  const dataDir = path.join(rootDir, 'data');

  await fs.mkdir(dataDir, { recursive: true });

  const filesWritten: string[] = [];

  // Write the versioned dataset under data/
  const versionedPath = path.join(dataDir, versionedFilename);
  await writeJsonFile(versionedPath, exportPayload);
  filesWritten.push(path.relative(rootDir, versionedPath));

  // Update the canonical JSON files at the project root
  await writeJsonFile(path.join(rootDir, 'real_municipalities.json'), exportPayload);
  filesWritten.push('real_municipalities.json');

  await writeJsonFile(path.join(rootDir, 'verified_municipalities.json'), {
    generatedAt,
    municipalityCount: verifiedMunicipalities.length,
    municipalities: verifiedMunicipalities,
  });
  filesWritten.push('verified_municipalities.json');

  await writeJsonFile(path.join(rootDir, 'municipality_sample_enhanced.json'),
    verifiedMunicipalities.slice(0, 25)
  );
  filesWritten.push('municipality_sample_enhanced.json');

  return { ...exportPayload, files: filesWritten };
}

function parseEventSelectors(value: string | null): EventSelectors {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn('Unable to parse event selectors JSON, returning raw string', error);
    return { raw: value };
  }
}

function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function buildVersionedFilename(timestampIso: string): string {
  const safeTimestamp = timestampIso.replace(/[:]/g, '-').replace(/\./g, '-');
  return `municipalities-${safeTimestamp}.json`;
}

async function writeJsonFile(filePath: string, data: unknown) {
  await fs.writeFile(filePath, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

main()
  .catch((error) => {
    console.error('Failed to seed Swiss municipalities', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
