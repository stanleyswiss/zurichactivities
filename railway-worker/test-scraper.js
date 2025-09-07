// Test script to verify Alpsabzug scraper locally
require('dotenv').config();
const { runAlpsabzugScraper } = require('./src/scraper');

async function test() {
  console.log('Testing Alpsabzug scraper...');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set');
  
  try {
    const result = await runAlpsabzugScraper();
    console.log('Test completed:', result);
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  process.exit(0);
}

test();