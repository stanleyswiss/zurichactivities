import { RawEvent, SOURCES, CATEGORIES } from '@/types/event';
import { geocodeAddress, formatSwissAddress } from '@/lib/utils/geocoding';

interface SwitzerlandTourismEvent {
  id: string;
  title: string;
  description?: string;
  startDate: string;
  endDate?: string;
  location?: {
    name?: string;
    address?: string;
    city?: string;
    postalCode?: string;
    coordinates?: {
      latitude: number;
      longitude: number;
    };
  };
  price?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  category?: string;
  url?: string;
  image?: string;
}

class RateLimiter {
  private lastRequest = 0;
  private minInterval: number;
  private requestCount = 0;
  private windowStart = Date.now();
  private readonly maxRequestsPerWindow = 50; // Conservative limit
  private readonly windowMs = 60 * 1000; // 1 minute window

  constructor(requestsPerSecond: number) {
    this.minInterval = 1000 / requestsPerSecond;
  }

  async waitForNextRequest(): Promise<void> {
    const now = Date.now();
    
    // Reset window if needed
    if (now - this.windowStart > this.windowMs) {
      this.requestCount = 0;
      this.windowStart = now;
    }
    
    // Check if we've hit the window limit
    if (this.requestCount >= this.maxRequestsPerWindow) {
      const waitTime = this.windowMs - (now - this.windowStart);
      if (waitTime > 0) {
        console.log(`Rate limit reached, waiting ${waitTime}ms`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.requestCount = 0;
        this.windowStart = Date.now();
      }
    }
    
    // Enforce minimum interval between requests
    const timeSinceLastRequest = now - this.lastRequest;
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequest = Date.now();
    this.requestCount++;
  }
}

export class SwitzerlandTourismScraper {
  private apiKey: string;
  private discoverApiKey: string;
  private baseUrl: string; // MySwitzerland API base
  private discoverBaseUrl: string; // Discover.swiss API base
  private rateLimiter = new RateLimiter(0.5); // 0.5 requests per second to be safe

  constructor() {
    this.apiKey = process.env.ST_API_KEY || '';
    this.discoverApiKey = process.env.DISCOVER_SWISS_API_KEY || '';
    this.baseUrl = 'https://api.myswitzerland.com/v1'; // Correct MySwitzerland API
    this.discoverBaseUrl = 'https://api.discover.swiss/info/v2'; // Discover.swiss API
    
    if (!this.apiKey && !this.discoverApiKey) {
      throw new Error('Either ST_API_KEY or DISCOVER_SWISS_API_KEY is required');
    }
    
    console.log(`Using Switzerland Tourism APIs - MySwitzerland: ${!!this.apiKey}, Discover: ${!!this.discoverApiKey}`);
  }

  async scrapeEvents(): Promise<RawEvent[]> {
    try {
      const events: RawEvent[] = [];
      
      // Try Discover.swiss API first (more comprehensive for events)
      if (this.discoverApiKey) {
        console.log('Fetching events from Discover.swiss API');
        const discoverEvents = await this.scrapeDiscoverEvents();
        events.push(...discoverEvents);
      }
      
      // Fallback to MySwitzerland API if available
      if (this.apiKey && events.length < 10) {
        console.log('Fetching additional events from MySwitzerland API');
        const stEvents = await this.scrapeMySwitzerland();
        events.push(...stEvents);
      }
      
      console.log(`Switzerland Tourism: ${events.length} total events found`);
      return events;
    } catch (error) {
      console.error('Switzerland Tourism scraper error:', error);
      return [];
    }
  }

  private async scrapeDiscoverEvents(): Promise<RawEvent[]> {
    await this.rateLimiter.waitForNextRequest();
    
    const url = new URL(`${this.discoverBaseUrl}/search`);
    
    // Search for events in Switzerland with time-based filtering
    const searchPayload = {
      query: {
        bool: {
          must: [
            { term: { "@type": "Event" } },
            {
              geo_bounding_box: {
                location: {
                  top_left: { lat: 48.5, lon: 7.0 },
                  bottom_right: { lat: 46.0, lon: 10.5 }
                }
              }
            },
            {
              range: {
                startDate: {
                  gte: "now",
                  lte: "now+6M"
                }
              }
            }
          ]
        }
      },
      size: 100
    };

    try {
      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': this.discoverApiKey,
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Accept-Language': process.env.ST_LANG || 'de',
          'User-Agent': 'SwissActivitiesDashboard/1.0'
        },
        body: JSON.stringify(searchPayload)
      });

