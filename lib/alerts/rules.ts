/**
 * Phase 12 rule definitions. Each rule receives a Context snapshot of
 * "right now" for the single user and returns a RuleHit | null. Rules
 * are pure — the engine dedupes against today's alerts_sent rows and
 * chooses whether to push.
 */

export type RuleKey =
  | "PROTEIN_LOW_EVENING"
  | "PROTEIN_LOW_DEFICIT"
  | "CALORIES_LOW_EVENING"
  | "CALORIES_OVER_BUDGET"
  | "WATER_BEHIND_SCHEDULE"
  | "WATER_NO_LOG_3H"
  | "MEAL_MISSED_BREAKFAST"
  | "MEAL_MISSED_LUNCH"
  | "WORKOUT_REMINDER_MORNING"
  | "WORKOUT_MISSED"
  | "WEIGHT_LOG_REMINDER"
  | "STREAK_BROKEN"
  | "STREAK_MILESTONE"
  | "WEIGHT_PLATEAU"
  | "WEIGHT_DROP_FAST"
  | "SUGAR_DAYS_ROW"
  | "FIBER_LOW"
  | "VEG_ONLY_DAY_PROTEIN"
  | "PRE_WORKOUT_NUDGE"
  | "POST_WORKOUT_PROTEIN";

export interface RuleContext {
  userId: string;
  today: string; // YYYY-MM-DD in user tz
  dayOfWeek: number;
  hour: number; // 0-23 local
  minute: number; // 0-59 local
  targets: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    waterMl: number;
  };
  consumed: {
    calories: number;
    proteinG: number;
    carbsG: number;
    fatG: number;
    fiberG: number;
    sugarG: number;
    itemsLogged: number;
  };
  waterMl: number;
  mealsLoggedToday: Set<string>; // meal_type strings
  latestWaterAgoMin: number | null;
  todayWorkout: {
    id: number;
    category: string;
    durationMin: number;
  } | null;
  workoutCompletedToday: boolean;
  workoutInProgress: boolean;
  streakDays: number;
  lastFoodLogDate: string | null;
  weightAvg7: number | null;
  weightAvg14: number | null;
  weightDropLast2Weeks: number | null;
  sugarDaysInARow: number;
  fiberShortfallDays: number;
  vegOnlyToday: boolean;
}

export interface RuleHit {
  key: RuleKey;
  message: string;
  priority: "low" | "normal" | "urgent"; // urgent bypasses quiet hours
  dedupeKey?: string; // defaults to key; allows per-day scope variants
  data?: Record<string, unknown>;
}

export interface Rule {
  key: RuleKey;
  evaluate: (ctx: RuleContext) => RuleHit | null;
}

// Helpers
const pctOfTarget = (consumed: number, target: number) =>
  target > 0 ? consumed / target : 0;

