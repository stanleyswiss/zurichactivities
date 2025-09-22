import { PrismaClient, Event, Municipality } from '@prisma/client';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import { calculateDistance } from '../utils/distance';

const SCHLIEREN_COORDS = {
  lat: parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LAT || '47.396'),
  lon: parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LON || '8.447'),
};

interface GOViSEvent {
  title: string;
  description?: string;
  startDate: Date;
  endDate?: Date;
  location?: string;
  url?: string;
  imageUrl?: string;
  category?: string;
}

export class GOViSScraper {
  private prisma: PrismaClient;
  
  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async scrapeMunicipality(municipality: Municipality): Promise<Event[]> {
    if (!municipality.eventPageUrl) {
      throw new Error(`No event page URL for ${municipality.name}`);
    }

    console.log(`Scraping GOViS events from ${municipality.name} (${municipality.eventPageUrl})`);
    
    try {
      const response = await fetch(municipality.eventPageUrl);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const $ = cheerio.load(html);
      
      // GOViS uses consistent class names across implementations
      const events: GOViSEvent[] = [];
      
      // Common GOViS event selectors
      const eventSelectors = [
        '.event-item',
        '.veranstaltung-item',
        '.agenda-item',
        'article.event',
        '.terminliste .termin',
        '.event-list-item',
      ];
      
      let foundSelector = null;
      for (const selector of eventSelectors) {
        if ($(selector).length > 0) {
          foundSelector = selector;
          break;
        }
      }
      
      if (!foundSelector) {
        console.log('No GOViS event containers found, trying alternative parsing...');
        return this.parseAlternativeFormat($, municipality);
      }
      
      $(foundSelector).each((_, element) => {
        const event = this.parseGOViSEvent($, element);
        if (event && event.startDate) {
          events.push(event);
        }
      });
      
      console.log(`Found ${events.length} events from ${municipality.name}`);
      
      // Convert to database events
      const dbEvents: Event[] = [];
      for (const event of events) {
        const dbEvent = await this.convertToDbEvent(event, municipality);
        if (dbEvent) {
          dbEvents.push(dbEvent);
        }
      }
      
      // Update municipality stats
      await this.prisma.municipality.update({
        where: { id: municipality.id },
        data: {
          lastScraped: new Date(),
          lastSuccessful: new Date(),
          eventCount: dbEvents.length,
          scrapeStatus: 'active',
          scrapeError: null,
        },
      });
      
      return dbEvents;
      
    } catch (error) {
      console.error(`Error scraping ${municipality.name}:`, error);
      
      await this.prisma.municipality.update({
        where: { id: municipality.id },
        data: {
          lastScraped: new Date(),
          scrapeStatus: 'failed',
          scrapeError: error instanceof Error ? error.message : 'Unknown error',
        },
      });
      
      throw error;
    }
  }

  private parseGOViSEvent($: cheerio.CheerioAPI, element: any): GOViSEvent | null {
    const $el = $(element);
    
    // Extract title
    const titleSelectors = ['h3', 'h4', '.event-title', '.titel', '.veranstaltung-titel'];
    let title = '';
    for (const selector of titleSelectors) {
      const found = $el.find(selector).first().text().trim();
      if (found) {
        title = found;
        break;
      }
    }
    
    if (!title) return null;
    
    // Extract date
    const dateSelectors = ['.event-date', '.datum', '.termin-datum', '.date', 'time'];
    let dateText = '';
    for (const selector of dateSelectors) {
      const found = $el.find(selector).first().text().trim();
      if (found) {
        dateText = found;
        break;
      }
    }
    
    const dates = this.parseSwissDate(dateText);
    if (!dates.start) return null;
    
    // Extract description
    const descSelectors = ['.event-description', '.beschreibung', '.text', 'p'];
    let description = '';
    for (const selector of descSelectors) {
      const found = $el.find(selector).first().text().trim();
      if (found && found !== title) {
        description = found;
        break;
      }
    }
    
    // Extract location
    const locationSelectors = ['.event-location', '.ort', '.location', '.veranstaltungsort'];
    let location = '';
    for (const selector of locationSelectors) {
      const found = $el.find(selector).first().text().trim();
      if (found) {
        location = found;
        break;
      }
    }
    
    // Extract URL
    let url = $el.find('a').first().attr('href') || '';
    if (url && !url.startsWith('http')) {
      const baseUrl = new URL($el.closest('[data-base-url]').attr('data-base-url') || '');
      url = new URL(url, baseUrl).toString();
    }
    
    // Extract image
    const imageUrl = $el.find('img').first().attr('src') || '';
    
    return {
      title,
      description,
      startDate: dates.start!, // Non-null assertion since we check above
      endDate: dates.end || undefined,
      location,
      url,
      imageUrl,
    };
  }

