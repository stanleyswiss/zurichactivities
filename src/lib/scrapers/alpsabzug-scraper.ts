import * as cheerio from 'cheerio';
import { RawEvent, SOURCES, CATEGORIES } from '@/types/event';
import { geocodeAddress } from '@/lib/utils/geocoding';

export class AlpsabzugScraper {
  private baseUrl = 'https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/veranstaltungen-suche/?rubrik=alpabzuegeaelplerfeste';

  async scrapeEvents(): Promise<RawEvent[]> {
    try {
      console.log('Scraping Alpsabzug events from myswitzerland.com...');
      
      const response = await fetch(this.baseUrl, {
        headers: {
          'User-Agent': 'SwissActivitiesDashboard/1.0 (compatible; educational use)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'de-CH,de;q=0.8,en;q=0.6',
          'Accept-Encoding': 'gzip, deflate, br'
        }
      });

      if (!response.ok) {
        throw new Error(`Alpsabzug scraper error: ${response.status}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      const events: RawEvent[] = [];
      
      console.log('HTML length:', html.length);
      console.log('Page title:', $('title').text());
      console.log('Body text sample:', $('body').text().substring(0, 200));

      // Parse all text content and look for Alpsabzug patterns
      // Since we're on the filtered page, all events should be Alpsabzug-related
      const bodyText = $('body').text();
      
      // Try multiple parsing strategies
      
      // Strategy 1: Look for the actual CSS classes used by myswitzerland.com
      const gridItems = $('.GridTeaser--grid--item, [class*="GridTeaser"], [class*="grid"], .teaser, .card, li, article, [class*="item"], [class*="event"]');
      console.log('Found grid items:', gridItems.length);
      
      gridItems.each((_, element) => {
        try {
          const $element = $(element);
          const text = $element.text().trim();
          
          if (text.length < 20) return; // Skip short elements
          
          const event = this.parseEventFromText(text, $element);
          if (event) {
            events.push(event);
          }
        } catch (error) {
          console.error('Error parsing list item:', error);
        }
      });
      
      // Strategy 2: Look for date patterns in the full text
      if (events.length === 0) {
        const lines = bodyText.split('\n').filter(line => line.trim().length > 20);
        
        for (const line of lines) {
          try {
            // Look for lines with dates and locations
            if (this.hasDatePattern(line) && this.hasLocationPattern(line)) {
              const event = this.parseEventFromText(line.trim());
              if (event) {
                events.push(event);
              }
            }
          } catch (error) {
            console.error('Error parsing text line:', error);
          }
        }
      }
      
      console.log(`Alpsabzug parsing strategies found ${events.length} events`);

      // Fallback: look for any text patterns that might contain events
      if (events.length === 0) {
        const bodyText = $('body').text();
        const eventPatterns = this.extractEventsFromText(bodyText);
        events.push(...eventPatterns);
      }

      // Geocode locations for events that have city information
      for (const event of events) {
        if (event.city && !event.lat) {
          try {
            const coords = await geocodeAddress(`${event.city}, Switzerland`);
            if (coords) {
              event.lat = coords.lat;
              event.lon = coords.lon;
            }
          } catch (error) {
            console.error(`Geocoding error for ${event.city}:`, error);
          }
          // Add delay to be respectful to geocoding service
          await this.delay(200);
        }
      }

      console.log(`Alpsabzug scraper: Found ${events.length} events`);
      return events;
    } catch (error) {
      console.error('Alpsabzug scraper error:', error);
      return [];
    }
  }

  private parseEventFromText(text: string, $element?: cheerio.Cheerio<any>): RawEvent | null {
    const startTime = this.parseDate(text);
    if (!startTime) return null;

    // Extract title - first meaningful line or up to first date
    const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    let title = lines[0];
    
    // If title is just a date, try to get a better title
    if (this.hasDatePattern(title) && lines.length > 1) {
      title = lines.find(l => !this.hasDatePattern(l) && l.length > 5) || title;
    }
    
    // Clean up title
    title = title.replace(/^\d+\.\s*/, '').trim(); // Remove leading numbers
    if (title.length < 3) return null;

    // Extract location
    const location = this.extractLocationFromText(text);
    if (!location) return null; // Must have a location

    // Get URL if available
    let url: string | undefined;
    if ($element) {
      const relativeUrl = $element.find('a').first().attr('href');
      url = relativeUrl ? (relativeUrl.startsWith('http') ? relativeUrl : `https://www.myswitzerland.com${relativeUrl}`) : undefined;
    }

    return {
      source: SOURCES.ALPSABZUG,
      sourceEventId: `alpsabzug-${this.generateId(title, startTime)}`,
      title,
      description: `Traditional Alpine cattle descent event in ${location}`,
      lang: 'de',
      category: CATEGORIES.ALPSABZUG,
      startTime,
      city: location,
      country: 'CH',
      url
    };
  }

  private hasDatePattern(text: string): boolean {
    // Match patterns like "9 Sep", "13 Sep", "9. September", etc.
    return /\d{1,2}\s*(Sep|Sept|September|Okt|Oktober)|\d{1,2}\.\s*(September|Oktober|\d{1,2}\.\d{2,4})/i.test(text);
  }

  private hasLocationPattern(text: string): boolean {
    // Check for Swiss location names
    const locations = [
      'Grindelwald', 'Zermatt', 'Appenzell', 'Engelberg', 'Davos', 'St. Moritz',
      'Saas-Fee', 'Verbier', 'Crans-Montana', 'Lenzerheide', 'Flims', 'Andermatt',
      'Gstaad', 'Wengen', 'Mürren', 'Klosters', 'Arosa', 'Pontresina',
      'Lauterbrunnen', 'St. Stephan', 'Müstair', 'Schwarzsee', 'Gimmelwald',
      'Schwyz', 'Glarus', 'Nidwalden', 'Obwalden', 'Uri', 'Wallis', 'Graubünden'
    ];
    
    return locations.some(loc => text.toLowerCase().includes(loc.toLowerCase()));
  }

  private isAlpsabzugEvent(title: string, fullText: string): boolean {
    const combinedText = `${title} ${fullText}`.toLowerCase();
    
    // Primary Alpsabzug keywords
    const alpsabzugTerms = [
      'alpabzug', 'alpsabzug', 'alpabfahrt', 'alpsabfahrt',
      'viehscheid', 'viehschied', 'désalpe', 'desalpe',
      'alpfest', 'älplerfest', 'sennen', 'sennerei',
      'alpaufzug', 'alpauftrieb', 'tierumfahrt',
      'alpweide', 'almabtrieb', 'cattle descent'
    ];

    // Secondary related terms (must be combined with location/context)
    const relatedTerms = [
      'kühe', 'rinder', 'vieh', 'tiere', 'cattle', 'cows',
      'alp', 'alm', 'bergbauer', 'berghof', 'alphütte',
      'tradition', 'brauch', 'folklore', 'hirten', 'senner'
    ];

    // Check for primary terms (sufficient alone)
    for (const term of alpsabzugTerms) {
      if (combinedText.includes(term)) {
        return true;
      }
    }

    // Check for related terms + Alpine context
    const hasRelatedTerm = relatedTerms.some(term => combinedText.includes(term));
    const hasAlpineContext = /berg|alp|tal|hof|hütte|mountain|alpine/i.test(combinedText);
    const hasSeasonalContext = /herbst|september|oktober|autumn|fall/i.test(combinedText);
    
    return hasRelatedTerm && hasAlpineContext && hasSeasonalContext;
  }

  private parseDate(dateText: string): Date | null {
    if (!dateText) return null;

    // German date patterns for Swiss events
    const patterns = [
      // "9 Sep" or "13 Sep" format
      /(\d{1,2})\s*(Sep|Sept|September|Okt|Oktober)/i,
      // DD.MM.YYYY or DD.MM.YY
      /(\d{1,2})\.(\d{1,2})\.(\d{2,4})/,
      // DD. Month YYYY
      /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(\d{4})/i,
      // Month DD, YYYY
      /(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(\d{1,2}),?\s*(\d{4})/i
    ];

    const germanMonths = {
      'januar': 0, 'februar': 1, 'märz': 2, 'april': 3, 'mai': 4, 'juni': 5,
      'juli': 6, 'august': 7, 'september': 8, 'oktober': 9, 'november': 10, 'dezember': 11,
      'sep': 8, 'sept': 8, 'okt': 9
    };

    for (const pattern of patterns) {
      const match = dateText.match(pattern);
      if (match) {
        if (pattern.toString().includes('Sep|Sept|September|Okt|Oktober')) {
          // "9 Sep" format - first pattern
          const day = parseInt(match[1]);
          const monthName = match[2].toLowerCase();
          const month = germanMonths[monthName as keyof typeof germanMonths];
          if (month !== undefined) {
            return new Date(2025, month, day); // Assume 2025 for current events
          }
        } else if (pattern.toString().includes('Januar')) {
          // Month name pattern
          const monthName = match[1].toLowerCase();
          const day = parseInt(match[2]);
          const year = parseInt(match[3]);
          const month = germanMonths[monthName as keyof typeof germanMonths];
          if (month !== undefined) {
            return new Date(year, month, day);
          }
        } else {
          // Numeric pattern
          const day = parseInt(match[1]);
          const month = parseInt(match[2]) - 1; // JS months are 0-based
          const year = parseInt(match[3]);
          const fullYear = year < 100 ? 2000 + year : year;
          return new Date(fullYear, month, day);
        }
      }
    }

    return null;
  }

  private extractLocationFromText(text: string): string {
    // Common Swiss Alpine regions/cities where Alpsabzug happens
    const locations = [
      'Grindelwald', 'Zermatt', 'Appenzell', 'Engelberg', 'Davos', 'St. Moritz',
      'Saas-Fee', 'Verbier', 'Crans-Montana', 'Lenzerheide', 'Flims', 'Andermatt',
      'Gstaad', 'Wengen', 'Mürren', 'Klosters', 'Arosa', 'Pontresina',
      'Schwyz', 'Glarus', 'Nidwalden', 'Obwalden', 'Uri', 'Wallis', 'Graubünden'
    ];

    for (const location of locations) {
      if (text.toLowerCase().includes(location.toLowerCase())) {
        return location;
      }
    }

    return '';
  }

  private extractCityFromLocation(locationText: string): string | undefined {
    if (!locationText) return undefined;
    
    const city = this.extractLocationFromText(locationText);
    return city || undefined;
  }

  private extractEventsFromText(text: string): RawEvent[] {
    // Fallback pattern matching for Alpsabzug events in plain text
    const events: RawEvent[] = [];
    const lines = text.split('\n').filter(line => line.trim().length > 20);

    for (const line of lines) {
      if (/alp.*abzug|alp.*abfahrt|viehscheid|désalpe|alpfest/i.test(line)) {
        const date = this.parseDate(line);
        if (date) {
          const location = this.extractLocationFromText(line);
          if (location) {
            events.push({
              source: SOURCES.ST,
              sourceEventId: `alpsabzug-text-${this.generateId(line, date)}`,
              title: line.trim().substring(0, 100),
              lang: 'de',
              category: CATEGORIES.ALPSABZUG,
              startTime: date,
              city: location,
              country: 'CH'
            });
          }
        }
      }
    }

    return events;
  }

  private generateId(title: string, date: Date): string {
    const titleHash = title.toLowerCase().replace(/[^a-z0-9]/g, '').substring(0, 20);
    const dateHash = date.getTime().toString(36);
    return `${titleHash}-${dateHash}`;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}