      if (!response.ok) {
        console.error(`Discover.swiss API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      const items = data.hits?.hits || [];
      
      console.log(`Discover.swiss: ${items.length} events found`);
      
      const rawEvents: RawEvent[] = [];
      for (const item of items) {
        try {
          const event = await this.transformSearchEvent(item._source || item);
          if (event) rawEvents.push(event);
        } catch (e) {
          console.error('Error transforming Discover event:', item?._source?.identifier || item?.identifier, e);
        }
      }
      
      console.log(`Discover.swiss: ${rawEvents.length} events mapped`);
      return rawEvents;
    } catch (error) {
      console.error('Discover.swiss API request failed:', error);
      return [];
    }
  }

  private async scrapeMySwitzerland(): Promise<RawEvent[]> {
    await this.rateLimiter.waitForNextRequest();
    
    // Try the official MySwitzerland events endpoint if it exists
    const url = new URL(`${this.baseUrl}/events`);
    const bbox = process.env.ST_BBOX || '7.0,46.0,10.5,48.5';
    url.searchParams.append('bbox', bbox);
    url.searchParams.append('lang', process.env.ST_LANG || 'de');
    url.searchParams.append('limit', process.env.ST_LIMIT || '50');
    url.searchParams.append('startDate', new Date().toISOString().split('T')[0]); // Today onwards

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'x-api-key': this.apiKey,
          'Accept': 'application/json',
          'User-Agent': 'SwissActivitiesDashboard/1.0'
        }
      });

      if (!response.ok) {
        console.error(`MySwitzerland API error: ${response.status} ${response.statusText}`);
        // If events endpoint fails, try attractions as fallback
        return await this.scrapeAttractionsAsFallback();
      }

      const data = await response.json();
      const items = data.data || data.events || [];
      
      console.log(`MySwitzerland Events: ${items.length} items found`);
      
      const rawEvents: RawEvent[] = [];
      for (const item of items) {
        try {
          const event = await this.transformEvent(item);
          if (event) rawEvents.push(event);
        } catch (e) {
          console.error('Error transforming MySwitzerland event:', item?.id || item?.identifier, e);
        }
      }
      
      console.log(`MySwitzerland: ${rawEvents.length} events mapped`);
      return rawEvents;
    } catch (error) {
      console.error('MySwitzerland API request failed:', error);
      return await this.scrapeAttractionsAsFallback();
    }
  }

  private async scrapeAttractionsAsFallback(): Promise<RawEvent[]> {
    console.log('Trying attractions endpoint as fallback...');
    
    // This method handles the case where the events endpoint doesn't exist
    // We'll try to extract event-like attractions
    const url = new URL(`${this.baseUrl}/attractions`);
    const bbox = process.env.ST_BBOX || '7.0,46.0,10.5,48.5';
    url.searchParams.append('bbox', bbox);
    url.searchParams.append('lang', process.env.ST_LANG || 'de');
    url.searchParams.append('limit', process.env.ST_LIMIT || '50');

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'x-api-key': this.apiKey,
          'Accept': 'application/json',
          'User-Agent': 'SwissActivitiesDashboard/1.0'
        }
      });

      if (!response.ok) {
        console.error(`MySwitzerland Attractions fallback error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      const items = data.data || [];
      
      console.log(`MySwitzerland Attractions (fallback): ${items.length} items found`);
      
      const rawEvents: RawEvent[] = [];
      for (const item of items) {
        try {
          const event = await this.transformAttraction(item);
          if (event) rawEvents.push(event);
        } catch (e) {
          console.error('Error transforming attraction:', item?.identifier, e);
        }
      }
      
      console.log(`MySwitzerland Attractions (fallback): ${rawEvents.length} events mapped`);
      return rawEvents;
    } catch (error) {
      console.error('MySwitzerland Attractions fallback failed:', error);
      return [];
    }
  }

  private isEventLikeOffer(offer: any): boolean {
    if (!offer.name) return false;
    
    const name = offer.name.toLowerCase();
    const eventKeywords = [
      'führung', 'tour', 'fest', 'festival', 'konzert', 'markt', 'event',
      'rundfahrt', 'rundgang', 'besichtigung', 'vorführung', 'aufführung',
      'workshop', 'kurs', 'seminar', 'veranstaltung'
    ];
    
    return eventKeywords.some(keyword => name.includes(keyword));
  }

