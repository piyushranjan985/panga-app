'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ALL_FEATURE_KEYS, FEATURE_LABELS } from '@/lib/payments/types';

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';

// Always creates a NEW PaymentPlan row (a new version) -- never a PATCH
// to an existing one. See prisma/schema.prisma's PaymentPlan comment and
// admin/lib/payments/plans.ts's createPlanVersion().
export default function CreatePlanVersionForm({ existingSlug }: { existingSlug?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState(existingSlug ?? '');
  const [intent, setIntent] = useState<'ALL' | 'JUST_VIBING' | 'SOMETHING_REAL' | 'RISHTA_READY'>('ALL');
  const [kind, setKind] = useState<'SUBSCRIPTION' | 'CREDIT_PACK'>('SUBSCRIPTION');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [priceRupees, setPriceRupees] = useState('');
  const [billingInterval, setBillingInterval] = useState<'MONTHLY' | 'QUARTERLY' | 'ANNUAL'>('MONTHLY');
  const [creditAmount, setCreditAmount] = useState('');
  const [features, setFeatures] = useState<Record<string, boolean>>({});
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/payments/plans', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug,
          intent: intent === 'ALL' ? null : intent,
          kind,
          name,
          description,
          priceInPaise: Math.round(Number(priceRupees) * 100),
          billingInterval: kind === 'SUBSCRIPTION' ? billingInterval : null,
          creditAmount: kind === 'CREDIT_PACK' ? Number(creditAmount) : null,
          features,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Something went wrong.');
        return;
      }
      setOpen(false);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white">
        {existingSlug ? 'Create new version' : 'Create plan'}
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-card border border-border bg-canvas p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-inkSoft">
          Slug (stable across versions)
          <input value={slug} onChange={(e) => setSlug(e.target.value)} disabled={Boolean(existingSlug)} className={`mt-1 ${input} disabled:opacity-60`} placeholder="serious-plus" />
        </label>
        <label className="text-xs font-semibold text-inkSoft">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${input}`} placeholder="Serious Plus" />
        </label>
        <label className="text-xs font-semibold text-inkSoft">
          Intent
          <select value={intent} onChange={(e) => setIntent(e.target.value as typeof intent)} className={`mt-1 ${input}`}>
            <option value="ALL">All intents</option>
            <option value="JUST_VIBING">Just Vibing (Dating)</option>
            <option value="SOMETHING_REAL">Something Real</option>
            <option value="RISHTA_READY">Rishta Ready (Matchmaking)</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-inkSoft">
          Kind
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} className={`mt-1 ${input}`}>
            <option value="SUBSCRIPTION">Subscription</option>
            <option value="CREDIT_PACK">Credit pack</option>
          </select>
        </label>
        <label className="text-xs font-semibold text-inkSoft sm:col-span-2">
          Description
          <input value={description} onChange={(e) => setDescription(e.target.value)} className={`mt-1 ${input}`} />
        </label>
        <label className="text-xs font-semibold text-inkSoft">
          Price (INR)
          <input type="number" min={0} step="0.01" value={priceRupees} onChange={(e) => setPriceRupees(e.target.value)} className={`mt-1 ${input}`} />
        </label>
        {kind === 'SUBSCRIPTION' ? (
          <label className="text-xs font-semibold text-inkSoft">
            Billing interval
            <select value={billingInterval} onChange={(e) => setBillingInterval(e.target.value as typeof billingInterval)} className={`mt-1 ${input}`}>
              <option value="MONTHLY">Monthly</option>
              <option value="QUARTERLY">Quarterly</option>
              <option value="ANNUAL">Annual</option>
            </select>
          </label>
        ) : (
          <label className="text-xs font-semibold text-inkSoft">
            Credits granted
            <input type="number" min={1} value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} className={`mt-1 ${input}`} />
          </label>
        )}
      </div>

      {kind === 'SUBSCRIPTION' && (
        <div className="mt-3">
          <p className="text-xs font-semibold text-inkSoft">Features this plan grants</p>
          <div className="mt-1 grid gap-1.5 sm:grid-cols-2">
            {ALL_FEATURE_KEYS.map((key) => (
              <label key={key} className="flex items-center gap-2 text-xs text-inkSoft">
                <input
                  type="checkbox"
                  checked={Boolean(features[key])}
                  onChange={(e) => setFeatures((f) => ({ ...f, [key]: e.target.checked }))}
                />
                {FEATURE_LABELS[key]}
              </label>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-3 text-sm text-critical">{error}</p>}
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-inkSoft">
          Cancel
        </button>
        <button
          type="button"
          disabled={loading || !slug.trim() || !name.trim() || !priceRupees}
          onClick={submit}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"
        >
          {loading ? 'Saving…' : 'Save new version'}
        </button>
      </div>
    </div>
  );
}
