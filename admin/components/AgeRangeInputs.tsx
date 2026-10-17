// Two number inputs for an admin list page's filter form, submitted as
// ageMin/ageMax query params -- see admin/lib/ageFilter.ts for how each
// page turns them into an actual query filter. Factored out since the
// same pair of inputs now appears on every list page that got this
// filter (Users, Moderation, Reports, Support, and the three Privacy
// pages).
export default function AgeRangeInputs({ defaultMin, defaultMax }: { defaultMin?: string; defaultMax?: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-inkSoft">
      <span className="text-xs">Age</span>
      <input
        type="number"
        name="ageMin"
        min={18}
        max={99}
        defaultValue={defaultMin}
        placeholder="18"
        aria-label="Minimum age"
        className="w-12 rounded-md border border-border bg-canvas px-1.5 py-1 text-sm outline-none focus:border-brand"
      />
      <span>–</span>
      <input
        type="number"
        name="ageMax"
        min={18}
        max={99}
        defaultValue={defaultMax}
        placeholder="99"
        aria-label="Maximum age"
        className="w-12 rounded-md border border-border bg-canvas px-1.5 py-1 text-sm outline-none focus:border-brand"
      />
    </div>
  );
}
