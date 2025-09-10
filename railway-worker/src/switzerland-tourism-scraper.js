const { PrismaClient } = require('@prisma/client');

// Initialize Prisma client
const prisma = new PrismaClient({
  log: ['error', 'warn'],
  errorFormat: 'minimal'
});

class SwitzerlandTourismScraper {
  constructor() {
    this.apiKey = process.env.ST_API_KEY || '';
    this.baseUrl = 'https://opendata.myswitzerland.io/v1';
    this.email = process.env.NOMINATIM_EMAIL || 'activities@example.com';
    
    // Debug environment variables
    console.log('ST_API_KEY present:', !!this.apiKey);
    console.log('ST_API_KEY length:', this.apiKey.length);
    console.log('ST_BBOX:', process.env.ST_BBOX);
    console.log('ST_LANG:', process.env.ST_LANG);
    console.log('ST_LIMIT:', process.env.ST_LIMIT);
    console.log('NOMINATIM_EMAIL:', process.env.NOMINATIM_EMAIL);
    
    if (!this.apiKey) {
      throw new Error('ST_API_KEY is required for Switzerland Tourism scraper');
    }
    
    console.log('Switzerland Tourism scraper initialized');
  }

  async scrapeEvents() {
    try {
      console.log('Starting Switzerland Tourism API scraping with geocoding...');
      
      const allOffers = await this.fetchAllOffers();
      console.log(`Fetched ${allOffers.length} offers from ST API`);
      
      const events = [];
      let processed = 0;
      
      for (const offer of allOffers) {
        try {
          const event = await this.transformOffer(offer);
          if (event) {
            events.push(event);
            processed++;
            if (processed % 10 === 0) {
              console.log(`Processed ${processed}/${allOffers.length} offers...`);
            }
          }
        } catch (error) {
          console.error('Error transforming offer:', offer.identifier, error.message);
        }
      }
      
      console.log(`Transformed ${events.length} events from ${allOffers.length} offers`);
      
      // Save events to database
      const savedCount = await this.saveEvents(events);
      
      return {
        eventsFound: events.length,
        eventsSaved: savedCount,
        offersProcessed: allOffers.length
      };
    } catch (error) {
      console.error('ST scraper error:', error);
      return {
        eventsFound: 0,
        eventsSaved: 0,
        error: error.message
      };
    }
  }

