import { PrismaClient } from '@prisma/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Create Prisma client using public URL
function createPrismaClient() {
  // Use DATABASE_PUBLIC_URL since internal URL doesn't work from Vercel
  const url = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
  
  return new PrismaClient({
    datasources: {
      db: { url }
    }
  });
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db