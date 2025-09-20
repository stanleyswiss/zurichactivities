import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateDistance } from '@/lib/utils/distance';

const SCHLIEREN_COORDS = {
  lat: 47.396,
  lon: 8.447,
};

interface EnhancedMunicipalityData {
  bfs_number: string;
  name: string;
  canton: string;
  district?: string;
  latitude: number;
  longitude: number;
  population?: number;
  website_url: string;
  event_page_url?: string | null;
  event_page_pattern?: string;
  cms_type: string;
  cms_version?: string;
  has_events: boolean;
  scraping_method: string;
  event_selectors?: {
    container?: string;
    title?: string;
    date?: string;
    location?: string;
    organizer?: string;
    description?: string;
    price?: string;
    registration?: string;
  } | null;
  date_format?: string;
  time_format?: string;
  language: string;
  multilingual?: boolean;
  api_endpoint?: string | null;
  requires_javascript?: boolean;
  ajax_pagination?: boolean;
  structured_data?: boolean;
  robots_txt_compliant?: boolean;
  update_frequency?: string;
  average_events_monthly?: number;
  notes?: string;
}

export const dynamic = 'force-dynamic';

function isAuthorized(request: NextRequest) {
  const token = process.env.SCRAPE_TOKEN;
  if (!token) return false;
  const urlToken = request.nextUrl.searchParams.get('token');
  return urlToken === token;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const data = await request.json();
    const municipalities: EnhancedMunicipalityData[] = data.municipalities || data;
    
    console.log(`Starting enhanced import of ${municipalities.length} municipalities...`);
    
    let imported = 0;
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const muni of municipalities) {
      try {
        // Convert BFS number to integer
        const bfsNumber = parseInt(muni.bfs_number);
        if (isNaN(bfsNumber)) {
          console.log(`Skipping ${muni.name}: Invalid BFS number ${muni.bfs_number}`);
          skipped++;
          continue;
        }
        
        // Calculate distance from Schlieren
        const distance = calculateDistance(
          SCHLIEREN_COORDS.lat,
          SCHLIEREN_COORDS.lon,
          muni.latitude,
          muni.longitude
        );
        
        // Skip if over 200km (safety check)
        if (distance > 200) {
          skipped++;
          continue;
        }
        
        const nameNorm = muni.name
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]/g, '');
        
        // Check if municipality exists
        const existing = await db.municipality.findUnique({
          where: { bfsNumber }
        });
        
        const municipalityData = {
          bfsNumber,
          name: muni.name,
          nameNorm,
          canton: muni.canton,
          district: muni.district || null,
          websiteUrl: muni.website_url || null,
          eventPageUrl: muni.event_page_url || null,
          eventPagePattern: muni.event_page_pattern || null,
          cmsType: muni.cms_type || 'unknown',
          cmsVersion: muni.cms_version || null,
          hasEvents: muni.has_events || false,
          scrapingMethod: muni.scraping_method || 'unknown',
          eventSelectors: muni.event_selectors ? JSON.stringify(muni.event_selectors) : null,
          dateFormat: muni.date_format || 'dd.mm.yyyy',
          timeFormat: muni.time_format || 'HH:MM',
          language: muni.language || 'de',
          multilingual: muni.multilingual || false,
          apiEndpoint: muni.api_endpoint || null,
          requiresJavascript: muni.requires_javascript || false,
          ajaxPagination: muni.ajax_pagination || false,
          structuredData: muni.structured_data || false,
          robotsTxtCompliant: muni.robots_txt_compliant !== false,
          updateFrequency: muni.update_frequency || 'weekly',
          averageEventsMonthly: muni.average_events_monthly || null,
          enhancedNotes: muni.notes || null,
          lat: muni.latitude,
          lon: muni.longitude,
          distanceFromHome: distance,
          population: muni.population || null,
          scrapeStatus: existing?.scrapeStatus || 'pending',
        };
        
        if (existing) {
          // Update existing municipality with enhanced data
          await db.municipality.update({
            where: { bfsNumber },
            data: municipalityData
          });
          updated++;
        } else {
          // Create new municipality
          await db.municipality.create({
            data: municipalityData
          });
          imported++;
        }
        
        if ((imported + updated) % 100 === 0) {
          console.log(`Progress: ${imported} new, ${updated} updated...`);
        }
        
      } catch (error) {
        console.error(`Error processing ${muni.name}:`, error);
        errors++;
      }
    }
    
    console.log(`Enhanced import complete: ${imported} new, ${updated} updated, ${skipped} skipped, ${errors} errors`);
    
    // Get updated stats
    const stats = {
      total: await db.municipality.count(),
      withWebsite: await db.municipality.count({
        where: { websiteUrl: { not: null } }
      }),
      withEventPage: await db.municipality.count({
        where: { eventPageUrl: { not: null } }
      }),
      withSelectors: await db.municipality.count({
        where: { eventSelectors: { not: null } }
      }),
      readyToScrape: await db.municipality.count({
        where: { 
          AND: [
            { eventPageUrl: { not: null } },
            { hasEvents: true },
            { scrapingMethod: { not: 'none' } }
          ]
        }
      }),
      byLanguage: await db.municipality.groupBy({
        by: ['language'],
        _count: true,
      }),
      byCmsType: await db.municipality.groupBy({
        by: ['cmsType'],
        _count: true,
      }),
    };
    
    return NextResponse.json({
      success: true,
      imported,
      updated,
      skipped,
      errors,
      stats,
      message: `Successfully processed ${imported + updated} municipalities with enhanced data`
    });
    
  } catch (error) {
    console.error('Enhanced import error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}