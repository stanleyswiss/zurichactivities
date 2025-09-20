import * as cheerio from 'cheerio';

export interface MunicipalityScrapingConfig {
  id: string;
  name: string;
  eventPageUrl: string;
  cmsType: string;
  scrapingMethod: string;
  eventSelectors?: {
    container?: string;
    title?: string;
    date?: string;
    location?: string;
    organizer?: string;
    description?: string;
    price?: string;
    registration?: string;
  } | null;
  apiEndpoint?: string | null;
  dateFormat?: string;
  language: string;
  requiresJavascript?: boolean;
  notes?: string;
}

export interface ExtractedEvent {
  title: string;
  startTime: Date;
  endTime?: Date;
  description?: string;
  venueName?: string;
  location?: string;
  organizer?: string;
  price?: string;
  url?: string;
  confidence: number;
}

export class EnhancedMunicipalScraper {
  private timeout = 10000;

  async scrapeEvents(config: MunicipalityScrapingConfig): Promise<ExtractedEvent[]> {
    try {
      console.log(`Scraping ${config.name} using ${config.cmsType} method: ${config.scrapingMethod}`);

      // Use API endpoint if available
      if (config.apiEndpoint && config.scrapingMethod === 'api-extraction') {
        return await this.scrapeFromAPI(config);
      }

      // Fetch HTML content
      if (config.requiresJavascript) {
        console.warn(`${config.name} requires JavaScript - would need browser automation`);
        return [];
      }

      const html = await this.fetchHTML(config.eventPageUrl);
      const $ = cheerio.load(html);

      // Route to CMS-specific scraper
      switch (config.cmsType) {
        case 'govis':
          return this.scrapeGOViS($, config);
        case 'onegov_cloud':
          return this.scrapeOneGovCloud($, config);
        case 'typo3':
          return this.scrapeTYPO3($, config);
        case 'drupal':
          return this.scrapeDrupal($, config);
        case 'wordpress':
          return this.scrapeWordPress($, config);
        case 'localcities':
          return this.scrapeLocalcities($, config);
        case 'custom':
        default:
          return this.scrapeWithCustomSelectors($, config);
      }
    } catch (error) {
      console.error(`Error scraping ${config.name}:`, error);
      return [];
    }
  }