  private parseSwissDate(dateText: string): { start: Date | null; end: Date | null } {
    // Clean up the text
    dateText = dateText.replace(/\s+/g, ' ').trim();
    
    // Common Swiss date patterns
    const patterns = [
      // DD.MM.YYYY HH:MM
      /(\d{1,2})\.(\d{1,2})\.(\d{4})\s*(?:(\d{1,2}):(\d{2}))?/,
      // DD. Month YYYY
      /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(\d{4})/i,
      // Today/Tomorrow in German
      /(Heute|Morgen|Übermorgen)/i,
    ];
    
    const now = new Date();
    let start: Date | null = null;
    let end: Date | null = null;
    
    // Try numeric date pattern
    const numericMatch = dateText.match(patterns[0]);
    if (numericMatch) {
      const [, day, month, year, hour, minute] = numericMatch;
      start = new Date(
        parseInt(year),
        parseInt(month) - 1,
        parseInt(day),
        hour ? parseInt(hour) : 0,
        minute ? parseInt(minute) : 0
      );
    }
    
    // Try month name pattern
    const monthMatch = dateText.match(patterns[1]);
    if (monthMatch && !start) {
      const [, day, monthName, year] = monthMatch;
      const monthIndex = this.getSwissMonthIndex(monthName);
      if (monthIndex >= 0) {
        start = new Date(parseInt(year), monthIndex, parseInt(day));
      }
    }
    
    // Try relative date pattern
    const relativeMatch = dateText.match(patterns[2]);
    if (relativeMatch && !start) {
      const relative = relativeMatch[1].toLowerCase();
      start = new Date(now);
      if (relative === 'morgen') {
        start.setDate(start.getDate() + 1);
      } else if (relative === 'übermorgen') {
        start.setDate(start.getDate() + 2);
      }
    }
    
    // Check for date range (von/bis or date - date format)
    if (dateText.includes(' bis ') || dateText.includes(' - ')) {
      const parts = dateText.split(/\s*(?:bis|-)\s*/);
      if (parts.length === 2) {
        // Parse start date if not already parsed
        if (!start) {
          const startDates = this.parseSwissDate(parts[0]);
          start = startDates.start;
        }
        // Parse end date
        const endDates = this.parseSwissDate(parts[1]);
        end = endDates.start;
      }
    }
    
    return { start, end };
  }

  private getSwissMonthIndex(monthName: string): number {
    const months = [
      'januar', 'februar', 'märz', 'april', 'mai', 'juni',
      'juli', 'august', 'september', 'oktober', 'november', 'dezember'
    ];
    return months.indexOf(monthName.toLowerCase());
  }

  private async parseAlternativeFormat($: cheerio.CheerioAPI, municipality: Municipality): Promise<Event[]> {
    // Try to find events in tables or lists
    const events: GOViSEvent[] = [];
    
    console.log(`Alternative parsing for ${municipality.name}: Looking for table rows...`);
    
    // Check for table format - try multiple table selectors
    const tableSelectors = ['table tr', 'tbody tr', '.table tr', '.events-table tr'];
    
    for (const selector of tableSelectors) {
      const rows = $(selector);
      console.log(`Found ${rows.length} rows with selector: ${selector}`);
      
      if (rows.length > 1) { // At least header + 1 data row
        rows.each((i, row) => {
          if (i === 0) return; // Skip header row
          
          const cells = $(row).find('td, th');
          console.log(`Row ${i}: ${cells.length} cells`);
          
          if (cells.length >= 2) {
            const dateText = cells.eq(0).text().trim();
            const nameCell = cells.eq(1);
            const title = nameCell.text().trim();
            const location = cells.length > 2 ? cells.eq(2).text().trim() : municipality.name;
            const organizer = cells.length > 3 ? cells.eq(3).text().trim() : '';
            
            // Get the URL from the name cell if it has a link
            const eventUrl = nameCell.find('a').first().attr('href');
            
            console.log(`Parsing event: "${title}" on "${dateText}" at "${location}"`);
            
            const dates = this.parseSwissDate(dateText);
            if (dates.start && title && title.length > 2) {
              const event: GOViSEvent = {
                title,
                startDate: dates.start,
                endDate: dates.end || undefined,
                location,
                description: organizer ? `Organisiert von: ${organizer}` : undefined,
              };
              
              if (eventUrl) {
                event.url = eventUrl.startsWith('http') ? eventUrl : `${municipality.websiteUrl || ''}${eventUrl}`;
              }
              
              events.push(event);
              console.log(`✓ Added event: ${title}`);
            } else {
              console.log(`✗ Skipped event: title="${title}", datesParsed=${!!dates.start}`);
            }
          }
        });
        
        // If we found events with this selector, break
        if (events.length > 0) {
          console.log(`Successfully parsed ${events.length} events with selector: ${selector}`);
          break;
        }
      }
    }
    
    // Convert to DB events
    const dbEvents: Event[] = [];
    for (const event of events) {
      const dbEvent = await this.convertToDbEvent(event, municipality);
      if (dbEvent) {
        dbEvents.push(dbEvent);
      }
    }
    
    return dbEvents;
  }

