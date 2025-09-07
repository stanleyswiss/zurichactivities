import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { RawEvent, SOURCES, CATEGORIES } from '@/types/event';
import { geocodeAddress, formatSwissAddress } from '@/lib/utils/geocoding';

interface AlpsabzugEventData {
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  location?: {
    name?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    lat?: number;
    lon?: number;
  };
  url?: string;
  imageUrl?: string;
  source: string;
}

interface RobotsRule {
  userAgent: string;
  disallowed: string[];
  crawlDelay?: number;
}

/**
 * Production-ready Playwright scraper for Swiss Alpsabzug events
 * Optimized for Vercel serverless environment with 10s timeout
 * Focuses on high-value Swiss Alpine tourism websites
 */
export class AlpsabzugScraper {
  private browser?: Browser;
  private context?: BrowserContext;
  private userAgent = 'SwissActivitiesDashboard/1.0 (+https://activities.swiss)';
  private robotsCache = new Map<string, RobotsRule>();
  
  // Alpsabzug-specific terms for filtering
  private alpsabzugTerms = [
    'alpabzug', 'alpsabzug', 'alpabfahrt', 'alpsabfahrt',
    'viehscheid', 'viehschied', 'désalpe', 'desalpe',
    'alpfest', 'älplerfest', 'sennen', 'sennerei',
    'alpaufzug', 'alpauftrieb', 'tierumfahrt',
    'alpweide', 'almabtrieb', 'cattle descent',
    'alpbetrieb', 'alpwirtschaft', 'bergbauern'
  ];

  // Primary API configuration (if available)
  private discoverSwissConfig = {
    apiKey: process.env.DISCOVER_SWISS_API_KEY || '37747c97733b44d68e44ff0f0189e08b',
    baseUrl: 'https://api.discover.swiss/info/v2',
    project: process.env.DISCOVER_SWISS_PROJECT || 'dsod-content', // Free tier - venues only
    enabled: process.env.USE_DISCOVER_SWISS_API === 'true' // Disabled by default (paid tier required for events)
  };

  // High-value Swiss tourism websites focused on Alpine regions
  private targetSources = [
    {
      url: 'https://www.graubuenden.ch/de/veranstaltungen',
      name: 'Graubünden Tourism',
      selectors: {
        events: '.event-item, .veranstaltung, [data-event], .event-card',
        title: 'h3, .title, .event-title, [data-title]',
        date: '.date, .datum, time, [datetime]',
        location: '.location, .ort, .venue',
        description: '.description, .text, p',
        link: 'a'
      }
    },
    {
      url: 'https://www.valais.ch/de/aktivitaeten/veranstaltungen',
      name: 'Valais Tourism',
      selectors: {
        events: '.event, .event-item, .veranstaltung',
        title: 'h2, h3, .title',
        date: '.date, time',
        location: '.location, .ort',
        description: '.summary, .description',
        link: 'a'
      }
    },
    {
      url: 'https://www.appenzell.ch/de/erleben/veranstaltungen',
      name: 'Appenzell Tourism',
      selectors: {
        events: '.event-teaser, .event, .veranstaltung',
        title: '.title, h3, h4',
        date: '.date, .datum',
        location: '.location',
        description: '.teaser, .summary',
        link: 'a'
      }
    },
    {
      url: 'https://www.uri.swiss/de/erleben/veranstaltungen',
      name: 'Uri Tourism',
      selectors: {
        events: '.event, .veranstaltung-item',
        title: '.title, h3',
        date: '.date, .datum',
        location: '.ort, .location',
        description: '.text, .beschreibung',
        link: 'a'
      }
    },
    {
      url: 'https://www.schwyz-tourismus.ch/de/veranstaltungen',
      name: 'Schwyz Tourism',
      selectors: {
        events: '.event, .veranstaltung',
        title: 'h3, .titel',
        date: '.datum, .date',
        location: '.ort',
        description: '.beschreibung',
        link: 'a'
      }
    }
  ];

