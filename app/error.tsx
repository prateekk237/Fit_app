"use client";

import { AlertOctagon, RotateCw } from "lucide-react";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Keep a breadcrumb for the devtools — don't leak internals to the UI.
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60vh] w-full max-w-md flex-col items-center justify-center px-6 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
        <AlertOctagon className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="mt-5 text-2xl font-bold">Something went sideways</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Fit hit an unexpected error. Your data is safe — try again.
      </p>
      {error.digest && (
        <code className="mt-3 rounded-md bg-muted px-2 py-1 text-[0.65rem] text-muted-foreground">
          ref {error.digest}
        </code>
      )}
      <Button onClick={() => reset()} className="mt-6">
        <RotateCw className="mr-1 h-4 w-4" aria-hidden /> Try again
      </Button>
    </div>
  );
}
