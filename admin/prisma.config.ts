import 'dotenv/config';
import path from 'node:path';
import { defineConfig, env } from 'prisma/config';

// The admin app has no schema of its own -- it points straight at the
// consumer app's prisma/schema.prisma (one path up), which now also holds
// every admin-domain model (AdminUser, AuditLogEntry, ModerationCase, ...
// see that file's "ADMIN PORTAL DOMAIN" section). One schema, one
// database, two Next.js apps: there is nothing to keep in sync by hand.
// Migrations are likewise generated/applied from the root app
// (`npm run db:migrate` there) since it's the same migrations history;
// this app only needs `prisma generate` (see package.json's postinstall)
// to get a typed client for these same tables.
export default defineConfig({
  schema: path.join(__dirname, '../prisma/schema.prisma'),
  migrations: {
    path: path.join(__dirname, '../prisma/migrations'),
  },
  datasource: {
    url: env('DATABASE_URL'),
  },
});
