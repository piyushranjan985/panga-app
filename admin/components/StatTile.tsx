import Link from 'next/link';

export default function StatTile({
  label,
  value,
  sub,
  tone = 'default',
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'success' | 'warning' | 'critical';
  href?: string;
}) {
  const toneClass =
    tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'critical' ? 'text-critical' : 'text-ink';
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-inkFaint">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-inkSoft">{sub}</p>}
    </>
  );
  const className = 'rounded-card border border-border bg-surface p-4' + (href ? ' block hover:border-brand/40' : '');
  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
