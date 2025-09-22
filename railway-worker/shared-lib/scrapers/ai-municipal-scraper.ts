import { PrismaClient, Event, Municipality } from '@prisma/client';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { calculateDistance } from '../utils/distance';
import {
  resolveCMSConfiguration,
  mergeEventSelectors,
  resolveApiEndpoint,
  getDefaultScrapingMethod,
} from './municipal-cms-config';
import { fetchMunicipalEventsFromAPI } from './municipal-api';
import {
  MunicipalityScrapingConfig,
  StructuredMunicipalEvent,
  MunicipalityEventSelectors,
} from './municipal-types';
import { parseMunicipalDate } from './municipal-utils';

const SCHLIEREN_COORDS = {
  lat: parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LAT || '47.396'),
  lon: parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LON || '8.447'),
};

interface ExtractedEvent {
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  location?: string;
  url?: string;
  imageUrl?: string;
  category?: string;
  price?: string;
  organizer?: string;
}

interface EventExtractionResult {
  events: ExtractedEvent[];
  confidence: number;
  method: string;
  errors: string[];
}

export class AIMunicipalScraper {
  private prisma: PrismaClient;
  
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async scrapeMunicipality(municipality: Municipality): Promise<Event[]> {
    if (!municipality.eventPageUrl) {
      throw new Error(`No event page URL for ${municipality.name}`);
    }

    console.log(`🤖 AI Scraping events from ${municipality.name} (${municipality.eventPageUrl})`);

    const cmsConfig = resolveCMSConfiguration(municipality.cmsType);
    const selectors = mergeEventSelectors(municipality, cmsConfig);
    const apiEndpoint = resolveApiEndpoint(municipality, cmsConfig);
    const scrapingMethod =
      getDefaultScrapingMethod(municipality, cmsConfig) ||
      municipality.scrapingMethod ||
      (apiEndpoint ? 'api-extraction' : 'ai-hybrid');

    const requiresDynamic = Boolean(municipality.requiresJavascript || municipality.ajaxPagination);
    let usedHeadless = false;
    let headlessMessage: string | null = null;
    let detectedCmsType = municipality.cmsType || 'unknown';

    try {
      if (apiEndpoint) {
        const apiResult = await this.tryScrapeViaApi(
          municipality,
          selectors,
          apiEndpoint,
          scrapingMethod
        );

        if (apiResult) {
          const cmsForUpdate = municipality.cmsType || detectedCmsType;
          await this.updateMunicipalityAfterScrape(municipality, apiResult.dbEvents, {
            cmsType: cmsForUpdate,
            selectors,
            apiEndpoint,
            scrapingMethod,
            usedHeadless: false,
            headlessMessage: null,
          });

          return apiResult.dbEvents;
        }

        console.log(
          `API endpoint for ${municipality.name} returned no events, continuing with HTML strategies.`
        );
      }

      let html: string | null = null;

      if (requiresDynamic) {
        try {
          html = await this.renderWithHeadless(municipality.eventPageUrl);
          usedHeadless = true;
          headlessMessage = `Headless fallback executed at ${new Date().toISOString()}`;
          console.log(`Headless rendering succeeded for ${municipality.name}.`);
        } catch (headlessError) {
          console.warn(`Headless rendering failed for ${municipality.name}:`, headlessError);
        }
      }

      if (!html) {
        const response = await fetch(municipality.eventPageUrl);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        html = await response.text();
      }

      const $ = cheerio.load(html);
      detectedCmsType = municipality.cmsType || this.detectCMSType($, municipality.eventPageUrl);

      const strategies: Array<() => Promise<EventExtractionResult>> = [];

      if (selectors) {
        strategies.push(() =>
          Promise.resolve(this.extractFromConfiguredSelectors($, selectors, municipality))
        );
      }

      strategies.push(
        () => Promise.resolve(this.extractFromStructuredData($)),
        () => Promise.resolve(this.extractFromCommonSelectors($)),
        () => Promise.resolve(this.extractFromTables($)),
        () => Promise.resolve(this.extractFromLists($)),
        () => Promise.resolve(this.extractFromCards($)),
        () => this.extractWithAIHeuristics($, municipality)
      );

      let bestResult: EventExtractionResult = {
        events: [],
        confidence: 0,
        method: 'none',
        errors: []
      };

      for (const strategy of strategies) {
        try {
          const result = await strategy();
          console.log(
            `Strategy ${result.method}: ${result.events.length} events, confidence: ${result.confidence}`
          );

          if (result.confidence > bestResult.confidence && result.events.length > 0) {
            bestResult = result;
          }
        } catch (error) {
          console.log(`Strategy failed:`, error);
        }
      }

      console.log(
        `🎯 Best strategy: ${bestResult.method} with ${bestResult.events.length} events (confidence: ${bestResult.confidence})`
      );

      const dbEvents = await this.persistExtractedEvents(bestResult.events, municipality);

      await this.updateMunicipalityAfterScrape(municipality, dbEvents, {
        cmsType: detectedCmsType,
        selectors,
        apiEndpoint,
        scrapingMethod,
        usedHeadless,
        headlessMessage,
      });

      return dbEvents;
    } catch (error) {
      console.error(`Error scraping ${municipality.name}:`, error);

      const baseMessage = error instanceof Error ? error.message : 'Unknown error';
      const combinedMessage =
        usedHeadless && headlessMessage ? `${baseMessage} | ${headlessMessage}` : baseMessage;

      await this.prisma.municipality.update({
        where: { id: municipality.id },
        data: {
          lastScraped: new Date(),
          scrapeStatus: 'failed',
          scrapeError: combinedMessage,
        },
      });

      throw error;
    }
  }

