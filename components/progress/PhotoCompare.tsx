"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  beforeUrl: string;
  afterUrl: string;
  beforeLabel?: string;
  afterLabel?: string;
}

/**
 * Swipe-reveal before/after slider. The "after" image is absolutely
 * positioned on top of the "before" and clipped by a vertical line the
 * user drags left/right.
 */
export function PhotoCompare({
  beforeUrl,
  afterUrl,
  beforeLabel = "Before",
  afterLabel = "After",
}: Props) {
  const [pct, setPct] = useState(50);
  const dragRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const applyFromClientX = useCallback((clientX: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
    setPct((x / rect.width) * 100);
  }, []);

  function startDrag() {
    dragRef.current = true;
  }
  function endDrag() {
    dragRef.current = false;
  }

  return (
    <div
      ref={wrapRef}
      className="relative aspect-[3/4] w-full touch-none select-none overflow-hidden rounded-lg border bg-muted"
      onPointerDown={(e) => {
        (e.target as Element).setPointerCapture?.(e.pointerId);
        startDrag();
        applyFromClientX(e.clientX);
      }}
      onPointerMove={(e) => {
        if (!dragRef.current) return;
        applyFromClientX(e.clientX);
      }}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {/* BEFORE (bottom layer) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeUrl}
        alt={beforeLabel}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
      {/* AFTER (clipped to pct) */}
      <div
        className="absolute inset-y-0 left-0 overflow-hidden"
        style={{ width: `${pct}%` }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={afterUrl}
          alt={afterLabel}
          className="h-full w-full object-cover"
          style={{ width: `${(100 / Math.max(pct, 0.1)) * 100}%` }}
          draggable={false}
        />
      </div>

      {/* Handle */}
      <div
        className={cn(
          "pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.2)]",
        )}
        style={{ left: `calc(${pct}% - 1px)` }}
      />
      <div
        className={cn(
          "pointer-events-none absolute z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-xs font-bold text-foreground shadow",
        )}
        style={{ top: "50%", left: `${pct}%` }}
      >
        ⇆
      </div>

      {/* Labels */}
      <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[0.65rem] font-semibold text-white">
        {afterLabel}
      </span>
      <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[0.65rem] font-semibold text-white">
        {beforeLabel}
      </span>
    </div>
  );
}
