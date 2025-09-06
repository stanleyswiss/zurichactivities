import { db } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Check if the database connection works
    await db.$connect();
    
    // Try to create a simple test query
    await db.$executeRaw`SELECT 1`;
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database connection successful. Schema should be auto-created by Prisma.' 
    });
  } catch (error) {
    console.error('Migration error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}