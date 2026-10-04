import Link from 'next/link';

export default function StatTile({
  label,
  value,
  sub,
  tone = 'default',
  href,
  detail,
}: {
  label: string;
  value: string | number;
  sub?: string;
  tone?: 'default' | 'success' | 'warning' | 'critical';
  href?: string;
  /** Shown as a native title-attribute tooltip on hover, and as an
   * `aria-label` fallback for anyone who can't hover (keyboard/touch) --
   * use it for the one thing a bare number doesn't say on its own: how
   * it's computed, what the scale means, or what counts as healthy. Skip
   * it when `sub` already says that. */
  detail?: string;
}) {
  const toneClass =
    tone === 'success' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'critical' ? 'text-critical' : 'text-ink';
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-inkFaint">
        {label}
        {detail && <span aria-hidden className="ml-1 text-inkFaint/70">ⓘ</span>}
      </p>
      <p className={`mt-1.5 text-2xl font-bold tabular-nums ${toneClass}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-inkSoft">{sub}</p>}
    </>
  );
  const className = 'rounded-card border border-border bg-surface p-4' + (href ? ' block hover:border-brand/40' : '');
  const titleProps = detail ? { title: detail, 'aria-label': `${label}: ${value}. ${detail}` } : {};
  return href ? (
    <Link href={href} className={className} {...titleProps}>
      {body}
    </Link>
  ) : (
    <div className={className} {...titleProps}>
      {body}
    </div>
  );
}
