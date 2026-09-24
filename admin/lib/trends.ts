import { db } from '@/lib/db';

export type Granularity = 'day' | 'week' | 'month' | 'year';

export interface TrendPoint {
  period: string; // ISO date (bucket start)
  count: number;
}

// How many buckets to show per granularity -- enough to see a real shape
// (a year of days would be unreadable; a year of years would be silly).
const PERIODS_FOR: Record<Granularity, number> = {
  day: 30,
  week: 12,
  month: 12,
  year: 5,
};

// date_trunc()'s unit name and the matching interval literal for
// generate_series -- both are validated against this fixed map (never
// interpolated from request input) before touching raw SQL.
const SQL_UNIT: Record<Granularity, { trunc: string; interval: string }> = {
  day: { trunc: 'day', interval: '1 day' },
  week: { trunc: 'week', interval: '1 week' },
  month: { trunc: 'month', interval: '1 month' },
  year: { trunc: 'year', interval: '1 year' },
};

export function periodsFor(granularity: Granularity): number {
  return PERIODS_FOR[granularity];
}

// One generic time-bucketed COUNT, built via generate_series + LEFT JOIN so
// empty buckets show up as 0 rather than being silently skipped (the whole
// point of a trend chart is that gaps are informative). `table` and
// `dateColumn`/`distinctColumn` are never taken from request input -- see
// the fixed METRICS map below, which is the only caller.
async function bucketedCount(
  table: string,
  dateColumn: string,
  granularity: Granularity,
  distinctColumn?: string,
): Promise<TrendPoint[]> {
  const { trunc, interval } = SQL_UNIT[granularity];
  const periods = PERIODS_FOR[granularity];
  const countExpr = distinctColumn ? `COUNT(DISTINCT t."${distinctColumn}")` : `COUNT(t."id")`;

  const rows = await db.$queryRawUnsafe<{ period: Date; count: bigint }[]>(
    `
    SELECT gs AS period, ${countExpr}::bigint AS count
    FROM generate_series(
      date_trunc('${trunc}', now()) - $1::int * interval '${interval}',
      date_trunc('${trunc}', now()),
      interval '${interval}'
    ) AS gs
    LEFT JOIN "${table}" t
      ON date_trunc('${trunc}', t."${dateColumn}") = gs
    GROUP BY gs
    ORDER BY gs;
    `,
    periods - 1,
  );

  return rows.map((r) => ({ period: r.period.toISOString(), count: Number(r.count) }));
}

// The fixed allowlist of what a trend chart can show -- the API route's
// `metric` query param is validated against these keys (a zod enum), never
// used to build SQL directly.
export const TRENDABLE_METRICS = {
  signups: { label: 'New signups', table: 'User', dateColumn: 'createdAt' },
  matches: { label: 'Matches created', table: 'Match', dateColumn: 'createdAt' },
  messages: { label: 'Messages sent', table: 'Message', dateColumn: 'createdAt' },
  activeUsers: {
    label: 'Active users (logged in)',
    table: 'LoginEvent',
    dateColumn: 'createdAt',
    distinctColumn: 'userId',
  },
} as const;

export type TrendMetricKey = keyof typeof TRENDABLE_METRICS;

export async function getTrend(metric: TrendMetricKey, granularity: Granularity): Promise<TrendPoint[]> {
  const def = TRENDABLE_METRICS[metric];
  return bucketedCount(def.table, def.dateColumn, granularity, 'distinctColumn' in def ? def.distinctColumn : undefined);
}

export async function getAllTrends(granularity: Granularity): Promise<Record<TrendMetricKey, TrendPoint[]>> {
  const keys = Object.keys(TRENDABLE_METRICS) as TrendMetricKey[];
  const results = await Promise.all(keys.map((k) => getTrend(k, granularity)));
  return Object.fromEntries(keys.map((k, i) => [k, results[i]])) as Record<TrendMetricKey, TrendPoint[]>;
}
