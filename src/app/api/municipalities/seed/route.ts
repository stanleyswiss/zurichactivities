import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { SwissMunicipalityService } from '@/lib/scrapers/swiss-municipalities';

function isAuthorized(request: NextRequest) {
  const token = process.env.SCRAPE_TOKEN;
  if (!token) return true; // Allow if no token configured
  
  const auth = request.headers.get('authorization');
  if (auth && auth.startsWith('Bearer ')) {
    return auth.slice(7) === token;
  }
  
  const urlToken = request.nextUrl.searchParams.get('token');
  return urlToken === token;
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const maxDistance = parseInt(request.nextUrl.searchParams.get('maxDistance') || '200');
  
  let prisma: PrismaClient | null = null;
  
  try {
    const internalUrl = process.env.DATABASE_URL;
    const publicUrl = process.env.DATABASE_PUBLIC_URL;
    
    // Try internal URL first, fall back to public
    const dbUrl = internalUrl || publicUrl;
    
    if (!dbUrl) {
      throw new Error('No database URL available');
    }
    
    prisma = new PrismaClient({
      datasources: { db: { url: dbUrl } }
    });
    
    await prisma.$connect();
    
    const service = new SwissMunicipalityService(prisma);
    const result = await service.fetchAndStoreMunicipalities(maxDistance);
    
    return NextResponse.json({
      success: true,
      message: `Seeded municipalities within ${maxDistance}km`,
      ...result
    });
    
  } catch (error) {
    console.error('Municipality seed error:', error);
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

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let prisma: PrismaClient | null = null;
  
  try {
    const body = await request.json();
    const action = body.action || 'seed';
    const maxDistance = body.maxDistance || 200;
    
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
    
    const service = new SwissMunicipalityService(prisma);
    
    switch (action) {
      case 'seed':
        const seedResult = await service.fetchAndStoreMunicipalities(maxDistance);
        return NextResponse.json({
          success: true,
          action: 'seed',
          ...seedResult
        });
        
      case 'findWebsites':
        await service.findWebsitePatterns();
        return NextResponse.json({
          success: true,
          action: 'findWebsites',
          message: 'Started website detection process'
        });
        
      case 'findEventPages':
        await service.detectEventPages();
        return NextResponse.json({
          success: true,
          action: 'findEventPages',
          message: 'Started event page detection process'
        });
        
      default:
        return NextResponse.json({
          success: false,
          error: `Unknown action: ${action}`
        }, { status: 400 });
    }
    
  } catch (error) {
    console.error('Municipality operation error:', error);
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