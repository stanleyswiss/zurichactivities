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

// Enhanced manual scrape endpoint with multiple scraper options
app.post('/scrape', async (req, res) => {
  try {
    console.log('Manual scrape triggered via HTTP');
    console.log('Request body:', req.body);
    const scraperType = (req.body && req.body.type) ? req.body.type : 'comprehensive';
    const async = req.body.async === true; // Allow async mode to prevent timeouts
    
    let result;
    switch (scraperType) {
      case 'simple':
        result = await scrapeSimple();
        break;
      case 'full':
        result = await runAlpsabzugScraper();
        break;
      case 'advanced':
        result = await runAdvancedAlpsabzugScraper();
        break;
      case 'structured':
        result = await runStructuredDataScraper();
        break;
      case 'myswitzerland':
        result = await runMySwitzerlandScraper();
        break;
      case 'comprehensive-myswitzerland':
        result = await runComprehensiveMySwitzerlandScraper();
        break;
      case 'fast-myswitzerland':
        result = await runFastMySwitzerlandScraper();
        break;
      case 'municipal':
        result = await runMunicipalScraper();
        break;
      case 'comprehensive':
        // Check if we should run async to avoid timeouts
        if (async) {
          console.log('Starting comprehensive scraping in background (async mode)...');
          // Start the comprehensive scraping in background
          setImmediate(async () => {
            try {
              const asyncResults = {};
              
              // Run all scrapers in background
              try {
                console.log('Background: Running FAST MySwitzerland scraper...');
                asyncResults.fastMyswitzerland = await runFastMySwitzerlandScraper();
              } catch (e) {
                console.error('Background FAST MySwitzerland scraper failed:', e.message);
              }

              try {
                console.log('Background: Running Municipal scraper...');
                asyncResults.municipal = await runMunicipalScraper();
              } catch (e) {
                console.error('Background Municipal scraper failed:', e.message);
              }

              try {
                console.log('Background: Running original MySwitzerland scraper...');
                asyncResults.myswitzerland = await runMySwitzerlandScraper();
              } catch (e) {
                console.error('Background MySwitzerland scraper failed:', e.message);
              }

              try {
                console.log('Background: Running structured data scraper...');
                asyncResults.structured = await runStructuredDataScraper();
              } catch (e) {
                console.error('Background structured scraper failed:', e.message);
              }

              const totalFound = (asyncResults.comprehensiveMyswitzerland?.eventsFound || 0) +
                                (asyncResults.municipal?.eventsFound || 0) +
                                (asyncResults.myswitzerland?.eventsFound || 0) +
                                (asyncResults.structured?.eventsFound || 0);
              const totalSaved = (asyncResults.comprehensiveMyswitzerland?.eventsSaved || 0) +
                                (asyncResults.municipal?.eventsSaved || 0) +
                                (asyncResults.myswitzerland?.eventsSaved || 0) +
                                (asyncResults.structured?.eventsSaved || 0);
                                
              console.log(`Background comprehensive scraping complete: ${totalFound} found, ${totalSaved} saved`);
            } catch (error) {
              console.error('Background comprehensive scraping failed:', error);
            }
          });
          
          // Return immediate response
          result = {
            comprehensive: true,
            async: true,
            message: 'Comprehensive scraping started in background',
            totalEventsFound: 0, // Will be updated as scrapers complete
            totalEventsSaved: 0
          };
          break;
        }
        
        // Synchronous comprehensive scraping (original behavior)
        console.log('Running comprehensive scraping with all new methods...');
        const results = {};
        
        try {
          console.log('1. Running FAST MySwitzerland scraper (priority)...');
          results.fastMyswitzerland = await runFastMySwitzerlandScraper();
        } catch (e) {
          console.error('FAST MySwitzerland scraper failed:', e.message);
          results.fastMyswitzerland = { error: e.message };
        }

        try {
          console.log('2. Running Municipal scraper...');
          results.municipal = await runMunicipalScraper();
        } catch (e) {
          console.error('Municipal scraper failed:', e.message);
          results.municipal = { error: e.message };
        }

        try {
          console.log('3. Running original MySwitzerland scraper...');
          results.myswitzerland = await runMySwitzerlandScraper();
        } catch (e) {
          console.error('MySwitzerland scraper failed:', e.message);
          results.myswitzerland = { error: e.message };
        }

        try {
          console.log('4. Running structured data scraper...');
          results.structured = await runStructuredDataScraper();
        } catch (e) {
          console.error('Structured data scraper failed:', e.message);
          results.structured = { error: e.message };
        }
        
        try {
          console.log('5. Running advanced scraper...');
          results.advanced = await runAdvancedAlpsabzugScraper();
        } catch (e) {
          console.error('Advanced scraper failed:', e.message);
          results.advanced = { error: e.message };
        }
        
        // Combine results
        const totalFound = (results.comprehensiveMyswitzerland?.eventsFound || 0) +
                          (results.municipal?.eventsFound || 0) +
                          (results.myswitzerland?.eventsFound || 0) +
                          (results.structured?.eventsFound || 0) + 
                          (results.advanced?.eventsFound || 0);
        const totalSaved = (results.comprehensiveMyswitzerland?.eventsSaved || 0) +
                          (results.municipal?.eventsSaved || 0) +
                          (results.myswitzerland?.eventsSaved || 0) +
                          (results.structured?.eventsSaved || 0) + 
                          (results.advanced?.eventsSaved || 0);
                          
        console.log(`Comprehensive scraping complete: ${totalFound} found, ${totalSaved} saved`);
        
        result = {
          comprehensive: true,
          totalEventsFound: totalFound,
          totalEventsSaved: totalSaved,
          results
        };
        break;
      default:
        result = await runAdvancedAlpsabzugScraper();
    }
    
    res.json({ success: true, scraperType, ...result });
  } catch (error) {
    console.error('Manual scrape failed:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({ 
      error: 'Scrape failed', 
      details: error.message,
      scraperType: scraperType || 'unknown'
    });
  }
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