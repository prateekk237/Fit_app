"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Camera, Image as ImageIcon, Loader2, Smile, User } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PhotoCompare } from "@/components/progress/PhotoCompare";
import { AdherenceChart } from "@/components/progress/AdherenceChart";
import { cn } from "@/lib/utils";

interface Photo {
  logId: string;
  date: string;
  weightKg: number;
  body: string | null;
  face: string | null;
}
interface PhotosResponse {
  photos: Photo[];
}

interface AdherenceRow {
  date: string;
  calories: number;
  proteinG: number;
  calorieAdherence: number;
  proteinAdherence: number;
  workoutDone: boolean;
  waterMl: number;
}
interface AdherenceResponse {
  days: number;
  range: { from: string | null; to: string | null };
  targets: {
    calories: number;
    proteinG: number;
    waterMl: number;
  };
  today: string;
  rows: AdherenceRow[];
}

async function fetchPhotos(): Promise<PhotosResponse> {
  const r = await fetch("/api/progress-photos");
  if (!r.ok) throw new Error("Failed");
  return r.json();
}
async function fetchAdherence(): Promise<AdherenceResponse> {
  const r = await fetch("/api/adherence?days=14");
  if (!r.ok) throw new Error("Failed");
  return r.json();
}
async function uploadPhoto(file: File, type: "body" | "face") {
  const form = new FormData();
  form.append("image", file);
  form.append("type", type);
  const r = await fetch("/api/progress-photos", { method: "POST", body: form });
  if (!r.ok) throw new Error((await r.json()).error ?? "Upload failed");
  return r.json();
}

const COMPRESSION: Parameters<typeof imageCompression>[1] = {
  maxSizeMB: 1,
  maxWidthOrHeight: 1800,
  useWebWorker: true,
  initialQuality: 0.82,
};

type PhotoKind = "body" | "face";

