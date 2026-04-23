"use client";

import { Pause, Play, Plus, Minus, X, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  seconds: number;
  onDone?: () => void;
  onDismiss?: () => void;
  autoStart?: boolean;
}

/**
 * Countdown rest timer. Uses wall-clock (Date.now()) reconciliation so it
 * stays accurate even if the browser throttles setInterval in the
 * background. Emits a short 880 Hz beep via WebAudio when it hits zero,
 * and holds a screen wake lock while running.
 */
export function RestTimer({ seconds, onDone, onDismiss, autoStart = true }: Props) {
  const [initialSec, setInitialSec] = useState(seconds);
  const [remainingMs, setRemainingMs] = useState(seconds * 1000);
  const [running, setRunning] = useState(autoStart);
  const [muted, setMuted] = useState(false);
  const targetRef = useRef<number | null>(
    autoStart ? Date.now() + seconds * 1000 : null,
  );
  const pausedRef = useRef<number | null>(null);
  const beepedRef = useRef(false);

  // Tick + wall-clock reconciliation.
  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => {
      if (targetRef.current == null) return;
      const left = Math.max(0, targetRef.current - Date.now());
      setRemainingMs(left);
      if (left <= 0 && !beepedRef.current) {
        beepedRef.current = true;
        if (!muted) void beep();
        onDone?.();
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [running, muted, onDone]);

  // Screen wake lock (best-effort, Chrome/Android).
  useEffect(() => {
    if (!running) return;
    let sentinel: { release?: () => Promise<void> } | null = null;
    interface WL { request: (t: string) => Promise<{ release?: () => Promise<void> }> }
    const wl = (navigator as Navigator & { wakeLock?: WL }).wakeLock;
    if (wl?.request) {
      wl.request("screen")
        .then((s) => {
          sentinel = s;
        })
        .catch(() => {});
    }
    return () => {
      sentinel?.release?.().catch(() => {});
    };
  }, [running]);

  const totalSec = initialSec;
  const remainingSec = Math.ceil(remainingMs / 1000);
  const pct = totalSec > 0 ? (remainingSec / totalSec) * 100 : 0;
  const done = remainingMs <= 0;

  function pause() {
    if (!running || targetRef.current == null) return;
    pausedRef.current = targetRef.current - Date.now();
    targetRef.current = null;
    setRunning(false);
  }
  function resume() {
    if (running) return;
    const left = pausedRef.current ?? remainingMs;
    targetRef.current = Date.now() + left;
    pausedRef.current = null;
    setRunning(true);
    beepedRef.current = false;
  }
  function bump(delta: number) {
    beepedRef.current = false;
    if (running && targetRef.current != null) {
      targetRef.current += delta * 1000;
    } else {
      pausedRef.current = (pausedRef.current ?? remainingMs) + delta * 1000;
    }
    setInitialSec((s) => Math.max(1, s + delta));
    setRemainingMs((m) => Math.max(0, m + delta * 1000));
  }

  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-colors",
        done
          ? "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30"
          : "border-border bg-card",
      )}
      role="timer"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {done ? "Rest done" : "Rest"}
          </p>
          <p className={cn(
            "mt-0.5 text-3xl font-bold tabular-nums",
            done ? "text-emerald-600" : "text-foreground",
          )}>
            {formatMMSS(remainingSec)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="icon"
            variant="ghost"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          </Button>
          <Button
            size="icon"
            variant="ghost"
            onClick={() => bump(-15)}
            aria-label="Subtract 15 seconds"
            disabled={remainingSec <= 15}
          >
            <Minus className="h-4 w-4" />
          </Button>
          <Button size="icon" variant="ghost" onClick={() => bump(15)} aria-label="Add 15 seconds">
            <Plus className="h-4 w-4" />
          </Button>
          {running ? (
            <Button size="icon" variant="outline" onClick={pause} aria-label="Pause timer">
              <Pause className="h-4 w-4" />
            </Button>
          ) : (
            <Button size="icon" variant="outline" onClick={resume} aria-label="Resume timer">
              <Play className="h-4 w-4" />
            </Button>
          )}
          {onDismiss && (
            <Button size="icon" variant="ghost" onClick={onDismiss} aria-label="Dismiss timer">
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn(
            "h-full transition-all duration-200 ease-linear",
            done ? "bg-emerald-500" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function formatMMSS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

// Fire-and-forget Web Audio beep so we don't depend on an <audio> tag.
async function beep() {
  try {
    const AudioCtx = (window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) as
      | typeof AudioContext
      | undefined;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    // Two short rising chirps so you can hear it through headphones.
    const now = ctx.currentTime;
    tone(ctx, 880, now, 0.18);
    tone(ctx, 1175, now + 0.22, 0.2);
    setTimeout(() => ctx.close().catch(() => {}), 600);
  } catch {
    /* ignore — non-critical */
  }
}

function tone(ctx: AudioContext, hz: number, when: number, dur: number) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.frequency.value = hz;
  g.gain.setValueAtTime(0.001, when);
  g.gain.exponentialRampToValueAtTime(0.35, when + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(when);
  osc.stop(when + dur + 0.02);
}
