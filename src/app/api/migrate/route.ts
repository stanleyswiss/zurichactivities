import { PrismaClient } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
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
        console.log('Connected using public URL');
      } else {
        throw new Error('No public URL available');
      }
    }
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database connection successful. Schema should be auto-created by Prisma.',
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