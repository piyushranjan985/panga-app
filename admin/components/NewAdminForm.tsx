'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'OPERATIONS', 'TRUST_AND_SAFETY', 'MODERATOR',
  'CUSTOMER_SUPPORT', 'PRIVACY_OFFICER', 'COMPLIANCE_OFFICER', 'FINANCE',
  'ANALYTICS', 'READ_ONLY',
];

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm outline-none focus:border-brand';

// Creating an admin account is step-up gated (adminUsers.manage is in
// lib/rbac.ts's STEP_UP_REQUIRED) -- same dance as NewIncidentForm.tsx /
// NewLegalHoldForm.tsx. No email delivery exists here, so the temporary
// password set below has to be handed to the new admin directly.
export default function NewAdminForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('READ_ONLY');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [needsStepUp, setNeedsStepUp] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setError(null);
    setLoading(true);
    try {
      if (needsStepUp) {
        const stepRes = await fetch('/api/auth/step-up', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password, code }),
        });
        if (!stepRes.ok) {
          const data = await stepRes.json().catch(() => ({}));
          setError(data.error || 'Re-verification failed.');
          return;
        }
      }

      const res = await fetch('/api/admin-users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, name, role, temporaryPassword }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.stepUpRequired) {
          setNeedsStepUp(true);
          setError('Enter your password and current code to create this admin.');
          return;
        }
        setError(data.error || 'Something went wrong.');
        return;
      }
      setSuccess(`Created ${email}. Share this temporary password with them directly -- it won't be shown again: ${temporaryPassword}`);
      setEmail('');
      setName('');
      setTemporaryPassword('');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
        Add admin
      </button>
    );
  }

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <p className="font-bold">Add an admin account</p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="text-xs font-semibold text-inkSoft">Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft">Name<input value={name} onChange={(e) => setName(e.target.value)} className={`mt-1 ${input}`} /></label>
        <label className="text-xs font-semibold text-inkSoft">Role
          <select value={role} onChange={(e) => setRole(e.target.value)} className={`mt-1 ${input}`}>
            {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
          </select>
        </label>
        <label className="text-xs font-semibold text-inkSoft">Temporary password (12+ characters)<input type="text" value={temporaryPassword} onChange={(e) => setTemporaryPassword(e.target.value)} className={`mt-1 ${input}`} /></label>
      </div>

      {needsStepUp && (
        <div className="mt-4 space-y-2 rounded-lg border border-border bg-canvas p-3">
          <p className="text-xs font-semibold text-inkSoft">Re-verify your identity to continue</p>
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} className={input} />
          <input type="text" inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className={input} />
        </div>
      )}

      {error && <p className="mt-3 text-sm text-critical">{error}</p>}
      {success && <p className="mt-3 rounded-lg bg-successSoft p-3 text-sm text-success">{success}</p>}

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-border px-3 py-1.5 text-sm font-semibold text-inkSoft">Close</button>
        <button
          type="button"
          disabled={loading || !email.trim() || !name.trim() || temporaryPassword.length < 12}
          onClick={submit}
          className="rounded-lg bg-brand px-4 py-1.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {loading ? 'Creating…' : 'Create admin'}
        </button>
      </div>
    </div>
  );
}
