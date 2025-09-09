const cron = require('node-cron');
const express = require('express');
const { runAlpsabzugScraper } = require('./scraper');
const { scrapeSimple } = require('./scraper-simple');
const { runMySwitzerlandScraper } = require('./myswitzerland-scraper');
const { runAdvancedAlpsabzugScraper } = require('./scraper-advanced');
const { runStructuredDataScraper } = require('./structured-data-scraper');
const { runComprehensiveMySwitzerlandScraper } = require('./comprehensive-myswitzerland-scraper');
const { runMunicipalScraper } = require('./municipal-scraper-architecture');
const { runFastMySwitzerlandScraper } = require('./fast-myswitzerland-scraper');

const app = express();
const PORT = process.env.PORT || 3000;

// Add JSON body parser middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

console.log('Railway Alpsabzug Scraper Worker Started');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'alpsabzug-scraper' });
});

// DISABLED: Railway scrapers are no longer used to prevent data pollution
// All scraping is now handled by clean API sources (MySwitzerland API + Limmattal HTML)
app.post('/scrape', async (req, res) => {
  console.log('Railway scraper endpoint called but DISABLED to prevent web-scraped data pollution');
  console.log('Request body:', req.body);
  
  res.status(200).json({
    success: false,
    message: 'Railway scrapers are disabled. Use clean MySwitzerland API + Limmattal HTML scraping instead.',
    disabled: true,
    reason: 'Prevents web-scraped data pollution in favor of clean API sources'
  });
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

// DISABLED: No automatic scraping on startup
// Railway worker should only respond to manual HTTP triggers
/*
setTimeout(() => {
  console.log('Running initial scrape with FAST MySwitzerland scraper...');
  runFastMySwitzerlandScraper().then(result => {
    if (result && result.eventsSaved === 0) {
      console.log('Fast scraper found no events, falling back to original MySwitzerland scraper...');
      return runMySwitzerlandScraper();
    }
    console.log(`Fast scraper success: ${result.eventsSaved} events saved`);
  }).catch(error => {
    console.error('FAST MySwitzerland scraper failed, falling back to original MySwitzerland scraper:', error);
    runMySwitzerlandScraper().catch(error => {
      console.error('MySwitzerland scraper failed, falling back to Municipal scraper:', error);
      runMunicipalScraper().catch(error => {
        console.error('Municipal scraper failed, falling back to structured data scraper:', error);
        runStructuredDataScraper().catch(error => {
          console.error('Structured data scraper failed, falling back to simple:', error);
          scrapeSimple().catch(console.error);
        });
      });
    });
  });
}, 5000);
*/

// DISABLED: Cron scheduling disabled - Railway scrapers should not run automatically
// Only manual triggers via HTTP POST /scrape endpoint are allowed
const schedule = process.env.CRON_SCHEDULE || '0 7 * * *';
/* CRON DISABLED - Use MySwitzerland API instead
cron.schedule(schedule, async () => {
  console.log('Starting scheduled comprehensive Swiss events scrape...');
  
  try {
    // Primary: Comprehensive MySwitzerland scraper
    console.log('1. Running Comprehensive MySwitzerland scraper...');
    await runComprehensiveMySwitzerlandScraper();
  } catch (error) {
    console.error('Comprehensive MySwitzerland scraper failed:', error);
    
    try {
      // Secondary: Municipal scraper
      console.log('2. Running Municipal scraper as fallback...');
      await runMunicipalScraper();
    } catch (municipalError) {
      console.error('Municipal scraper failed:', municipalError);
      
      try {
        // Tertiary: Original MySwitzerland scraper
        console.log('3. Running original MySwitzerland scraper as fallback...');
        await runMySwitzerlandScraper();
      } catch (myswitzerError) {
        console.error('MySwitzerland scraper failed:', myswitzerError);
        
        try {
          // Quaternary: Structured data scraper
          console.log('4. Running structured data scraper as fallback...');
          await runStructuredDataScraper();
        } catch (structuredError) {
          console.error('Structured data scraper failed:', structuredError);
          
          try {
            // Final fallback: Simple scraper
            console.log('5. Running simple scraper as final fallback...');
            await scrapeSimple();
          } catch (simpleError) {
            console.error('All scrapers failed:', simpleError);
          }
        }
      }
    }
  }
});
*/ // END CRON DISABLED

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});