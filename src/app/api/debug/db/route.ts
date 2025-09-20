import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  
  // Only allow with token for security
  if (token !== 'randomscrape123token') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    DATABASE_URL: process.env.DATABASE_URL ? 'SET (masked)' : 'NOT SET',
    DATABASE_PUBLIC_URL: process.env.DATABASE_PUBLIC_URL ? 'SET (masked)' : 'NOT SET',
    RAILWAY_WORKER_URL: process.env.RAILWAY_WORKER_URL ? 'SET (masked)' : 'NOT SET',
    NODE_ENV: process.env.NODE_ENV,
    VERCEL: process.env.VERCEL ? 'true' : 'false',
    // Show first few chars to help debug
    DB_URL_START: process.env.DATABASE_URL?.substring(0, 30) + '...',
    DB_PUBLIC_URL_START: process.env.DATABASE_PUBLIC_URL?.substring(0, 30) + '...',
  });
}