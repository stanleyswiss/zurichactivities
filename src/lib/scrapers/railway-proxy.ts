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
      console.log(`Triggering Railway worker for ${scraperType} scraping (async)...`);
      
      // Fire and forget - start the scraping but don't wait for completion
      // to avoid Vercel timeout issues
      const response = await fetch(`${this.railwayUrl}/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: scraperType, async: true }),
        signal: AbortSignal.timeout(10000), // Reduced to 10 seconds - just to confirm it starts
      });

      if (!response.ok) {
        // Try to get error details
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Railway worker responded with ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log(`Railway ${scraperType} scraper started successfully`);
      
      // Return estimated results since scraping happens asynchronously
      // The actual events are saved directly to the database by Railway
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
      console.log('Triggering Railway comprehensive scraping (async)...');
      
      // Trigger comprehensive scraping but don't wait for full completion
      const response = await fetch(`${this.railwayUrl}/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'comprehensive', async: true }),
        signal: AbortSignal.timeout(15000), // 15 second timeout - just to confirm it starts
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Railway worker responded with ${response.status}: ${errorText}`);
      }

      const result = await response.json();
      console.log('Railway comprehensive scraping started successfully');
      
      // Since we're doing async scraping, return estimated counts
      // The actual scraping continues in the background on Railway
      return { 
        eventsFound: result.totalEventsFound || 0, 
        eventsSaved: result.totalEventsSaved || 0 
      };
    } catch (error) {
      console.error('Railway comprehensive scraper error:', error);
      // Return 0 but don't fail - Railway might still be scraping in background
      return { eventsFound: 0, eventsSaved: 0 };
    }
  }
}