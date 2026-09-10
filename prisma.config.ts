import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

// Prisma 7 moved the database connection string out of schema.prisma and
// into this config file. Local dev reads DATABASE_URL from .env (loaded by
// the dotenv/config import above); Vercel injects it directly as an
// environment variable, so this works unchanged in both places.
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
