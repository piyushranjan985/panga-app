// Shared CSV-building helpers for every /api/*/export route in this
// portal, so each export endpoint doesn't hand-roll its own quoting and
// every CSV this admin produces escapes commas/quotes/newlines the same
// way. Callers still do their own permission check + writeAudit() call
// (see app/api/users/export/route.ts for the house pattern) -- this file
// only covers the CSV formatting + response plumbing, not auth/logging.
import { NextResponse } from 'next/server';

function escapeCsvValue(value: unknown): string {
  const str = value === null || value === undefined ? '' : String(value);
  return `"${str.replace(/"/g, '""')}"`;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCsvValue).join(',')];
  for (const row of rows) {
    lines.push(row.map(escapeCsvValue).join(','));
  }
  return lines.join('\n');
}

export function csvResponse(csv: string, filenameStem: string): NextResponse {
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'content-type': 'text/csv',
      'content-disposition': `attachment; filename="findmyvybe-${filenameStem}-${date}.csv"`,
    },
  });
}
