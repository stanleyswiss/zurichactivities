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

  constructor(requestsPerSecond: number) {
    this.minInterval = 1000 / requestsPerSecond;
  }

  async waitForNextRequest(): Promise<void> {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequest;
    
    if (timeSinceLastRequest < this.minInterval) {
      const waitTime = this.minInterval - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequest = Date.now();
  }
}

export class SwitzerlandTourismScraper {
  private apiKey: string;
  private baseUrl?: string; // GET events endpoint (x-api-key)
  private searchUrl?: string; // POST search endpoint (Ocp-Apim-Subscription-Key)
  private subscriptionKey?: string;
  private rateLimiter = new RateLimiter(1); // 1 request per second

  constructor() {
    this.apiKey = process.env.ST_API_KEY || '';
    this.baseUrl = process.env.ST_EVENTS_URL || 'https://opendata.myswitzerland.io/v1/events';
    this.searchUrl = process.env.ST_SEARCH_URL || 'https://api.discover.swiss/info/v2/search';
    this.subscriptionKey = process.env.ST_SUBSCRIPTION_KEY || process.env.DISCOVER_SWISS_API_KEY || '';
    if (!this.baseUrl && !this.searchUrl) {
      throw new Error('Configure ST_EVENTS_URL (GET + x-api-key) or ST_SEARCH_URL (POST + Ocp-Apim-Subscription-Key)');
    }
  }

  async scrapeEvents(): Promise<RawEvent[]> {
    try {
      await this.rateLimiter.waitForNextRequest();
      if (this.baseUrl) return await this.scrapeViaEventsGet();
      if (this.searchUrl) return await this.scrapeViaSearchPost();
      return [];
    } catch (error) {
      console.error('Switzerland Tourism scraper error:', error);
      return [];
    }
  }