  private async tryScrapeViaApi(
    municipality: Municipality,
    selectors: MunicipalityEventSelectors | null,
    apiEndpoint: string,
    scrapingMethod: string
  ): Promise<{ extracted: ExtractedEvent[]; dbEvents: Event[] } | null> {
    const config = this.buildApiScrapingConfig(
      municipality,
      selectors,
      apiEndpoint,
      scrapingMethod
    );
    const structuredEvents = await fetchMunicipalEventsFromAPI(config);

    if (!structuredEvents || structuredEvents.length === 0) {
      return null;
    }

    console.log(
      `API extraction returned ${structuredEvents.length} events for ${municipality.name}`
    );

    const extractedEvents = this.mapStructuredEventsToExtracted(structuredEvents);
    if (extractedEvents.length === 0) {
      return null;
    }

    const dbEvents = await this.persistExtractedEvents(extractedEvents, municipality);
    if (dbEvents.length === 0) {
      console.log(
        `API extraction for ${municipality.name} yielded events outside the persistence window`
      );
      return null;
    }

    console.log(`Persisted ${dbEvents.length} API events for ${municipality.name}`);

    return { extracted: extractedEvents, dbEvents };
  }

  private buildApiScrapingConfig(
    municipality: Municipality,
    selectors: MunicipalityEventSelectors | null,
    apiEndpoint: string,
    scrapingMethod: string
  ): MunicipalityScrapingConfig {
    return {
      id: municipality.id,
      name: municipality.name,
      eventPageUrl: municipality.eventPageUrl!,
      cmsType: municipality.cmsType || 'unknown',
      scrapingMethod,
      eventSelectors: selectors,
      apiEndpoint,
      dateFormat: municipality.dateFormat || undefined,
      language: municipality.language,
      requiresJavascript: municipality.requiresJavascript || municipality.ajaxPagination,
      notes: municipality.enhancedNotes || undefined,
    };
  }

  private mapStructuredEventsToExtracted(
    events: StructuredMunicipalEvent[]
  ): ExtractedEvent[] {
    const mapped: ExtractedEvent[] = [];

    for (const event of events) {
      if (!event.startTime) {
        continue;
      }

      mapped.push({
        title: event.title,
        description: event.description,
        startDate: event.startTime,
        endDate: event.endTime,
        location: event.venueName || event.location,
        url: event.url,
        category: undefined,
        imageUrl: undefined,
        price: event.price,
        organizer: event.organizer,
      });
    }

    return mapped;
  }

