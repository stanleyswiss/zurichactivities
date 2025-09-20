import { PrismaClient } from '@prisma/client';
import { calculateDistance } from '../utils/distance';

const SCHLIEREN_COORDS = {
  lat: parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LAT || '47.396'),
  lon: parseFloat(process.env.NEXT_PUBLIC_SCHLIEREN_LON || '8.447'),
};

interface SwissPostMunicipality {
  bfsNr: number;
  gemeindename: string;
  kanton: string;
  bezirk?: string;
  plz?: string;
  latitude?: number;
  longitude?: number;
}

interface OpenDataMunicipality {
  registryId: number;
  dateOfChange: string;
  municipalityId: number;
  municipalityLongName: string;
  municipalityShortName: string;
  cantonAbbreviation: string;
  municipalityTypeName: string;
  municipalityDateOfChange: string;
}

export class SwissMunicipalityService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async fetchAndStoreMunicipalities(maxDistance: number = 200) {
    console.log(`Fetching Swiss municipalities within ${maxDistance}km of Schlieren...`);
    
    try {
      // Try Swiss Post API first
      const municipalities = await this.fetchFromSwissPost();
      
      if (!municipalities || municipalities.length === 0) {
        console.log('Swiss Post API failed, trying OpenData.swiss...');
        // Fallback to other sources if needed
        return await this.fetchFromOpenDataSwiss();
      }

      // Filter by distance and store
      let stored = 0;
      let skipped = 0;
      
      for (const muni of municipalities) {
        if (!muni.latitude || !muni.longitude) {
          skipped++;
          continue;
        }

        const distance = calculateDistance(
          SCHLIEREN_COORDS.lat,
          SCHLIEREN_COORDS.lon,
          muni.latitude,
          muni.longitude
        );

        if (distance <= maxDistance) {
          await this.upsertMunicipality({
            bfsNumber: muni.bfsNr,
            name: muni.gemeindename,
            canton: muni.kanton,
            district: muni.bezirk,
            lat: muni.latitude,
            lon: muni.longitude,
            distanceFromHome: distance,
          });
          stored++;
        }
      }

      console.log(`Stored ${stored} municipalities within ${maxDistance}km (skipped ${skipped} without coordinates)`);
      return { stored, skipped, total: municipalities.length };
      
    } catch (error) {
      console.error('Error fetching municipalities:', error);
      throw error;
    }
  }

  private async fetchFromSwissPost(): Promise<SwissPostMunicipality[]> {
    try {
      // Swiss Post provides a list of all municipalities with PLZ
      const response = await fetch(
        'https://swisspost.opendatasoft.com/api/records/1.0/search/?dataset=politische-gemeinden_v2&rows=3000&facet=kanton'
      );
      
      if (!response.ok) {
        throw new Error(`Swiss Post API error: ${response.status}`);
      }

      const data = await response.json();
      
      return data.records.map((record: any) => ({
        bfsNr: record.fields.bfsnr,
        gemeindename: record.fields.gemeindename,
        kanton: record.fields.kanton,
        bezirk: record.fields.bezirk,
        plz: record.fields.plz,
        latitude: record.fields.geo_point_2d?.[0],
        longitude: record.fields.geo_point_2d?.[1],
      }));
    } catch (error) {
      console.error('Swiss Post API error:', error);
      return [];
    }
  }

  private async fetchFromOpenDataSwiss(): Promise<any> {
    try {
      // Official Swiss municipality register
      const response = await fetch(
        'https://data.geo.admin.ch/ch.swisstopo.swissboundaries3d-gemeinde-flaeche.fill/v1/current/gemeinde.json'
      );

      if (!response.ok) {
        throw new Error(`OpenData API error: ${response.status}`);
      }

      const data = await response.json();
      
      // This returns GeoJSON, we'd need to process it differently
      console.log('OpenData response needs custom processing...');
      return { stored: 0, skipped: 0, total: 0 };
      
    } catch (error) {
      console.error('OpenData.swiss API error:', error);
      return { stored: 0, skipped: 0, total: 0 };
    }
  }

  private async upsertMunicipality(data: {
    bfsNumber: number;
    name: string;
    canton: string;
    district?: string;
    lat: number;
    lon: number;
    distanceFromHome: number;
  }) {
    const nameNorm = this.normalizeName(data.name);
    
    await this.prisma.municipality.upsert({
      where: { bfsNumber: data.bfsNumber },
      create: {
        bfsNumber: data.bfsNumber,
        name: data.name,
        nameNorm,
        canton: data.canton,
        district: data.district,
        lat: data.lat,
        lon: data.lon,
        distanceFromHome: data.distanceFromHome,
        scrapeStatus: 'pending',
      },
      update: {
        name: data.name,
        nameNorm,
        canton: data.canton,
        district: data.district,
        lat: data.lat,
        lon: data.lon,
        distanceFromHome: data.distanceFromHome,
      },
    });
  }

  private normalizeName(name: string): string {
    return name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove diacritics
      .replace(/[^a-z0-9]/g, ''); // Keep only alphanumeric
  }

  async findWebsitePatterns() {
    // Common Swiss municipality website patterns
    const patterns = [
      (name: string) => `https://www.${name.toLowerCase()}.ch`,
      (name: string) => `https://${name.toLowerCase()}.ch`,
      (name: string) => `https://www.gemeinde-${name.toLowerCase()}.ch`,
      (name: string) => `https://www.stadt-${name.toLowerCase()}.ch`,
      (name: string) => `https://www.${name.toLowerCase().replace(/\s+/g, '-')}.ch`,
    ];

    const municipalities = await this.prisma.municipality.findMany({
      where: { 
        websiteUrl: null,
        distanceFromHome: { lte: 50 } // Start with closer ones
      },
      orderBy: { distanceFromHome: 'asc' },
      take: 10, // Process in batches
    });

    for (const muni of municipalities) {
      for (const pattern of patterns) {
        const url = pattern(muni.name);
        
        try {
          const response = await fetch(url, { 
            method: 'HEAD',
            signal: AbortSignal.timeout(5000),
          });
          
          if (response.ok) {
            await this.prisma.municipality.update({
              where: { id: muni.id },
              data: { websiteUrl: url },
            });
            console.log(`Found website for ${muni.name}: ${url}`);
            break;
          }
        } catch (error) {
          // Try next pattern
        }
      }
    }
  }

  async detectEventPages() {
    const eventPatterns = [
      '/veranstaltungen',
      '/events',
      '/agenda',
      '/anlaesse',
      '/kalender',
      '/termine',
      '/aktuelles/veranstaltungen',
      '/de/veranstaltungen',
      '/gemeinde/veranstaltungen',
    ];

    const municipalities = await this.prisma.municipality.findMany({
      where: { 
        websiteUrl: { not: null },
        eventPageUrl: null,
        distanceFromHome: { lte: 50 }
      },
      orderBy: { distanceFromHome: 'asc' },
      take: 10,
    });

    for (const muni of municipalities) {
      for (const pattern of eventPatterns) {
        const url = muni.websiteUrl + pattern;
        
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(5000),
          });
          
          if (response.ok) {
            await this.prisma.municipality.update({
              where: { id: muni.id },
              data: { 
                eventPageUrl: url,
                eventPagePattern: pattern,
              },
            });
            console.log(`Found event page for ${muni.name}: ${url}`);
            break;
          }
        } catch (error) {
          // Try next pattern
        }
      }
    }
  }
}