"use client";

import dynamic from "next/dynamic";
import { toHighlighterMuscles } from "./muscle-map";

// Model ships as CommonJS; load client-only.
const Model = dynamic(() => import("react-body-highlighter"), { ssr: false });

interface Props {
  name: string;
  muscleGroups: string[];
}

/**
 * Two silhouettes (anterior + posterior) with the exercise's muscle groups
 * highlighted in red.
 */
export function BodyHighlighter({ name, muscleGroups }: Props) {
  const muscles = toHighlighterMuscles(muscleGroups);
  const data = [{ name, muscles }];

  return (
    <div className="grid grid-cols-2 gap-4">
      <div className="flex flex-col items-center">
        <Model
          data={data}
          style={{ width: "100%", maxWidth: 160 }}
          highlightedColors={["#ef4444", "#b91c1c"]}
          type="anterior"
        />
        <p className="mt-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          Front
        </p>
      </div>
      <div className="flex flex-col items-center">
        <Model
          data={data}
          style={{ width: "100%", maxWidth: 160 }}
          highlightedColors={["#ef4444", "#b91c1c"]}
          type="posterior"
        />
        <p className="mt-1 text-[0.65rem] uppercase tracking-wide text-muted-foreground">
          Back
        </p>
      </div>
    </div>
  );
}
