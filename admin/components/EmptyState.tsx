export default function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="rounded-card border border-dashed border-border p-10 text-center">
      <p className="text-sm font-semibold text-inkSoft">{title}</p>
      {description && <p className="mt-1 text-sm text-inkFaint">{description}</p>}
    </div>
  );
}