  private async scrapeViaEventsGet(): Promise<RawEvent[]> {
    if (!this.baseUrl) return [];
    if (!this.apiKey) throw new Error('ST_API_KEY missing for ST_EVENTS_URL');

    const bbox = process.env.ST_BBOX || '8.0,47.0,9.0,48.0'; // lon_min, lat_min, lon_max, lat_max
    const url = new URL(this.baseUrl);
    url.searchParams.append('bbox', bbox);
    url.searchParams.append('lang', process.env.ST_LANG || 'de');
    url.searchParams.append('limit', process.env.ST_LIMIT || '100');
    // Some deployments may not support date filters; omit for broad results

    const response = await fetch(url.toString(), {
      headers: {
        'x-api-key': this.apiKey,
        'Accept': 'application/json',
        'User-Agent': 'SwissActivitiesDashboard/1.0'
      }
    });

    if (!response.ok) {
      console.error(`ST API error: ${response.status} ${response.statusText}`);
      console.error('ST API URL:', url.toString());
      console.error('ST API Key present:', !!this.apiKey);
      // Return empty array instead of throwing to prevent 504 timeouts
      return [];
    }

    let data;
    try {
      const responseText = await response.text();
      data = JSON.parse(responseText);
    } catch (jsonError) {
      console.error('ST API JSON parse error:', jsonError);
      return [];
    }
    // Attempt to normalize common shapes: array | {events} | {data} | {value} | {items} | {results}
    let items: any[] = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data) {
      items = data.events || data.data || data.value || data.items || data.results || [];
      // Some payloads nest under data.data
      if (!Array.isArray(items) && data.data && Array.isArray(data.data.data)) {
        items = data.data.data;
      }
    }
    console.log('Switzerland Tourism (GET) payload keys:', Object.keys(data || {}), 'arrayLen:', Array.isArray(items) ? items.length : 0);
    const rawEvents: RawEvent[] = [];
    for (const node of items as any[]) {
      try {
        if (node && (node.startDate || node.endDate)) {
          const raw = await this.transformEvent(node as SwitzerlandTourismEvent);
          if (raw) rawEvents.push(raw);
        } else {
          const ra = await this.transformAttraction(node);
          if (ra) rawEvents.push(ra);
        }
      } catch (e) {
        console.error('Error transforming ST item (GET):', (node as any)?.id || (node as any)?.identifier, e);
      }
    }
    console.log(`Switzerland Tourism (GET): ${rawEvents.length} items mapped`);
    return rawEvents;
  }

  private async scrapeViaSearchPost(): Promise<RawEvent[]> {
    if (!this.searchUrl) return [];
    const key = this.subscriptionKey || this.apiKey;
    if (!key) throw new Error('ST_SUBSCRIPTION_KEY or ST_API_KEY required for ST_SEARCH_URL');

    const lat = parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LAT || '47.396');
    const lon = parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LON || '8.447');
    const select = 'identifier,name,startDate,endDate,location,offers,url,image,description';
    const lang = process.env.ST_LANG || 'de';
    const limit = parseInt(process.env.ST_LIMIT || '100');

    const response = await fetch(`${this.searchUrl}?scoringReferencePoint=${lon},${lat}`, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': key,
        'Accept-Language': lang,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'SwissActivitiesDashboard/1.0'
      },
      body: JSON.stringify({
        type: ['Event'],
        select,
        top: limit
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`ST Search API error: ${response.status} ${response.statusText}`, errorText);
      throw new Error(`ST Search API error: ${response.status} ${response.statusText}`);
    }

    let data;
    try {
      const responseText = await response.text();
      data = JSON.parse(responseText);
    } catch (jsonError) {
      console.error('Discover Swiss API JSON parse error:', jsonError);
      return [];
    }
    console.log('Discover Swiss API response keys:', Object.keys(data || {}));
    
    // Handle different API response formats
    let items: any[] = [];
    if (Array.isArray(data)) {
      items = data;
    } else if (data) {
      // Try common response formats
      items = data.value || data.events || data.data || data.results || data.items || [];
      // Handle nested structures
      if (!Array.isArray(items) && typeof items === 'object' && items !== null) {
        const nestedItems = (items as any).events || (items as any).data || (items as any).results || (items as any).items || [];
        items = Array.isArray(nestedItems) ? nestedItems : [];
      }
    }
    
    console.log(`Discover Swiss API items found: ${Array.isArray(items) ? items.length : 0}`);
    
    const rawEvents: RawEvent[] = [];
    for (const node of items as any[]) {
      try {
        const raw = await this.transformSearchEvent(node);
        if (raw) rawEvents.push(raw);
      } catch (e) {
        console.error('Error transforming ST event (POST):', node?.identifier || node?.id, e);
      }
    }
    console.log(`Switzerland Tourism (POST search): ${rawEvents.length} events`);
    return rawEvents;
  }

  // Map TouristAttraction-like nodes to our RawEvent model when Events feed is unavailable
  private async transformAttraction(node: any): Promise<RawEvent | null> {
    if (!node) return null;
    const title: string | undefined = node.name || node.title;
    if (!title) return null;

    // Heuristic: include only if current month/season appears in classifications to keep it relevant
    const classifications = Array.isArray(node.classification) ? node.classification : [];
    const now = new Date();
    const monthNames = ['january','february','march','april','may','june','july','august','september','october','november','december'];
    const currentMonth = monthNames[now.getMonth()];
    const seasonNames = ['winter','spring','summer','autumn'];
    const currentSeason = seasonNames[Math.floor(((now.getMonth()+1)%12)/3)];
    let timeRelevant = false;
    for (const c of classifications) {
      const name = (c?.name || '').toLowerCase();
      const values: any[] = c?.values || [];
      const valueNames = values.map(v => (v?.name || '').toLowerCase());
      if (name === 'month' && (valueNames.includes(currentMonth) || valueNames.includes('allyear'))) timeRelevant = true;
      if (name === 'seasons' && (valueNames.includes(currentSeason) || valueNames.includes('allyear'))) timeRelevant = true;
    }
    if (!timeRelevant && classifications.length > 0) return null;

    const description: string | undefined = node.abstract || node.description;
    const url: string | undefined = node.url || node.links?.self;
    const imageUrl: string | undefined = node.photo || node.image?.url || (Array.isArray(node.image) ? node.image[0] : undefined);
    const lat: number | undefined = node.geo?.latitude;
    const lon: number | undefined = node.geo?.longitude;

    // Category inference
    let category: string | undefined;
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

    return {
      source: SOURCES.ST,
      sourceEventId: node.identifier || url,
      title,
      description,
      lang: process.env.ST_LANG || 'de',
      category,
      startTime: now, // treat as currently available activity
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