export default function ProgressPage() {
  const qc = useQueryClient();
  const { data: photosData, isPending: photosPending } = useQuery({
    queryKey: ["progress-photos"],
    queryFn: fetchPhotos,
  });
  const { data: adh, isPending: adhPending } = useQuery({
    queryKey: ["adherence", 14],
    queryFn: fetchAdherence,
  });

  const [kind, setKind] = useState<PhotoKind>("body");
  const [compareSel, setCompareSel] = useState<{ before?: string; after?: string }>({});

  const uploadMutation = useMutation({
    mutationFn: async ({ file, type }: { file: File; type: PhotoKind }) => {
      let out: File = file;
      if (file.size > 1024 * 1024) {
        out = await imageCompression(file, COMPRESSION);
      }
      return uploadPhoto(out, type);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["progress-photos"] });
    },
  });

  const photosOfKind = useMemo(() => {
    if (!photosData) return [] as Photo[];
    return photosData.photos.filter((p) =>
      kind === "body" ? p.body : p.face,
    );
  }, [photosData, kind]);

  const compareBefore =
    compareSel.before && photosOfKind.find((p) => p.logId === compareSel.before);
  const compareAfter =
    compareSel.after && photosOfKind.find((p) => p.logId === compareSel.after);
  const beforeUrl =
    compareBefore && (kind === "body" ? compareBefore.body : compareBefore.face);
  const afterUrl =
    compareAfter && (kind === "body" ? compareAfter.body : compareAfter.face);

  function handleFile(type: PhotoKind, file: File | null) {
    if (!file) return;
    uploadMutation.mutate({ file, type });
  }

  function togglePick(logId: string) {
    setCompareSel((sel) => {
      if (sel.before === logId) return { ...sel, before: undefined };
      if (sel.after === logId) return { ...sel, after: undefined };
      if (!sel.before) return { ...sel, before: logId };
      if (!sel.after) return { ...sel, after: logId };
      return { before: logId, after: undefined };
    });
  }

  return (
    <div className="space-y-6 pb-6">
      <header>
        <h1 className="text-2xl font-bold">Progress</h1>
        <p className="text-sm text-muted-foreground">
          Photos every 2 weeks · macro adherence last 14 days.
        </p>
      </header>

      <section>
        <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          14-day adherence
        </h2>
        <Card className="p-4">
          {adhPending || !adh ? (
            <Skeleton className="h-48 w-full" />
          ) : (
            <>
              <div className="mb-3 flex items-center justify-between">
                <p className="text-sm font-semibold">Calories</p>
                <Legend />
              </div>
              <AdherenceChart
                rows={adh.rows}
                metric="calorie"
                target={adh.targets.calories}
              />
              <div className="mb-2 mt-4 flex items-center justify-between">
                <p className="text-sm font-semibold">Protein</p>
              </div>
              <AdherenceChart
                rows={adh.rows}
                metric="protein"
                target={adh.targets.proteinG}
              />
              <AdherenceSummary rows={adh.rows} />
            </>
          )}
        </Card>
      </section>

      <section>
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Progress photos
          </h2>
          <Tabs
            value={kind}
            onValueChange={(v) => {
              setKind(v as PhotoKind);
              setCompareSel({});
            }}
          >
            <TabsList className="h-8 text-xs">
              <TabsTrigger value="body" className="gap-1 px-2 py-1">
                <User className="h-3.5 w-3.5" /> Body
              </TabsTrigger>
              <TabsTrigger value="face" className="gap-1 px-2 py-1">
                <Smile className="h-3.5 w-3.5" /> Face
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="mb-3 grid grid-cols-2 gap-2">
          <UploadButton
            camera
            disabled={uploadMutation.isPending}
            onFile={(f) => handleFile(kind, f)}
          />
          <UploadButton
            disabled={uploadMutation.isPending}
            onFile={(f) => handleFile(kind, f)}
          />
        </div>
        {uploadMutation.isPending && (
          <p className="mb-2 flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Uploading…
          </p>
        )}
        {uploadMutation.error && (
          <p className="mb-2 text-center text-xs text-destructive">
            {(uploadMutation.error as Error).message}
          </p>
        )}

        {beforeUrl && afterUrl && compareBefore && compareAfter && (
          <Card className="mb-3 space-y-2 p-3">
            <p className="text-xs font-semibold text-muted-foreground">
              Comparing {compareBefore.date} → {compareAfter.date}
            </p>
            <PhotoCompare
              beforeUrl={beforeUrl}
              afterUrl={afterUrl}
              beforeLabel={compareBefore.date}
              afterLabel={compareAfter.date}
            />
            <Button size="sm" variant="ghost" onClick={() => setCompareSel({})}>
              Clear comparison
            </Button>
          </Card>
        )}

        {photosPending ? (
          <div className="grid grid-cols-3 gap-2">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="aspect-square rounded-md" />
            ))}
          </div>
        ) : photosOfKind.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            No {kind} photos yet — upload one above.
          </Card>
        ) : (
          <>
            <p className="mb-1 px-1 text-[0.65rem] text-muted-foreground">
              Tap two photos to compare.
            </p>
            <ul className="grid grid-cols-3 gap-2">
              {photosOfKind.map((p) => {
                const url = kind === "body" ? p.body : p.face;
                if (!url) return null;
                const selected =
                  compareSel.before === p.logId || compareSel.after === p.logId;
                const pos =
                  compareSel.before === p.logId
                    ? "before"
                    : compareSel.after === p.logId
                      ? "after"
                      : null;
                return (
                  <li key={p.logId}>
                    <button
                      type="button"
                      onClick={() => togglePick(p.logId)}
                      className={cn(
                        "group relative block aspect-square w-full overflow-hidden rounded-md border bg-muted",
                        selected && "ring-2 ring-primary",
                      )}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={`${kind} on ${p.date}`}
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <span className="absolute bottom-1 left-1 rounded bg-black/55 px-1.5 py-0.5 text-[0.6rem] font-semibold text-white">
                        {p.date}
                      </span>
                      {pos && (
                        <span className="absolute right-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[0.55rem] font-bold uppercase text-primary-foreground">
                          {pos}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

function UploadButton({
  camera,
  disabled,
  onFile,
}: {
  camera?: boolean;
  disabled?: boolean;
  onFile: (f: File) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const Icon = camera ? Camera : ImageIcon;
  return (
    <>
      <Button
        type="button"
        variant={camera ? "default" : "outline"}
        size="lg"
        disabled={disabled}
        onClick={() => ref.current?.click()}
        className="h-20 flex-col gap-1 text-sm"
      >
        <Icon className="h-5 w-5" aria-hidden />
        {camera ? "Take photo" : "From gallery"}
      </Button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        {...(camera ? { capture: "environment" } : {})}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />
    </>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground">
      <Dot c="#10b981" /> On target
      <Dot c="#f59e0b" /> Off ±
      <Dot c="#f43f5e" /> Way off
    </div>
  );
}
function Dot({ c }: { c: string }) {
  return (
    <span
      className="inline-block h-2 w-2 rounded-full"
      style={{ backgroundColor: c }}
      aria-hidden
    />
  );
}

function AdherenceSummary({ rows }: { rows: AdherenceRow[] }) {
  const logged = rows.filter((r) => r.calories > 0).length;
  const onProtein = rows.filter(
    (r) => r.proteinAdherence >= 85 && r.proteinAdherence <= 115,
  ).length;
  const workouts = rows.filter((r) => r.workoutDone).length;
  return (
    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
      <Stat label="Days logged" value={`${logged}/${rows.length}`} />
      <Stat label="On protein" value={`${onProtein}/${rows.length}`} />
      <Stat label="Workouts" value={`${workouts}/${rows.length}`} />
    </div>
  );
}
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/40 p-2">
      <p className="text-[0.6rem] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}
