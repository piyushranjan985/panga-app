'use client';

import { useCallback, useEffect, useState } from 'react';
import TrendChart from '@/components/TrendChart';
import type { Granularity, TrendMetricKey } from '@/lib/trends';

const GRANULARITY_OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'day', label: 'Day by day' },
  { value: 'week', label: 'Week by week' },
  { value: 'month', label: 'Month by month' },
  { value: 'year', label: 'Year by year' },
];

const METRIC_LABELS: Record<TrendMetricKey, string> = {
  signups: 'New signups',
  matches: 'Matches created',
  messages: 'Messages sent',
  activeUsers: 'Active users (logged in)',
};

type TrendsResponse = {
  granularity: Granularity;
  trends: Record<TrendMetricKey, { period: string; count: number }[]>;
};

export default function TrendsClient() {
  const [granularity, setGranularity] = useState<Granularity>('day');
  const [data, setData] = useState<TrendsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (g: Granularity) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/analytics/trends?granularity=${g}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error || 'Could not load trends.');
        return;
      }
      setData(await res.json());
    } catch {
      setError('Could not reach the server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load(granularity);
  }, [granularity, load]);

  return (
    <div className="space-y-6">
      <div className="flex gap-1 rounded-lg border border-border bg-surface p-1">
        {GRANULARITY_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setGranularity(opt.value)}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
              granularity === opt.value ? 'bg-brand text-white' : 'text-inkSoft hover:bg-canvas'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-critical">{error}</p>}

      {loading && !data ? (
        <p className="text-sm text-inkSoft">Loading…</p>
      ) : data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {(Object.keys(METRIC_LABELS) as TrendMetricKey[]).map((key) => (
            <TrendChart
              key={key}
              label={METRIC_LABELS[key]}
              points={data.trends[key] ?? []}
              granularity={data.granularity}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