  private async transformOffer(offer: any): Promise<RawEvent | null> {
    if (!offer.name || !offer.validFrom || !offer.validThrough) {
      return null;
    }

    const startTime = new Date(offer.validFrom);
    const endTime = new Date(offer.validThrough);
    
    // Skip if dates are too far in the past or future
    const now = new Date();
    const oneYearAgo = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
    const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    
    if (endTime < oneYearAgo || startTime > oneYearFromNow) {
      return null;
    }

    // Extract price information
    let priceMin: number | undefined;
    let currency = 'CHF';
    
    if (offer.priceSpecification) {
      priceMin = offer.priceSpecification.minPrice;
      currency = offer.priceSpecification.priceCurrency || 'CHF';
    }

    // Determine category based on offer name
    let category: string | undefined = this.mapCategory(offer.name);

    return {
      source: SOURCES.ST,
      sourceEventId: offer.identifier || offer.url,
      title: offer.name,
      description: offer.priceSpecification?.description || `Angebot gültig von ${offer.validFrom} bis ${offer.validThrough}`,
      lang: process.env.ST_LANG || 'de',
      category,
      startTime,
      endTime,
      venueName: undefined,
      street: undefined,
      postalCode: undefined,
      city: undefined,
      country: 'CH',
      lat: undefined,
      lon: undefined,
      priceMin,
      priceMax: undefined,
      currency,
      url: offer.url,
      imageUrl: undefined
    };
  }

  // Map TouristAttraction-like nodes to our RawEvent model when Events feed is unavailable
  private async transformAttraction(node: any): Promise<RawEvent | null> {
    if (!node) return null;
    const title: string | undefined = node.name || node.title;
    if (!title) return null;

    const titleLower = title.toLowerCase();
    const description = node.abstract || node.description || '';
    const descLower = description.toLowerCase();
    const combinedText = `${titleLower} ${descLower}`;
    
    // Priority for Alpsabzug events - always include if detected
    const isAlpsabzug = /alp(s)?abzug|alp(s)?abfahrt|viehscheid|d[ée]salpe|alpfest|sennen|alpaufzug|tierumfahrt|alpweide|sennerei/.test(combinedText);
    
    // Heuristic: include if Alpsabzug OR if current month/season appears in classifications
    const classifications = Array.isArray(node.classification) ? node.classification : [];
    let timeRelevant = isAlpsabzug; // Always relevant if Alpsabzug
    
    if (!timeRelevant) {
      const now = new Date();
      const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
      const currentMonth = monthNames[now.getMonth()];
      const seasonNames = ['winter','spring','summer','autumn'];
      const currentSeason = seasonNames[Math.floor(((now.getMonth()+1)%12)/3)];
      
      for (const c of classifications) {
        const name = (c?.name || '').toLowerCase();
        const values: any[] = c?.values || [];
        const valueNames = values.map(v => (v?.name || '').toLowerCase());
        if (name === 'month' && (valueNames.includes(currentMonth) || valueNames.includes('allyear'))) timeRelevant = true;
        if (name === 'seasons' && (valueNames.includes(currentSeason) || valueNames.includes('allyear'))) timeRelevant = true;
      }
    }
    
    if (!timeRelevant && classifications.length > 0) return null;
    const url: string | undefined = node.url || node.links?.self;
    const imageUrl: string | undefined = node.photo || node.image?.url || (Array.isArray(node.image) ? node.image[0] : undefined);
    const lat: number | undefined = node.geo?.latitude;
    const lon: number | undefined = node.geo?.longitude;

    // Category inference - prioritize Alpsabzug
    let category: string | undefined;
    if (isAlpsabzug) {
      category = CATEGORIES.ALPSABZUG;
    } else {
      for (const c of classifications) {
        const name = (c?.name || '').toLowerCase();
        const values: any[] = c?.values || [];
        const combined = [name, ...values.map((v: any) => (v?.name || v?.title || '').toLowerCase())].join(' ');
        if (!category) {
          if (combined.includes('culture') || combined.includes('museum') || combined.includes('kultur')) category = CATEGORIES.CULTURE;
          else if (combined.includes('family') || combined.includes('famil')) category = CATEGORIES.FAMILY;
          else if (combined.includes('market') || combined.includes('markt')) category = CATEGORIES.MARKET;
          else if (combined.includes('sport') || combined.includes('active')) category = CATEGORIES.SPORTS;
          else if (combined.includes('nature')) category = CATEGORIES.SEASONAL;
        }
      }
    }

    return {
      source: SOURCES.ST,
      sourceEventId: node.identifier || url,
      title,
      description,
      lang: process.env.ST_LANG || 'de',
      category,
      startTime: new Date(), // treat as currently available activity
      endTime: undefined,
      venueName: undefined,
      street: undefined,
      postalCode: undefined,
      city: undefined,
      country: 'CH',
      lat,
      lon,
      priceMin: undefined,
      priceMax: undefined,
      currency: 'CHF',
      url,
      imageUrl
    };
  }

