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
  private baseUrl: string;
  private rateLimiter = new RateLimiter(1); // 1 request per second

  constructor() {
    this.apiKey = process.env.ST_API_KEY!;
    if (!this.apiKey) throw new Error('ST_API_KEY environment variable is required');
    // Require explicit endpoint to avoid DNS failures
    this.baseUrl = process.env.ST_EVENTS_URL || '';
    if (!this.baseUrl) throw new Error('ST_EVENTS_URL environment variable is required (Switzerland Tourism Events endpoint)');
  }

  async scrapeEvents(): Promise<RawEvent[]> {
    try {
      await this.rateLimiter.waitForNextRequest();

      // Bounding box around Zurich region (rough coordinates)
      const bbox = process.env.ST_BBOX || '8.0,47.0,9.0,48.0'; // lon_min, lat_min, lon_max, lat_max
      
      const url = new URL(this.baseUrl);
      // Common patterns; customizable per deployment
      url.searchParams.append('bbox', bbox);
      url.searchParams.append('lang', process.env.ST_LANG || 'de');
      url.searchParams.append('limit', process.env.ST_LIMIT || '100');
      url.searchParams.append('from', new Date().toISOString().split('T')[0]);
      
      const response = await fetch(url.toString(), {
        headers: {
          'x-api-key': this.apiKey,
          'Accept': 'application/json',
          'User-Agent': 'SwissActivitiesDashboard/1.0'
        }
      });

      if (!response.ok) {
        throw new Error(`ST API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      // Map flexible payloads: either an array, or { events: [] }
      const events: SwitzerlandTourismEvent[] = Array.isArray(data) ? data : (data.events || []);

      const rawEvents: RawEvent[] = [];

      for (const event of events) {
        try {
          const rawEvent = await this.transformEvent(event);
          if (rawEvent) {
            rawEvents.push(rawEvent);
          }
        } catch (error) {
          console.error('Error transforming ST event:', event.id, error);
        }
      }

      console.log(`Switzerland Tourism: Scraped ${rawEvents.length} events`);
      return rawEvents;
    } catch (error) {
      console.error('Switzerland Tourism scraper error:', error);
      return [];
    }
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
