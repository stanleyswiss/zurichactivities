import * as cheerio from 'cheerio';
import { ProxyAgent } from 'undici';
import { db } from '@/lib/db';

const EVENT_KEYWORDS = [
  'veranstaltung',
  'veranstaltungen',
  'veranstaltungskalender',
  'events',
  'event',
  'agenda',
  'anlass',
  'anlässe',
  'anlaesse',
  'kalender',
  'termine',
  'manifestation',
  'manifestations',
  'manifestaziun',
  'manifestaziuns',
  'événement',
  'événements',
  'evenement',
  'evenements',
  'eventi',
  'manifestazioni',
  'occurrenzas',
  'appuntamenti',
  'agenda eventi',
  'freizeit',
  'kultur',
  'loisirs',
  'temps libre',
  'temps-libre',
];

const CMS_SPECIFIC_SELECTORS: Record<string, string[]> = {
  govis: ['.content-teaser', '.veranstaltung-item', '.event-item'],
  onegov_cloud: ['.onegov-event', 'article[data-event-id]'],
  typo3: ['.tx-sfeventmgt .event-item', '.tx-calendarize .cal-event', '.tx-t3events .event', '.tx-news-article', '.event-item'],
  localcities: ['.localcities-event', '.lc-event-card', '[data-municipality-id]'],
  drupal: ['.event-item', '.node-event', '.view-content .views-row'],
};

const GENERIC_EVENT_SELECTORS = [
  '.event-list',
  '.event-item',
  '.event',
  '.veranstaltung',
  '.veranstaltungen',
  '.agenda-item',
  '.calendar',
  '.cal-event',
  '.elementEventList',
  '.elementEvent',
  '.elementEventDates',
  '[class*="event-list"]',
  '[class*="veranstaltung"]',
  '[data-event-id]'
];

const CMS_API_ENDPOINTS: Record<string, string[]> = {
  onegov_cloud: ['/api/events.json', '/agenda.json', '/events.json'],
};

const SEARCH_ENDPOINTS = [
  '/search?q=veranstaltungen',
  '/suche?q=veranstaltungen',
  '/recherche?q=evenements',
  '/ricerca?q=eventi',
];

const REQUEST_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; ZurichActivitiesBot/1.0; +https://zurichactivities.vercel.app)',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
};

const PROXY_AGENT = (() => {
  const proxyUrl =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy ||
    null;

  if (!proxyUrl) return undefined;

  try {
    return new ProxyAgent(proxyUrl);
  } catch (error) {
    console.warn('Failed to configure proxy agent:', error instanceof Error ? error.message : error);
    return undefined;
  }
})();