  private async persistExtractedEvents(
    events: ExtractedEvent[],
    municipality: Municipality
  ): Promise<Event[]> {
    const dbEvents: Event[] = [];

    for (const event of events) {
      const dbEvent = await this.convertToDbEvent(event, municipality);
      if (dbEvent) {
        dbEvents.push(dbEvent);
      }
    }

    return dbEvents;
  }

  private async updateMunicipalityAfterScrape(
    municipality: Municipality,
    dbEvents: Event[],
    options: {
      cmsType?: string;
      selectors?: MunicipalityEventSelectors | null;
      apiEndpoint?: string | null;
      scrapingMethod?: string | null;
      usedHeadless?: boolean;
      headlessMessage?: string | null;
    }
  ) {
    const data: any = {
      lastScraped: new Date(),
      eventCount: dbEvents.length,
      scrapeStatus: options.usedHeadless ? 'headless-active' : 'active',
      scrapeError: options.usedHeadless ? options.headlessMessage : null,
    };

    if (dbEvents.length > 0) {
      data.lastSuccessful = new Date();
      data.hasEvents = true;
    }

    if (options.cmsType) {
      data.cmsType = options.cmsType;
    }

    if (options.selectors) {
      data.eventSelectors = JSON.stringify(options.selectors);
    }

    if (options.apiEndpoint !== undefined) {
      data.apiEndpoint = options.apiEndpoint;
    }

    if (options.scrapingMethod) {
      data.scrapingMethod = options.scrapingMethod;
    }

    await this.prisma.municipality.update({
      where: { id: municipality.id },
      data,
    });
  }

  private extractFromConfiguredSelectors(
    $: cheerio.CheerioAPI,
    selectors: MunicipalityEventSelectors,
    municipality: Municipality
  ): EventExtractionResult {
    if (!selectors.container) {
      return {
        events: [],
        confidence: 0,
        method: 'cms-selectors',
        errors: ['No container selector defined'],
      };
    }

    const events: ExtractedEvent[] = [];

    $(selectors.container).each((_, element) => {
      const $event = $(element);

      const title = this.extractTextFromSelector($event, selectors.title || 'h1, h2, h3');
      if (!title) {
        return;
      }

      const datetimeAttr = $event.find('time[datetime]').first().attr('datetime');
      const dateText = this.extractTextFromSelector($event, selectors.date || '') || undefined;

      let startDate: Date | null = null;
      let endDate: Date | null = null;

      if (datetimeAttr) {
        const parsedDate = new Date(datetimeAttr);
        if (!isNaN(parsedDate.getTime())) {
          startDate = parsedDate;
        }
      }

      if (!startDate && dateText) {
        startDate = parseMunicipalDate(dateText, municipality.dateFormat || undefined);
      }

      if (!startDate && dateText) {
        const range = this.extractDatesFromText(dateText);
        startDate = range.start;
        endDate = range.end;
      }

      if (!startDate) {
        return;
      }

      const location = this.extractTextFromSelector($event, selectors.location || '.location, .ort');
      const description = this.extractTextFromSelector($event, selectors.description || 'p');
      const organizer = this.extractTextFromSelector($event, selectors.organizer || '.organizer');

      let url: string | undefined;
      const href = $event.find('a').first().attr('href');
      if (href) {
        const base = municipality.eventPageUrl ?? municipality.websiteUrl ?? undefined;
        try {
          url = base ? new URL(href, base).toString() : new URL(href).toString();
        } catch (error) {
          url = href.startsWith('http') ? href : undefined;
        }
      }

      events.push({
        title: title.trim(),
        description: description || undefined,
        startDate,
        endDate: endDate || undefined,
        location: location || municipality.name,
        url,
        organizer: organizer || undefined,
      });
    });

    return {
      events,
      confidence: events.length > 0 ? 0.9 : 0,
      method: 'cms-selectors',
      errors: [],
    };
  }

  private extractTextFromSelector(
    $element: cheerio.Cheerio<any>,
    selector?: string
  ): string | null {
    if (!selector) return null;

    const selectors = selector.split(',').map(sel => sel.trim());

    for (const sel of selectors) {
      if (!sel) continue;

      const candidate = sel === '&self' ? $element : $element.find(sel).first();
      if (candidate && candidate.length > 0) {
        const text = candidate.text().trim();
        if (text) {
          return text;
        }
      }
    }

    return null;
  }

