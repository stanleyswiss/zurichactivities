import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create Prisma client with fallback URL logic
function createPrismaClient() {
  const internalUrl = process.env.DATABASE_URL;
  const publicUrl = process.env.DATABASE_PUBLIC_URL;
  
  // Try public URL first in production since internal often fails
  const url = process.env.NODE_ENV === 'production' && publicUrl ? publicUrl : internalUrl;
  
  return new PrismaClient({
    datasources: {
      db: { url }
    }
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db