interface CandidateLink {
  url: string;
  source: 'homepage' | 'sitemap' | 'search';
  score: number;
  text?: string;
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveUrl(base: string, href?: string | null) {
  if (!href) return null;
  if (href.startsWith('#')) return null;
  if (href.startsWith('javascript:')) return null;

  try {
    return new URL(href, base).toString();
  } catch (error) {
    return null;
  }
}

function computeKeywordScore(text: string, href: string) {
  const normalizedText = normalizeText(text);
  const normalizedHref = normalizeText(href);

  let score = 0;
  for (const keyword of EVENT_KEYWORDS) {
    if (normalizedText.includes(keyword)) {
      score += keyword.length > 8 ? 4 : 3;
      if (normalizedText.startsWith(keyword)) score += 2;
    }

    if (normalizedHref.includes(keyword)) {
      score += keyword.length > 8 ? 3 : 2;
    }
  }

  return score;
}

async function fetchWithTimeout(url: string, timeout = 10000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const requestInit: RequestInit & { dispatcher?: any } = {
      headers: REQUEST_HEADERS,
      signal: controller.signal,
    };

    if (PROXY_AGENT) {
      requestInit.dispatcher = PROXY_AGENT;
    }

    const response = await fetch(url, requestInit);
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

function collectHomepageCandidates($: cheerio.CheerioAPI, baseUrl: string, cmsHint?: string | null) {
  const base = new URL(baseUrl);
  const candidates = new Map<string, CandidateLink>();

  $('a').each((_, element) => {
    const text = $(element).text().trim();
    const href = $(element).attr('href');
    const titleAttr = $(element).attr('title');

    const resolved = resolveUrl(baseUrl, href);
    if (!resolved) return;

    const candidateUrl = new URL(resolved);
    if (candidateUrl.protocol !== 'https:' && candidateUrl.protocol !== 'http:') return;

    const scoreFromText = computeKeywordScore(text || '', resolved);
    const scoreFromTitle = computeKeywordScore(titleAttr || '', resolved);

    let score = scoreFromText + scoreFromTitle;

    if (
      candidateUrl.hostname === base.hostname ||
      candidateUrl.hostname.endsWith(`.${base.hostname.split('.').slice(-2).join('.')}`)
    ) {
      score += 1;
    }

    if (cmsHint === 'localcities' && candidateUrl.hostname.includes('localcities')) {
      score += 3;
    }

    if (score <= 0) return;

    const existing = candidates.get(resolved);
    if (!existing || existing.score < score) {
      candidates.set(resolved, {
        url: resolved,
        source: 'homepage',
        score,
        text,
      });
    }
  });

  return Array.from(candidates.values()).sort((a, b) => b.score - a.score);
}

async function discoverFromSitemap(baseUrl: string): Promise<CandidateLink[]> {
  try {
    const sitemapUrl = new URL('/sitemap.xml', baseUrl).toString();
    const response = await fetchWithTimeout(sitemapUrl, 8000);
    if (!response.ok) return [];

    const xml = await response.text();
    const matches = xml.matchAll(/<loc>([^<]+)<\/loc>/g);
    const candidates: CandidateLink[] = [];
    for (const match of matches) {
      const url = match[1];
      const score = computeKeywordScore(url, url);
      if (score > 0) {
        candidates.push({
          url,
          source: 'sitemap',
          score,
        });
      }
    }

    return candidates.sort((a, b) => b.score - a.score).slice(0, 5);
  } catch (error) {
    console.warn('Failed to read sitemap for', baseUrl, error instanceof Error ? error.message : error);
    return [];
  }
}

function buildSearchCandidates(baseUrl: string): CandidateLink[] {
  return SEARCH_ENDPOINTS.map((endpoint) => ({
    url: new URL(endpoint, baseUrl).toString(),
    source: 'search',
    score: 1,
  }));
}

function countSelectorMatches($: cheerio.CheerioAPI, selectors: string[]) {
  const matchedSelectors: string[] = [];
  let total = 0;

  for (const selector of selectors) {
    const count = $(selector).length;
    if (count > 0) {
      matchedSelectors.push(selector);
      total += count;
    }
  }

  return { total, matchedSelectors };
}

function hasEventJsonLd($: cheerio.CheerioAPI) {
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    const content = $(script).contents().text();
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data)) {
        if (data.some((entry) => entry['@type'] === 'Event')) {
          return true;
        }
      } else if (data && typeof data === 'object') {
        const type = (data as any)['@type'];
        if (type === 'Event' || (Array.isArray(type) && type.includes('Event'))) {
          return true;
        }
        const graph = (data as any)['@graph'];
        if (Array.isArray(graph) && graph.some((entry: any) => entry['@type'] === 'Event')) {
          return true;
        }
      }
    } catch (error) {
      // Ignore JSON parse errors
    }
  }

  return false;
}

