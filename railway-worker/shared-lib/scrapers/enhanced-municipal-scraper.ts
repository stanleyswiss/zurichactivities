import * as cheerio from 'cheerio';
import {
  MunicipalityScrapingConfig,
  StructuredMunicipalEvent as ExtractedEvent,
} from './municipal-types';
import { fetchMunicipalEventsFromAPI } from './municipal-api';
import { parseMunicipalDate } from './municipal-utils';

export class EnhancedMunicipalScraper {
  private timeout = 10000;

  async scrapeEvents(config: MunicipalityScrapingConfig): Promise<ExtractedEvent[]> {
    try {
      console.log(`Scraping ${config.name} using ${config.cmsType} method: ${config.scrapingMethod}`);

      // Use API endpoint if available
      if (config.apiEndpoint && config.scrapingMethod === 'api-extraction') {
        return await fetchMunicipalEventsFromAPI(config);
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

        const startTime = parseMunicipalDate(dateText, config.dateFormat);
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
        const startTime = datetimeAttr
          ? new Date(datetimeAttr)
          : parseMunicipalDate(dateText, config.dateFormat);

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

          const startTime = parseMunicipalDate(dateText, config.dateFormat);
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

        const startTime = parseMunicipalDate(dateText, config.dateFormat);
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

          const startTime = parseMunicipalDate(dateText, config.dateFormat);
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

        const startTime = parseMunicipalDate(dateText, config.dateFormat);
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

        const startTime = parseMunicipalDate(dateText, config.dateFormat);
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

        const startTime = parseMunicipalDate(dateText, config.dateFormat);
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

}
