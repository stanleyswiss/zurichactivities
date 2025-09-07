import { NextResponse } from 'next/server';
import chromium from '@sparticuz/chromium';
import playwright from 'playwright-core';

export const runtime = 'nodejs';   // IMPORTANT: not 'edge'
export const dynamic = 'force-dynamic';

export async function GET() {
  let browser;
  
  try {
    console.log('Starting Playwright browser for endpoint discovery...');
    
    const executablePath = await chromium.executablePath();
    browser = await playwright.chromium.launch({
      args: chromium.args,
      headless: true,
      executablePath
    });

    const page = await browser.newPage({
      userAgent: 'Mozilla/5.0 (compatible; AlpabzugBot/1.0)'
    });

    // Block heavy assets to keep TTFB low
    await page.route('**/*', (route) => {
      const type = route.request().resourceType();
      return ['image', 'media', 'font', 'stylesheet'].includes(type)
        ? route.abort()
        : route.continue();
    });

    const results: any[] = [];
    const requests: any[] = [];
    
    // Capture both requests and responses
    page.on('request', (req) => {
      const url = req.url();
      if (/api|event|search|finder|data/i.test(url)) {
        requests.push({
          type: 'request',
          url: url,
          method: req.method(),
          headers: req.headers(),
          postData: req.postData()
        });
      }
    });

    page.on('response', async (res) => {
      try {
        const ct = res.headers()['content-type'] || '';
        const url = res.url();
        
        if (ct.includes('application/json') && /event|search|finder|api|data/i.test(url)) {
          console.log(`Found JSON response: ${url}`);
          const json = await res.json();
          results.push({ 
            type: 'response',
            url: url, 
            status: res.status(),
            headers: res.headers(),
            json: json 
          });
        }
      } catch (error) {
        console.error('Error parsing JSON response:', error);
      }
    });

    console.log('Navigating to Alpine festivals page...');
    await page.goto('https://www.myswitzerland.com/en/experiences/events/events-search/?rubrik=alpinefestivals', { 
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    console.log('Waiting for content to load...');
    await page.waitForTimeout(5000);

    // Try to trigger any lazy-loaded content
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await page.waitForTimeout(2000);

    await browser.close();
    browser = null;

    console.log(`Discovery complete. Found ${results.length} JSON responses, ${requests.length} relevant requests`);

    // Find the most relevant endpoint
    const eventEndpoints = results.filter(r => 
      /event/i.test(r.url) || 
      (r.json && (Array.isArray(r.json) || r.json.events || r.json.data))
    );

    return NextResponse.json({
      success: true,
      summary: {
        totalJsonResponses: results.length,
        totalRequests: requests.length,
        eventEndpoints: eventEndpoints.length
      },
      eventEndpoints: eventEndpoints.map(e => ({
        url: e.url,
        status: e.status,
        hasEvents: Array.isArray(e.json) || !!(e.json?.events || e.json?.data),
        eventCount: Array.isArray(e.json) ? e.json.length : (e.json?.events?.length || e.json?.data?.length || 0)
      })),
      allResponses: results,
      allRequests: requests
    });

  } catch (error) {
    console.error('Discovery error:', error);
    
    if (browser) {
      try {
        await browser.close();
      } catch (closeError) {
        console.error('Error closing browser:', closeError);
      }
    }

    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  }
}