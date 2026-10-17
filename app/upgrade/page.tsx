'use client';

import { useEffect, useState } from 'react';
import Navbar from '@/components/Navbar';
import InactivityLogout from '@/components/InactivityLogout';
import { safeJson } from '@/lib/clientJson';
import { formatInr } from '@/lib/payments/money';
import { FEATURE_LABELS, type FeatureKey } from '@/lib/payments/types';

interface Plan {
  id: string;
  intent: string | null;
  kind: 'SUBSCRIPTION' | 'CREDIT_PACK';
  name: string;
  slug: string;
  description: string;
  priceInPaise: number;
  currency: string;
  billingInterval: string | null;
  creditAmount: number | null;
  features: Partial<Record<FeatureKey, boolean>>;
}

interface Entitlements {
  freeTier: boolean;
  activePlanSlug: string | null;
  features: Record<FeatureKey, boolean>;
  creditBalance: number;
}

interface CheckoutState {
  transactionId: string;
  totalInPaise: number;
  status: string;
}

type ResultKind = 'success' | 'failure' | 'pending' | null;

// A mock-mode checkout screen -- the "Simulate payment outcome" buttons
// below only have any effect while PAYMENT_MODE=mock (see
// app/api/payments/checkout/[transactionId]/confirm/route.ts); they're
// silently ignored otherwise, so this page can never be used to fabricate
// a live entitlement. Labelled plainly as test-mode so nobody mistakes it
// for a real payment screen.
export default function UpgradePage() {
  const [plansData, setPlansData] = useState<{ checkoutReachable: boolean; plans: Plan[] } | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [activeCheckout, setActiveCheckout] = useState<{ plan: Plan; checkout: CheckoutState } | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [busyPlanId, setBusyPlanId] = useState<string | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [result, setResult] = useState<{ kind: ResultKind; planName: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  function loadEntitlements() {
    fetch('/api/payments/subscription')
      .then((r) => safeJson<Entitlements>(r))
      .then(setEntitlements);
  }

  useEffect(() => {
    fetch('/api/payments/plans')
      .then((r) => safeJson<{ checkoutReachable: boolean; plans: Plan[] }>(r))
      .then(setPlansData);
    loadEntitlements();
  }, []);

  async function choosePlan(plan: Plan) {
    setError(null);
    setBusyPlanId(plan.id);
    try {
      const res = await fetch('/api/payments/checkout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planId: plan.id, promoCode: promoCode.trim() || undefined }),
      });
      const data = await safeJson<CheckoutState & { error?: string }>(res);
      if (!res.ok) {
        setError(data.error || 'Could not start checkout.');
        return;
      }
      setActiveCheckout({ plan, checkout: data });
      setResult(null);
    } finally {
      setBusyPlanId(null);
    }
  }

  async function simulate(outcome: 'success' | 'failure' | 'pending') {
    if (!activeCheckout) return;
    setConfirmBusy(true);
    try {
      const res = await fetch(`/api/payments/checkout/${activeCheckout.checkout.transactionId}/confirm`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ simulate: outcome }),
      });
      const data = await safeJson<{ status: string }>(res);
      if (data.status === 'SUCCEEDED') {
        setResult({ kind: 'success', planName: activeCheckout.plan.name });
        await loadEntitlements();
        setActiveCheckout(null);
      } else if (data.status === 'FAILED') {
        setResult({ kind: 'failure', planName: activeCheckout.plan.name });
        setActiveCheckout(null);
      } else {
        setResult({ kind: 'pending', planName: activeCheckout.plan.name });
      }
    } finally {
      setConfirmBusy(false);
    }
  }

  const subscriptionPlans = plansData?.plans.filter((p) => p.kind === 'SUBSCRIPTION') ?? [];
  const creditPacks = plansData?.plans.filter((p) => p.kind === 'CREDIT_PACK') ?? [];

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <Navbar />
      <InactivityLogout />
      <main className="mx-auto max-w-3xl px-4 py-6">
        <h1 className="mb-1 font-display text-2xl font-extrabold">Vybe Plus & Boosts</h1>
        <p className="mb-6 text-sm text-inkSoft">
          Safety features -- verification, reporting, blocking -- are free for everyone, always. These are optional
          extras.
        </p>

        {entitlements && !entitlements.freeTier && (
          <div className="mb-6 rounded-2xl border border-line bg-white p-4 text-sm">
            <p className="font-semibold">
              {entitlements.activePlanSlug ? `You're on ${entitlements.activePlanSlug.replace(/-/g, ' ')}.` : "You're on the free plan."}
            </p>
            <p className="mt-1 text-inkSoft">Credits available: {entitlements.creditBalance}</p>
          </div>
        )}

        {result?.kind === 'success' && (
          <div className="mb-6 rounded-2xl border border-mint/40 bg-mint/10 p-4 text-sm font-semibold text-mint">
            Payment succeeded (mock) -- {result.planName} is now active.
          </div>
        )}
        {result?.kind === 'failure' && (
          <div className="mb-6 rounded-2xl border border-line bg-white p-4 text-sm font-semibold text-critical">
            Payment failed (mock) -- {result.planName} was not activated. No charge was made.
          </div>
        )}
        {error && <p className="mb-4 text-sm font-semibold text-critical">{error}</p>}

        {plansData === null ? (
          <p className="text-sm text-inkSoft">Loading…</p>
        ) : !plansData.checkoutReachable ? (
          <div className="rounded-2xl border border-dashed border-line p-6 text-center">
            <p className="font-semibold">Everything&apos;s free right now.</p>
            <p className="mt-1 text-sm text-inkSoft">
              Paid plans aren&apos;t available yet -- we&apos;ll tell you clearly before anything is ever charged.
            </p>
          </div>
        ) : (
          <>
            {subscriptionPlans.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 font-display text-lg font-bold">Plans</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {subscriptionPlans.map((plan) => (
                    <div key={plan.id} className="flex flex-col rounded-2xl border border-line bg-white p-4">
                      <p className="font-display text-base font-bold">{plan.name}</p>
                      <p className="mt-1 text-sm text-inkSoft">{plan.description}</p>
                      <p className="mt-2 text-xl font-extrabold">
                        {formatInr(plan.priceInPaise)}
                        <span className="text-xs font-semibold text-inkFaint"> / {plan.billingInterval?.toLowerCase()}</span>
                      </p>
                      <ul className="mt-2 flex-1 space-y-1 text-xs text-inkSoft">
                        {Object.entries(plan.features)
                          .filter(([, on]) => on)
                          .map(([key]) => (
                            <li key={key}>✓ {FEATURE_LABELS[key as FeatureKey] ?? key}</li>
                          ))}
                      </ul>
                      <button
                        type="button"
                        disabled={busyPlanId === plan.id}
                        onClick={() => choosePlan(plan)}
                        className="mt-3 rounded-full bg-magenta px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {busyPlanId === plan.id ? 'Starting…' : plan.slug === entitlements?.activePlanSlug ? 'Current plan -- renew' : 'Choose plan'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {creditPacks.length > 0 && (
              <section className="mb-8">
                <h2 className="mb-3 font-display text-lg font-bold">Boost packs</h2>
                <div className="grid gap-3 sm:grid-cols-2">
                  {creditPacks.map((plan) => (
                    <div key={plan.id} className="flex flex-col rounded-2xl border border-line bg-white p-4">
                      <p className="font-display text-base font-bold">{plan.name}</p>
                      <p className="mt-1 text-sm text-inkSoft">{plan.description}</p>
                      <p className="mt-2 text-xl font-extrabold">{formatInr(plan.priceInPaise)}</p>
                      <p className="text-xs text-inkFaint">{plan.creditAmount} credits</p>
                      <button
                        type="button"
                        disabled={busyPlanId === plan.id}
                        onClick={() => choosePlan(plan)}
                        className="mt-3 rounded-full border border-magenta px-4 py-2 text-sm font-bold text-magenta disabled:opacity-50"
                      >
                        {busyPlanId === plan.id ? 'Starting…' : 'Buy'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <label className="mb-6 block text-xs font-semibold text-inkSoft">
              Promo code (optional)
              <input
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value)}
                placeholder="e.g. WELCOME10"
                className="mt-1 w-full max-w-xs rounded-full border border-line px-3 py-1.5 text-sm outline-none focus:border-magenta"
              />
            </label>
          </>
        )}
      </main>

      {activeCheckout && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-sm rounded-2xl border border-line bg-white p-6">
            <p className="font-display text-lg font-bold">{activeCheckout.plan.name}</p>
            <p className="mt-1 text-sm text-inkSoft">
              Total: <span className="font-bold text-ink">{formatInr(activeCheckout.checkout.totalInPaise)}</span> (incl. GST)
            </p>
            <p className="mt-4 rounded-xl bg-canvas p-3 text-xs font-semibold text-inkSoft">
              Test mode -- no real gateway is called. Pick an outcome to simulate:
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => simulate('success')}
                className="rounded-full bg-magenta px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {confirmBusy ? 'Processing…' : 'Simulate payment success'}
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => simulate('failure')}
                className="rounded-full border border-line px-4 py-2 text-sm font-semibold text-inkSoft disabled:opacity-50"
              >
                Simulate payment failure
              </button>
              <button
                type="button"
                disabled={confirmBusy}
                onClick={() => setActiveCheckout(null)}
                className="mt-1 text-xs font-semibold text-inkFaint"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
