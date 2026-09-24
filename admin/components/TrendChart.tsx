'use client';

import { useMemo, useState } from 'react';
import type { Granularity } from '@/lib/trends';

interface Point {
  period: string;
  count: number;
}

const VIEW_W = 600;
const VIEW_H = 160;
const PAD_L = 8;
const PAD_R = 8;
const PAD_T = 12;
const PAD_B = 28;

function formatPeriodLabel(iso: string, granularity: Granularity): string {
  const d = new Date(iso);
  if (granularity === 'day') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (granularity === 'week') return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (granularity === 'month') return d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  return d.toLocaleDateString(undefined, { year: 'numeric' });
}

// Dependency-free inline SVG line chart -- thin 2px line, rounded data-end,
// recessive gridlines, hover crosshair + tooltip. Single series per chart
// (each metric gets its own card), so no categorical palette is needed --
// just the app's own brand color, which already passes contrast on both
// surfaces since it's used for text/buttons elsewhere in this app.
export default function TrendChart({
  label,
  points,
  granularity,
}: {
  label: string;
  points: Point[];
  granularity: Granularity;
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  const { path, dots, yTicks, xLabelIdxs, latest, changePct } = useMemo(() => {
    const counts = points.map((p) => p.count);
    const max = Math.max(1, ...counts);
    const innerW = VIEW_W - PAD_L - PAD_R;
    const innerH = VIEW_H - PAD_T - PAD_B;
    const stepX = points.length > 1 ? innerW / (points.length - 1) : 0;

    const coords = points.map((p, i) => {
      const x = PAD_L + i * stepX;
      const y = PAD_T + innerH - (p.count / max) * innerH;
      return { x, y, p };
    });

    const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');

    // 3 horizontal gridlines at 0%, 50%, 100% of max.
    const yTicks = [0, 0.5, 1].map((frac) => ({
      y: PAD_T + innerH - frac * innerH,
      value: Math.round(frac * max),
    }));

    // Label first, middle, last x-axis point only -- avoids crowding.
    const xLabelIdxs =
      points.length <= 1
        ? [0]
        : Array.from(new Set([0, Math.floor((points.length - 1) / 2), points.length - 1]));

    const latest = points.length ? (points[points.length - 1]?.count ?? 0) : 0;
    const first = points.length ? (points[0]?.count ?? 0) : 0;
    const changePct = first > 0 ? ((latest - first) / first) * 100 : latest > 0 ? 100 : 0;

    return { path, dots: coords, yTicks, xLabelIdxs, latest, changePct };
  }, [points]);

  const hovered = hoverIdx !== null ? dots[hoverIdx] : null;

  function handleMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * VIEW_W;
    let nearest = 0;
    let best = Infinity;
    dots.forEach((d, i) => {
      const dist = Math.abs(d.x - relX);
      if (dist < best) {
        best = dist;
        nearest = i;
      }
    });
    setHoverIdx(nearest);
  }

  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-inkFaint">{label}</p>
        {points.length > 0 && (
          <span className={`text-xs font-semibold tabular-nums ${changePct >= 0 ? 'text-success' : 'text-critical'}`}>
            {changePct >= 0 ? '+' : ''}
            {changePct.toFixed(0)}%
          </span>
        )}
      </div>
      <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink">{latest.toLocaleString()}</p>

      <div className="relative mt-2">
        <svg
          viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
          className="h-36 w-full"
          onMouseMove={handleMove}
          onMouseLeave={() => setHoverIdx(null)}
          role="img"
          aria-label={`${label} trend, ${points.length} ${granularity} buckets, latest value ${latest}`}
        >
          {/* Recessive gridlines with their value */}
          {yTicks.map((t, i) => (
            <g key={i}>
              <line
                x1={PAD_L}
                x2={VIEW_W - PAD_R}
                y1={t.y}
                y2={t.y}
                className="stroke-border"
                strokeWidth={1}
              />
              <text x={0} y={t.y - 2} className="fill-inkFaint text-[9px]">
                {t.value.toLocaleString()}
              </text>
            </g>
          ))}

          {/* The line itself -- thin, rounded ends */}
          <path d={path} fill="none" className="stroke-brand" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

          {/* Crosshair + hovered point */}
          {hovered && (
            <>
              <line
                x1={hovered.x}
                x2={hovered.x}
                y1={PAD_T}
                y2={VIEW_H - PAD_B}
                className="stroke-inkFaint"
                strokeWidth={1}
                strokeDasharray="2,2"
              />
              <circle cx={hovered.x} cy={hovered.y} r={4} className="fill-brand" />
            </>
          )}

          {/* X-axis labels */}
          {xLabelIdxs.map((i) => (
            <text
              key={i}
              x={dots[i]?.x ?? 0}
              y={VIEW_H - 8}
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
              className="fill-inkFaint text-[9px]"
            >
              {points[i] ? formatPeriodLabel(points[i].period, granularity) : ''}
            </text>
          ))}
        </svg>

        {hovered && (
          <div
            className="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded-md border border-border bg-surfaceRaised px-2 py-1 text-xs shadow-sm"
            style={{
              left: `${(hovered.x / VIEW_W) * 100}%`,
              top: `${(hovered.y / VIEW_H) * 100}%`,
            }}
          >
            <p className="font-semibold tabular-nums text-ink">{hovered.p.count.toLocaleString()}</p>
            <p className="text-inkFaint">{formatPeriodLabel(hovered.p.period, granularity)}</p>
          </div>
        )}
      </div>
    </div>
  );
}
