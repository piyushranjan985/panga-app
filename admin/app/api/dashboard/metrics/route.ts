import { NextResponse } from 'next/server';
import { requirePermission } from '@/lib/apiGuard';
import { getDashboardMetrics, rangeFromPreset } from '@/lib/dashboardMetrics';

export async function GET(req: Request) {
  const guard = await requirePermission('dashboard.view');
  if ('error' in guard) return guard.error;

  const { searchParams } = new URL(req.url);
  const preset = searchParams.get('range') || '7d';
  const fromParam = searchParams.get('from');
  const toParam = searchParams.get('to');

  const range =
    preset === 'custom' && fromParam && toParam
      ? { from: new Date(fromParam), to: new Date(toParam) }
      : rangeFromPreset(preset);

  const metrics = await getDashboardMetrics(range);
  return NextResponse.json(metrics);
}
