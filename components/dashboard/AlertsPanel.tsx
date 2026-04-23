"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, BellRing, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface PendingAlert {
  id: string;
  type: string;
  message: string;
  sentAt: string;
}

async function fetchPending(): Promise<{ alerts: PendingAlert[] }> {
  const r = await fetch("/api/alerts/pending");
  if (!r.ok) throw new Error("Failed");
  return r.json();
}
async function dismiss(id: string) {
  const r = await fetch(`/api/alerts/${id}/dismiss`, { method: "POST" });
  if (!r.ok) throw new Error("Failed");
}
async function fetchVapidKey(): Promise<string | null> {
  const r = await fetch("/api/push/subscribe");
  if (!r.ok) return null;
  const body = await r.json();
  return body.vapidPublicKey ?? null;
}
async function postSubscription(sub: PushSubscription) {
  const r = await fetch("/api/push/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub.toJSON()),
  });
  if (!r.ok) throw new Error("Failed");
}

function urlBase64ToUint8Array(b64: string): Uint8Array {
  const padding = "=".repeat((4 - (b64.length % 4)) % 4);
  const normalized = (b64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

type Perm = "idle" | "granted" | "denied" | "default" | "unsupported";

export function AlertsPanel() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ["alerts", "pending"],
    queryFn: fetchPending,
    refetchInterval: 60_000,
  });
  const dismissMutation = useMutation({
    mutationFn: dismiss,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts", "pending"] }),
  });

  const [perm, setPerm] = useState<Perm>("idle");
  const [subscribing, setSubscribing] = useState(false);
  const [hidePrompt, setHidePrompt] = useState(false);

  useEffect(() => {
    if (typeof Notification === "undefined") return setPerm("unsupported");
    setPerm(Notification.permission as Perm);
    setHidePrompt(localStorage.getItem("fit:push:dismissed") === "1");
  }, []);

  async function enablePush() {
    setSubscribing(true);
    try {
      if (typeof Notification === "undefined") return setPerm("unsupported");
      let p = Notification.permission as Perm;
      if (p === "default") {
        p = (await Notification.requestPermission()) as Perm;
      }
      setPerm(p);
      if (p !== "granted") return;
      const vapid = await fetchVapidKey();
      if (!vapid) throw new Error("VAPID key not configured on server");
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      const sub =
        existing ??
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          // Cast: PushManager expects BufferSource; our helper returns
          // a valid ArrayBuffer-backed Uint8Array.
          applicationServerKey: urlBase64ToUint8Array(vapid) as unknown as BufferSource,
        }));
      await postSubscription(sub);
    } catch (err) {
      console.error("[push subscribe]", err);
      toast({
        variant: "destructive",
        title: "Couldn't enable notifications",
        description: (err as Error).message,
      });
    } finally {
      setSubscribing(false);
    }
  }

  const alerts = data?.alerts ?? [];
  const showEnablePrompt =
    !hidePrompt && perm !== "granted" && perm !== "unsupported";

  if (!showEnablePrompt && alerts.length === 0) return null;

  return (
    <div className="space-y-2">
      {showEnablePrompt && (
        <Card className="flex items-start gap-3 border-primary/30 bg-primary/5 p-3">
          <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Turn on nudges</p>
            <p className="text-xs text-muted-foreground">
              We&apos;ll ping you about protein gaps, workouts, and water —
              nothing else.
            </p>
          </div>
          <div className="flex flex-col gap-1">
            <Button size="sm" onClick={enablePush} disabled={subscribing}>
              {subscribing ? "…" : <><Bell className="mr-1 h-3.5 w-3.5" /> Enable</>}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-xs text-muted-foreground"
              onClick={() => {
                localStorage.setItem("fit:push:dismissed", "1");
                setHidePrompt(true);
              }}
            >
              Not now
            </Button>
          </div>
        </Card>
      )}

      {perm === "denied" && (
        <Card className="flex items-start gap-2 border-destructive/40 bg-destructive/5 p-3 text-xs">
          <BellOff className="mt-0.5 h-4 w-4 text-destructive" aria-hidden />
          <p className="text-destructive">
            Notifications blocked. Re-enable in your browser settings to resume.
          </p>
        </Card>
      )}

      {alerts.map((a) => (
        <Card key={a.id} className="flex items-start gap-2 p-3">
          <Bell className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm">{a.message}</p>
            <p className="mt-0.5 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
              {a.type}
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss"
            onClick={() => dismissMutation.mutate(a.id)}
            className={cn(
              "rounded-full p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              dismissMutation.isPending && "opacity-50",
            )}
          >
            <X className="h-4 w-4" />
          </button>
        </Card>
      ))}
    </div>
  );
}
