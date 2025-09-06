import * as cheerio from 'cheerio';
import { RawEvent, SOURCES, CATEGORIES } from '@/types/event';
import { geocodeAddress, formatSwissAddress } from '@/lib/utils/geocoding';

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
      const $ = cheerio.load(html);
      
      const events: RawEvent[] = [];
      
      // Look for common event container patterns
      const eventElements = $('.event, .veranstaltung, .event-item, [class*="event"]').toArray();
      
      for (const element of eventElements) {
        try {
          const event = await this.parseEvent($, $(element));
          if (event) {
            events.push(event);
          }
        } catch (error) {
          console.error('Error parsing Limmattal event:', error);
        }
      }

      // Fallback: look for date patterns and event titles
      if (events.length === 0) {
        $('*').each((_, element) => {
          const text = $(element).text().trim();
          const hasDate = /\d{1,2}\.\d{1,2}\.\d{4}|\d{1,2}\s+(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)/i.test(text);
          const hasTime = /\d{1,2}[:\.]\d{2}/.test(text);
          
          if (hasDate && text.length > 20 && text.length < 200) {
            try {
              const event = this.parseTextEvent(text);
              if (event) {
                events.push(event);
              }
            } catch (error) {
              console.error('Error parsing text event:', error);
            }
          }
        });
      }

      console.log(`Limmattal: Scraped ${events.length} events`);
      return events;
    } catch (error) {
      console.error('Limmattal scraper error:', error);
      return [];
    }
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

    // Try to extract location info
    const locationText = venue || element.text();
    const locationMatch = locationText.match(/(\d{4}\s+\w+)/); // Swiss postal code pattern
    const city = locationMatch ? locationMatch[1] : this.inferCity(locationText);

    let lat: number | undefined;
    let lon: number | undefined;

    if (city) {
      const coords = await geocodeAddress(city);
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
      city: city,
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
      lang: 'de',
      category: this.inferCategory(title),
      startTime,
      country: 'CH'
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

  private generateEventId(title: string, startTime: Date): string {
    const hash = title.toLowerCase().replace(/\s+/g, '-').substring(0, 20);
    const timestamp = startTime.getTime().toString(36);
    return `limmattal-${hash}-${timestamp}`;
  }
}