  async fetchAllOffers() {
    const allOffers = [];
    const bbox = process.env.ST_BBOX || '7.0,46.0,10.5,48.5';
    const maxPages = parseInt(process.env.ST_LIMIT || '10'); // Number of pages to fetch
    
    // Set date range for next 3 months
    const today = new Date();
    const futureDate = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    
    for (let page = 0; page < maxPages; page++) {
      try {
        const url = new URL(`${this.baseUrl}/offers`);
        url.searchParams.append('bbox', bbox);
        url.searchParams.append('validFrom', today.toISOString().split('T')[0]);
        url.searchParams.append('validThrough', futureDate.toISOString().split('T')[0]);
        url.searchParams.append('lang', process.env.ST_LANG || 'de');
        url.searchParams.append('page', page.toString());
        url.searchParams.append('expand', 'true');
        
        console.log(`Fetching ST API page ${page}...`);
        
        const response = await fetch(url.toString(), {
          headers: {
            'x-api-key': this.apiKey,
            'Accept': 'application/json',
            'User-Agent': 'SwissActivitiesDashboard/2.0'
          }
        });
        
        if (!response.ok) {
          console.error(`ST API error on page ${page}: ${response.status}`);
          break;
        }
        
        const data = await response.json();
        const offers = data.data || [];
        
        console.log(`Page ${page}: ${offers.length} offers`);
        allOffers.push(...offers);
        
        // If we got less than 10, we're on the last page
        if (offers.length < 10) {
          console.log('Reached last page');
          break;
        }
        
        // Rate limiting - wait 500ms between requests
        if (page < maxPages - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error fetching page ${page}:`, error.message);
        break;
      }
    }
    
    return allOffers;
  }

  async transformOffer(offer) {
    if (!offer.name || !offer.validFrom) {
      return null;
    }
    
    const startTime = new Date(offer.validFrom);
    const endTime = offer.validThrough ? new Date(offer.validThrough) : null;
    
    // Skip past events
    if (endTime && endTime < new Date()) {
      return null;
    }
    
    // Filter for event-like offers
    const durationDays = endTime ? 
      Math.ceil((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24)) : 1;
    
    // Skip very long-term offers unless they have event keywords
    if (durationDays > 90 && !this.isEventLikeOffer(offer)) {
      return null;
    }
    
    // Extract location data
    let lat = offer.areaServed?.geo?.latitude;
    let lon = offer.areaServed?.geo?.longitude;
    let city = null;
    let venueName = offer.areaServed?.name;
    
    // Geocode to get city name if we have coordinates
    if (lat && lon) {
      try {
        const geocodeResult = await this.reverseGeocode(lat, lon);
        city = geocodeResult?.city;
      } catch (error) {
        console.log(`Geocoding failed for ${offer.identifier}`);
      }
    }
    
    // Extract price info
    const priceSpec = offer.priceSpecification || {};
    const priceMin = priceSpec.minPrice;
    const priceMax = priceSpec.maxPrice;
    const currency = priceSpec.priceCurrency || 'CHF';
    
    return {
      source: 'ST',
      sourceEventId: offer.identifier || offer.url,
      title: offer.name,
      description: offer.abstract || offer.description || `Available from ${offer.validFrom} to ${offer.validThrough}`,
      lang: process.env.ST_LANG || 'de',
      category: this.mapCategory(offer.name + ' ' + (offer.abstract || '')),
      startTime,
      endTime,
      venueName,
      street: null,
      postalCode: null,
      city,
      country: 'CH',
      lat,
      lon,
      priceMin,
      priceMax,
      currency,
      url: offer.url || offer.mainEntityOfPage,
      imageUrl: offer.image?.[0]?.url
    };
  }

  isEventLikeOffer(offer) {
    const text = (offer.name + ' ' + (offer.abstract || '')).toLowerCase();
    const eventKeywords = [
      'führung', 'tour', 'fest', 'festival', 'konzert', 'markt', 'event',
      'rundfahrt', 'rundgang', 'besichtigung', 'vorführung', 'aufführung',
      'workshop', 'kurs', 'seminar', 'veranstaltung', 'ausstellung',
      'theater', 'oper', 'ballet', 'tanz', 'musik', 'show', 'vorstellung',
      'märit', 'chilbi', 'fasnacht', 'fasching', 'karneval', 'weihnachtsmarkt',
      'sportanlass', 'wettkampf', 'turnier', 'rennen', 'lauf', 'marathon'
    ];
    
    return eventKeywords.some(keyword => text.includes(keyword));
  }

  mapCategory(text) {
    const textLower = text.toLowerCase();
    
    if (textLower.includes('alp') || textLower.includes('vieh')) {
      return 'alpsabzug';
    }
    if (textLower.includes('festival') || textLower.includes('fest')) {
      return 'festival';
    }
    if (textLower.includes('musik') || textLower.includes('konzert')) {
      return 'musik';
    }
    if (textLower.includes('markt')) {
      return 'markt';
    }
    if (textLower.includes('familie') || textLower.includes('kinder')) {
      return 'familie';
    }
    if (textLower.includes('sport')) {
      return 'sport';
    }
    if (textLower.includes('kultur') || textLower.includes('theater')) {
      return 'kultur';
    }
    if (textLower.includes('weihnacht') || textLower.includes('advent')) {
      return 'saisonal';
    }
    
    return null;
  }

  async reverseGeocode(lat, lon) {
    try {
      const url = new URL('https://nominatim.openstreetmap.org/reverse');
      url.searchParams.append('lat', lat.toString());
      url.searchParams.append('lon', lon.toString());
      url.searchParams.append('format', 'json');
      url.searchParams.append('addressdetails', '1');
      url.searchParams.append('accept-language', 'de');
      
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': `SwissActivitiesDashboard/2.0 (${this.email})`
        }
      });
      
      if (!response.ok) {
        return null;
      }
      
      const data = await response.json();
      const address = data.address || {};
      const city = address.city || address.town || address.village || address.municipality;
      
      return { city };
    } catch (error) {
      console.error('Reverse geocoding error:', error.message);
      return null;
    }
  }

  async saveEvents(events) {
    let savedCount = 0;
    
    for (const event of events) {
      try {
        // Generate uniqueness hash
        const uniquenessHash = this.generateHash(event);
        const titleNorm = event.title.toLowerCase().trim();
        
        // Check if event exists
        const existing = await prisma.event.findUnique({
          where: { uniquenessHash }
        });
        
        if (!existing) {
          await prisma.event.create({
            data: {
              ...event,
              titleNorm,
              uniquenessHash
            }
          });
          savedCount++;
        }
      } catch (error) {
        console.error('Error saving event:', event.title, error.message);
      }
    }
    
    console.log(`Saved ${savedCount} new events to database`);
    return savedCount;
  }

  generateHash(event) {
    const crypto = require('crypto');
    const normalized = {
      title: event.title.toLowerCase().trim(),
      startTime: Math.round(event.startTime.getTime() / 60000), // minute precision
      lat: event.lat ? Math.round(event.lat * 10000) / 10000 : null,
      lon: event.lon ? Math.round(event.lon * 10000) / 10000 : null
    };
    
    return crypto.createHash('sha1')
      .update(JSON.stringify(normalized))
      .digest('hex');
  }
}

module.exports = { SwitzerlandTourismScraper };