const { chromium } = require('playwright');

async function debugScrape() {
  const browser = await chromium.launch({ headless: true });
  
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    });
    
    const page = await context.newPage();
    
    // Test MySwitzerland
    console.log('\n=== Testing MySwitzerland ===');
    await page.goto('https://www.myswitzerland.com/de-ch/erlebnisse/veranstaltungen/', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    // Take screenshot
    await page.screenshot({ path: 'myswitzerland.png' });
    console.log('Screenshot saved as myswitzerland.png');
    
    // Try to find any event-like elements
    const elements = await page.$$eval('*', elements => {
      return elements
        .filter(el => el.textContent && el.textContent.toLowerCase().includes('alpabzug'))
        .slice(0, 5)
        .map(el => ({
          tag: el.tagName,
          class: el.className,
          text: el.textContent.substring(0, 100)
        }));
    });
    
    console.log('Elements containing "alpabzug":', elements);
    
    // Look for common event containers
    const containers = [
      '.event', '.veranstaltung', '.card', '.item', '.result',
      'article', '[role="listitem"]', '.list-item'
    ];
    
    for (const selector of containers) {
      const count = await page.$$eval(selector, els => els.length);
      if (count > 0) {
        console.log(`Found ${count} elements matching: ${selector}`);
        
        // Get first element details
        const sample = await page.$eval(selector, el => ({
          html: el.innerHTML.substring(0, 200),
          text: el.textContent.substring(0, 100)
        }));
        console.log('Sample:', sample);
      }
    }
    
    // Test direct Alpsabzug search
    console.log('\n=== Testing Alpsabzug Search ===');
    await page.goto('https://www.myswitzerland.com/de-ch/suche/?q=alpabzug', { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    
    const searchResults = await page.$$('.search-result, .result-item, [class*="result"]');
    console.log(`Found ${searchResults.length} search results`);
    
  } catch (error) {
    console.error('Debug error:', error);
  } finally {
    await browser.close();
  }
}

// Run if called directly
if (require.main === module) {
  debugScrape().then(() => {
    console.log('Debug complete');
    process.exit(0);
  });
}

module.exports = { debugScrape };