  private async renderWithHeadless(url: string): Promise<string> {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    try {
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForLoadState('networkidle');
      const content = await page.content();
      await browser.close();
      return content;
    } catch (error) {
      await browser.close();
      throw error;
    }
  }

  private extractFromStructuredData($: cheerio.CheerioAPI): EventExtractionResult {
    const events: ExtractedEvent[] = [];
    
    // Look for JSON-LD structured data
    $('script[type="application/ld+json"]').each((_, script) => {
      try {
        const data = JSON.parse($(script).html() || '');
        if (data['@type'] === 'Event' || (Array.isArray(data) && data.some(item => item['@type'] === 'Event'))) {
          const eventData = Array.isArray(data) ? data.filter(item => item['@type'] === 'Event') : [data];
          
          for (const event of eventData) {
            if (event.name && event.startDate) {
              events.push({
                title: event.name,
                description: event.description,
                startDate: new Date(event.startDate),
                endDate: event.endDate ? new Date(event.endDate) : undefined,
                location: event.location?.name || event.location?.address?.addressLocality,
                url: event.url,
                imageUrl: event.image?.url || event.image,
                category: event.category,
              });
            }
          }
        }
      } catch (e) {
        // Not valid JSON-LD, continue
      }
    });
    
    return {
      events,
      confidence: events.length > 0 ? 0.95 : 0,
      method: 'structured-data',
      errors: []
    };
  }

  private extractFromCommonSelectors($: cheerio.CheerioAPI): EventExtractionResult {
    const events: ExtractedEvent[] = [];
    const selectors = [
      '.event', '.veranstaltung', '.termin', '.agenda-item',
      '[class*="event"]', '[class*="veranstaltung"]', '[class*="termin"]',
      'article', '.post', '.entry', '.item'
    ];
    
    for (const selector of selectors) {
      const elements = $(selector);
      if (elements.length > 0) {
        elements.each((_, element) => {
          const event = this.extractEventFromElement($, $(element));
          if (event) {
            events.push(event);
          }
        });
        
        if (events.length > 0) {
          break; // Found events with this selector
        }
      }
    }
    
    return {
      events,
      confidence: events.length > 0 ? 0.8 : 0,
      method: 'common-selectors',
      errors: []
    };
  }

  private extractFromTables($: cheerio.CheerioAPI): EventExtractionResult {
    const events: ExtractedEvent[] = [];
    
    $('table').each((_, table) => {
      const rows = $(table).find('tr');
      if (rows.length < 2) return; // Need at least header + 1 row
      
      rows.each((i, row) => {
        if (i === 0) return; // Skip header
        
        const cells = $(row).find('td, th');
        if (cells.length >= 2) {
          const event = this.extractEventFromTableRow($, cells);
          if (event) {
            events.push(event);
          }
        }
      });
    });
    
    return {
      events,
      confidence: events.length > 0 ? 0.75 : 0,
      method: 'table-extraction',
      errors: []
    };
  }

  private extractFromLists($: cheerio.CheerioAPI): EventExtractionResult {
    const events: ExtractedEvent[] = [];
    
    $('ul, ol').each((_, list) => {
      const items = $(list).find('li');
      if (items.length > 0) {
        items.each((_, item) => {
          const event = this.extractEventFromElement($, $(item));
          if (event) {
            events.push(event);
          }
        });
      }
    });
    
    return {
      events,
      confidence: events.length > 0 ? 0.7 : 0,
      method: 'list-extraction',
      errors: []
    };
  }

  private extractFromCards($: cheerio.CheerioAPI): EventExtractionResult {
    const events: ExtractedEvent[] = [];
    const cardSelectors = [
      '.card', '.box', '.panel', '.tile', '.widget',
      '[class*="card"]', '[class*="box"]', '[class*="widget"]'
    ];
    
    for (const selector of cardSelectors) {
      $(selector).each((_, element) => {
        const event = this.extractEventFromElement($, $(element));
        if (event) {
          events.push(event);
        }
      });
    }
    
    return {
      events,
      confidence: events.length > 0 ? 0.6 : 0,
      method: 'card-extraction',
      errors: []
    };
  }

