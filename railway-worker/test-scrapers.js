#!/usr/bin/env node

/**
 * Test script for Alpsabzug scrapers
 * Usage: node test-scrapers.js [scraper-type]
 * Scraper types: advanced, structured, simple, all
 */

const { runAdvancedAlpsabzugScraper } = require('./src/scraper-advanced');
const { runStructuredDataScraper } = require('./src/structured-data-scraper');
const { scrapeSimple } = require('./src/scraper-simple');

async function testScraper(scraperType) {
  console.log(`\n=== Testing ${scraperType.toUpperCase()} Scraper ===`);
  console.log(`Started at: ${new Date().toISOString()}`);
  
  const startTime = Date.now();
  
  try {
    let result;
    
    switch (scraperType) {
      case 'advanced':
        result = await runAdvancedAlpsabzugScraper();
        break;
      case 'structured':
        result = await runStructuredDataScraper();
        break;
      case 'simple':
        result = await scrapeSimple();
        break;
      default:
        throw new Error(`Unknown scraper type: ${scraperType}`);
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log(`\n=== ${scraperType.toUpperCase()} SCRAPER RESULTS ===`);
    console.log(`Duration: ${duration} seconds`);
    console.log(`Events found: ${result.eventsFound || 0}`);
    console.log(`Unique events: ${result.uniqueEvents || result.eventsFound || 0}`);
    console.log(`Events saved: ${result.eventsSaved || 0}`);
    
    if (result.sources) {
      console.log(`Sources processed: ${result.sources}`);
    }
    
    if (result.pagesScraped) {
      console.log(`Pages scraped: ${result.pagesScraped}`);
    }
    
    // Quality metrics
    const savedRatio = result.eventsSaved / (result.eventsFound || 1);
    console.log(`Save ratio: ${(savedRatio * 100).toFixed(1)}%`);
    
    if (result.eventsSaved === 0) {
      console.log(`\u26a0️  WARNING: No events were saved to database`);
    } else if (result.eventsSaved < 5) {
      console.log(`\u26a0️  WARNING: Low event count (${result.eventsSaved} events)`);
    } else {
      console.log(`✓ Good event count: ${result.eventsSaved} events saved`);
    }
    
    return result;
    
  } catch (error) {
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.error(`\n✗ ${scraperType.toUpperCase()} SCRAPER FAILED`);
    console.error(`Duration: ${duration} seconds`);
    console.error(`Error: ${error.message}`);
    console.error(`Stack: ${error.stack}`);
    
    return { error: error.message, duration };
  }
}

async function testAllScrapers() {
  const scrapers = ['advanced', 'structured', 'simple'];
  const results = {};
  
  console.log('='.repeat(60));
  console.log('COMPREHENSIVE SCRAPER TESTING');
  console.log('='.repeat(60));
  
  for (const scraperType of scrapers) {
    results[scraperType] = await testScraper(scraperType);
    
    // Delay between scrapers to avoid overwhelming sources
    if (scraperType !== scrapers[scrapers.length - 1]) {
      console.log('\nWaiting 10 seconds before next scraper...');
      await new Promise(resolve => setTimeout(resolve, 10000));
    }
  }
  
  // Summary report
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY REPORT');
  console.log('='.repeat(60));
  
  let totalEvents = 0;
  let totalSaved = 0;
  let successfulScrapers = 0;
  
  for (const [scraperType, result] of Object.entries(results)) {
    if (result.error) {
      console.log(`${scraperType.toUpperCase()}: FAILED - ${result.error}`);
    } else {
      console.log(`${scraperType.toUpperCase()}: SUCCESS - ${result.eventsSaved || 0} events saved`);
      totalEvents += result.eventsFound || 0;
      totalSaved += result.eventsSaved || 0;
      successfulScrapers++;
    }
  }
  
  console.log('\nOVERALL STATISTICS:');
  console.log(`Successful scrapers: ${successfulScrapers}/${scrapers.length}`);
  console.log(`Total events found: ${totalEvents}`);
  console.log(`Total events saved: ${totalSaved}`);
  console.log(`Overall save ratio: ${totalEvents > 0 ? ((totalSaved / totalEvents) * 100).toFixed(1) : 0}%`);
  
  // Recommendations
  console.log('\nRECOMMENDations:');
  if (successfulScrapers === 0) {
    console.log('✗ All scrapers failed - check database connection and API keys');
  } else if (totalSaved < 10) {
    console.log('⚠️  Low event count - consider adding more sources or adjusting filters');
  } else if (totalSaved >= 30) {
    console.log('✓ Excellent results - scraping architecture is working well');
  } else {
    console.log('✓ Good results - scraping is functional');
  }
  
  return results;
}

async function main() {
  const scraperType = process.argv[2] || 'all';
  
  console.log('Advanced Alpsabzug Scraper Testing Tool');
  console.log(`Node.js version: ${process.version}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Database URL: ${process.env.DATABASE_URL ? 'Set' : 'Not set'}`);
  console.log(`ST API Key: ${process.env.ST_API_KEY ? 'Set' : 'Not set'}`);
  
  try {
    let results;
    
    if (scraperType === 'all') {
      results = await testAllScrapers();
    } else {
      results = await testScraper(scraperType);
    }
    
    console.log('\n✓ Testing completed successfully');
    process.exit(0);
    
  } catch (error) {
    console.error('\n✗ Testing failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n\nReceived SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Run if called directly
if (require.main === module) {
  main();
}

module.exports = { testScraper, testAllScrapers };