  constructor() {
    // Ensure cleanup on process termination
    process.on('exit', () => this.cleanup());
    process.on('SIGINT', () => this.cleanup());
    process.on('SIGTERM', () => this.cleanup());
  }

  async scrapeEvents(): Promise<RawEvent[]> {
    const startTime = Date.now();
    const maxDuration = 8000; // 8 seconds to stay under Vercel's 10s limit
    
    try {
      console.log('🚀 Starting Alpsabzug scraper...');
      
      const allEvents: RawEvent[] = [];
      
      // Try Discover Swiss API first (if enabled)
      if (this.discoverSwissConfig.enabled) {
        console.log('📡 Attempting Discover Swiss API for events...');
        try {
          const apiEvents = await this.scrapeDiscoverSwissAPI();
          if (apiEvents.length > 0) {
            allEvents.push(...apiEvents);
            console.log(`✅ Discover Swiss API: ${apiEvents.length} Alpsabzug events found`);
            // If API succeeds, skip web scraping to save time
            return allEvents;
          }
        } catch (error) {
          console.log('⚠️ Discover Swiss API failed, falling back to web scraping:', error);
        }
      }
      
      // Fallback to web scraping
      console.log('🌐 Initializing browser for web scraping...');
      await this.initializeBrowser();
      
      // Process each source with time budgeting
      for (const source of this.targetSources) {
        const sourceStartTime = Date.now();
        
        // Check remaining time budget
        if (Date.now() - startTime > maxDuration - 2000) {
          console.log(`⏰ Time budget exhausted, stopping at ${source.name}`);
          break;
        }
        
        try {
          // Check robots.txt compliance
          if (!(await this.checkRobotsCompliance(source.url))) {
            console.log(`🤖 Robots.txt disallows scraping for ${source.name}, skipping`);
            continue;
          }
          
          console.log(`📍 Scraping Alpsabzug events from ${source.name}...`);
          
          const events = await this.scrapeSource(source, 2000); // 2s timeout per source
          const filteredEvents = events.filter(event => 
            this.isAlpsabzugEvent(event.title, event.description || '')
          );
          
          allEvents.push(...filteredEvents);
          
          console.log(`✅ ${source.name}: ${filteredEvents.length}/${events.length} Alpsabzug events in ${Date.now() - sourceStartTime}ms`);
          
          // Rate limiting: 1 second between sources
          await this.delay(1000);
          
        } catch (error) {
          console.error(`❌ Error scraping ${source.name}:`, error);
          // Continue with next source
        }
      }
      
      console.log(`🎯 Alpsabzug scraper completed: ${allEvents.length} events in ${Date.now() - startTime}ms`);
      return allEvents;
      
    } catch (error) {
      console.error('💥 Alpsabzug scraper failed:', error);
      return [];
    } finally {
      await this.cleanup();
    }
  }

