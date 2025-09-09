import cron from 'node-cron';
import { SwitzerlandTourismScraper } from './scrapers/switzerland-tourism';
import { LimmattalScraper } from './scrapers/limmattal';
import { db } from './db';
import { generateUniquenessHash, normalizeTitle } from './utils/deduplication';
import { RawEvent } from '@/types/event';

interface ScraperResult {
  source: string;
  success: boolean;
  eventsFound: number;
  eventsSaved: number;
  duration: number;
  error?: string;
}

export class EventScheduler {
  private isRunning = false;
  private lastRuns: Record<string, Date> = {};

  constructor() {
    this.initializeScheduler();
  }

  private initializeScheduler() {
    // Avoid in-Lambda cron in Vercel; rely on Vercel Cron instead
    const runningOnVercel = !!process.env.VERCEL;
    if (runningOnVercel) {
      console.log('Vercel environment detected: internal cron disabled. Use Vercel Cron.');
      return;
    }
    // Daily at 6 AM (for non-serverless/local usage)
    cron.schedule('0 6 * * *', async () => {
      console.log('Running scheduled scrape at', new Date());
      await this.runAllScrapers();
    });
    console.log('Event scheduler initialized - will run daily at 6:00 AM (non-Vercel)');
  }

  async runAllScrapers(sources?: string[], force: boolean = false): Promise<ScraperResult[]> {
    if (this.isRunning && !force) {
      throw new Error('Scraping is already in progress');
    }

    this.isRunning = true;
    const results: ScraperResult[] = [];
    let sourcesToRun = sources;
    if (!sourcesToRun || sourcesToRun.length === 0) {
      const envList = process.env.SOURCES_ENABLED?.split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
      sourcesToRun = (envList && envList.length > 0) ? envList : ['LIMMATTAL', 'ST'];
    }

    console.log(`Starting scrape for sources: ${sourcesToRun.join(', ')}`);

    for (const source of sourcesToRun) {
      const startTime = Date.now();
      let result: ScraperResult = {
        source,
        success: false,
        eventsFound: 0,
        eventsSaved: 0,
        duration: 0
      };

      try {
        const events = await this.scrapeSource(source);
        result.eventsFound = events.length;

        if (events.length > 0) {
          const savedCount = await this.saveEvents(events, force);
          result.eventsSaved = savedCount;
        }


        result.success = true;
        this.lastRuns[source] = new Date();

        console.log(`${source}: Found ${result.eventsFound}, saved ${result.eventsSaved} events`);
      } catch (error) {
        result.error = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Error scraping ${source}:`, error);
      }

      result.duration = Date.now() - startTime;
      results.push(result);

      // Reduce delay between scrapers to stay within time limits
      if (sourcesToRun.indexOf(source) < sourcesToRun.length - 1) {
        await this.delay(500); // Reduced from 2000ms to 500ms
      }
    }

    this.isRunning = false;

    const totalFound = results.reduce((sum, r) => sum + r.eventsFound, 0);
    const totalSaved = results.reduce((sum, r) => sum + r.eventsSaved, 0);
    console.log(`Scrape completed: ${totalFound} found, ${totalSaved} saved`);

    return results;
  }

  private async scrapeSource(source: string): Promise<RawEvent[]> {
    // Timeout for individual scrapers - ST needs more time for location fetching
    const timeoutMs = source === 'ST' ? 25000 : 10000; // 25s for ST, 10s for others
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`${source} scraper timed out after ${timeoutMs/1000} seconds`)), timeoutMs);
    });

    try {
      const scraperPromise = this.executeScraper(source);
      return await Promise.race([scraperPromise, timeoutPromise]);
    } catch (error) {
      console.error(`${source} scraper error:`, error);
      throw error;
    }
  }

  private async executeScraper(source: string): Promise<RawEvent[]> {
    switch (source) {
      case 'ST':
        const stScraper = new SwitzerlandTourismScraper();
        return await stScraper.scrapeEvents();
      case 'LIMMATTAL':
        const limmattalScraper = new LimmattalScraper();
        return await limmattalScraper.scrapeEvents();
      // Only clean data sources are supported
      default:
        throw new Error(`Unknown source: ${source} - only ST and LIMMATTAL are supported`);
    }
  }

  private async saveEvents(events: RawEvent[], force: boolean = false): Promise<number> {
    let savedCount = 0;

    for (const event of events) {
      try {
        // Content filter: drop political/administrative events and unwanted entries
        if (!this.isAllowedEvent(event)) {
          continue;
        }
        const uniquenessHash = generateUniquenessHash(event);
        const titleNorm = normalizeTitle(event.title);

        const existingEvent = await db.event.findUnique({
          where: { uniquenessHash }
        });

        if (!existingEvent || force) {
          if (existingEvent && force) {
            await db.event.update({
              where: { id: existingEvent.id },
              data: {
                ...event,
                titleNorm,
                uniquenessHash,
                updatedAt: new Date()
              }
            });
          } else {
            await db.event.create({
              data: {
                ...event,
                titleNorm,
                uniquenessHash
              }
            });
          }
          savedCount++;
        }
      } catch (error) {
        console.error(`Error saving event: ${event.title}`, error);
      }
    }

    return savedCount;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isAlpsabzugEvent(title: string, description: string): boolean {
    const combinedText = `${title} ${description}`.toLowerCase();
    
    // Primary Alpsabzug keywords
    const alpsabzugTerms = [
      'alpabzug', 'alpsabzug', 'alpabfahrt', 'alpsabfahrt',
      'viehscheid', 'viehschied', 'désalpe', 'desalpe',
      'alpfest', 'älplerfest', 'sennen', 'sennerei',
      'alpaufzug', 'alpauftrieb', 'tierumfahrt',
      'alpweide', 'almabtrieb', 'cattle descent'
    ];

    return alpsabzugTerms.some(term => combinedText.includes(term));
  }

  // Basic content filtering: exclude political/administrative items; optionally allowlist categories
  private isAllowedEvent(event: RawEvent): boolean {
    const text = `${event.title} ${event.description ?? ''}`.toLowerCase();
    const blocklist = [
      'gemeindeversammlung', 'abstimmung', 'wahlen', 'wahl', 'politik', 'politisch',
      'stadtrat', 'gemeinderat', 'einwohnerrat', 'parlament', 'parteitag', 'versammlung der partei',
      'behörde', 'amt', 'verordnung', 'amtliche', 'sitzung'
    ];
    if (blocklist.some(word => text.includes(word))) return false;

    // If category exists and is one of the known categories, allow
    // Otherwise, allow by default to not over-prune; scrapers should set category
    return true;
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRuns: { ...this.lastRuns }
    };
  }

  getLastRun(source: string): Date | null {
    return this.lastRuns[source] || null;
  }
}

// Export singleton instance
export const eventScheduler = new EventScheduler();
