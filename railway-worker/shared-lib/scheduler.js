"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.eventScheduler = exports.EventScheduler = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("./db");
const ai_municipal_scraper_1 = require("./scrapers/ai-municipal-scraper");
class EventScheduler {
    constructor() {
        this.isRunning = false;
        this.lastRun = null;
        this.initializeScheduler();
    }
    initializeScheduler() {
        // Avoid in-Lambda cron in Vercel; rely on Vercel Cron instead
        const runningOnVercel = !!process.env.VERCEL;
        if (runningOnVercel) {
            console.log('Vercel environment detected: internal cron disabled. Use Vercel Cron.');
            return;
        }
        // Daily at 6 AM (for non-serverless/local usage)
        node_cron_1.default.schedule('0 6 * * *', async () => {
            console.log('Running scheduled municipal scrape at', new Date());
            await this.runMunicipalScrapers();
        });
        console.log('Municipal event scheduler initialized - will run daily at 6:00 AM (non-Vercel)');
    }
    async runMunicipalScrapers(limit = 5, maxDistance = 100, cmsType = 'all') {
        if (this.isRunning) {
            throw new Error('Scraping is already in progress');
        }
        this.isRunning = true;
        const startTime = Date.now();
        const results = [];
        const normalizedLimit = Math.max(1, Math.min(limit, 10));
        try {
            console.log(`Starting municipal scrape: ${normalizedLimit} municipalities within ${maxDistance}km`);
            // Use AI-powered municipal scraper with proper database connection handling
            try {
                const aiScraper = new ai_municipal_scraper_1.AIMunicipalScraper(db_1.db);
                const result = await aiScraper.scrapeMultipleMunicipalities(normalizedLimit, maxDistance);
                results.push({
                    source: 'MUNICIPAL',
                    success: result.success > 0,
                    eventsFound: result.totalEvents,
                    eventsSaved: result.totalEvents,
                    duration: Date.now() - startTime,
                    municipalitiesScraped: result.success + result.failed,
                });
                console.log(`Municipal scrape completed: ${result.success} succeeded, ${result.failed} failed, ${result.totalEvents} events found`);
            }
            catch (dbError) {
                console.error('Database connection failed, municipal scraping not available:', dbError);
                results.push({
                    source: 'MUNICIPAL',
                    success: false,
                    eventsFound: 0,
                    eventsSaved: 0,
                    duration: Date.now() - startTime,
                    error: 'Database connection failed - municipal scraping requires database access',
                    municipalitiesScraped: 0,
                });
            }
            this.lastRun = new Date();
        }
        catch (error) {
            console.error('Municipal scraper error:', error);
            results.push({
                source: 'MUNICIPAL',
                success: false,
                eventsFound: 0,
                eventsSaved: 0,
                duration: Date.now() - startTime,
                error: error instanceof Error ? error.message : 'Unknown error',
                municipalitiesScraped: 0,
            });
        }
        finally {
            this.isRunning = false;
        }
        return results;
    }
    // Compatibility method for existing API
    async runAllScrapers(sources, force = false) {
        // Always run municipal scrapers regardless of requested sources
        return this.runMunicipalScrapers();
    }
    getStatus() {
        return {
            isRunning: this.isRunning,
            lastRun: this.lastRun,
        };
    }
    getLastRun() {
        return this.lastRun;
    }
}
exports.EventScheduler = EventScheduler;
// Export singleton instance
exports.eventScheduler = new EventScheduler();
