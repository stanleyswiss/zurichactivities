const cron = require('node-cron');
const express = require('express');
const { runAlpsabzugScraper } = require('./scraper');
const { scrapeSimple } = require('./scraper-simple');
const { runMySwitzerlandScraper } = require('./myswitzerland-scraper');
const { runAdvancedAlpsabzugScraper } = require('./scraper-advanced');
const { runStructuredDataScraper } = require('./structured-data-scraper');

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
    const scraperType = (req.body && req.body.type) ? req.body.type : 'comprehensive'; // Default to comprehensive
    
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
      case 'comprehensive':
        // Run multiple scrapers for maximum coverage
        console.log('Running comprehensive scraping with all methods...');
        const results = {};
        
        try {
          console.log('1. Running MySwitzerland scraper (priority)...');
          results.myswitzerland = await runMySwitzerlandScraper();
        } catch (e) {
          console.error('MySwitzerland scraper failed:', e.message);
          results.myswitzerland = { error: e.message };
        }

        try {
          console.log('2. Running structured data scraper...');
          results.structured = await runStructuredDataScraper();
        } catch (e) {
          console.error('Structured data scraper failed:', e.message);
          results.structured = { error: e.message };
        }
        
        try {
          console.log('2. Running advanced scraper...');
          results.advanced = await runAdvancedAlpsabzugScraper();
        } catch (e) {
          console.error('Advanced scraper failed:', e.message);
          results.advanced = { error: e.message };
        }
        
        try {
          console.log('3. Running fallback scraper...');
          results.fallback = await runAlpsabzugScraper();
        } catch (e) {
          console.error('Fallback scraper failed:', e.message);
          results.fallback = { error: e.message };
        }
        
        // Combine results (include MySwitzerland!)
        const totalFound = (results.myswitzerland?.eventsFound || 0) +
                          (results.structured?.eventsFound || 0) + 
                          (results.advanced?.eventsFound || 0) + 
                          (results.fallback?.eventsFound || 0);
        const totalSaved = (results.myswitzerland?.eventsSaved || 0) +
                          (results.structured?.eventsSaved || 0) + 
                          (results.advanced?.eventsSaved || 0) + 
                          (results.fallback?.eventsSaved || 0);
                          
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

// Run initial scrape after a delay to ensure DB connection
setTimeout(() => {
  console.log('Running initial scrape with MySwitzerland scraper...');
  runMySwitzerlandScraper().catch(error => {
    console.error('MySwitzerland scraper failed, falling back to advanced scraper:', error);
    runAdvancedAlpsabzugScraper().catch(error => {
      console.error('Advanced scraper failed, falling back to structured data scraper:', error);
      runStructuredDataScraper().catch(error => {
        console.error('Structured data scraper failed, falling back to simple:', error);
        scrapeSimple().catch(console.error);
      });
    });
  });
}, 5000);

// Schedule to run every day at 7 AM (1 hour after main scraper)
const schedule = process.env.CRON_SCHEDULE || '0 7 * * *';
cron.schedule(schedule, async () => {
  console.log('Starting scheduled comprehensive Alpsabzug scrape...');
  
  try {
    // Primary: Advanced scraper with multiple sources
    console.log('1. Running advanced scraper...');
    await runAdvancedAlpsabzugScraper();
  } catch (error) {
    console.error('Advanced scraper failed:', error);
    
    try {
      // Secondary: Structured data scraper
      console.log('2. Running structured data scraper as fallback...');
      await runStructuredDataScraper();
    } catch (structuredError) {
      console.error('Structured data scraper failed:', structuredError);
      
      try {
        // Tertiary: Original scraper
        console.log('3. Running original scraper as final fallback...');
        await runAlpsabzugScraper();
      } catch (originalError) {
        console.error('Original scraper failed, trying simple scraper:', originalError);
        
        try {
          // Final fallback: Simple scraper
          await scrapeSimple();
        } catch (simpleError) {
          console.error('All scrapers failed:', simpleError);
        }
      }
    }
  }
});

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});