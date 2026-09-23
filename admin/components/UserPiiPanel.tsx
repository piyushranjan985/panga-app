'use client';

import { useState } from 'react';

interface Revealed {
  email: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  preciseLocation: { latitude: number; longitude: number; updatedAt: string | null } | null;
}

// Masked by default (the page never even fetches the real values on
// load). Clicking "Show" calls the PII endpoint, which permission-checks
// and audit-logs the access server-side -- this component just renders
// whatever it gets back.
export default function UserPiiPanel({
  userId,
  canViewPii,
  hasEmail,
  hasPhone,
}: {
  userId: string;
  canViewPii: boolean;
  hasEmail: boolean;
  hasPhone: boolean;
}) {
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reveal() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/users/${userId}/pii`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Could not load.');
        return;
      }
      setRevealed(data);
    } finally {
      setLoading(false);
    }
  }

  if (!hasEmail && !hasPhone) return null;

  return (
    <div className="mb-2 rounded-lg border border-border bg-canvas p-3">
      {revealed ? (
        <div className="space-y-1 text-sm">
          {revealed.email && <p>Email: {revealed.email}</p>}
          {revealed.phone && <p>Phone: {revealed.phone}</p>}
          {revealed.dateOfBirth && <p>Date of birth: {revealed.dateOfBirth}</p>}
          {revealed.preciseLocation && (
            <p>
              Precise location: {revealed.preciseLocation.latitude.toFixed(4)}, {revealed.preciseLocation.longitude.toFixed(4)}
            </p>
          )}
          <p className="text-xs text-inkFaint">This access was recorded in the audit log.</p>
        </div>
      ) : (
        <div className="flex items-center justify-between">
          <p className="text-sm text-inkFaint">Email/phone hidden by default.</p>
          {canViewPii ? (
            <button onClick={reveal} disabled={loading} className="rounded-lg border border-border bg-surface px-3 py-1 text-xs font-semibold">
              {loading ? 'Loading…' : 'Show'}
            </button>
          ) : (
            <span className="text-xs text-inkFaint">No permission</span>
          )}
        </div>
      )}
      {error && <p className="mt-1 text-xs text-critical">{error}</p>}
    </div>
  );
}
