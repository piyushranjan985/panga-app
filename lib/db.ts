import { PrismaClient } from '@prisma/client';

// Standard Next.js dev-mode singleton so hot-reload doesn't exhaust Postgres
// connections. In production (serverless), swap this for Prisma Accelerate
// or a pgBouncer-fronted DATABASE_URL — see the strategy doc's scaling section.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