  private async extractWithAIHeuristics($: cheerio.CheerioAPI, municipality: Municipality): Promise<EventExtractionResult> {
    const events: ExtractedEvent[] = [];
    
    // Advanced heuristics: look for date patterns and event-like content
    const dateRegex = /\b(\d{1,2}\.?\d{1,2}\.?\d{2,4}|\d{4}-\d{2}-\d{2})\b/g;
    const eventKeywords = ['veranstaltung', 'event', 'termin', 'festival', 'konzert', 'workshop', 'kurs', 'meeting', 'treffen'];
    
    // Find all elements containing dates
    const elementsWithDates: cheerio.Cheerio<any>[] = [];
    $('*').each((_, element) => {
      const text = $(element).text();
      if (dateRegex.test(text) && eventKeywords.some(keyword => text.toLowerCase().includes(keyword))) {
        elementsWithDates.push($(element));
      }
    });
    
    for (const element of elementsWithDates) {
      const event = this.extractEventFromElement($, element);
      if (event) {
        events.push(event);
      }
    }
    
    return {
      events,
      confidence: events.length > 0 ? 0.5 : 0,
      method: 'ai-heuristics',
      errors: []
    };
  }

  private extractEventFromElement($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): ExtractedEvent | null {
    const text = element.text().trim();
    if (!text || text.length < 10) return null;
    
    // Extract title
    const titleSelectors = ['h1', 'h2', 'h3', 'h4', '.title', '.name', 'a'];
    let title = '';
    for (const selector of titleSelectors) {
      const found = element.find(selector).first().text().trim();
      if (found && found.length < 200) {
        title = found;
        break;
      }
    }
    if (!title) {
      title = text.split('\n')[0].trim().substring(0, 100);
    }
    
    // Extract dates using pattern matching
    const dates = this.extractDatesFromText(text);
    if (!dates.start) return null;
    
    // Extract location
    const locationSelectors = ['.location', '.ort', '.venue', '.address'];
    let location = '';
    for (const selector of locationSelectors) {
      const found = element.find(selector).first().text().trim();
      if (found) {
        location = found;
        break;
      }
    }
    
    // Extract URL
    const link = element.find('a').first().attr('href');
    let url = '';
    if (link) {
      url = link.startsWith('http') ? link : '';
    }
    
    // Extract description
    const description = element.find('p, .description, .summary').first().text().trim();
    
    return {
      title,
      description: description || undefined,
      startDate: dates.start,
      endDate: dates.end || undefined,
      location: location || undefined,
      url: url || undefined,
    };
  }

  private extractEventFromTableRow($: cheerio.CheerioAPI, cells: cheerio.Cheerio<any>): ExtractedEvent | null {
    if (cells.length < 2) return null;
    
    const dateText = cells.eq(0).text().trim();
    const nameCell = cells.eq(1);
    const title = nameCell.text().trim();
    
    if (!title || title.length < 3) return null;
    
    const dates = this.extractDatesFromText(dateText);
    if (!dates.start) return null;
    
    const location = cells.length > 2 ? cells.eq(2).text().trim() : undefined;
    const organizer = cells.length > 3 ? cells.eq(3).text().trim() : undefined;
    
    const eventUrl = nameCell.find('a').first().attr('href');
    
    return {
      title,
      startDate: dates.start,
      endDate: dates.end || undefined,
      location,
      description: organizer ? `Organisiert von: ${organizer}` : undefined,
      url: eventUrl || undefined,
    };
  }