async function checkApiEndpoint(url: string): Promise<boolean> {
  try {
    const response = await fetchWithTimeout(url, 8000);
    if (!response.ok) return false;

    const text = await response.text();
    try {
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        return data.length > 0;
      }

      const events = (data as any).events || (data as any).items || (data as any).results || (data as any).data;
      if (Array.isArray(events)) {
        return events.length > 0;
      }

      return false;
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

function computeConfidence(options: {
  cmsType?: string | null;
  eventCount: number;
  hasJsonLd: boolean;
  apiEndpoint?: string | null;
}) {
  let score = 0;
  if (options.eventCount >= 5) score += 0.4;
  else if (options.eventCount >= 2) score += 0.3;
  else if (options.eventCount > 0) score += 0.2;

  if (options.hasJsonLd) score += 0.2;
  if (options.apiEndpoint) score += 0.2;

  if (options.cmsType && options.cmsType !== 'unknown') {
    score += 0.1;
  }

  return Math.min(score, 0.95);
}

export function detectCMSType(html: string, url: string): string {
  const htmlLower = html.toLowerCase();
  const urlLower = url.toLowerCase();

  if (htmlLower.includes('govis') || htmlLower.includes('gov-is') || htmlLower.includes('govis.ch')) return 'govis';
  if (htmlLower.includes('onegov') || htmlLower.includes('plonetheme.onegovbear') || htmlLower.includes('ftw.simplelayout')) {
    return 'onegov_cloud';
  }
  if (htmlLower.includes('typo3') || htmlLower.includes('typo3conf') || htmlLower.includes('tx-news')) return 'typo3';
  if (htmlLower.includes('localcities') || urlLower.includes('localcities')) return 'localcities';
  if (htmlLower.includes('drupal') || htmlLower.includes('drupal.js')) return 'drupal';
  if (htmlLower.includes('wordpress') || htmlLower.includes('wp-content') || htmlLower.includes('wp-includes')) return 'wordpress';
  if (htmlLower.includes('joomla') || htmlLower.includes('joomla!')) return 'joomla';
  if (urlLower.includes('i-web') || htmlLower.includes('i-web') || htmlLower.includes('iweb')) return 'i-web';
  if (htmlLower.includes('cmsbox') || htmlLower.includes('cms-box')) return 'cmsbox';
  if (htmlLower.includes('next') && htmlLower.includes('react')) return 'nextjs';
  if (htmlLower.includes('vue.js') || htmlLower.includes('vuejs')) return 'vue';
  if (htmlLower.includes('angular')) return 'angular';

  return 'unknown';
}

export async function verifyMunicipalityEventPage(municipality: any) {
  if (!municipality.websiteUrl) {
    return {
      success: false,
      error: 'Missing website URL',
      confidence: 0,
    };
  }

  console.log(`Discovering event page for ${municipality.name} (${municipality.websiteUrl})`);

  const homepageResponse = await fetchWithTimeout(municipality.websiteUrl);
  if (!homepageResponse.ok) {
    return {
      success: false,
      error: `Homepage responded with status ${homepageResponse.status}`,
      confidence: 0,
    };
  }

  const homepageHtml = await homepageResponse.text();
  const $homepage = cheerio.load(homepageHtml);
  const homepageCms = detectCMSType(homepageHtml, municipality.websiteUrl);

  let candidates: CandidateLink[] = [];

  const homepageCandidates = collectHomepageCandidates($homepage, municipality.websiteUrl, municipality.cmsType);
  candidates = candidates.concat(homepageCandidates);

  const sitemapCandidates = await discoverFromSitemap(municipality.websiteUrl);
  candidates = candidates.concat(sitemapCandidates);

  const searchCandidates = buildSearchCandidates(municipality.websiteUrl);
  candidates = candidates.concat(searchCandidates);

  if (!candidates.length) {
    return {
      success: false,
      error: 'No candidates discovered',
      confidence: 0,
    };
  }

  candidates = candidates.slice(0, 10);

  let lastError: string | null = null;

  for (const candidate of candidates) {
    try {
      const response = await fetchWithTimeout(candidate.url, 15000);
      if (!response.ok) {
        lastError = `Candidate responded with ${response.status}`;
        continue;
      }

      const html = await response.text();
      const $ = cheerio.load(html);

      let cmsType = detectCMSType(html, candidate.url);
      if ((!cmsType || cmsType === 'unknown') && homepageCms) {
        cmsType = homepageCms;
      }

      const cmsSelectors = cmsType ? CMS_SPECIFIC_SELECTORS[cmsType] ?? [] : [];
      const { total: cmsMatches, matchedSelectors } = countSelectorMatches($, cmsSelectors);

      let eventCount = cmsMatches;
      let activeSelectors = matchedSelectors.slice();

      if (eventCount === 0) {
        const generic = countSelectorMatches($, GENERIC_EVENT_SELECTORS);
        eventCount = generic.total;
        activeSelectors = generic.matchedSelectors;
      }

      const hasJsonLd = hasEventJsonLd($);

      let apiEndpoint: string | null = null;
      if (cmsType && CMS_API_ENDPOINTS[cmsType]) {
        for (const endpoint of CMS_API_ENDPOINTS[cmsType]) {
          const apiUrl = new URL(endpoint, candidate.url).toString();
          const ok = await checkApiEndpoint(apiUrl);
          if (ok) {
            apiEndpoint = apiUrl;
            break;
          }
        }
      }

      const success = eventCount > 0 || hasJsonLd || Boolean(apiEndpoint);
      const confidence = success
        ? computeConfidence({ cmsType, eventCount, hasJsonLd, apiEndpoint })
        : 0;

      if (!success) {
        lastError = 'No event signals detected';
        console.warn(`Candidate ${candidate.url} for ${municipality.name} did not expose events`);
        continue;
      }

      const eventUrl = candidate.url;
      const pattern = (() => {
        try {
          return new URL(eventUrl).pathname || null;
        } catch (error) {
          return null;
        }
      })();

      const updateData: any = {
        eventPageUrl: eventUrl,
        eventPagePattern: pattern,
        cmsType: cmsType || 'unknown',
        eventPageConfidence: confidence,
      };

      if (apiEndpoint) {
        updateData.apiEndpoint = apiEndpoint;
      }

      await db.municipality.update({
        where: { id: municipality.id },
        data: updateData,
      });

      console.log(
        `✓ Found event page for ${municipality.name}: ${eventUrl} (cms=${cmsType}, confidence=${confidence.toFixed(2)})`
      );

      return {
        success: true,
        eventPageUrl: eventUrl,
        eventPagePattern: pattern,
        cmsType,
        confidence,
        apiEndpoint,
        selectors: activeSelectors,
        source: candidate.source,
      };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'Unknown error';
      console.warn(`Error inspecting candidate ${candidate.url} for ${municipality.name}:`, lastError);
    }
  }

  console.warn(`Failed to discover event page for ${municipality.name}: ${lastError || 'no candidates matched'}`);

  return {
    success: false,
    error: lastError || 'No event pages detected',
    confidence: 0,
  };
}
