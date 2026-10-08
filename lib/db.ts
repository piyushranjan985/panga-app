import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// Standard Next.js dev-mode singleton so hot-reload doesn't exhaust Postgres
// connections. DATABASE_URL is expected to already point at Neon's pooled
// (PgBouncer, "-pooler") endpoint in every deployed environment — see
// docs/MYSTERY_MATCH.md's env notes / the scaling doc for why.
//
// Prisma 7 requires an explicit driver adapter rather than reading the
// connection string straight from schema.prisma (that moved to
// prisma.config.ts for the CLI; the running app still needs its own adapter).
//
// max is capped low on purpose: Neon's pooler already multiplexes
// connections across all our serverless instances, so each individual
// instance only needs a handful of its own client connections, not
// node-postgres's default of 10. A low per-instance cap keeps us from
// stacking "10 connections x many concurrent instances" on top of the
// pooler at real traffic. Bump PRISMA_PG_POOL_MAX if a workload genuinely
// needs more headroom in one instance.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PRISMA_PG_POOL_MAX) || 3,
});

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
