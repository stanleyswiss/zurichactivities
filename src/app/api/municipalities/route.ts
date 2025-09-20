import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  let prisma: PrismaClient | null = null;
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const maxDistance = parseInt(searchParams.get('maxDistance') || '200');
    const canton = searchParams.get('canton') || undefined;
    const status = searchParams.get('status') || undefined;
    const hasWebsite = searchParams.get('hasWebsite');
    const hasEventPage = searchParams.get('hasEventPage');
    const limit = parseInt(searchParams.get('limit') || '100');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    const internalUrl = process.env.DATABASE_URL;
    const publicUrl = process.env.DATABASE_PUBLIC_URL;
    
    const dbUrl = internalUrl || publicUrl;
    
    if (!dbUrl) {
      throw new Error('No database URL available');
    }
    
    prisma = new PrismaClient({
      datasources: { db: { url: dbUrl } }
    });
    
    await prisma.$connect();
    
    // Build where clause
    const where: any = {
      distanceFromHome: { lte: maxDistance }
    };
    
    if (canton) {
      where.canton = canton;
    }
    
    if (status) {
      where.scrapeStatus = status;
    }
    
    if (hasWebsite === 'true') {
      where.websiteUrl = { not: null };
    } else if (hasWebsite === 'false') {
      where.websiteUrl = null;
    }
    
    if (hasEventPage === 'true') {
      where.eventPageUrl = { not: null };
    } else if (hasEventPage === 'false') {
      where.eventPageUrl = null;
    }
    
    // Get total count
    const total = await prisma.municipality.count({ where });
    
    // Get municipalities
    const municipalities = await prisma.municipality.findMany({
      where,
      orderBy: [
        { distanceFromHome: 'asc' },
        { name: 'asc' }
      ],
      take: limit,
      skip: offset,
      include: {
        _count: {
          select: { events: true }
        }
      }
    });
    
    // Get statistics
    const stats = await prisma.municipality.groupBy({
      by: ['canton', 'scrapeStatus'],
      where: { distanceFromHome: { lte: maxDistance } },
      _count: true,
    });
    
    const websiteStats = await prisma.municipality.aggregate({
      where: { distanceFromHome: { lte: maxDistance } },
      _count: {
        _all: true,
        websiteUrl: true,
        eventPageUrl: true,
      },
    });
    
    return NextResponse.json({
      success: true,
      total,
      municipalities,
      stats: {
        byCantonAndStatus: stats,
        totals: {
          all: websiteStats._count._all,
          withWebsite: websiteStats._count.websiteUrl,
          withEventPage: websiteStats._count.eventPageUrl,
        }
      },
      pagination: {
        limit,
        offset,
        hasMore: offset + limit < total,
      }
    });
    
  } catch (error) {
    console.error('Municipality list error:', error);
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