const LABELS: Record<string, string> = {
  JUST_VIBING: 'Just Vibing',
  SOMETHING_REAL: 'Something Real',
  RISHTA_READY: 'Rishta Ready',
};

const STYLES: Record<string, string> = {
  JUST_VIBING: 'bg-amber-100 text-amber-700',
  SOMETHING_REAL: 'bg-mint/15 text-mint',
  RISHTA_READY: 'bg-magenta/10 text-magenta',
};

export default function IntentBadge({ intent, className = '' }: { intent: string; className?: string }) {
  const style = STYLES[intent] ?? STYLES.SOMETHING_REAL;
  const label = LABELS[intent] ?? intent;
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${style} ${className}`}>
      {label}
    </span>
  );
}
