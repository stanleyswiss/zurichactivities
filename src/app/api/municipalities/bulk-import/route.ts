import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateDistance } from '@/lib/utils/distance';

const SCHLIEREN_COORDS = {
  lat: 47.396,
  lon: 8.447,
};

interface MunicipalityData {
  bfsNumber: number;
  name: string;
  canton: string;
  lat: number;
  lon: number;
  websiteUrl: string;
  population?: number;
  district?: string;
}

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
    const municipalities: MunicipalityData[] = await request.json();
    
    console.log(`Starting bulk import of ${municipalities.length} municipalities...`);
    
    let imported = 0;
    let skipped = 0;
    let errors = 0;
    
    for (const muni of municipalities) {
      try {
        // Calculate distance from Schlieren
        const distance = calculateDistance(
          SCHLIEREN_COORDS.lat,
          SCHLIEREN_COORDS.lon,
          muni.lat,
          muni.lon
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
        
        await db.municipality.upsert({
          where: { bfsNumber: muni.bfsNumber },
          create: {
            bfsNumber: muni.bfsNumber,
            name: muni.name,
            nameNorm,
            canton: muni.canton,
            district: muni.district || null,
            websiteUrl: muni.websiteUrl || null,
            lat: muni.lat,
            lon: muni.lon,
            distanceFromHome: distance,
            population: muni.population || null,
            scrapeStatus: 'pending',
          },
          update: {
            name: muni.name,
            nameNorm,
            canton: muni.canton,
            district: muni.district || null,
            websiteUrl: muni.websiteUrl || null,
            lat: muni.lat,
            lon: muni.lon,
            distanceFromHome: distance,
            population: muni.population || null,
          },
        });
        
        imported++;
        
        if (imported % 50 === 0) {
          console.log(`Progress: ${imported} imported...`);
        }
        
      } catch (error) {
        console.error(`Error importing ${muni.name}:`, error);
        errors++;
      }
    }
    
    console.log(`Import complete: ${imported} imported, ${skipped} skipped, ${errors} errors`);
    
    // Get updated stats
    const stats = {
      total: await db.municipality.count(),
      withWebsite: await db.municipality.count({
        where: { websiteUrl: { not: null } }
      }),
      cantons: await db.municipality.groupBy({
        by: ['canton'],
        _count: true,
      }),
    };
    
    return NextResponse.json({
      success: true,
      imported,
      skipped,
      errors,
      stats,
      message: `Successfully imported ${imported} municipalities`
    });
    
  } catch (error) {
    console.error('Bulk import error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}