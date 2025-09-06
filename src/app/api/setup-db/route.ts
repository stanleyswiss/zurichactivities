import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    // Import child_process dynamically
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);
    
    console.log('Setting up database schema...');
    
    // Set the DATABASE_URL to use public URL for this operation
    const env = {
      ...process.env,
      DATABASE_URL: process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL
    };
    
    // Run prisma db push to create the tables
    const { stdout, stderr } = await execAsync('yarn prisma db push --force-reset', {
      env,
      cwd: process.cwd()
    });
    
    console.log('Prisma stdout:', stdout);
    if (stderr) console.log('Prisma stderr:', stderr);
    
    return NextResponse.json({ 
      success: true, 
      message: 'Database schema created successfully',
      stdout,
      stderr
    });
  } catch (error) {
    console.error('Setup error:', error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }, { status: 500 });
  }
}