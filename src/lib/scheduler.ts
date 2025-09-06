import cron from 'node-cron';
import { SwitzerlandTourismScraper } from './scrapers/switzerland-tourism';
import { LimmattalScraper } from './scrapers/limmattal';
import { TestScraper } from './scrapers/test-scraper';
import { MunicipalScraper } from './scrapers/municipal-scraper';
import { ZurichTourismScraper } from './scrapers/zurich-tourism';
import { ComprehensiveTestScraper } from './scrapers/comprehensive-test-scraper';
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
    // Daily at 6 AM
    cron.schedule('0 6 * * *', async () => {
      console.log('Running scheduled scrape at', new Date());
      await this.runAllScrapers();
    });

    console.log('Event scheduler initialized - will run daily at 6:00 AM');
  }

  async runAllScrapers(sources?: string[], force: boolean = false): Promise<ScraperResult[]> {
    if (this.isRunning && !force) {
      throw new Error('Scraping is already in progress');
    }

    this.isRunning = true;
    const results: ScraperResult[] = [];
    const sourcesToRun = sources || ['ST', 'LIMMATTAL'];

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

      // Add delay between scrapers to be respectful
      if (sourcesToRun.indexOf(source) < sourcesToRun.length - 1) {
        await this.delay(2000);
      }
    }

    this.isRunning = false;

    const totalFound = results.reduce((sum, r) => sum + r.eventsFound, 0);
    const totalSaved = results.reduce((sum, r) => sum + r.eventsSaved, 0);
    console.log(`Scrape completed: ${totalFound} found, ${totalSaved} saved`);

    return results;
  }

  private async scrapeSource(source: string): Promise<RawEvent[]> {
    switch (source) {
      case 'ST':
        const stScraper = new SwitzerlandTourismScraper();
        return await stScraper.scrapeEvents();
      case 'LIMMATTAL':
        const limmattalScraper = new LimmattalScraper();
        return await limmattalScraper.scrapeEvents();
      case 'TEST':
        const testScraper = new TestScraper();
        return await testScraper.scrapeEvents();
      case 'MUNICIPAL':
        const municipalScraper = new MunicipalScraper();
        return await municipalScraper.scrapeEvents();
      case 'ZURICH':
        const zurichScraper = new ZurichTourismScraper();
        return await zurichScraper.scrapeEvents();
      case 'COMPREHENSIVE':
        const comprehensiveScraper = new ComprehensiveTestScraper();
        return await comprehensiveScraper.scrapeEvents();
      default:
        throw new Error(`Unknown source: ${source}`);
    }
  }

  private async saveEvents(events: RawEvent[], force: boolean = false): Promise<number> {
    let savedCount = 0;

    for (const event of events) {
      try {
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