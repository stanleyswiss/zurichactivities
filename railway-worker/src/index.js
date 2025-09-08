const cron = require('node-cron');
const express = require('express');
const { runAlpsabzugScraper } = require('./scraper');
const { scrapeSimple } = require('./scraper-simple');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('Railway Alpsabzug Scraper Worker Started');

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'alpsabzug-scraper' });
});

// Manual scrape endpoint
app.post('/scrape', async (req, res) => {
  try {
    console.log('Manual scrape triggered via HTTP');
    const scraperType = req.body.type || 'full'; // 'full' or 'simple'
    
    let result;
    if (scraperType === 'simple') {
      result = await scrapeSimple();
    } else {
      result = await runAlpsabzugScraper();
    }
    
    res.json({ success: true, scraperType, ...result });
  } catch (error) {
    console.error('Manual scrape failed:', error);
    res.status(500).json({ error: 'Scrape failed', details: error.message });
  }
});

// Start HTTP server
app.listen(PORT, () => {
  console.log(`HTTP server listening on port ${PORT}`);
});

// Run initial scrape after a delay to ensure DB connection
setTimeout(() => {
  console.log('Running initial scrape with full scraper...');
  runAlpsabzugScraper().catch(error => {
    console.error('Full scraper failed, falling back to simple:', error);
    scrapeSimple().catch(console.error);
  });
}, 5000);

// Schedule to run every day at 7 AM (1 hour after main scraper)
const schedule = process.env.CRON_SCHEDULE || '0 7 * * *';
cron.schedule(schedule, async () => {
  console.log('Starting scheduled Alpsabzug scrape...');
  try {
    await runAlpsabzugScraper();
  } catch (error) {
    console.error('Full scraper failed, trying simple scraper:', error);
    try {
      await scrapeSimple();
    } catch (fallbackError) {
      console.error('Both scrapers failed:', fallbackError);
    }
  }
});

// Keep the process alive
process.on('SIGTERM', () => {
  console.log('Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});