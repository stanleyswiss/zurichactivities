import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { EnhancedMunicipalScraper } from '@/lib/scrapers/enhanced-municipal-scraper';
import {
  MunicipalityScrapingConfig,
  StructuredMunicipalEvent as ExtractedEvent,
} from '@/lib/scrapers/municipal-types';
import { createHash } from 'crypto';

function isAuthorized(request: NextRequest) {
  const token = process.env.SCRAPE_TOKEN;
  if (!token) return false;
  const urlToken = request.nextUrl.searchParams.get('token');
  return urlToken === token;
}

function generateUniquenessHash(event: ExtractedEvent, municipalityId: string): string {
  const normalizedTitle = event.title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '');
  
  const dateKey = event.startTime.toISOString().split('T')[0]; // YYYY-MM-DD
  const venueKey = event.venueName?.toLowerCase().replace(/[^a-z0-9]/g, '') || '';
  
  const composite = `${municipalityId}-${normalizedTitle}-${dateKey}-${venueKey}`;
  return createHash('sha256').update(composite).digest('hex');
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const limit = parseInt(searchParams.get('limit') || '10');
  const maxDistance = parseInt(searchParams.get('maxDistance') || '50');
  const municipalityId = searchParams.get('municipalityId');
  const cmsType = searchParams.get('cmsType');

  try {
    let whereClause: any = {
      distanceFromHome: { lte: maxDistance },
      hasEvents: true,
      eventPageUrl: { not: null },
      scrapingMethod: { not: 'none' },
      OR: [
        { scrapeStatus: 'pending' },
        { lastScraped: { lt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }, // Last scraped > 24h ago
      ]
    };

    if (municipalityId) {
      whereClause = { id: municipalityId };
    }

    if (cmsType) {
      whereClause.cmsType = cmsType;
    }

    const municipalities = await db.municipality.findMany({
      where: whereClause,
      orderBy: [
        { distanceFromHome: 'asc' },
        { population: 'desc' },
      ],
      take: limit,
    });

    console.log(`Starting enhanced scraping for ${municipalities.length} municipalities...`);

    const scraper = new EnhancedMunicipalScraper();
    const results = {
      processed: 0,
      successful: 0,
      failed: 0,
      totalEvents: 0,
      municipalities: [] as any[],
    };

    for (const municipality of municipalities) {
      const municipalityResult = {
        id: municipality.id,
        name: municipality.name,
        canton: municipality.canton,
        cmsType: municipality.cmsType,
        scrapingMethod: municipality.scrapingMethod,
        success: false,
        eventCount: 0,
        error: null as string | null,
        events: [] as any[],
      };

      try {
        // Convert municipality to scraping config
        const config: MunicipalityScrapingConfig = {
          id: municipality.id,
          name: municipality.name,
          eventPageUrl: municipality.eventPageUrl!,
          cmsType: municipality.cmsType || 'unknown',
          scrapingMethod: municipality.scrapingMethod || 'table-extraction',
          eventSelectors: municipality.eventSelectors ? JSON.parse(municipality.eventSelectors) : null,
          apiEndpoint: municipality.apiEndpoint,
          dateFormat: municipality.dateFormat || 'dd.mm.yyyy',
          language: municipality.language,
          requiresJavascript: municipality.requiresJavascript,
          notes: municipality.enhancedNotes || undefined,
        };

        console.log(`Scraping ${municipality.name} (${municipality.cmsType})...`);
        
        // Update scrape status to in progress
        await db.municipality.update({
          where: { id: municipality.id },
          data: { 
            scrapeStatus: 'active',
            lastScraped: new Date(),
            scrapeError: null,
          },
        });

        const extractedEvents = await scraper.scrapeEvents(config);
        
        let savedEvents = 0;
        const eventResults = [];

        // Save events to database
        for (const event of extractedEvents) {
          try {
            const uniquenessHash = generateUniquenessHash(event, municipality.id);
            
            const savedEvent = await db.event.upsert({
              where: { uniquenessHash },
              create: {
                source: 'MUNICIPAL',
                sourceEventId: null,
                title: event.title,
                titleNorm: event.title.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''),
                description: event.description,
                lang: municipality.language,
                category: null,
                startTime: event.startTime,
                endTime: event.endTime,
                venueName: event.venueName,
                street: null,
                postalCode: null,
                city: municipality.name,
                country: 'CH',
                lat: null,
                lon: null,
                priceMin: null,
                priceMax: null,
                currency: 'CHF',
                url: event.url,
                imageUrl: null,
                uniquenessHash,
                municipalityId: municipality.id,
              },
              update: {
                title: event.title,
                description: event.description,
                startTime: event.startTime,
                endTime: event.endTime,
                venueName: event.venueName,
                url: event.url,
              },
            });

            savedEvents++;
            eventResults.push({
              title: event.title,
              startTime: event.startTime,
              confidence: event.confidence,
              saved: true,
            });
            
          } catch (eventError) {
            console.warn(`Error saving event "${event.title}":`, eventError);
            eventResults.push({
              title: event.title,
              startTime: event.startTime,
              confidence: event.confidence,
              saved: false,
              error: eventError instanceof Error ? eventError.message : 'Unknown error',
            });
          }
        }

        // Update municipality with results
        await db.municipality.update({
          where: { id: municipality.id },
          data: {
            eventCount: savedEvents,
            scrapeStatus: savedEvents > 0 ? 'active' : 'failed',
            lastSuccessful: savedEvents > 0 ? new Date() : municipality.lastSuccessful,
            scrapeError: savedEvents === 0 && extractedEvents.length === 0 ? 'No events found' : null,
          },
        });

        municipalityResult.success = true;
        municipalityResult.eventCount = savedEvents;
        municipalityResult.events = eventResults;
        results.successful++;
        results.totalEvents += savedEvents;

        console.log(`✓ ${municipality.name}: ${savedEvents} events saved`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`✗ Error scraping ${municipality.name}:`, errorMessage);

        municipalityResult.error = errorMessage;
        
        // Update municipality with error
        await db.municipality.update({
          where: { id: municipality.id },
          data: {
            scrapeStatus: 'failed',
            scrapeError: errorMessage,
            lastScraped: new Date(),
          },
        });

        results.failed++;
      }

      results.municipalities.push(municipalityResult);
      results.processed++;

      // Be polite to servers - delay between requests
      if (results.processed < municipalities.length) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`Enhanced scraping complete: ${results.successful} successful, ${results.failed} failed, ${results.totalEvents} total events`);

    return NextResponse.json({
      success: true,
      results,
      summary: {
        processed: results.processed,
        successful: results.successful,
        failed: results.failed,
        totalEvents: results.totalEvents,
      },
    });

  } catch (error) {
    console.error('Enhanced scraping error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { municipalityId, bfsNumber } = await request.json();

    let municipality;
    if (municipalityId) {
      municipality = await db.municipality.findUnique({
        where: { id: municipalityId }
      });
    } else if (bfsNumber) {
      municipality = await db.municipality.findUnique({
        where: { bfsNumber: parseInt(bfsNumber) }
      });
    } else {
      return NextResponse.json({
        success: false,
        error: 'Either municipalityId or bfsNumber required'
      }, { status: 400 });
    }

    if (!municipality) {
      return NextResponse.json({
        success: false,
        error: 'Municipality not found'
      }, { status: 404 });
    }

    if (!municipality.eventPageUrl || !municipality.hasEvents) {
      return NextResponse.json({
        success: false,
        error: 'Municipality has no event page configured'
      }, { status: 400 });
    }

    // Use GET logic for single municipality
    const searchParams = new URLSearchParams({ 
      municipalityId: municipality.id,
      limit: '1',
      token: request.nextUrl.searchParams.get('token') || ''
    });
    
    const getRequest = new NextRequest(
      `${request.url.split('?')[0]}?${searchParams}`,
      { method: 'GET' }
    );

    return await GET(getRequest);

  } catch (error) {
    console.error('Single municipality scraping error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}
