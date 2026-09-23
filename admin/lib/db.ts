import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Same pattern as the consumer app's lib/db.ts, same DATABASE_URL, same
// generated client (both apps' prisma.config.ts point at the one shared
// prisma/schema.prisma) -- but this is its own PrismaClient *instance* and
// its own connection pool, since these are two separate Next.js
// deployments. Keep DATABASE_URL's pool size in mind if both apps ever run
// serverless at real scale (Prisma Accelerate / pgBouncer -- see the root
// app's lib/db.ts comment, same advice applies here).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
