// Proxy scraper that calls Railway worker for Switzerland Tourism API scraping
import { RawEvent } from '@/types/event';

export class STProxyScraper {
  private railwayUrl: string;
  
  constructor() {
    this.railwayUrl = process.env.RAILWAY_WORKER_URL || '';
  }

  async scrapeEvents(): Promise<RawEvent[]> {
    if (!this.railwayUrl) {
      console.error('RAILWAY_WORKER_URL not configured for ST scraping');
      return [];
    }

    try {
      console.log('Delegating ST scraping to Railway worker...');
      
      const response = await fetch(`${this.railwayUrl}/scrape`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ type: 'st-api' }),
        // No timeout - Railway can take as long as needed
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        throw new Error(`Railway worker error: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log(`Railway ST scraper completed: ${result.eventsFound} found, ${result.eventsSaved} saved`);
      
      // Store result for scheduler to report
      (this as any)._result = {
        eventsFound: result.eventsFound,
        eventsSaved: result.eventsSaved
      };
      
      // Railway saves directly to DB, so return empty array
      return [];
    } catch (error) {
      console.error('ST proxy scraper error:', error);
      return [];
    }
  }
}