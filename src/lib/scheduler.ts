import cron from 'node-cron';
import { db } from './db';
import { GOViSScraper } from './scrapers/govis-scraper';
import { PrismaClient } from '@prisma/client';

interface ScraperResult {
  source: string;
  success: boolean;
  eventsFound: number;
  eventsSaved: number;
  duration: number;
  error?: string;
  municipalitiesScraped?: number;
}

export class EventScheduler {
  private isRunning = false;
  private lastRun: Date | null = null;

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
      console.log('Running scheduled municipal scrape at', new Date());
      await this.runMunicipalScrapers();
    });
    
    console.log('Municipal event scheduler initialized - will run daily at 6:00 AM (non-Vercel)');
  }

  async runMunicipalScrapers(
    limit: number = 50, 
    maxDistance: number = 100,
    cmsType: string = 'all'
  ): Promise<ScraperResult[]> {
    if (this.isRunning) {
      throw new Error('Scraping is already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();
    const results: ScraperResult[] = [];

    try {
      console.log(`Starting municipal scrape: ${limit} municipalities within ${maxDistance}km`);

      // Use local municipal scraper with proper database connection handling
      try {
        const govisScraper = new GOViSScraper(db);
        const result = await govisScraper.scrapeMultipleMunicipalities(limit, maxDistance);

        results.push({
          source: 'MUNICIPAL',
          success: result.success > 0,
          eventsFound: result.totalEvents,
          eventsSaved: result.totalEvents,
          duration: Date.now() - startTime,
          municipalitiesScraped: result.success + result.failed,
        });
        
        console.log(`Municipal scrape completed: ${result.success} succeeded, ${result.failed} failed, ${result.totalEvents} events found`);
      } catch (dbError) {
        console.error('Database connection failed, municipal scraping not available:', dbError);
        results.push({
          source: 'MUNICIPAL',
          success: false,
          eventsFound: 0,
          eventsSaved: 0,
          duration: Date.now() - startTime,
          error: 'Database connection failed - municipal scraping requires database access',
          municipalitiesScraped: 0,
        });
      }

      this.lastRun = new Date();

    } catch (error) {
      console.error('Municipal scraper error:', error);
      results.push({
        source: 'MUNICIPAL',
        success: false,
        eventsFound: 0,
        eventsSaved: 0,
        duration: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        municipalitiesScraped: 0,
      });
    } finally {
      this.isRunning = false;
    }

    return results;
  }

  // Compatibility method for existing API
  async runAllScrapers(sources?: string[], force: boolean = false): Promise<ScraperResult[]> {
    // Always run municipal scrapers regardless of requested sources
    return this.runMunicipalScrapers();
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
    };
  }

  getLastRun(): Date | null {
    return this.lastRun;
  }
}

// Export singleton instance
export const eventScheduler = new EventScheduler();