  private async transformEvent(event: SwitzerlandTourismEvent): Promise<RawEvent | null> {
    if (!event.title || !event.startDate) {
      return null;
    }

    const startTime = new Date(event.startDate);
    const endTime = event.endDate ? new Date(event.endDate) : undefined;

    let lat: number | undefined;
    let lon: number | undefined;

    if (event.location?.coordinates) {
      lat = event.location.coordinates.latitude;
      lon = event.location.coordinates.longitude;
    } else if (event.location?.address || event.location?.city) {
      const address = formatSwissAddress(
        event.location.address,
        event.location.postalCode,
        event.location.city
      );
      const coords = await geocodeAddress(address);
      if (coords) {
        lat = coords.lat;
        lon = coords.lon;
      }
    }

    return {
      source: SOURCES.ST,
      sourceEventId: event.id,
      title: event.title,
      description: event.description,
      lang: 'de',
      category: this.mapCategory(event.category),
      startTime,
      endTime,
      venueName: event.location?.name,
      street: event.location?.address,
      postalCode: event.location?.postalCode,
      city: event.location?.city,
      country: 'CH',
      lat,
      lon,
      priceMin: event.price?.min,
      priceMax: event.price?.max,
      currency: event.price?.currency || 'CHF',
      url: event.url,
      imageUrl: event.image
    };
  }

  private async transformSearchEvent(node: any): Promise<RawEvent | null> {
    const title = node?.name || node?.title;
    const start = node?.startDate;
    if (!title || !start) return null;
    const end = node?.endDate;

    let lat: number | undefined = node?.location?.geo?.latitude;
    let lon: number | undefined = node?.location?.geo?.longitude;
    const street: string | undefined = node?.location?.address?.streetAddress;
    const postalCode: string | undefined = node?.location?.address?.postalCode;
    const city: string | undefined = node?.location?.address?.addressLocality;
    const venueName: string | undefined = node?.location?.name;

    if ((!lat || !lon) && (street || city || postalCode)) {
      const addr = formatSwissAddress(street, postalCode, city);
      const g = await geocodeAddress(addr);
      if (g) { lat = g.lat; lon = g.lon; }
    }

    const priceInfo = node?.offers?.price || node?.offers;
    let priceMin: number | undefined;
    let priceMax: number | undefined;
    let currency: string | undefined;
    if (priceInfo) {
      if (typeof priceInfo.min === 'number') priceMin = priceInfo.min;
      if (typeof priceInfo.max === 'number') priceMax = priceInfo.max;
      currency = priceInfo.currency || priceInfo.priceCurrency;
      const p = parseFloat(priceInfo.price);
      if (!isNaN(p)) priceMin = priceMin ?? p;
    }

    const imageUrl: string | undefined = node?.image?.url || (Array.isArray(node?.image) ? node.image[0] : node?.image);
    const url: string | undefined = node?.url;

    return {
      source: SOURCES.ST,
      sourceEventId: node?.identifier || node?.id || url,
      title,
      description: node?.description,
      lang: process.env.ST_LANG || 'de',
      category: undefined,
      startTime: new Date(start),
      endTime: end ? new Date(end) : undefined,
      venueName,
      street,
      postalCode,
      city,
      country: 'CH',
      lat,
      lon,
      priceMin,
      priceMax,
      currency: currency || 'CHF',
      url,
      imageUrl
    };
  }

  private mapCategory(category?: string): string | undefined {
    if (!category) return undefined;
    
    const categoryLower = category.toLowerCase();
    
    if (categoryLower.includes('alp') || categoryLower.includes('vieh')) {
      return CATEGORIES.ALPSABZUG;
    }
    if (categoryLower.includes('festival') || categoryLower.includes('fest')) {
      return CATEGORIES.FESTIVAL;
    }
    if (categoryLower.includes('musik') || categoryLower.includes('konzert')) {
      return CATEGORIES.MUSIC;
    }
    if (categoryLower.includes('markt')) {
      return CATEGORIES.MARKET;
    }
    if (categoryLower.includes('familie') || categoryLower.includes('kinder')) {
      return CATEGORIES.FAMILY;
    }
    if (categoryLower.includes('sport')) {
      return CATEGORIES.SPORTS;
    }
    if (categoryLower.includes('kultur') || categoryLower.includes('theater')) {
      return CATEGORIES.CULTURE;
    }
    if (categoryLower.includes('weihnacht') || categoryLower.includes('advent')) {
      return CATEGORIES.SEASONAL;
    }
    
    return category;
  }
}
