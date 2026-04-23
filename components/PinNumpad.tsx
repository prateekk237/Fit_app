"use client";

import { useCallback, useEffect, useState } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  length?: number;
  onComplete: (pin: string) => void | Promise<void>;
  disabled?: boolean;
  resetSignal?: number; // bump to clear entry (e.g. after wrong PIN)
}

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"] as const;

export function PinNumpad({ length = 6, onComplete, disabled = false, resetSignal }: Props) {
  const [pin, setPin] = useState("");

  useEffect(() => {
    setPin("");
  }, [resetSignal]);

  const handleKey = useCallback(
    async (key: string) => {
      if (disabled) return;
      if (typeof navigator !== "undefined" && "vibrate" in navigator) {
        navigator.vibrate?.(10);
      }
      if (key === "back") {
        setPin((p) => p.slice(0, -1));
        return;
      }
      setPin((prev) => {
        if (prev.length >= length) return prev;
        const next = prev + key;
        if (next.length === length) {
          void onComplete(next);
        }
        return next;
      });
    },
    [disabled, length, onComplete],
  );

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (disabled) return;
      if (e.key >= "0" && e.key <= "9") handleKey(e.key);
      else if (e.key === "Backspace") handleKey("back");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handleKey, disabled]);

  return (
    <div className="flex w-full flex-col items-center gap-8">
      <div className="flex gap-3" aria-label={`${pin.length} of ${length} digits entered`}>
        {Array.from({ length }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-4 w-4 rounded-full border-2 transition-colors",
              i < pin.length
                ? "border-primary bg-primary"
                : "border-muted-foreground/40 bg-transparent",
            )}
          />
        ))}
      </div>

      <div className="grid w-full max-w-xs grid-cols-3 gap-3">
        {KEYS.map((k, idx) => {
          if (k === "") return <div key={`blank-${idx}`} aria-hidden />;
          const isBack = k === "back";
          return (
            <button
              key={k}
              type="button"
              onClick={() => handleKey(k)}
              disabled={disabled}
              aria-label={isBack ? "Delete last digit" : `Digit ${k}`}
              className={cn(
                "flex h-16 items-center justify-center rounded-xl border text-2xl font-semibold transition-colors",
                "active:scale-95 active:bg-secondary",
                isBack
                  ? "border-transparent text-muted-foreground hover:text-foreground"
                  : "border-input bg-card hover:bg-accent",
                disabled && "opacity-50",
              )}
            >
              {isBack ? <Delete className="h-6 w-6" aria-hidden /> : k}
            </button>
          );
        })}
      </div>
    </div>
  );
}
