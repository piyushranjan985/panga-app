'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

const ROLES = [
  'SUPER_ADMIN', 'ADMIN', 'OPERATIONS', 'TRUST_AND_SAFETY', 'MODERATOR',
  'CUSTOMER_SUPPORT', 'PRIVACY_OFFICER', 'COMPLIANCE_OFFICER', 'FINANCE',
  'ANALYTICS', 'READ_ONLY',
];

const input = 'w-full rounded-lg border border-border bg-surface px-3 py-2 text-xs outline-none focus:border-brand';

// One shared step-up flow for every mutation on this row (role change,
// (de)activate, reset MFA, reset password) -- adminUsers.manage is
// step-up gated (lib/rbac.ts), same dance as elsewhere in the portal.
// The server independently refuses a self-edit (see
// app/api/admin-users/[adminId]/route.ts), so this component doesn't
// need to special-case "is this me" beyond just not rendering for the
// signed-in admin's own row (handled by the caller).
export default function AdminUserActions({ adminId, role, isActive }: { adminId: string; role: string; isActive: boolean }) {
  const router = useRouter();
  const [selectedRole, setSelectedRole] = useState(role);
  const [showPasswordField, setShowPasswordField] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [needsStepUp, setNeedsStepUp] = useState(false);
  const [stepUpPassword, setStepUpPassword] = useState('');
  const [code, setCode] = useState('');
  const [pendingBody, setPendingBody] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run(body: Record<string, unknown>) {
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      if (needsStepUp) {
        const stepRes = await fetch('/api/auth/step-up', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ password: stepUpPassword, code }),
        });
        if (!stepRes.ok) {
          const data = await stepRes.json().catch(() => ({}));
          setError(data.error || 'Re-verification failed.');
          return;
        }
      }

      const res = await fetch(`/api/admin-users/${adminId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.stepUpRequired) {
          setNeedsStepUp(true);
          setPendingBody(body);
          setError('Enter your password and current code to confirm.');
          return;
        }
        setError(data.error || 'Something went wrong.');
        return;
      }
      setNeedsStepUp(false);
      setPendingBody(null);
      setShowPasswordField(false);
      setNewPassword('');
      setNotice('Done.');
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)} className={`${input} w-auto`}>
          {ROLES.map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
        </select>
        <button type="button" disabled={loading || selectedRole === role} onClick={() => run({ role: selectedRole })} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-inkSoft hover:bg-canvas disabled:opacity-50">
          Set role
        </button>
        <button type="button" disabled={loading} onClick={() => run({ isActive: !isActive })} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-inkSoft hover:bg-canvas disabled:opacity-50">
          {isActive ? 'Deactivate' : 'Reactivate'}
        </button>
        <button type="button" disabled={loading} onClick={() => run({ resetMfa: true })} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-inkSoft hover:bg-canvas disabled:opacity-50">
          Reset MFA
        </button>
        <button type="button" onClick={() => setShowPasswordField((v) => !v)} className="rounded-lg border border-border px-2 py-1 text-xs font-semibold text-inkSoft hover:bg-canvas">
          Reset password
        </button>
      </div>

      {showPasswordField && (
        <div className="flex items-center gap-1.5">
          <input type="text" placeholder="New password (12+ chars)" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className={`${input} w-56`} />
          <button type="button" disabled={loading || newPassword.length < 12} onClick={() => run({ newPassword })} className="rounded-lg bg-brand px-2 py-1 text-xs font-bold text-white disabled:opacity-50">
            Set
          </button>
        </div>
      )}

      {needsStepUp && (
        <div className="space-y-1.5 rounded-lg border border-border bg-canvas p-2">
          <p className="text-xs font-semibold text-inkSoft">Re-verify your identity</p>
          <input type="password" placeholder="Password" value={stepUpPassword} onChange={(e) => setStepUpPassword(e.target.value)} className={input} />
          <input type="text" inputMode="numeric" placeholder="6-digit code" value={code} onChange={(e) => setCode(e.target.value)} className={input} />
          <button type="button" disabled={loading} onClick={() => pendingBody && run(pendingBody)} className="rounded-lg bg-brand px-2 py-1 text-xs font-bold text-white disabled:opacity-50">
            Confirm
          </button>
        </div>
      )}

      {error && <p className="text-xs text-critical">{error}</p>}
      {notice && <p className="text-xs text-success">{notice}</p>}
    </div>
  );
}