  private extractDatesFromText(text: string): { start: Date | null; end: Date | null } {
    // Swiss date patterns
    const patterns = [
      // DD.MM.YYYY or DD.MM.YY
      /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/g,
      // YYYY-MM-DD
      /(\d{4})-(\d{2})-(\d{2})/g,
    ];
    
    const dates: Date[] = [];
    
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        let day, month, year;
        
        if (match[0].includes('-')) {
          // ISO format YYYY-MM-DD
          year = parseInt(match[1]);
          month = parseInt(match[2]) - 1; // JS months are 0-indexed
          day = parseInt(match[3]);
        } else {
          // Swiss format DD.MM.YYYY
          day = parseInt(match[1]);
          month = parseInt(match[2]) - 1;
          year = parseInt(match[3]);
          if (year < 100) year += 2000; // Convert YY to YYYY
        }
        
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime()) && date.getFullYear() >= 2020 && date.getFullYear() <= 2030) {
          dates.push(date);
        }
      }
    }
    
    dates.sort((a, b) => a.getTime() - b.getTime());
    
    return {
      start: dates.length > 0 ? dates[0] : null,
      end: dates.length > 1 ? dates[1] : null,
    };
  }

  private detectCMSType($: cheerio.CheerioAPI, url: string): string {
    const html = $.html();
    
    // Check for common CMS signatures
    if (html.includes('drupal') || html.includes('Drupal')) return 'drupal';
    if (html.includes('wordpress') || html.includes('wp-content')) return 'wordpress';
    if (html.includes('typo3') || html.includes('TYPO3')) return 'typo3';
    if (html.includes('joomla') || html.includes('Joomla')) return 'joomla';
    if (html.includes('govCMS') || html.includes('govcms')) return 'govcms';
    
    // Check for Swiss municipal CMS patterns
    if (url.includes('i-web') || html.includes('i-web')) return 'i-web';
    if (html.includes('govis') || html.includes('GOViS')) return 'govis';
    
    return 'unknown';
  }

  private async convertToDbEvent(event: ExtractedEvent, municipality: Municipality): Promise<Event | null> {
    // Skip past events
    if (event.startDate < new Date()) {
      return null;
    }
    
    // Skip events too far in the future (>90 days)
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 90);
    if (event.startDate > maxDate) {
      return null;
    }
    
    const titleNorm = event.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    
    const uniquenessHash = crypto
      .createHash('sha256')
      .update(`AI-MUNICIPAL-${municipality.bfsNumber}-${titleNorm}-${event.startDate.toISOString()}`)
      .digest('hex');
    
    try {
      const dbEvent = await this.prisma.event.upsert({
        where: { uniquenessHash },
        create: {
          source: 'MUNICIPAL',
          sourceEventId: `${municipality.bfsNumber}-${uniquenessHash.substring(0, 8)}`,
          title: event.title,
          titleNorm,
          description: event.description,
          lang: 'de',
          category: event.category || 'Gemeindeveranstaltung',
          startTime: event.startDate,
          endTime: event.endDate,
          venueName: event.location || municipality.name,
          city: municipality.name,
          country: 'CH',
          lat: municipality.lat,
          lon: municipality.lon,
          url: event.url || municipality.eventPageUrl,
          imageUrl: event.imageUrl,
          uniquenessHash,
          municipalityId: municipality.id,
        },
        update: {
          title: event.title,
          description: event.description,
          startTime: event.startDate,
          endTime: event.endDate,
          venueName: event.location || municipality.name,
          url: event.url || municipality.eventPageUrl,
          imageUrl: event.imageUrl,
        },
      });
      
      return dbEvent;
    } catch (error) {
      console.error(`Error saving event "${event.title}":`, error);
      return null;
    }
  }

  async scrapeMultipleMunicipalities(limit: number = 10, maxDistance: number = 50) {
    const municipalities = await this.prisma.municipality.findMany({
      where: {
        eventPageUrl: { not: null },
        distanceFromHome: { lte: maxDistance },
        OR: [
          { lastScraped: null },
          { 
            lastScraped: { 
              lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
            } 
          },
        ],
      },
      orderBy: [
        { lastScraped: 'asc' },
        { distanceFromHome: 'asc' },
      ],
      take: limit,
    });
    
    console.log(`🤖 AI scraping ${municipalities.length} municipalities...`);
    
    const results = {
      success: 0,
      failed: 0,
      totalEvents: 0,
    };
    
    for (const municipality of municipalities) {
      try {
        const events = await this.scrapeMunicipality(municipality);
        results.success++;
        results.totalEvents += events.length;
        console.log(`✅ ${municipality.name}: ${events.length} events`);
      } catch (error) {
        results.failed++;
        console.error(`❌ ${municipality.name}:`, error);
      }
      
      // Be polite - wait between requests
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    return results;
  }
}
