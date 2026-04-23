"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PinNumpad } from "@/components/PinNumpad";

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginShell />}>
      <LoginClient />
    </Suspense>
  );
}

function LoginShell() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-10 text-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fit</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter your 6-digit PIN</p>
        </div>
      </div>
    </div>
  );
}

function LoginClient() {
  const router = useRouter();
  const params = useSearchParams();
  const from = params.get("from") || "/";

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetSignal, setResetSignal] = useState(0);
  const [locked, setLocked] = useState(false);

  async function handleComplete(pin: string) {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        router.replace(from);
        router.refresh();
        return;
      }
      if (res.status === 429) {
        setLocked(true);
        setError(body.error ?? "Too many attempts. Try again later.");
        return;
      }
      const remaining = typeof body.remaining === "number" ? body.remaining : null;
      setError(
        body.error +
          (remaining !== null ? ` — ${remaining} attempt${remaining === 1 ? "" : "s"} left` : ""),
      );
      setResetSignal((n) => n + 1);
    } catch {
      setError("Network error — please try again.");
      setResetSignal((n) => n + 1);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-10 text-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Fit</h1>
          <p className="mt-2 text-sm text-muted-foreground">Enter your 6-digit PIN</p>
        </div>

        <PinNumpad
          onComplete={handleComplete}
          disabled={submitting || locked}
          resetSignal={resetSignal}
        />

        <div className="min-h-[1.25rem]" role="status" aria-live="polite">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!error && submitting && (
            <p className="text-sm text-muted-foreground">Signing in…</p>
          )}
        </div>
      </div>
    </div>
  );
}
