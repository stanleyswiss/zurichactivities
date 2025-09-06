import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  let prisma: PrismaClient | null = null;
  
  try {
    const publicUrl = process.env.DATABASE_PUBLIC_URL;
    
    if (!publicUrl) {
      throw new Error('DATABASE_PUBLIC_URL not found');
    }
    
    prisma = new PrismaClient({
      datasources: { db: { url: publicUrl } }
    });
    
    await prisma.$connect();
    
    // Create the Event table using raw SQL
    await prisma.$executeRaw`
      CREATE TABLE IF NOT EXISTS "Event" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "source" TEXT NOT NULL,
        "sourceEventId" TEXT,
        "title" TEXT NOT NULL,
        "titleNorm" TEXT NOT NULL,
        "description" TEXT,
        "lang" TEXT NOT NULL DEFAULT 'de',
        "category" TEXT,
        "startTime" TIMESTAMP(3) NOT NULL,
        "endTime" TIMESTAMP(3),
        "venueName" TEXT,
        "street" TEXT,
        "postalCode" TEXT,
        "city" TEXT,
        "country" TEXT NOT NULL DEFAULT 'CH',
        "lat" DOUBLE PRECISION,
        "lon" DOUBLE PRECISION,
        "priceMin" DOUBLE PRECISION,
        "priceMax" DOUBLE PRECISION,
        "currency" TEXT NOT NULL DEFAULT 'CHF',
        "url" TEXT,
        "imageUrl" TEXT,
        "uniquenessHash" TEXT NOT NULL UNIQUE,
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `;
    
    // Create indexes
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Event_startTime_idx" ON "Event"("startTime")`;
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Event_lat_lon_idx" ON "Event"("lat", "lon")`;
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Event_source_idx" ON "Event"("source")`;
    await prisma.$executeRaw`CREATE INDEX IF NOT EXISTS "Event_category_idx" ON "Event"("category")`;
    
    // Test that we can query the table
    const count = await prisma.event.count();
    
    return NextResponse.json({ 
      success: true, 
      message: `Event table created successfully. Current count: ${count}`,
      count
    });
  } catch (error) {
    console.error('Create tables error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  } finally {
    if (prisma) {
      await prisma.$disconnect();
    }
  }
}