  private async convertToDbEvent(event: GOViSEvent, municipality: Municipality): Promise<Event | null> {
    // Skip past events
    if (event.startDate < new Date()) {
      return null;
    }
    
    // Skip events too far in the future (>90 days)
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 90);
    if (event.startDate > maxDate) {
      return null;
    }
    
    const titleNorm = event.title
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
    
    const uniquenessHash = crypto
      .createHash('sha256')
      .update(`MUNICIPAL-${municipality.bfsNumber}-${titleNorm}-${event.startDate.toISOString()}`)
      .digest('hex');
    
    try {
      const dbEvent = await this.prisma.event.upsert({
        where: { uniquenessHash },
        create: {
          source: 'MUNICIPAL',
          sourceEventId: `${municipality.bfsNumber}-${uniquenessHash.substring(0, 8)}`,
          title: event.title,
          titleNorm,
          description: event.description,
          lang: 'de',
          category: event.category || 'Gemeindeveranstaltung',
          startTime: event.startDate,
          endTime: event.endDate,
          venueName: event.location || municipality.name,
          city: municipality.name,
          country: 'CH',
          lat: municipality.lat,
          lon: municipality.lon,
          url: event.url || municipality.eventPageUrl,
          imageUrl: event.imageUrl,
          uniquenessHash,
          municipalityId: municipality.id,
        },
        update: {
          title: event.title,
          description: event.description,
          startTime: event.startDate,
          endTime: event.endDate,
          venueName: event.location || municipality.name,
          url: event.url || municipality.eventPageUrl,
          imageUrl: event.imageUrl,
        },
      });
      
      return dbEvent;
    } catch (error) {
      console.error(`Error saving event "${event.title}":`, error);
      return null;
    }
  }

  async scrapeMultipleMunicipalities(limit: number = 10, maxDistance: number = 50) {
    console.log(`GOViS scraper: Looking for municipalities with limit=${limit}, maxDistance=${maxDistance}`);
    
    try {
      const municipalities = await this.prisma.municipality.findMany({
        where: {
          eventPageUrl: { not: null },
          cmsType: 'govis',
          distanceFromHome: { lte: maxDistance },
          OR: [
            { lastScraped: null },
            { 
              lastScraped: { 
                lt: new Date(Date.now() - 24 * 60 * 60 * 1000) // 24 hours ago
              } 
            },
          ],
        },
        orderBy: [
          { lastScraped: 'asc' },
          { distanceFromHome: 'asc' },
        ],
        take: limit,
      });
      
      console.log(`GOViS scraper: Found ${municipalities.length} municipalities to scrape`);
      console.log(`GOViS scraper: Municipalities found:`, municipalities.map(m => ({ name: m.name, eventPageUrl: m.eventPageUrl, cmsType: m.cmsType, distance: m.distanceFromHome })));
      
      console.log(`Scraping ${municipalities.length} GOViS municipalities...`);
      
      const results = {
        success: 0,
        failed: 0,
        totalEvents: 0,
      };
    
    for (const municipality of municipalities) {
      try {
        const events = await this.scrapeMunicipality(municipality);
        results.success++;
        results.totalEvents += events.length;
      } catch (error) {
        results.failed++;
        console.error(`Failed to scrape ${municipality.name}:`, error);
      }
      
      // Be polite - wait between requests
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    return results;
    
    } catch (dbError) {
      console.error('GOViS scraper: Database query failed:', dbError);
      return {
        success: 0,
        failed: 0,
        totalEvents: 0,
      };
    }
  }
}