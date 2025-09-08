import * as cheerio from 'cheerio';
import { RawEvent, SOURCES, CATEGORIES } from '@/types/event';
import { geocodeAddress, formatSwissAddress } from '@/lib/utils/geocoding';
import { extractJsonLd, jsonLdToRawEvents } from '@/lib/utils/jsonld';

export class LimmattalScraper {
  private baseUrl = 'https://www.limmatstadt.ch/veranstaltungen';

  async scrapeEvents(): Promise<RawEvent[]> {
    try {
      const response = await fetch(this.baseUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`Limmattal scraper error: ${response.status}`);
      }

      const html = await response.text();

      // Try JSON-LD on listing page (in case events are embedded)
      const ld = extractJsonLd(html);
      let events: RawEvent[] = await jsonLdToRawEvents(ld, SOURCES.LIMMATTAL, 'de');
      console.log('Limmattal listing JSON-LD count:', ld.length, 'events from JSON-LD:', events.length);

      // Parse event cards from the main listing page FIRST (faster)
      if (events.length === 0) {
        const $ = cheerio.load(html);
        
        // Look for event links and cards
        $('a[href*="veranstaltungen"], a[href*="event"]').each((_, element) => {
          try {
            const $element = $(element);
            const href = $element.attr('href');
            if (!href) return;
            
            // Extract event data from the card
            const title = $element.find('h3').text().trim() || $element.text().split('\n')[0]?.trim();
            if (!title || title.length < 5) return;
            
            const fullText = $element.text();
            
            // Extract date using German format
            const dateMatch = fullText.match(/(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(\d{4})/i);
            if (!dateMatch) return;
            
            const startTime = this.parseGermanDate(dateMatch[1], dateMatch[2], dateMatch[3]);
            if (!startTime || isNaN(startTime.getTime())) return;
            
            // Skip events too far in the past or future
            const now = new Date();
            const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
            const oneYearFromNow = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
            
            if (startTime < twoWeeksAgo || startTime > oneYearFromNow) return;
            
            // Extract location from text
            const locationMatch = fullText.match(/(Schlieren|Dietikon|Oetwil|Urdorf|Oberengstringen|Weiningen|Limmattal)/i);
            const city = locationMatch ? locationMatch[1] : 'Schlieren'; // Default to Schlieren
            
            const url = href.startsWith('http') ? href : `https://www.limmatstadt.ch${href}`;
            
            const event: RawEvent = {
              source: SOURCES.LIMMATTAL,
              sourceEventId: this.generateEventId(title, startTime),
              title: title.trim(),
              description: fullText.length > title.length ? fullText.substring(title.length).trim() : undefined,
              lang: 'de',
              category: this.inferCategory(title, fullText),
              startTime,
              endTime: undefined, // Required field
              venueName: undefined, // Required field
              street: undefined,
              postalCode: undefined,
              city,
              country: 'CH',
              lat: undefined,
              lon: undefined,
              priceMin: undefined,
              priceMax: undefined,
              currency: 'CHF',
              url,
              imageUrl: undefined
            };
            
            events.push(event);
          } catch (error) {
            console.error('Error parsing Limmattal event card:', error);
          }
        });
        
        console.log(`Limmattal main page parsing: ${events.length} events found`);
      }

      // Only visit detail pages if main page parsing failed AND we have time budget
      if (events.length === 0) {
        const $ = cheerio.load(html);
        const detailLinks = new Set<string>();
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href) return;
          if (/veranstaltungen|event|events/i.test(href)) {
            const abs = href.startsWith('http') ? href : `https://www.limmatstadt.ch${href}`;
            detailLinks.add(abs.split('#')[0]);
          }
        });

