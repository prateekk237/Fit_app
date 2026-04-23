"use client";

import Link from "next/link";
import { Dumbbell, ChevronRight } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export interface LibraryExercise {
  id: number;
  slug: string;
  name: string;
  category: string;
  muscleGroups: string[];
  equipmentNeeded: string[];
  difficulty: string | null;
  imageUrl: string | null;
  youtubeId: string | null;
}

interface Props {
  ex: LibraryExercise;
}

const CATEGORY_COLOR: Record<string, string> = {
  push: "bg-rose-500/10 text-rose-700",
  pull: "bg-indigo-500/10 text-indigo-700",
  legs: "bg-amber-500/10 text-amber-700",
  hiit: "bg-orange-500/10 text-orange-700",
  fullbody: "bg-emerald-500/10 text-emerald-700",
  cardio: "bg-sky-500/10 text-sky-700",
  core: "bg-violet-500/10 text-violet-700",
};

export function ExerciseCard({ ex }: Props) {
  const color = CATEGORY_COLOR[ex.category] ?? "bg-muted text-muted-foreground";

  return (
    <Link
      href={`/exercises/${ex.slug}`}
      className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary rounded-lg"
    >
      <Card className="flex items-center gap-3 p-3 transition-colors hover:bg-accent">
        <div
          className={cn(
            "flex h-12 w-12 shrink-0 items-center justify-center rounded-md",
            color,
          )}
          aria-hidden
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {ex.imageUrl ? (
            <img
              src={ex.imageUrl}
              alt=""
              className="h-full w-full rounded-md object-cover"
              loading="lazy"
            />
          ) : (
            <Dumbbell className="h-5 w-5" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold capitalize">{ex.name}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            <Badge className={cn("border-transparent text-[0.6rem] capitalize", color)}>
              {ex.category}
            </Badge>
            {ex.muscleGroups.slice(0, 3).map((m) => (
              <Badge key={m} variant="outline" className="text-[0.6rem]">
                {m}
              </Badge>
            ))}
            {ex.equipmentNeeded.length > 0 && (
              <Badge variant="secondary" className="text-[0.6rem]">
                {ex.equipmentNeeded[0]}
                {ex.equipmentNeeded.length > 1 ? ` +${ex.equipmentNeeded.length - 1}` : ""}
              </Badge>
            )}
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
      </Card>
    </Link>
  );
}
