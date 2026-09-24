#!/usr/bin/env bash
set -euo pipefail

# Prisma's `prisma generate` resolves whether @prisma/client is
# "installed" starting from the *schema file's own directory*
# (../prisma, i.e. the repo root's prisma/ folder) -- not from this
# app's cwd, and not from the generator's own explicit `output` paths
# (that's a separate, later step). Confirmed via `DEBUG=prisma:*`: it
# computes baseDir from the schema's directory and comes back with
# `prismaClientDir undefined` whenever nothing is installed at the
# repo root -- which is exactly the case on a Vercel build for this
# project alone (Root Directory: admin), where only admin/node_modules
# ever gets installed. Admin's own, perfectly valid, @prisma/client
# install is irrelevant to this specific check.
#
# Fix: make sure a minimal @prisma/client exists at the repo root too,
# purely to satisfy that check. --no-save keeps this from touching the
# consumer app's committed package.json/lockfile; --ignore-scripts
# skips install scripts since we only need the package's files to
# exist here, not a real generate to run against this throwaway copy.
if [ ! -d ../node_modules/@prisma/client ]; then
  echo "[prebuild] seeding ../node_modules/@prisma/client for Prisma's baseDir check..."
  (cd .. && npm install @prisma/client@7.10.0 --no-save --ignore-scripts --no-audit --no-fund --loglevel=error)
fi

# Separately: @prisma/client's own generated entry file immediately
# does require('.prisma/client/default'), which throws on any machine
# where nothing has ever run a real generate before -- a chicken-and-
# egg bug in this exact "separate app, first-ever generate" scenario
# (confirmed directly: requiring @prisma/client threw "Cannot find
# module '.prisma/client/default'" before this fix). Seed a throwaway
# placeholder in both locations so that require succeeds; the real
# `prisma generate` below overwrites both with the actual generated
# client immediately after (this app's own copy via the `adminClient`
# generator in prisma/schema.prisma; the root copy is never used for
# anything real, it only exists to pass the baseDir check above).
for dir in .. .; do
  mkdir -p "$dir/node_modules/.prisma/client"
  if [ ! -f "$dir/node_modules/.prisma/client/default.js" ]; then
    printf 'module.exports = {};\n' > "$dir/node_modules/.prisma/client/default.js"
  fi
done

prisma generate
