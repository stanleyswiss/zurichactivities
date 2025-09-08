// Proxy scraper that calls the Railway worker to run Alpsabzug scrapers
import { RawEvent } from '@/types/event';

export class RailwayProxyScraper {
  private railwayUrl: string;
  
  constructor() {
    // Railway worker URL - you'll need to set RAILWAY_WORKER_URL in your Vercel env vars
    this.railwayUrl = process.env.RAILWAY_WORKER_URL || '';
  }

  async scrapeEvents(scraperType: string = 'comprehensive'): Promise<RawEvent[]> {
    if (!this.railwayUrl) {
      console.error('RAILWAY_WORKER_URL not configured');
      return [];
    }

    try {
      console.log(`Calling Railway worker for ${scraperType} scraping...`);
      
      const response = await fetch(`${this.railwayUrl}/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: scraperType }),
        signal: AbortSignal.timeout(60000), // 60 second timeout
      });

      if (!response.ok) {
        throw new Error(`Railway worker responded with ${response.status}`);
      }

      const result = await response.json();
      console.log(`Railway ${scraperType} scraper: found ${result.eventsFound || 0} events`);
      
      // Railway worker saves events directly to the database
      // So we return empty array here - the events are already saved
      return [];
    } catch (error) {
      console.error(`Railway proxy scraper error:`, error);
      // Don't throw - allow other scrapers to continue
      return [];
    }
  }

  async triggerAllRailwayScrapers(): Promise<{ eventsFound: number; eventsSaved: number }> {
    if (!this.railwayUrl) {
      console.error('RAILWAY_WORKER_URL not configured');
      return { eventsFound: 0, eventsSaved: 0 };
    }

    try {
      // Trigger comprehensive scraping which runs all Railway scrapers
      const response = await fetch(`${this.railwayUrl}/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'comprehensive' }),
        signal: AbortSignal.timeout(120000), // 2 minute timeout for comprehensive
      });

      if (!response.ok) {
        throw new Error(`Railway worker responded with ${response.status}`);
      }

      const result = await response.json();
      
      // Calculate totals from comprehensive results
      let totalFound = 0;
      let totalSaved = 0;
      
      if (result.totalEventsFound !== undefined) {
        totalFound = result.totalEventsFound;
        totalSaved = result.totalEventsSaved || 0;
      } else if (result.myswitzerland || result.structured || result.advanced) {
        // Sum up from individual scraper results
        const scraperResults = [
          result.myswitzerland,
          result.structured, 
          result.advanced,
          result.original
        ].filter(Boolean);
        
        totalFound = scraperResults.reduce((sum, r) => sum + (r.eventsFound || 0), 0);
        totalSaved = scraperResults.reduce((sum, r) => sum + (r.eventsSaved || 0), 0);
      }
      
      console.log(`Railway comprehensive scraping completed: ${totalFound} found, ${totalSaved} saved`);
      
      return { eventsFound: totalFound, eventsSaved: totalSaved };
    } catch (error) {
      console.error('Railway comprehensive scraper error:', error);
      return { eventsFound: 0, eventsSaved: 0 };
    }
  }
}