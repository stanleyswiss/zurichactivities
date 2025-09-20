import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

function isAuthorized(request: NextRequest) {
  const token = process.env.SCRAPE_TOKEN;
  if (!token) return false; // require token for this endpoint
  const auth = request.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7) === token;
  }
  const urlToken = request.nextUrl.searchParams.get('token');
  return urlToken === token;
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let prisma: PrismaClient | null = null;
  
  try {
    // First try with internal DATABASE_URL
    const internalUrl = process.env.DATABASE_URL;
    const publicUrl = process.env.DATABASE_PUBLIC_URL;
    
    console.log('Attempting database connection...');
    
    try {
      if (internalUrl) {
        prisma = new PrismaClient({
          datasources: { db: { url: internalUrl } }
        });
        await prisma.$connect();
        await prisma.$executeRaw`SELECT 1`;
        
        // Ensure database tables exist
        await ensureDatabaseTables(prisma);
        
        console.log('Connected using internal URL');
      } else {
        throw new Error('No internal URL available');
      }
    } catch (internalError) {
      console.log('Internal URL failed, trying public URL...');
      
      if (publicUrl) {
        await prisma?.$disconnect();
        prisma = new PrismaClient({
          datasources: { db: { url: publicUrl } }
        });
        await prisma.$connect();
        await prisma.$executeRaw`SELECT 1`;
        
        // Ensure database tables exist
        await ensureDatabaseTables(prisma);
        
        console.log('Connected using public URL');
      } else {
        throw new Error('No public URL available');
      }
    }
    
    return NextResponse.json({ 
      success: true,
      message: 'Database connection successful. All tables ensured.',
      url: prisma ? 'Connected successfully' : 'Unknown connection'
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}

export async function GET(request: NextRequest) {
  // Convenience method to run from browser with ?token=
  return POST(request);
}

async function ensureDatabaseTables(prisma: PrismaClient) {
  // Create table if not exists (case-sensitive to match Prisma model)
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GeocodeCache" (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      "addressKey" TEXT NOT NULL UNIQUE,
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Create Municipality table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Municipality" (
      id TEXT PRIMARY KEY DEFAULT md5(random()::text || clock_timestamp()::text),
      "bfsNumber" INTEGER NOT NULL UNIQUE,
      name TEXT NOT NULL,
      "nameNorm" TEXT NOT NULL,
      canton TEXT NOT NULL,
      district TEXT,
      "websiteUrl" TEXT,
      "eventPageUrl" TEXT,
      "eventPagePattern" TEXT,
      "cmsType" TEXT,
      lat DOUBLE PRECISION NOT NULL,
      lon DOUBLE PRECISION NOT NULL,
      "distanceFromHome" DOUBLE PRECISION NOT NULL,
      population INTEGER,
      "lastScraped" TIMESTAMPTZ,
      "lastSuccessful" TIMESTAMPTZ,
      "scrapeStatus" TEXT NOT NULL DEFAULT 'pending',
      "scrapeError" TEXT,
      "eventCount" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);

  // Create indexes for Municipality
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Municipality_canton_idx" ON "Municipality" (canton);
    CREATE INDEX IF NOT EXISTS "Municipality_distanceFromHome_idx" ON "Municipality" ("distanceFromHome");
    CREATE INDEX IF NOT EXISTS "Municipality_scrapeStatus_idx" ON "Municipality" ("scrapeStatus");
    CREATE INDEX IF NOT EXISTS "Municipality_lastScraped_idx" ON "Municipality" ("lastScraped");
  `);

  // Add municipalityId column to Event table if it doesn't exist
  await prisma.$executeRawUnsafe(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                     WHERE table_name='Event' AND column_name='municipalityId') THEN
        ALTER TABLE "Event" ADD COLUMN "municipalityId" TEXT;
        ALTER TABLE "Event" ADD CONSTRAINT "Event_municipalityId_fkey" 
          FOREIGN KEY ("municipalityId") REFERENCES "Municipality"(id) ON DELETE SET NULL ON UPDATE CASCADE;
        CREATE INDEX "Event_municipalityId_idx" ON "Event" ("municipalityId");
      END IF;
    END $$;
  `);
}
