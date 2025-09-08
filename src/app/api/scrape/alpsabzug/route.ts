import { NextRequest, NextResponse } from 'next/server';
import { headers } from 'next/headers';

export async function POST(request: NextRequest) {
  try {
    const headersList = headers();
    const authHeader = headersList.get('authorization');
    const token = process.env.SCRAPE_TOKEN;
    
    // Check authorization
    if (token && authHeader !== `Bearer ${token}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }
    
    // Get Railway worker URL from environment
    const railwayWorkerUrl = process.env.RAILWAY_WORKER_URL;
    if (!railwayWorkerUrl) {
      return NextResponse.json(
        { error: 'Railway worker URL not configured' },
        { status: 500 }
      );
    }
    
    // Trigger Railway worker
    const response = await fetch(`${railwayWorkerUrl}/scrape`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader || ''
      }
    });
    
    if (!response.ok) {
      throw new Error(`Railway worker error: ${response.status}`);
    }
    
    const result = await response.json();
    
    return NextResponse.json({
      success: true,
      message: 'Alpsabzug scraper triggered on Railway',
      result
    });
  } catch (error) {
    console.error('Error triggering Alpsabzug scraper:', error);
    return NextResponse.json(
      { 
        error: 'Failed to trigger Alpsabzug scraper', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}