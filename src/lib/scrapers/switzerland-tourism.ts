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
    this.baseUrl = 'https://opendata.myswitzerland.io/v1'; // OpenData MySwitzerland API  
    this.discoverBaseUrl = 'https://api.discover.swiss/info/v2'; // Discover.swiss API
    
    if (!this.apiKey && !this.discoverApiKey) {
      throw new Error('Either ST_API_KEY or DISCOVER_SWISS_API_KEY is required');
    }
    
    console.log(`Using Switzerland Tourism APIs - MySwitzerland: ${!!this.apiKey}, Discover: ${!!this.discoverApiKey}`);
  }

  async scrapeEvents(): Promise<RawEvent[]> {
    try {
      // Use the attractions endpoint as specified
      await this.rateLimiter.waitForNextRequest();
      
      const url = new URL(`${this.baseUrl}/attractions`);
      const bbox = process.env.ST_BBOX || '7.0,46.0,10.5,48.5';
      url.searchParams.append('bbox', bbox);
      url.searchParams.append('lang', process.env.ST_LANG || 'de');
      url.searchParams.append('limit', process.env.ST_LIMIT || '100');

      console.log('Fetching from:', url.toString());

      const response = await fetch(url.toString(), {
        headers: {
          'x-api-key': this.apiKey || 'TaX5CpphzS32bCUNPAfog465D6RtYgO1191X2CZ2',
          'Accept': 'application/json',
          'User-Agent': 'SwissActivitiesDashboard/1.0'
        }
      });

      if (!response.ok) {
        console.error(`ST API error: ${response.status} ${response.statusText}`);
        return [];
      }

      const data = await response.json();
      console.log('ST API response keys:', Object.keys(data || {}));
      
      let items: any[] = [];
      if (Array.isArray(data)) {
        items = data;
      } else if (data && data.data) {
        items = data.data;
      }
      
      console.log(`ST API: ${items.length} attractions found`);
      
      const rawEvents: RawEvent[] = [];
      for (const item of items) {
        try {
          const event = await this.transformAttraction(item);
          if (event) rawEvents.push(event);
        } catch (e) {
          console.error('Error transforming ST item:', item?.identifier, e);
        }
      }
      
      console.log(`ST API: ${rawEvents.length} events mapped`);
      return rawEvents;
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
    
    // Use attractions endpoint as it's the documented working endpoint
    return await this.scrapeAttractionsAsFallback();
  }

  private async scrapeAttractionsAsFallback(): Promise<RawEvent[]> {
    console.log('Trying OpenData attractions endpoint...');
    
    // Use the documented OpenData endpoint 
    const url = new URL(`${this.baseUrl}/data`); // OpenData endpoint
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

    // Filter out non-European languages
    const nonEuropeanPatterns = [
      /[\u0600-\u06FF]/, // Arabic
      /[\u0590-\u05FF]/, // Hebrew  
      /[\u4E00-\u9FFF]/, // Chinese
      /[\u3040-\u309F\u30A0-\u30FF]/, // Japanese
      /[\u0400-\u04FF]/, // Cyrillic (Russian)
      /[\u0E00-\u0E7F]/, // Thai
      /[\u0D80-\u0DFF]/, // Sinhala
      /[\u0980-\u09FF]/, // Bengali
    ];
    
    if (nonEuropeanPatterns.some(pattern => pattern.test(title))) {
      return null;
    }

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

    // Category inference - prioritize Alpsabzug, then infer from content
    let category: string | undefined;
    if (isAlpsabzug) {
      category = CATEGORIES.ALPSABZUG;
    } else {
      // First try classification data
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
      
      // If no category from classifications, infer from title/description
      if (!category) {
        category = this.mapCategory(combinedText);
        
        // Additional pattern matching for better categorization
        if (combinedText.includes('weihnacht') || combinedText.includes('advent') || 
            combinedText.includes('christmas')) {
          category = CATEGORIES.SEASONAL;
        } else if (combinedText.includes('führung') || combinedText.includes('besichtigung') || 
                   combinedText.includes('tour') || combinedText.includes('museum')) {
          category = CATEGORIES.CULTURE;
        } else if (combinedText.includes('wandern') || combinedText.includes('hiking') ||
                   combinedText.includes('ski') || combinedText.includes('bike')) {
          category = CATEGORIES.SPORTS;
        }
      }
    }

    // Extract city from address if coordinates available
    let city: string | undefined;
    if (lat && lon) {
      try {
        // Try to reverse geocode to get city name
        const reverseGeocode = await this.reverseGeocodeSwiss(lat, lon);
        city = reverseGeocode?.city;
      } catch (error) {
        console.log('Reverse geocoding failed:', error);
      }
    }

    // Extract date information if available, otherwise use upcoming dates
    let startTime = new Date();
    let endTime: Date | undefined;
    
    // Try to extract dates from node data
    if (node.validFrom && node.validThrough) {
      startTime = new Date(node.validFrom);
      endTime = new Date(node.validThrough);
    } else if (node.startDate) {
      startTime = new Date(node.startDate);
      if (node.endDate) {
        endTime = new Date(node.endDate);
      }
    } else {
      // For attractions without specific dates, set them as available from tomorrow
      // to avoid showing scraper runtime
      startTime = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    return {
      source: SOURCES.ST,
      sourceEventId: node.identifier || url,
      title,
      description,
      lang: process.env.ST_LANG || 'de',
      category,
      startTime,
      endTime,
      venueName: title, // Use title as venue for attractions
      street: undefined,
      postalCode: undefined,
      city: city || undefined,
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

  private async reverseGeocodeSwiss(lat: number, lon: number): Promise<{ city?: string } | null> {
    try {
      const email = process.env.NOMINATIM_EMAIL || 'activities@example.com';
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.append('lat', lat.toString());
      url.searchParams.append('lon', lon.toString());
      url.searchParams.append('format', 'json');
      url.searchParams.append('addressdetails', '1');
      
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': `SwissActivitiesDashboard/2.0 (${email})`
        }
      });
      
      if (!response.ok) return null;
      
      const data = await response.json();
      
      // Extract city from address components
      const address = data.address || {};
      const city = address.city || address.town || address.village || address.municipality;
      
      return city ? { city } : null;
    } catch (error) {
      console.error('Reverse geocoding error:', error);
      return null;
    }
  }

  private mapCategory(category?: string): string | undefined {
    if (!category) return undefined;
    
    const categoryLower = category.toLowerCase();
    
    // Filter out city names and administrative terms (don't return them as categories)
    const cityNames = [
      'zürich', 'zurich', 'bern', 'geneva', 'basel', 'lausanne', 'winterthur', 
      'lucerne', 'luzern', 'st. gallen', 'biel', 'thun', 'köniz', 'schaffhausen',
      'fribourg', 'chur', 'neuchâtel', 'vernier', 'uster', 'sion', 'emmen',
      'yverdon', 'zug', 'kriens', 'rapperswil', 'dietikon', 'schlieren', 
      'urdorf', 'oberengstringen', 'weiningen', 'baden', 'wohlen', 'bremgarten',
      'olten', 'solothurn', 'aarau', 'frauenfeld'
    ];
    
    const adminTerms = [
      'gemeinde', 'municipality', 'canton', 'kanton', 'region', 'bezirk', 
      'district', 'stadt', 'city', 'dorf', 'village', 'ort', 'place'
    ];
    
    // Don't return city names or administrative terms as categories
    if (cityNames.some(city => categoryLower === city) || 
        adminTerms.some(term => categoryLower.includes(term))) {
      return undefined;
    }
    
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
    
    // Only return the original category if it's not a city name or admin term
    return category;
  }
}
