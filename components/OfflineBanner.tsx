"use client";

import { useEffect, useState } from "react";
import { CloudOff, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shows a small banner when the browser reports offline. Visible in
 * installed-PWA mode too. Stays out of the way until you actually need it.
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(true);
  const [justReconnected, setJustReconnected] = useState(false);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    setOnline(navigator.onLine);

    const on = () => {
      setOnline(true);
      setJustReconnected(true);
      setTimeout(() => setJustReconnected(false), 4000);
    };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online && !justReconnected) return null;

  return (
    <div
      role="status"
      className={cn(
        "sticky top-0 z-50 flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium",
        online
          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
          : "bg-amber-500/15 text-amber-700 dark:text-amber-300",
      )}
    >
      {online ? (
        <>
          <RefreshCw className="h-3 w-3" aria-hidden /> Back online — queued logs
          syncing.
        </>
      ) : (
        <>
          <CloudOff className="h-3 w-3" aria-hidden /> You&apos;re offline.
          Food + water entries queue locally and send when you reconnect.
        </>
      )}
    </div>
  );
}