  private async initializeBrowser(): Promise<void> {
    try {
      // Serverless-optimized Chromium launch
      this.browser = await chromium.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-renderer-backgrounding',
          '--disable-backgrounding-occluded-windows',
          '--disable-ipc-flooding-protection',
          '--no-first-run',
          '--no-default-browser-check',
          '--memory-pressure-off',
          '--max_old_space_size=256' // Reduced memory usage
        ]
      });

      this.context = await this.browser.newContext({
        userAgent: this.userAgent,
        viewport: { width: 1280, height: 720 },
        locale: 'de-CH',
        acceptDownloads: false,
        ignoreHTTPSErrors: true
      });

      // Block unnecessary resources for faster loading
      await this.context.route('**/*', (route) => {
        const resourceType = route.request().resourceType();
        if (['image', 'font', 'media', 'stylesheet'].includes(resourceType)) {
          route.abort();
        } else {
          route.continue();
        }
      });

    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  private async scrapeSource(source: any, timeoutMs: number): Promise<RawEvent[]> {
    if (!this.context) throw new Error('Browser context not initialized');
    
    const page = await this.context.newPage();
    const events: RawEvent[] = [];
    
    try {
      // Navigate with aggressive timeout
      await page.goto(source.url, { 
        waitUntil: 'domcontentloaded', 
        timeout: timeoutMs 
      });
      
      // Wait for content but don't block
      try {
        await page.waitForLoadState('networkidle', { timeout: 1000 });
      } catch {
        // Continue if network doesn't idle quickly
      }
      
      // First try: Extract JSON-LD structured data (fastest)
      const jsonLdEvents = await this.extractJsonLdEvents(page);
      if (jsonLdEvents.length > 0) {
        events.push(...jsonLdEvents);
      } else {
        // Fallback: HTML semantic extraction
        const htmlEvents = await this.extractHtmlEvents(page, source);
        events.push(...htmlEvents);
      }
      
      return events;
      
    } catch (error) {
      console.error(`Error scraping ${source.name}:`, error);
      return [];
    } finally {
      await page.close();
    }
  }

  private async extractJsonLdEvents(page: Page): Promise<RawEvent[]> {
    try {
      const jsonLdScripts = await page.locator('script[type="application/ld+json"]').allTextContents();
      const events: RawEvent[] = [];
      
      for (const scriptContent of jsonLdScripts) {
        try {
          const data = JSON.parse(scriptContent);
          const extractedEvents = await this.parseJsonLdData(data);
          events.push(...extractedEvents);
        } catch (error) {
          // Continue with next script
        }
      }
      
      return events;
    } catch (error) {
      return [];
    }
  }

  private async parseJsonLdData(data: any): Promise<RawEvent[]> {
    const events: RawEvent[] = [];
    
    // Handle different JSON-LD structures
    if (Array.isArray(data)) {
      for (const item of data) {
        const event = await this.parseJsonLdEvent(item);
        if (event) events.push(event);
      }
    } else if (data['@type'] === 'Event' || data.type === 'Event') {
      const event = await this.parseJsonLdEvent(data);
      if (event) events.push(event);
    } else if (data['@graph']) {
      for (const item of data['@graph']) {
        if (item['@type'] === 'Event' || item.type === 'Event') {
          const event = await this.parseJsonLdEvent(item);
          if (event) events.push(event);
        }
      }
    }
    
    return events;
  }

  private async parseJsonLdEvent(eventData: any): Promise<RawEvent | null> {
    try {
      const title = eventData.name || eventData.title;
      const startDate = eventData.startDate;
      
      if (!title || !startDate) return null;
      
      const description = eventData.description;
      const endDate = eventData.endDate;
      const url = eventData.url;
      const image = eventData.image?.url || eventData.image;
      
      // Extract location information
      let location = eventData.location;
      let lat: number | undefined;
      let lon: number | undefined;
      let venueName: string | undefined;
      let street: string | undefined;
      let city: string | undefined;
      let postalCode: string | undefined;
      
      if (location) {
        if (typeof location === 'string') {
          venueName = location;
        } else {
          venueName = location.name;
          if (location.address) {
            street = location.address.streetAddress;
            city = location.address.addressLocality;
            postalCode = location.address.postalCode;
          }
          if (location.geo) {
            lat = parseFloat(location.geo.latitude);
            lon = parseFloat(location.geo.longitude);
          }
        }
      }
      
      // Geocode if coordinates not available
      if (!lat || !lon) {
        if (street || city) {
          const address = formatSwissAddress(street, postalCode, city);
          const coords = await geocodeAddress(address);
          if (coords) {
            lat = coords.lat;
            lon = coords.lon;
          }
        }
      }
      
      return {
        source: SOURCES.ALPSABZUG,
        sourceEventId: url || `${title}-${startDate}`,
        title,
        description,
        lang: 'de',
        category: CATEGORIES.ALPSABZUG,
        startTime: new Date(startDate),
        endTime: endDate ? new Date(endDate) : undefined,
        venueName,
        street,
        postalCode,
        city,
        country: 'CH',
        lat,
        lon,
        url,
        imageUrl: image
      };
    } catch (error) {
      return null;
    }
  }

  private async extractHtmlEvents(page: Page, source: any): Promise<RawEvent[]> {
    try {
      const events: RawEvent[] = [];
      
      // Use the source-specific selectors
      const eventElements = await page.locator(source.selectors.events).all();
      
      for (const element of eventElements.slice(0, 10)) { // Limit to 10 events per source
        try {
          const eventData = await this.extractEventDataFromElement(element, source);
          if (eventData) {
            events.push(eventData);
          }
        } catch (error) {
          // Continue with next event
        }
      }
      
      return events;
    } catch (error) {
      return [];
    }
  }

  private async extractEventDataFromElement(element: any, source: any): Promise<RawEvent | null> {
    try {
      // Extract title
      const title = await this.getTextContent(element, source.selectors.title.split(', '));
      if (!title) return null;
      
      // Extract description
      const description = await this.getTextContent(element, source.selectors.description.split(', '));
      
      // Extract date
      const dateText = await this.getDateContent(element, source.selectors.date.split(', '));
      if (!dateText) return null;
      
      const startTime = this.parseSwissDate(dateText);
      if (!startTime) return null;
      
      // Extract location
      const locationText = await this.getTextContent(element, source.selectors.location.split(', '));
      
      // Extract URL
      let eventUrl = await this.getAttribute(element, [source.selectors.link], 'href');
      if (eventUrl && !eventUrl.startsWith('http')) {
        const baseUrl = new URL(source.url).origin;
        eventUrl = new URL(eventUrl, baseUrl).toString();
      }
      
      // Geocoding for location
      let lat: number | undefined;
      let lon: number | undefined;
      let city: string | undefined;
      
      if (locationText) {
        city = this.extractCityFromLocation(locationText);
        const coords = await geocodeAddress(locationText);
        if (coords) {
          lat = coords.lat;
          lon = coords.lon;
        }
      }
      
      return {
        source: SOURCES.ALPSABZUG,
        sourceEventId: eventUrl || `${title}-${startTime.toISOString()}`,
        title,
        description,
        lang: 'de',
        category: CATEGORIES.ALPSABZUG,
        startTime,
        venueName: locationText,
        city,
        country: 'CH',
        lat,
        lon,
        url: eventUrl
      };
    } catch (error) {
      return null;
    }
  }

  private async getTextContent(element: any, selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
      try {
        const text = await element.locator(selector.trim()).first().textContent();
        if (text && text.trim()) return text.trim();
      } catch {
        // Try next selector
      }
    }
    
    // Fallback to element's own text
    try {
      const text = await element.textContent();
      return text?.trim() || null;
    } catch {
      return null;
    }
  }

  private async getDateContent(element: any, selectors: string[]): Promise<string | null> {
    for (const selector of selectors) {
      try {
        const dateElement = element.locator(selector.trim()).first();
        
        // Try datetime attribute first
        const datetime = await dateElement.getAttribute('datetime');
        if (datetime) return datetime;
        
        // Try content attribute
        const content = await dateElement.getAttribute('content');
        if (content) return content;
        
        // Try text content
        const text = await dateElement.textContent();
        if (text && text.trim()) {
          return text.trim();
        }
      } catch {
        // Try next selector
      }
    }
    return null;
  }

  private async getAttribute(element: any, selectors: string[], attribute: string): Promise<string | null> {
    for (const selector of selectors) {
      try {
        const attr = await element.locator(selector.trim()).first().getAttribute(attribute);
        if (attr) return attr;
      } catch {
        // Try next selector
      }
    }
    return null;
  }

  private parseSwissDate(dateString: string): Date | null {
    try {
      // Handle various Swiss date formats
      const patterns = [
        /(\d{1,2})\.(\d{1,2})\.(\d{4})/,  // DD.MM.YYYY
        /(\d{1,2})\/(\d{1,2})\/(\d{4})/,  // DD/MM/YYYY
        /(\d{4}-\d{2}-\d{2})/,            // YYYY-MM-DD
      ];
      
      for (const pattern of patterns) {
        const match = dateString.match(pattern);
        if (match) {
          if (match[3]) {
            // DD.MM.YYYY or DD/MM/YYYY format
            const date = new Date(`${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`);
            if (!isNaN(date.getTime())) return date;
          } else {
            // Already in YYYY-MM-DD format
            const date = new Date(match[1]);
            if (!isNaN(date.getTime())) return date;
          }
        }
      }
      
      // German month names
      const germanMonths = {
        'januar': 0, 'februar': 1, 'märz': 2, 'april': 3, 'mai': 4, 'juni': 5,
        'juli': 6, 'august': 7, 'september': 8, 'oktober': 9, 'november': 10, 'dezember': 11
      };
      
      const germanMatch = dateString.match(/(\d{1,2})\s+(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\s*(\d{4})?/i);
      if (germanMatch) {
        const day = parseInt(germanMatch[1]);
        const month = germanMonths[germanMatch[2].toLowerCase() as keyof typeof germanMonths];
        const year = germanMatch[3] ? parseInt(germanMatch[3]) : new Date().getFullYear();
        
        const date = new Date(year, month, day);
        if (!isNaN(date.getTime())) return date;
      }
      
      return null;
    } catch {
      return null;
    }
  }

  private extractCityFromLocation(location?: string): string | undefined {
    if (!location) return undefined;
    
    // Extract city from location string (common Swiss patterns)
    const cityPatterns = [
      /(\d{4})\s+([A-Za-zäöüÄÖÜ\s-]+)/,  // "8001 Zürich"
      /([A-Za-zäöüÄÖÜ\s-]+),?\s*CH/i,    // "Zürich, CH"
      /([A-Za-zäöüÄÖÜ\s-]+)$/             // Just the city name at end
    ];
    
    for (const pattern of cityPatterns) {
      const match = location.match(pattern);
      if (match) {
        return (match[2] || match[1])?.trim();
      }
    }
    
    return undefined;
  }

  private async checkRobotsCompliance(url: string): Promise<boolean> {
    try {
      const baseUrl = new URL(url).origin;
      
      // Check cache first
      if (this.robotsCache.has(baseUrl)) {
        const rule = this.robotsCache.get(baseUrl)!;
        return !rule.disallowed.some(path => url.includes(path));
      }
      
      // Fetch robots.txt with timeout
      const robotsUrl = `${baseUrl}/robots.txt`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
      
      try {
        const response = await fetch(robotsUrl, {
          headers: { 'User-Agent': this.userAgent },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          // If robots.txt doesn't exist, assume allowed
          this.robotsCache.set(baseUrl, { userAgent: '*', disallowed: [] });
          return true;
        }
        
        const robotsText = await response.text();
        const rule = this.parseRobotsTxt(robotsText);
        this.robotsCache.set(baseUrl, rule);
        
        return !rule.disallowed.some(path => url.includes(path));
      } catch (fetchError) {
        clearTimeout(timeoutId);
        // If robots.txt fetch fails, assume allowed
        return true;
      }
    } catch (error) {
      // Err on the side of caution - assume allowed
      return true;
    }
  }

  private parseRobotsTxt(robotsText: string): RobotsRule {
    const lines = robotsText.split('\n');
    const rule: RobotsRule = { userAgent: '*', disallowed: [] };
    
    let currentUserAgent = '';
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      
      const [key, value] = trimmed.split(':').map(s => s.trim());
      
      switch (key.toLowerCase()) {
        case 'user-agent':
          currentUserAgent = value.toLowerCase();
          break;
        case 'disallow':
          if (currentUserAgent === '*' || currentUserAgent.includes('bot') || currentUserAgent === '') {
            if (value) rule.disallowed.push(value);
          }
          break;
        case 'crawl-delay':
          if (currentUserAgent === '*' || currentUserAgent.includes('bot') || currentUserAgent === '') {
            rule.crawlDelay = parseInt(value);
          }
          break;
      }
    }
    
    return rule;
  }

  private isAlpsabzugEvent(title: string, description: string): boolean {
    const combinedText = `${title} ${description}`.toLowerCase();
    return this.alpsabzugTerms.some(term => combinedText.includes(term));
  }

  private async delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private async scrapeDiscoverSwissAPI(): Promise<RawEvent[]> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3s timeout for API
      
      // Try events endpoint (likely requires paid subscription)
      const eventsUrl = `${this.discoverSwissConfig.baseUrl}/events?project=${this.discoverSwissConfig.project}&resultsPerPage=100`;
      
      try {
        const response = await fetch(eventsUrl, {
          headers: {
            'Ocp-Apim-Subscription-Key': this.discoverSwissConfig.apiKey,
            'Accept-Language': 'de',
            'User-Agent': this.userAgent
          },
          signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
          throw new Error(`API responded with ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        const events = data.results || data.items || [];
        
        console.log(`📊 Discover Swiss API returned ${events.length} events`);
        
        // Transform API events to RawEvent format
        const transformedEvents: RawEvent[] = [];
        for (const event of events) {
          try {
            const transformed = await this.transformDiscoverSwissEvent(event);
            if (transformed && this.isAlpsabzugEvent(transformed.title, transformed.description || '')) {
              transformedEvents.push(transformed);
            }
          } catch (error) {
            console.error('Error transforming API event:', error);
          }
        }
        
        return transformedEvents;
        
      } catch (fetchError) {
        clearTimeout(timeoutId);
        throw fetchError;
      }
    } catch (error) {
      console.error('Discover Swiss API error:', error);
      throw error;
    }
  }

  private async transformDiscoverSwissEvent(apiEvent: any): Promise<RawEvent | null> {
    try {
      const title = apiEvent.name || apiEvent.title;
      const startDate = apiEvent.startDate || apiEvent.dateTime;
      
      if (!title || !startDate) return null;
      
      const description = apiEvent.description || apiEvent.summary;
      const endDate = apiEvent.endDate;
      const url = apiEvent.url || apiEvent.link;
      const imageUrl = apiEvent.image?.url || apiEvent.imageUrl;
      
      // Extract location
      let lat: number | undefined;
      let lon: number | undefined;
      let venueName: string | undefined;
      let street: string | undefined;
      let city: string | undefined;
      let postalCode: string | undefined;
      
      if (apiEvent.location) {
        venueName = apiEvent.location.name;
        if (apiEvent.location.address) {
          street = apiEvent.location.address.streetAddress;
          city = apiEvent.location.address.locality;
          postalCode = apiEvent.location.address.postalCode;
        }
        if (apiEvent.location.geo) {
          lat = parseFloat(apiEvent.location.geo.latitude);
          lon = parseFloat(apiEvent.location.geo.longitude);
        }
      }
      
      // Geocode if needed
      if (!lat || !lon) {
        if (street || city) {
          const address = formatSwissAddress(street, postalCode, city);
          const coords = await geocodeAddress(address);
          if (coords) {
            lat = coords.lat;
            lon = coords.lon;
          }
        }
      }
      
      return {
        source: SOURCES.ALPSABZUG,
        sourceEventId: apiEvent.id || url || `${title}-${startDate}`,
        title,
        description,
        lang: 'de',
        category: CATEGORIES.ALPSABZUG,
        startTime: new Date(startDate),
        endTime: endDate ? new Date(endDate) : undefined,
        venueName,
        street,
        postalCode,
        city,
        country: 'CH',
        lat,
        lon,
        url,
        imageUrl
      };
    } catch (error) {
      console.error('Error transforming Discover Swiss event:', error);
      return null;
    }
  }

  private async cleanup(): Promise<void> {
    try {
      if (this.context) {
        await this.context.close();
        this.context = undefined;
      }
      if (this.browser) {
        await this.browser.close();
        this.browser = undefined;
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}