export const RULES: Rule[] = [
  {
    key: "PROTEIN_LOW_EVENING",
    evaluate: (c) => {
      if (c.hour < 16) return null;
      if (pctOfTarget(c.consumed.proteinG, c.targets.proteinG) >= 0.6) return null;
      return {
        key: "PROTEIN_LOW_EVENING",
        priority: "normal",
        message: `You've had ${Math.round(c.consumed.proteinG)}g protein (target ${c.targets.proteinG}g). Try 100g grilled chicken or 100g paneer.`,
      };
    },
  },
  {
    key: "PROTEIN_LOW_DEFICIT",
    evaluate: (c) => {
      if (c.hour < 21) return null;
      if (pctOfTarget(c.consumed.proteinG, c.targets.proteinG) >= 0.8) return null;
      return {
        key: "PROTEIN_LOW_DEFICIT",
        priority: "normal",
        message: `Finished ${Math.round(c.consumed.proteinG)}g/${c.targets.proteinG}g protein. Add a boiled egg tomorrow morning.`,
      };
    },
  },
  {
    key: "CALORIES_LOW_EVENING",
    evaluate: (c) => {
      if (c.hour < 20) return null;
      const gap = c.targets.calories - c.consumed.calories;
      if (gap < 400) return null;
      return {
        key: "CALORIES_LOW_EVENING",
        priority: "normal",
        message: `You're ${gap} kcal under. 150g low-fat paneer bhurji will close the gap.`,
      };
    },
  },
  {
    key: "CALORIES_OVER_BUDGET",
    evaluate: (c) => {
      const over = c.consumed.calories - c.targets.calories;
      if (over <= 150) return null;
      return {
        key: "CALORIES_OVER_BUDGET",
        priority: "normal",
        message: `You're ${Math.round(over)} kcal over. Consider lighter dinner.`,
      };
    },
  },
  {
    key: "WATER_BEHIND_SCHEDULE",
    evaluate: (c) => {
      if (c.hour < 8 || c.hour > 22) return null;
      const expectedFraction = Math.min(1, (c.hour - 6) / (22 - 6));
      const expected = c.targets.waterMl * expectedFraction;
      if (c.waterMl >= expected - 200) return null;
      return {
        key: "WATER_BEHIND_SCHEDULE",
        priority: "low",
        message: `You're behind on water — ${c.waterMl} / ~${Math.round(expected)} ml by now.`,
      };
    },
  },
  {
    key: "WATER_NO_LOG_3H",
    evaluate: (c) => {
      if (c.hour < 8 || c.hour > 22) return null;
      if (c.latestWaterAgoMin == null) return null;
      if (c.latestWaterAgoMin < 180) return null;
      return {
        key: "WATER_NO_LOG_3H",
        priority: "low",
        message: "Quick hydration check — haven't seen a water log for 3 hours.",
      };
    },
  },
  {
    key: "MEAL_MISSED_BREAKFAST",
    evaluate: (c) => {
      if (c.hour < 10) return null;
      if (c.mealsLoggedToday.has("breakfast")) return null;
      return {
        key: "MEAL_MISSED_BREAKFAST",
        priority: "normal",
        message: "No breakfast logged. Oats + 2 egg whites = 20g protein fast.",
      };
    },
  },
  {
    key: "MEAL_MISSED_LUNCH",
    evaluate: (c) => {
      if (c.hour < 14 || (c.hour === 14 && c.minute < 30)) return null;
      if (c.mealsLoggedToday.has("lunch")) return null;
      return {
        key: "MEAL_MISSED_LUNCH",
        priority: "normal",
        message: "Lunch reminder — today's plan meal waiting in the app.",
      };
    },
  },
  {
    key: "WORKOUT_REMINDER_MORNING",
    evaluate: (c) => {
      if (c.hour !== 7 || c.minute > 45) return null;
      if (!c.todayWorkout || c.todayWorkout.category === "rest") return null;
      if (c.workoutCompletedToday) return null;
      return {
        key: "WORKOUT_REMINDER_MORNING",
        priority: "normal",
        message: `Today is Day ${c.dayOfWeek}: ${c.todayWorkout.category}. ${c.todayWorkout.durationMin} min.`,
      };
    },
  },
  {
    key: "WORKOUT_MISSED",
    evaluate: (c) => {
      if (c.hour < 22) return null;
      if (!c.todayWorkout || c.todayWorkout.category === "rest") return null;
      if (c.workoutCompletedToday) return null;
      return {
        key: "WORKOUT_MISSED",
        priority: "normal",
        message: `Day ${c.dayOfWeek} workout not logged. Reschedule?`,
      };
    },
  },
  {
    key: "WEIGHT_LOG_REMINDER",
    evaluate: (c) => {
      // Sunday 07:00 window (06:45 - 08:00)
      if (c.dayOfWeek !== 7) return null;
      if (c.hour < 7 || c.hour > 8) return null;
      return {
        key: "WEIGHT_LOG_REMINDER",
        priority: "normal",
        message: "Weekly weigh-in time. Take progress + face photo.",
      };
    },
  },
  {
    key: "STREAK_BROKEN",
    evaluate: (c) => {
      if (c.streakDays !== 0) return null;
      if (!c.lastFoodLogDate) return null;
      const last = new Date(`${c.lastFoodLogDate}T00:00:00Z`);
      const today = new Date(`${c.today}T00:00:00Z`);
      const days = Math.round((today.getTime() - last.getTime()) / 86_400_000);
      if (days < 2 || days > 3) return null;
      return {
        key: "STREAK_BROKEN",
        priority: "low",
        message: "Streak reset. Rebuild from today.",
      };
    },
  },
  {
    key: "STREAK_MILESTONE",
    evaluate: (c) => {
      const milestones = [7, 14, 30, 60];
      if (!milestones.includes(c.streakDays)) return null;
      return {
        key: "STREAK_MILESTONE",
        priority: "low",
        message: `🔥 ${c.streakDays}-day streak.`,
        dedupeKey: `STREAK_MILESTONE:${c.streakDays}`,
      };
    },
  },
  {
    key: "WEIGHT_PLATEAU",
    evaluate: (c) => {
      if (c.weightAvg7 == null || c.weightAvg14 == null) return null;
      if (Math.abs(c.weightAvg7 - c.weightAvg14) >= 0.3) return null;
      if (c.dayOfWeek !== 1) return null; // only Monday
      if (c.hour !== 9) return null;
      return {
        key: "WEIGHT_PLATEAU",
        priority: "low",
        message: "Plateau detected. Suggest a refeed or tighter cut?",
      };
    },
  },
  {
    key: "WEIGHT_DROP_FAST",
    evaluate: (c) => {
      if (c.weightDropLast2Weeks == null) return null;
      if (c.weightDropLast2Weeks < 2.4) return null; // >1.2 kg/week × 2 weeks
      return {
        key: "WEIGHT_DROP_FAST",
        priority: "normal",
        message: "Losing fast — protect muscle by hitting protein.",
      };
    },
  },
  {
    key: "SUGAR_DAYS_ROW",
    evaluate: (c) => {
      if (c.sugarDaysInARow < 3) return null;
      if (c.hour < 20) return null;
      return {
        key: "SUGAR_DAYS_ROW",
        priority: "low",
        message: `${c.sugarDaysInARow}-day sugar streak. Schedule a detox day?`,
      };
    },
  },
  {
    key: "FIBER_LOW",
    evaluate: (c) => {
      if (c.fiberShortfallDays < 3) return null;
      if (c.hour < 20) return null;
      return {
        key: "FIBER_LOW",
        priority: "low",
        message: "Low fiber lately. Add sprouts or chana.",
      };
    },
  },
  {
    key: "VEG_ONLY_DAY_PROTEIN",
    evaluate: (c) => {
      if (!c.vegOnlyToday) return null;
      if (c.hour < 20) return null;
      if (pctOfTarget(c.consumed.proteinG, c.targets.proteinG) >= 0.8) return null;
      return {
        key: "VEG_ONLY_DAY_PROTEIN",
        priority: "normal",
        message: "Veg protein lags. Add paneer + dal combo.",
      };
    },
  },
  {
    key: "PRE_WORKOUT_NUDGE",
    evaluate: (c) => {
      if (!c.todayWorkout || c.todayWorkout.category === "rest") return null;
      if (c.workoutCompletedToday) return null;
      // 45 min before a 07:00 AM workout → fires at 06:15
      if (c.hour !== 6 || c.minute > 30) return null;
      return {
        key: "PRE_WORKOUT_NUDGE",
        priority: "normal",
        message: "Workout in 45 min — banana + black coffee?",
      };
    },
  },
  {
    key: "POST_WORKOUT_PROTEIN",
    evaluate: (c) => {
      if (!c.workoutInProgress && !c.workoutCompletedToday) return null;
      if (c.mealsLoggedToday.has("post-workout")) return null;
      if (c.hour < 17 || c.hour > 20) return null;
      return {
        key: "POST_WORKOUT_PROTEIN",
        priority: "normal",
        message: "Post-workout window — 2 boiled eggs or 100g paneer.",
      };
    },
  },
];

export const URGENT_KEYS: ReadonlySet<RuleKey> = new Set<RuleKey>([
  "WORKOUT_MISSED",
  "WEIGHT_DROP_FAST",
]);
