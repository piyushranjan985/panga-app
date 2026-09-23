const TONE_CLASSES: Record<string, string> = {
  default: 'bg-canvas text-inkSoft',
  success: 'bg-successSoft text-success',
  warning: 'bg-warningSoft text-warning',
  critical: 'bg-criticalSoft text-critical',
  info: 'bg-infoSoft text-info',
  brand: 'bg-brand/10 text-brand',
};

export default function Badge({
  children,
  tone = 'default',
}: {
  children: React.ReactNode;
  tone?: keyof typeof TONE_CLASSES;
}) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}>
      {children}
    </span>
  );
}