  private async fetchHTML(url: string): Promise<string> {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), this.timeout);

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SwissEventsBot/1.0; +https://zurichactivities.vercel.app/about)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'de-CH,de;q=0.9,en;q=0.8',
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return await response.text();
  }

  private async scrapeFromAPI(config: MunicipalityScrapingConfig): Promise<ExtractedEvent[]> {
    try {
      const response = await fetch(config.apiEndpoint!, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'SwissEventsBot/1.0',
        },
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const data = await response.json();
      return this.parseAPIResponse(data, config);
    } catch (error) {
      console.error(`API scraping failed for ${config.name}:`, error);
      return [];
    }
  }

  private parseAPIResponse(data: any, config: MunicipalityScrapingConfig): ExtractedEvent[] {
    const events: ExtractedEvent[] = [];

    // Handle different API response formats
    const eventsList = Array.isArray(data) ? data : 
                      data.events || data.items || data.results || 
                      (data.data && Array.isArray(data.data) ? data.data : []);

    for (const item of eventsList) {
      try {
        const event = this.parseEventFromAPI(item, config);
        if (event) {
          events.push(event);
        }
      } catch (error) {
        console.warn(`Error parsing API event:`, error);
      }
    }

    return events;
  }

  private parseEventFromAPI(item: any, config: MunicipalityScrapingConfig): ExtractedEvent | null {
    // Common API field mappings
    const title = item.title || item.name || item.subject || item.event_name;
    const startTime = this.parseDate(
      item.start_date || item.startDate || item.date || item.event_date, 
      config.dateFormat
    );

    if (!title || !startTime) {
      return null;
    }

    return {
      title: title.trim(),
      startTime,
      endTime: this.parseDate(item.end_date || item.endDate, config.dateFormat),
      description: item.description || item.body || item.text,
      venueName: item.venue || item.location || item.place,
      location: item.address || item.location_text,
      organizer: item.organizer || item.organization,
      price: this.extractPrice(item.price || item.cost || item.fee),
      url: item.url || item.link || item.event_url,
      confidence: 0.9,
    };
  }

  private scrapeGOViS($: cheerio.CheerioAPI, config: MunicipalityScrapingConfig): ExtractedEvent[] {
    const events: ExtractedEvent[] = [];
    const selectors = config.eventSelectors || {};

    // GOViS-specific selectors with fallbacks
    const containerSelector = selectors.container || '.content-teaser, .veranstaltung-item, .event-item';
    
    $(containerSelector).each((_, element) => {
      try {
        const $event = $(element);
        
        const title = this.extractText($event, selectors.title || '.teaser-title h3, .event-title, h3');
        const dateText = this.extractText($event, selectors.date || '.date-display-single, .event-date, .datum');
        const location = this.extractText($event, selectors.location || '.location-info, .event-location, .ort');
        const description = this.extractText($event, selectors.description || '.teaser-text, .event-description');

        if (!title || !dateText) return;

        const startTime = this.parseDate(dateText, config.dateFormat);
        if (!startTime) return;

        events.push({
          title: title.trim(),
          startTime,
          description: description?.trim(),
          venueName: location?.trim(),
          confidence: 0.85,
        });
      } catch (error) {
        console.warn('Error parsing GOViS event:', error);
      }
    });

    return events;
  }

  private scrapeOneGovCloud($: cheerio.CheerioAPI, config: MunicipalityScrapingConfig): ExtractedEvent[] {
    const events: ExtractedEvent[] = [];
    const selectors = config.eventSelectors || {};

    // OneGov Cloud-specific selectors
    const containerSelector = selectors.container || '.onegov-event, article[data-event-id]';
    
    $(containerSelector).each((_, element) => {
      try {
        const $event = $(element);
        
        const title = this.extractText($event, selectors.title || '.event-title, h2, h3');
        const dateText = this.extractText($event, selectors.date || 'time[datetime], .event-date');
        const location = this.extractText($event, selectors.location || '.event-location, .event-meta');
        
        // Try to get datetime attribute if available
        const datetimeAttr = $event.find('time[datetime]').attr('datetime');
        const startTime = datetimeAttr ? new Date(datetimeAttr) : this.parseDate(dateText, config.dateFormat);

        if (!title || !startTime) return;

        events.push({
          title: title.trim(),
          startTime,
          venueName: location?.trim(),
          confidence: 0.9,
        });
      } catch (error) {
        console.warn('Error parsing OneGov event:', error);
      }
    });

    return events;
  }

  private scrapeTYPO3($: cheerio.CheerioAPI, config: MunicipalityScrapingConfig): ExtractedEvent[] {
    const events: ExtractedEvent[] = [];
    const selectors = config.eventSelectors || {};

    // TYPO3-specific selectors for various extensions
    const containerSelectors = [
      selectors.container,
      '.tx-sfeventmgt .event-item',
      '.tx-calendarize .cal-event',
      '.tx-t3events .event',
      '.tx-news-article',
      '.event-item'
    ].filter(Boolean);

    for (const containerSelector of containerSelectors) {
      $(containerSelector!).each((_, element) => {
        try {
          const $event = $(element);
          
          const title = this.extractText($event, selectors.title || '.news-text-wrap h1, .event-title, h2, h3');
          const dateText = this.extractText($event, selectors.date || '.news-date, .event-date, .cal-date');
          const location = this.extractText($event, selectors.location || '.news-location, .event-location');
          const description = this.extractText($event, selectors.description || '.bodytext, .event-description');

          if (!title || !dateText) return;

          const startTime = this.parseDate(dateText, config.dateFormat);
          if (!startTime) return;

          events.push({
            title: title.trim(),
            startTime,
            description: description?.trim(),
            venueName: location?.trim(),
            confidence: 0.8,
          });
        } catch (error) {
          console.warn('Error parsing TYPO3 event:', error);
        }
      });
    }

    return events;
  }

  private scrapeDrupal($: cheerio.CheerioAPI, config: MunicipalityScrapingConfig): ExtractedEvent[] {
    const events: ExtractedEvent[] = [];
    const selectors = config.eventSelectors || {};

    // Drupal-specific selectors
    const containerSelector = selectors.container || '.event-item, .node-event, .view-content .views-row';
    
    $(containerSelector).each((_, element) => {
      try {
        const $event = $(element);
        
        const title = this.extractText($event, selectors.title || '.field-name-title a, .node-title a, h3 a');
        const dateText = this.extractText($event, selectors.date || '.field-name-field-date, .field-name-field-event-date');
        const location = this.extractText($event, selectors.location || '.field-name-field-location, .field-name-field-venue');

        if (!title || !dateText) return;

        const startTime = this.parseDate(dateText, config.dateFormat);
        if (!startTime) return;

        events.push({
          title: title.trim(),
          startTime,
          venueName: location?.trim(),
          confidence: 0.8,
        });
      } catch (error) {
        console.warn('Error parsing Drupal event:', error);
      }
    });

    return events;
  }

  private scrapeWordPress($: cheerio.CheerioAPI, config: MunicipalityScrapingConfig): ExtractedEvent[] {
    const events: ExtractedEvent[] = [];
    const selectors = config.eventSelectors || {};

    // WordPress event plugin selectors
    const containerSelectors = [
      selectors.container,
      '.tribe-events-list-item', // The Events Calendar
      '.sc-event', // Sugar Calendar
      '.wp-calendar .event-item',
      '.event-listing .event'
    ].filter(Boolean);

    for (const containerSelector of containerSelectors) {
      $(containerSelector!).each((_, element) => {
        try {
          const $event = $(element);
          
          const title = this.extractText($event, selectors.title || '.tribe-event-title, .event-title, h3');
          const dateText = this.extractText($event, selectors.date || '.tribe-event-date, .event-date');
          const location = this.extractText($event, selectors.location || '.tribe-event-venue, .event-venue');

          if (!title || !dateText) return;

          const startTime = this.parseDate(dateText, config.dateFormat);
          if (!startTime) return;

          events.push({
            title: title.trim(),
            startTime,
            venueName: location?.trim(),
            confidence: 0.75,
          });
        } catch (error) {
          console.warn('Error parsing WordPress event:', error);
        }
      });
    }

    return events;
  }

  private scrapeLocalcities($: cheerio.CheerioAPI, config: MunicipalityScrapingConfig): ExtractedEvent[] {
    const events: ExtractedEvent[] = [];
    const selectors = config.eventSelectors || {};

    // Localcities standardized selectors
    const containerSelector = selectors.container || '.localcities-event, .lc-event-card, [data-municipality-id]';
    
    $(containerSelector).each((_, element) => {
      try {
        const $event = $(element);
        
        const title = this.extractText($event, selectors.title || '.lc-event-title, .event-title');
        const dateText = this.extractText($event, selectors.date || '.lc-event-date, .event-date');
        const location = this.extractText($event, selectors.location || '.lc-event-location, .event-location');

        if (!title || !dateText) return;

        const startTime = this.parseDate(dateText, config.dateFormat);
        if (!startTime) return;

        events.push({
          title: title.trim(),
          startTime,
          venueName: location?.trim(),
          confidence: 0.85,
        });
      } catch (error) {
        console.warn('Error parsing Localcities event:', error);
      }
    });

    return events;
  }

  private scrapeWithCustomSelectors($: cheerio.CheerioAPI, config: MunicipalityScrapingConfig): ExtractedEvent[] {
    const events: ExtractedEvent[] = [];
    const selectors = config.eventSelectors;

    if (!selectors || !selectors.container) {
      return this.fallbackScraping($, config);
    }

    $(selectors.container).each((_, element) => {
      try {
        const $event = $(element);
        
        const title = this.extractText($event, selectors.title || 'h2, h3, .title');
        const dateText = this.extractText($event, selectors.date || '.date, .datum, .event-date');
        const location = this.extractText($event, selectors.location || '.location, .ort, .venue');
        const description = this.extractText($event, selectors.description || '.description, .text');

        if (!title || !dateText) return;

        const startTime = this.parseDate(dateText, config.dateFormat);
        if (!startTime) return;

        events.push({
          title: title.trim(),
          startTime,
          description: description?.trim(),
          venueName: location?.trim(),
          confidence: 0.7,
        });
      } catch (error) {
        console.warn('Error parsing custom event:', error);
      }
    });

    return events;
  }

  private fallbackScraping($: cheerio.CheerioAPI, config: MunicipalityScrapingConfig): ExtractedEvent[] {
    // Fallback patterns for unknown/custom sites
    const commonSelectors = [
      '.event', '.veranstaltung', '.ereignis', '.manifestation', '.evento',
      '.event-item', '.calendar-item', '.agenda-item',
      '[data-event]', '[class*="event"]', '[class*="veranstaltung"]'
    ];

    for (const selector of commonSelectors) {
      const events = this.scrapeWithSelector($, selector, config);
      if (events.length > 0) {
        return events;
      }
    }

    return [];
  }

  private scrapeWithSelector($: cheerio.CheerioAPI, selector: string, config: MunicipalityScrapingConfig): ExtractedEvent[] {
    const events: ExtractedEvent[] = [];

    $(selector).each((_, element) => {
      try {
        const $event = $(element);
        
        // Try multiple title selectors
        const title = this.extractText($event, 'h1, h2, h3, .title, .name, .subject');
        
        // Try multiple date selectors
        const dateText = this.extractText($event, '.date, .datum, .when, time, [datetime]');

        if (!title || !dateText) return;

        const startTime = this.parseDate(dateText, config.dateFormat);
        if (!startTime) return;

        events.push({
          title: title.trim(),
          startTime,
          confidence: 0.5,
        });
      } catch (error) {
        // Silently continue
      }
    });

    return events;
  }

  private extractText($container: cheerio.Cheerio<any>, selector?: string): string | null {
    if (!selector) return null;
    
    const selectors = selector.split(',').map(s => s.trim());
    
    for (const sel of selectors) {
      const element = $container.find(sel).first();
      if (element.length > 0) {
        const text = element.text().trim();
        if (text.length > 0) {
          return text;
        }
      }
    }
    
    return null;
  }

  private parseDate(dateText: string | null | undefined, format?: string): Date | null {
    if (!dateText) return null;

    // Clean the date text
    const cleaned = dateText.trim().replace(/\s+/g, ' ');

    // Try ISO format first
    if (/^\d{4}-\d{2}-\d{2}/.test(cleaned)) {
      const date = new Date(cleaned);
      if (!isNaN(date.getTime())) return date;
    }

    // Swiss date formats: DD.MM.YYYY
    const swissMatch = cleaned.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (swissMatch) {
      const [, day, month, year] = swissMatch;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) return date;
    }

    // Try parsing with Date constructor
    const fallbackDate = new Date(cleaned);
    if (!isNaN(fallbackDate.getTime())) {
      return fallbackDate;
    }

    return null;
  }

  private extractPrice(priceText: string | null | undefined): string | undefined {
    if (!priceText) return undefined;
    
    // Look for Swiss price patterns: CHF, Fr., .-
    const priceMatch = priceText.match(/(CHF|Fr\.?)\s*(\d+(?:[.,]\d{2})?)|(\d+(?:[.,]\d{2})?)\s*\.?-?/);
    if (priceMatch) {
      return priceText.trim();
    }
    
    return undefined;
  }
}