        console.log('Limmattal detail links found:', detailLinks.size);
        const cap = Math.min(detailLinks.size, 5); // Further reduce from 15 to 5 for speed
        const links = Array.from(detailLinks).slice(0, cap);
        for (const link of links) {
          try {
            await this.delay(100); // Reduce delay from 300ms to 100ms
            const r = await fetch(link, { headers: { 'User-Agent': 'SwissActivitiesDashboard/1.0' } });
            if (!r.ok) continue;
            const page = await r.text();
            const ld2 = extractJsonLd(page);
            const ev = await jsonLdToRawEvents(ld2, SOURCES.LIMMATTAL, 'de');
            // If JSON-LD not present, fallback to legacy parse
            if (ev.length > 0) {
              // Attach canonical URL when missing
              ev.forEach(e => { if (!e.url) e.url = link; });
              events.push(...ev);
            } else {
              const $d = cheerio.load(page);
              const parsed = await this.parseEvent($d, $d('body'));
              if (parsed) {
                parsed.url = parsed.url || link;
                events.push(parsed);
              }
            }
          } catch (e) {
            console.error('Limmattal detail fetch error:', e);
          }
        }
      }


      console.log(`Limmattal: Scraped ${events.length} events`);
      return events;
    } catch (error) {
      console.error('Limmattal scraper error:', error);
      return [];
    }
  }

  private delay(ms: number): Promise<void> {
    return new Promise(res => setTimeout(res, ms));
  }

  private async parseEvent($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>): Promise<RawEvent | null> {
    const title = this.extractText($, element, '.title, .event-title, h1, h2, h3, h4, .name');
    if (!title) return null;

    const description = this.extractText($, element, '.description, .event-description, .content, p');
    const dateStr = this.extractText($, element, '.date, .event-date, .datum, time');
    const timeStr = this.extractText($, element, '.time, .event-time, .zeit');
    const venue = this.extractText($, element, '.venue, .location, .ort, .veranstaltungsort');
    // Prefer detail links that look like event detail pages
    let url = element.find('a[href*="veranstaltungen"], a[href*="event"], a[href*="events"]').first().attr('href')
      || element.find('a').first().attr('href');

    const startTime = this.parseDateTime(dateStr, timeStr);
    if (!startTime) return null;

    // Enhanced location extraction
    const locationText = venue || element.text();
    const postalMatch = locationText.match(/(\d{4})\s+([A-Za-z\s]+)/); // Swiss postal code pattern
    
    let city: string | undefined;
    let postalCode: string | undefined;
    let street: string | undefined;
    let lat: number | undefined;
    let lon: number | undefined;

    if (postalMatch) {
      postalCode = postalMatch[1];
      city = postalMatch[2].trim();
    } else {
      city = this.inferCity(locationText);
    }

    // Try to extract street from venue if available
    if (venue && venue.includes(',')) {
      const parts = venue.split(',').map(p => p.trim());
      if (parts.length >= 2) {
        street = parts[0];
        // Look for postal code in remaining parts
        for (let i = 1; i < parts.length; i++) {
          const match = parts[i].match(/(\d{4})\s+(.+)/);
          if (match) {
            postalCode = match[1];
            city = match[2];
            break;
          }
        }
      }
    }

    // Geocode with full address if available
    if (city) {
      const fullAddress = formatSwissAddress(street, postalCode, city);
      const coords = await geocodeAddress(fullAddress);
      if (coords) {
        lat = coords.lat;
        lon = coords.lon;
      }
    }

    return {
      source: SOURCES.LIMMATTAL,
      sourceEventId: this.generateEventId(title, startTime),
      title: title.trim(),
      description,
      lang: 'de',
      category: this.inferCategory(title, description),
      startTime,
      venueName: venue,
      street,
      postalCode,
      city,
      country: 'CH',
      lat,
      lon,
      url: url ? (url.startsWith('http') ? url : `https://www.limmatstadt.ch${url}`) : undefined
    };
  }

  private parseTextEvent(text: string): RawEvent | null {
    // Extract date patterns
    const dateMatch = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    const timeMatch = text.match(/(\d{1,2})[:\.]\d{2}/);
    
    if (!dateMatch) return null;

    const day = parseInt(dateMatch[1]);
    const month = parseInt(dateMatch[2]);
    const year = parseInt(dateMatch[3]);
    
    const startTime = new Date(year, month - 1, day);
    if (timeMatch) {
      const [hour, minute] = timeMatch[0].split(/[:.]/).map(n => parseInt(n));
      startTime.setHours(hour, minute);
    }

    // Extract title (text before first punctuation or line break)
    const titleMatch = text.match(/^([^.\n]+)/);
    const title = titleMatch ? titleMatch[1].trim() : text.substring(0, 100);

    return {
      source: SOURCES.LIMMATTAL,
      sourceEventId: this.generateEventId(title, startTime),
      title,
      description: undefined,
      lang: 'de',
      category: this.inferCategory(title),
      startTime,
      endTime: undefined,
      venueName: undefined,
      street: undefined,
      postalCode: undefined,
      city: undefined,
      country: 'CH',
      lat: undefined,
      lon: undefined,
      priceMin: undefined,
      priceMax: undefined,
      currency: 'CHF',
      url: undefined,
      imageUrl: undefined
    };
  }

  private extractText($: cheerio.CheerioAPI, element: cheerio.Cheerio<any>, selector: string): string | undefined {
    const found = element.find(selector).first();
    if (found.length) {
      return found.text().trim();
    }
    return undefined;
  }

  private parseDateTime(dateStr?: string, timeStr?: string): Date | null {
    if (!dateStr) return null;

    // Try different date formats
    let date: Date | null = null;

    // DD.MM.YYYY format
    const ddmmyyyy = dateStr.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (ddmmyyyy) {
      date = new Date(parseInt(ddmmyyyy[3]), parseInt(ddmmyyyy[2]) - 1, parseInt(ddmmyyyy[1]));
    }

    // German month names
    const germanMonths = {
      'januar': 0, 'februar': 1, 'märz': 2, 'april': 3, 'mai': 4, 'juni': 5,
      'juli': 6, 'august': 7, 'september': 8, 'oktober': 9, 'november': 10, 'dezember': 11
    };

    const germanDate = dateStr.match(/(\d{1,2})\s+(januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)/i);
    if (germanDate && !date) {
      const month = germanMonths[germanDate[2].toLowerCase() as keyof typeof germanMonths];
      const currentYear = new Date().getFullYear();
      date = new Date(currentYear, month, parseInt(germanDate[1]));
    }

    if (!date || isNaN(date.getTime())) return null;

    // Add time if provided
    if (timeStr) {
      const timeMatch = timeStr.match(/(\d{1,2})[:.](\d{2})/);
      if (timeMatch) {
        date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2]));
      }
    }

    return date;
  }

  private inferCategory(title: string, description?: string): string | undefined {
    const text = `${title} ${description || ''}`.toLowerCase();
    
    if (text.includes('fest') || text.includes('festival')) return CATEGORIES.FESTIVAL;
    if (text.includes('konzert') || text.includes('musik')) return CATEGORIES.MUSIC;
    if (text.includes('markt')) return CATEGORIES.MARKET;
    if (text.includes('familie') || text.includes('kinder')) return CATEGORIES.FAMILY;
    if (text.includes('sport')) return CATEGORIES.SPORTS;
    if (text.includes('kultur') || text.includes('theater')) return CATEGORIES.CULTURE;
    if (text.includes('gemeinde') || text.includes('versammlung')) return CATEGORIES.COMMUNITY;
    if (text.includes('weihnacht') || text.includes('advent')) return CATEGORIES.SEASONAL;
    
    return undefined;
  }

  private inferCity(text: string): string | undefined {
    const cities = ['Schlieren', 'Dietikon', 'Oetwil', 'Urdorf', 'Oberengstringen', 'Weiningen'];
    const lowerText = text.toLowerCase();
    
    for (const city of cities) {
      if (lowerText.includes(city.toLowerCase())) {
        return city;
      }
    }
    
    return undefined;
  }

  private parseGermanDate(day: string, month: string, year: string): Date | null {
    const germanMonths = {
      'januar': 0, 'februar': 1, 'märz': 2, 'april': 3, 'mai': 4, 'juni': 5,
      'juli': 6, 'august': 7, 'september': 8, 'oktober': 9, 'november': 10, 'dezember': 11
    };
    
    const monthIndex = germanMonths[month.toLowerCase() as keyof typeof germanMonths];
    if (monthIndex === undefined) return null;
    
    const date = new Date(parseInt(year), monthIndex, parseInt(day));
    return isNaN(date.getTime()) ? null : date;
  }

  private generateEventId(title: string, startTime: Date): string {
    const hash = title.toLowerCase().replace(/\s+/g, '-').substring(0, 20);
    const timestamp = startTime.getTime().toString(36);
    return `limmattal-${hash}-${timestamp}`;
  }
}
