import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Standard Next.js dev-mode singleton so hot-reload doesn't exhaust Postgres
// connections. In production (serverless), swap this for Prisma Accelerate
// or a pgBouncer-fronted DATABASE_URL — see the strategy doc's scaling section.
//
// Prisma 7 requires an explicit driver adapter rather than reading the
// connection string straight from schema.prisma (that moved to
// prisma.config.ts for the CLI; the running app still needs its own adapter).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
