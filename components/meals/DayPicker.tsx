"use client";

import { cn } from "@/lib/utils";

const DAYS = [
  { n: 1, short: "Mon", full: "Monday" },
  { n: 2, short: "Tue", full: "Tuesday" },
  { n: 3, short: "Wed", full: "Wednesday" },
  { n: 4, short: "Thu", full: "Thursday" },
  { n: 5, short: "Fri", full: "Friday" },
  { n: 6, short: "Sat", full: "Saturday" },
  { n: 7, short: "Sun", full: "Sunday" },
];

interface Props {
  value: number;
  onChange: (day: number) => void;
  today: number;
}

export function DayPicker({ value, onChange, today }: Props) {
  return (
    <div
      className="flex w-full gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="tablist"
      aria-label="Day of week"
    >
      {DAYS.map((d) => {
        const active = d.n === value;
        const isToday = d.n === today;
        return (
          <button
            key={d.n}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(d.n)}
            className={cn(
              "relative flex h-16 min-w-[3.25rem] shrink-0 flex-col items-center justify-center rounded-lg border text-xs font-semibold transition-colors",
              active
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
            )}
          >
            <span className="text-[0.65rem] uppercase tracking-wide opacity-70">
              {d.short}
            </span>
            <span className="mt-0.5 text-lg tabular-nums">{d.n}</span>
            {isToday && (
              <span
                className={cn(
                  "absolute -top-1 right-1 h-1.5 w-1.5 rounded-full",
                  active ? "bg-primary-foreground" : "bg-primary",
                )}
                aria-label="today"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
