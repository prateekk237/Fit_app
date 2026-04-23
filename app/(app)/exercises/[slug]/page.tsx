"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Youtube } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BodyHighlighter } from "@/components/exercises/BodyHighlighter";
import {
  ExerciseCard,
  type LibraryExercise,
} from "@/components/exercises/ExerciseCard";

interface DetailResponse {
  exercise: LibraryExercise & {
    instructions: string;
    formCue: string | null;
    commonMistakes: string | null;
    attribution: string | null;
  };
  related: LibraryExercise[];
}

async function fetchDetail(slug: string): Promise<DetailResponse> {
  const res = await fetch(`/api/exercises/${slug}`);
  if (!res.ok) throw new Error("Failed to load exercise");
  return res.json();
}

export default function ExerciseDetailPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug as string;

  const { data, isPending, error } = useQuery({
    queryKey: ["exercise", slug],
    queryFn: () => fetchDetail(slug),
    enabled: !!slug,
  });

  if (isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="aspect-video rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }
  if (error || !data) {
    return <Card className="p-4 text-sm text-destructive">Not found.</Card>;
  }

  const ex = data.exercise;

  return (
    <div className="space-y-4 pb-6">
      <header className="flex items-start gap-2">
        <Link
          href="/exercises"
          className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-accent"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground capitalize">
            {ex.category}
            {ex.difficulty && <span className="ml-1 text-muted-foreground/60">· {ex.difficulty}</span>}
          </p>
          <h1 className="text-xl font-bold leading-tight capitalize">{ex.name}</h1>
        </div>
      </header>

      {/* Demo (image preferred, YT fallback) */}
      <Card className="overflow-hidden">
        {ex.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ex.imageUrl}
            alt={ex.name}
            className="mx-auto max-h-80 w-full object-contain bg-muted"
          />
        ) : ex.youtubeId ? (
          <div className="aspect-video">
            <iframe
              src={`https://www.youtube-nocookie.com/embed/${ex.youtubeId}?rel=0&modestbranding=1`}
              title={ex.name}
              className="h-full w-full"
              loading="lazy"
              allowFullScreen
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
            />
          </div>
        ) : (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            No demo available
          </div>
        )}
      </Card>

      {/* Body highlighter */}
      <Card className="p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Muscles worked
        </p>
        <BodyHighlighter name={ex.name} muscleGroups={ex.muscleGroups} />
        <div className="mt-3 flex flex-wrap gap-1">
          {ex.muscleGroups.map((m) => (
            <Badge key={m} variant="outline" className="text-[0.7rem]">
              {m}
            </Badge>
          ))}
        </div>
      </Card>

      {/* Instructions + form cue */}
      <Card className="space-y-3 p-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            How to do it
          </p>
          <p className="mt-1 text-sm text-foreground">{ex.instructions}</p>
        </div>
        {ex.formCue && (
          <div className="rounded-md border border-primary/30 bg-primary/5 p-3">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-primary">
              Form cue
            </p>
            <p className="mt-0.5 text-sm">{ex.formCue}</p>
          </div>
        )}
        {ex.commonMistakes && (
          <div className="rounded-md border border-amber-300 bg-amber-50 p-3 dark:border-amber-800/50 dark:bg-amber-950/30">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-amber-700">
              Common mistakes
            </p>
            <p className="mt-0.5 text-sm text-amber-900 dark:text-amber-200">
              {ex.commonMistakes}
            </p>
          </div>
        )}
      </Card>

      {/* Equipment + attribution */}
      <Card className="p-4 text-xs">
        {ex.equipmentNeeded.length > 0 ? (
          <>
            <p className="font-semibold uppercase tracking-wide text-muted-foreground">
              Equipment
            </p>
            <div className="mt-1 flex flex-wrap gap-1">
              {ex.equipmentNeeded.map((e) => (
                <Badge key={e} variant="secondary" className="text-[0.7rem] capitalize">
                  {e}
                </Badge>
              ))}
            </div>
          </>
        ) : (
          <p className="text-muted-foreground">Body-weight only — no equipment required.</p>
        )}
        {ex.attribution && (
          <p className="mt-2 text-muted-foreground">Image credit: {ex.attribution}</p>
        )}
      </Card>

      {/* Related */}
      {data.related.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Similar exercises
          </h2>
          <ul className="space-y-2">
            {data.related.map((r) => (
              <li key={r.id}>
                <ExerciseCard ex={r} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
