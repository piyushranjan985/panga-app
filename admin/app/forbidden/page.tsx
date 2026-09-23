export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4">
      <div className="max-w-sm text-center">
        <p className="text-4xl">🔒</p>
        <p className="mt-3 text-lg font-bold">You don&apos;t have access to this</p>
        <p className="mt-1 text-sm text-inkSoft">
          Your role doesn&apos;t include this permission. If you think this is wrong, ask a Super Admin to review
          your role under Admin &amp; Roles.
        </p>
        <a href="/dashboard" className="mt-6 inline-block rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white">
          Back to Dashboard
        </a>
      </div>
    </div>
  );
}
