'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketStatus, TicketPriority } from '@prisma/client';

export default function TicketControls({
  ticketId,
  status,
  priority,
  currentAssigneeId,
  admins,
}: {
  ticketId: string;
  status: TicketStatus;
  priority: TicketPriority;
  currentAssigneeId: string | null;
  admins: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function update(data: Record<string, unknown>) {
    setSaving(true);
    try {
      await fetch(`/api/support/tickets/${ticketId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(data),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-card border border-border bg-surface p-5">
      <h2 className="mb-2 text-sm font-bold">Manage</h2>
      <label className="mb-1 block text-xs font-semibold text-inkFaint">Status</label>
      <select defaultValue={status} disabled={saving} onChange={(e) => update({ status: e.target.value })} className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        {['OPEN', 'IN_PROGRESS', 'WAITING_ON_USER', 'ESCALATED', 'RESOLVED', 'CLOSED'].map((s) => (
          <option key={s} value={s}>{s}</option>
        ))}
      </select>
      <label className="mb-1 block text-xs font-semibold text-inkFaint">Priority</label>
      <select defaultValue={priority} disabled={saving} onChange={(e) => update({ priority: e.target.value })} className="mb-3 w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        {['LOW', 'NORMAL', 'HIGH', 'URGENT'].map((p) => (
          <option key={p} value={p}>{p}</option>
        ))}
      </select>
      <label className="mb-1 block text-xs font-semibold text-inkFaint">Assignee</label>
      <select defaultValue={currentAssigneeId ?? ''} disabled={saving} onChange={(e) => update({ assigneeId: e.target.value || null })} className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm">
        <option value="">Unassigned</option>
        {admins.map((a) => (
          <option key={a.id} value={a.id}>{a.name}</option>
        ))}
      </select>
    </div>
  );
}
