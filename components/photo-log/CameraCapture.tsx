"use client";

import { Camera, Image as ImageIcon, RotateCcw, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface CaptureResult {
  file: File;             // compressed file (or original if already small)
  previewUrl: string;     // object URL
  originalBytes: number;
  finalBytes: number;
}

interface Props {
  onCapture: (result: CaptureResult) => void;
  disabled?: boolean;
}

const COMPRESS_THRESHOLD_BYTES = 1024 * 1024; // compress anything > 1 MB
const COMPRESSION_OPTS: Parameters<typeof imageCompression>[1] = {
  maxSizeMB: 0.5, // target < 500 KB per Phase 6 acceptance
  maxWidthOrHeight: 1600,
  useWebWorker: true,
  initialQuality: 0.8,
};

export function CameraCapture({ onCapture, disabled }: Props) {
  const camRef = useRef<HTMLInputElement>(null);
  const libRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<"idle" | "compressing" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  async function handleFile(file: File) {
    setError(null);
    if (!file.type.startsWith("image/")) {
      setError("That doesn't look like an image.");
      return;
    }
    const originalBytes = file.size;
    let out: File = file;
    if (file.size > COMPRESS_THRESHOLD_BYTES) {
      setStatus("compressing");
      try {
        out = await imageCompression(file, COMPRESSION_OPTS);
      } catch (err) {
        setStatus("error");
        setError((err as Error).message || "Compression failed");
        return;
      }
    }
    setStatus("idle");
    const previewUrl = URL.createObjectURL(out);
    onCapture({
      file: out,
      previewUrl,
      originalBytes,
      finalBytes: out.size,
    });
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          size="lg"
          variant="default"
          disabled={disabled || status === "compressing"}
          onClick={() => camRef.current?.click()}
          className={cn(
            "h-28 flex-col gap-1 text-base font-semibold",
            "shadow-lg shadow-primary/20",
          )}
        >
          {status === "compressing" ? (
            <Loader2 className="h-7 w-7 animate-spin" aria-hidden />
          ) : (
            <Camera className="h-7 w-7" aria-hidden />
          )}
          Take photo
        </Button>
        <Button
          type="button"
          size="lg"
          variant="outline"
          disabled={disabled || status === "compressing"}
          onClick={() => libRef.current?.click()}
          className="h-28 flex-col gap-1 text-base font-semibold"
        >
          <ImageIcon className="h-7 w-7" aria-hidden />
          From gallery
        </Button>
      </div>

      {status === "compressing" && (
        <p className="text-center text-xs text-muted-foreground">
          Shrinking image… this saves your mobile data.
        </p>
      )}

      {/* Capture from camera */}
      <input
        ref={camRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = ""; // allow re-selecting the same file
        }}
      />
      {/* Pick from library */}
      <input
        ref={libRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
          e.target.value = "";
        }}
      />
    </div>
  );
}

export function PhotoPreview({
  previewUrl,
  originalBytes,
  finalBytes,
  onRetake,
}: {
  previewUrl: string;
  originalBytes: number;
  finalBytes: number;
  onRetake: () => void;
}) {
  useEffect(() => {
    return () => {
      URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const savedPct =
    originalBytes > finalBytes
      ? Math.round(((originalBytes - finalBytes) / originalBytes) * 100)
      : 0;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-xl border bg-muted">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={previewUrl}
          alt="Captured food"
          className="aspect-square w-full object-cover"
        />
      </div>
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="tabular-nums">
          {(finalBytes / 1024).toFixed(0)} KB
          {originalBytes !== finalBytes && (
            <span className="ml-1 text-emerald-600">-{savedPct}%</span>
          )}
        </span>
        <Button size="sm" variant="ghost" onClick={onRetake}>
          <RotateCcw className="mr-1 h-4 w-4" aria-hidden /> Retake
        </Button>
      </div>
    </div>
  );
}
