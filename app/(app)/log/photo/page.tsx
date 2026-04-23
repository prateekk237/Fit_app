"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  CameraCapture,
  PhotoPreview,
  type CaptureResult,
} from "@/components/photo-log/CameraCapture";
import {
  AiAnalysisResult,
  type AiResultShape,
  type DetectedItem,
} from "@/components/photo-log/AiAnalysisResult";
import type { MealType } from "@/types/food-log";

type Stage =
  | { kind: "idle" }
  | { kind: "captured"; capture: CaptureResult }
  | { kind: "analyzing"; capture: CaptureResult }
  | {
      kind: "review";
      capture: CaptureResult;
      result: AiResultShape;
      provider: string;
      durationMs: number;
    }
  | { kind: "done"; count: number };

interface AnalyzeResponse {
  provider: string;
  durationMs: number;
  attempts: Array<{ provider: string; error?: string }>;
  result: AiResultShape;
  logIds: string[];
}

function currentMealType(): MealType {
  const h = new Date().getHours();
  if (h < 7) return "pre-workout";
  if (h < 10) return "breakfast";
  if (h < 12) return "mid-morning";
  if (h < 15) return "lunch";
  if (h < 17) return "snack";
  if (h < 19) return "post-workout";
  return "dinner";
}

async function runAnalysis(file: File): Promise<AnalyzeResponse> {
  const form = new FormData();
  form.append("image", file);
  form.append("preview", "1");
  const res = await fetch("/api/food-logs/photo", {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "AI analysis failed");
  }
  return res.json();
}

async function saveItem(payload: {
  foodName: string;
  portionG: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  mealType: MealType;
}): Promise<void> {
  const res = await fetch("/api/food-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "Save failed");
  }
}

export default function PhotoLogPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const [saveProgress, setSaveProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const analyzeMutation = useMutation({
    mutationFn: runAnalysis,
    onSuccess: (data, file) => {
      setError(null);
      const capture = (stage as { capture?: CaptureResult }).capture;
      if (!capture) return;
      setStage({
        kind: "review",
        capture,
        result: data.result,
        provider: data.provider,
        durationMs: data.durationMs,
      });
    },
    onError: (err) => {
      setError((err as Error).message);
      const capture = (stage as { capture?: CaptureResult }).capture;
      if (capture) setStage({ kind: "captured", capture });
    },
  });

  async function analyze(capture: CaptureResult) {
    setStage({ kind: "analyzing", capture });
    analyzeMutation.mutate(capture.file);
  }

  async function saveAll(items: DetectedItem[], mealType: MealType) {
    setSaveProgress(0);
    setError(null);
    let ok = 0;
    for (const it of items) {
      try {
        await saveItem({
          foodName: it.name,
          portionG: it.portionGrams,
          calories: it.calories,
          proteinG: it.proteinG,
          carbsG: it.carbsG,
          fatG: it.fatG,
          mealType,
        });
        ok += 1;
        setSaveProgress(ok);
      } catch (err) {
        setError((err as Error).message);
        return;
      }
    }
    qc.invalidateQueries({ queryKey: ["food-logs", "today"] });
    qc.invalidateQueries({ queryKey: ["dashboard", "today"] });
    setStage({ kind: "done", count: ok });
  }

  const saving = saveProgress > 0 && stage.kind === "review";

  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link
            href="/log"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
            aria-label="Back to log"
          >
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold leading-tight">Photo log</h1>
            <p className="text-xs text-muted-foreground">
              Snap your plate — AI reads the portion.
            </p>
          </div>
        </div>
        <div className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
          <Sparkles className="h-3 w-3" aria-hidden /> AI
        </div>
      </header>

      {stage.kind === "idle" && (
        <div className="space-y-4">
          <CameraCapture
            onCapture={(c) => setStage({ kind: "captured", capture: c })}
          />
          <Card className="p-4 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground">Tips for best results</p>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4">
              <li>Full plate in frame, top-down angle.</li>
              <li>Good lighting — natural light works best.</li>
              <li>One dish at a time gives the highest accuracy.</li>
            </ul>
          </Card>
        </div>
      )}

      {(stage.kind === "captured" || stage.kind === "analyzing") && (
        <div className="space-y-4">
          <PhotoPreview
            previewUrl={stage.capture.previewUrl}
            originalBytes={stage.capture.originalBytes}
            finalBytes={stage.capture.finalBytes}
            onRetake={() => setStage({ kind: "idle" })}
          />
          {error && (
            <p className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={stage.kind === "analyzing"}
            onClick={() => analyze(stage.capture)}
          >
            {stage.kind === "analyzing" ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />
                Analysing plate…
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" aria-hidden /> Analyse with AI
              </>
            )}
          </Button>
        </div>
      )}

      {stage.kind === "review" && (
        <div className="space-y-4">
          <PhotoPreview
            previewUrl={stage.capture.previewUrl}
            originalBytes={stage.capture.originalBytes}
            finalBytes={stage.capture.finalBytes}
            onRetake={() => setStage({ kind: "idle" })}
          />
          <AiAnalysisResult
            result={stage.result}
            provider={stage.provider}
            durationMs={stage.durationMs}
            defaultMealType={currentMealType()}
            saving={saving}
            savedCount={saveProgress}
            onSave={(items, mealType) => saveAll(items, mealType)}
            onDiscard={() => setStage({ kind: "idle" })}
          />
          {error && (
            <p className="rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      )}

      {stage.kind === "done" && (
        <Card className="flex flex-col items-center gap-3 p-6 text-center">
          <Sparkles className="h-8 w-8 text-primary" aria-hidden />
          <p className="text-lg font-semibold">Saved {stage.count} item{stage.count === 1 ? "" : "s"}</p>
          <p className="text-sm text-muted-foreground">
            Your dashboard and daily log are up to date.
          </p>
          <div className="flex w-full gap-2 pt-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStage({ kind: "idle" })}
            >
              Log another
            </Button>
            <Button className="flex-1" onClick={() => router.push("/")}>
              Go to dashboard
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
