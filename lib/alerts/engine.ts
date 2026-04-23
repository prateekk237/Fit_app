import { Prisma } from "@prisma/client";
import webpush from "web-push";
import { prisma } from "@/lib/db";
import {
  getLocalDate,
  getLocalDateUTC,
  getLocalHour,
  getLocalIsoDayOfWeek,
  getLocalMinute,
} from "@/lib/time";
import { computeStreak } from "@/lib/streak";
import { RULES, URGENT_KEYS, type RuleContext, type RuleHit } from "./rules";

export interface EvaluateOptions {
  dryRun?: boolean;
  respectQuietHours?: boolean;
  /** Override time-of-day — test helper */
  mockNow?: Date;
}

export interface EvaluateResult {
  at: string;
  userId: string;
  hour: number;
  quietHours: boolean;
  fired: RuleHit[];
  skipped: Array<{ key: string; reason: string }>;
  delivered: number;
}

function vapidConfigured() {
  return (
    !!process.env.VAPID_PUBLIC_KEY &&
    !!process.env.VAPID_PRIVATE_KEY &&
    !!process.env.VAPID_SUBJECT
  );
}
function configureVapid() {
  if (!vapidConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  return true;
}

export async function evaluateForUser(
  userId: string,
  opts: EvaluateOptions = {},
): Promise<EvaluateResult> {
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  const now = opts.mockNow ?? new Date();
  const ctx = await buildContext(user, now);

  const quiet =
    (opts.respectQuietHours ?? true) && (ctx.hour >= 22 || ctx.hour < 7);

  const fired: RuleHit[] = [];
  const skipped: Array<{ key: string; reason: string }> = [];

  for (const rule of RULES) {
    let hit: RuleHit | null = null;
    try {
      hit = rule.evaluate(ctx);
    } catch (err) {
      skipped.push({ key: rule.key, reason: `eval-error: ${(err as Error).message}` });
      continue;
    }
    if (!hit) continue;
    if (quiet && !URGENT_KEYS.has(hit.key)) {
      skipped.push({ key: hit.key, reason: "quiet-hours" });
      continue;
    }
    // Dedupe: don't fire the same (user, dedupeKey, logDate) twice in one local day.
    const dedupeKey = hit.dedupeKey ?? hit.key;
    const alreadySent = await prisma.alertSent.findFirst({
      where: {
        userId,
        type: dedupeKey,
        sentAt: { gte: getLocalDateUTC(user.timezone, now) },
      },
    });
    if (alreadySent) {
      skipped.push({ key: hit.key, reason: "already-sent-today" });
      continue;
    }
    fired.push(hit);
  }

  let delivered = 0;
  if (!opts.dryRun && fired.length > 0) {
    const vapid = configureVapid();
    for (const hit of fired) {
      await prisma.alertSent.create({
        data: {
          userId,
          type: hit.dedupeKey ?? hit.key,
          message: hit.message,
          dataJson: (hit.data ?? {}) as Prisma.InputJsonValue,
        },
      });
      if (!vapid) continue;
      try {
        const subs = await prisma.pushSubscription.findMany({ where: { userId } });
        const payload = JSON.stringify({
          title: "Fit",
          body: hit.message,
          tag: hit.key,
          url: "/",
          priority: hit.priority,
        });
        for (const s of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: s.endpoint, keys: { p256dh: s.p256dhKey, auth: s.authKey } },
              payload,
              { TTL: 60 * 60, urgency: hit.priority === "urgent" ? "high" : "normal" },
            );
            delivered += 1;
          } catch (err) {
            const status = (err as { statusCode?: number }).statusCode;
            if (status === 404 || status === 410) {
              // Subscription gone — clean up.
              await prisma.pushSubscription.delete({ where: { id: s.id } });
            }
          }
        }
      } catch {
        /* non-fatal — alert is already persisted */
      }
    }
  }

  return {
    at: now.toISOString(),
    userId,
    hour: ctx.hour,
    quietHours: quiet,
    fired,
    skipped,
    delivered,
  };
}

async function buildContext(
  user: Awaited<ReturnType<typeof prisma.user.findUniqueOrThrow>>,
  now: Date,
): Promise<RuleContext> {
  const today = getLocalDate(user.timezone, now);
  const todayUTC = getLocalDateUTC(user.timezone, now);
  const dayOfWeek = getLocalIsoDayOfWeek(user.timezone, now);
  const hour = getLocalHour(user.timezone, now);
  const minute = getLocalMinute(user.timezone, now);

  const ninety = new Date(todayUTC);
  ninety.setUTCDate(ninety.getUTCDate() - 90);

  const [
    foodAgg,
    foodTypes,
    waterAgg,
    latestWater,
    lastFood,
    workoutToday,
    workoutLog,
    weightWindow,
    sugarRows,
    fiberRows,
    vegTodayCheck,
  ] = await Promise.all([
    prisma.foodLog.aggregate({
      where: { userId: user.id, logDate: todayUTC },
      _sum: { calories: true, proteinG: true, carbsG: true, fatG: true, fiberG: true },
      _count: { _all: true },
    }),
    prisma.foodLog.findMany({
      where: { userId: user.id, logDate: todayUTC },
      select: { mealType: true, foodName: true },
    }),
    prisma.waterLog.aggregate({
      where: { userId: user.id, logDate: todayUTC },
      _sum: { amountMl: true },
    }),
    prisma.waterLog.findFirst({
      where: { userId: user.id, logDate: todayUTC },
      orderBy: { loggedAt: "desc" },
    }),
    prisma.foodLog.findFirst({
      where: { userId: user.id },
      orderBy: { logDate: "desc" },
    }),
    prisma.workout.findFirst({ where: { dayNumber: dayOfWeek } }),
    prisma.workoutLog.findFirst({
      where: { userId: user.id, logDate: todayUTC },
      orderBy: { startedAt: "desc" },
    }),
    prisma.weightLog.findMany({
      where: { userId: user.id, logDate: { gte: ninety } },
      orderBy: { logDate: "asc" },
      select: { logDate: true, weightKg: true },
    }),
    prisma.foodLog.groupBy({
      by: ["logDate"],
      where: { userId: user.id, logDate: { gte: addDays(todayUTC, -6) } },
    }),
    prisma.foodLog.groupBy({
      by: ["logDate"],
      where: { userId: user.id, logDate: { gte: addDays(todayUTC, -6) } },
      _sum: { fiberG: true },
    }),
    prisma.foodLog.findFirst({
      where: {
        userId: user.id,
        logDate: todayUTC,
        food: { isVeg: false },
      },
    }),
  ]);

  const streakDays = await computeStreak(user.id, today);

  const mealTypes = new Set(
    foodTypes.map((r) => r.mealType).filter((v): v is string => typeof v === "string"),
  );

  const latestAgo = latestWater
    ? Math.round((now.getTime() - latestWater.loggedAt.getTime()) / 60_000)
    : null;

  const weights = weightWindow.map((w) => Number(w.weightKg));
  const weightAvg7 = avg(weights.slice(-7));
  const weightAvg14 = avg(weights.slice(-14));
  const weightDropLast2Weeks =
    weights.length >= 14 ? weights[weights.length - 14]! - weights[weights.length - 1]! : null;

  // "Sugar days" heuristic: a day with any logged chai/biryani/naan/aloo paratha.
  const sugarFoods = ["chai with sugar", "nimbu pani sweetened", "chicken biryani", "naan", "dates"];
  const sugarWindow = await prisma.foodLog.findMany({
    where: {
      userId: user.id,
      logDate: { gte: addDays(todayUTC, -6) },
      foodName: { in: sugarFoods },
    },
    select: { logDate: true },
  });
  const sugarSet = new Set(
    sugarWindow.map((r) =>
      typeof r.logDate === "string" ? r.logDate : r.logDate.toISOString().slice(0, 10),
    ),
  );
  let sugarDaysInARow = 0;
  for (let i = 0; i < 14; i++) {
    const d = addDays(todayUTC, -i).toISOString().slice(0, 10);
    if (sugarSet.has(d)) sugarDaysInARow += 1;
    else break;
  }

  const fiberShortfall = fiberRows.filter(
    (r) => (r._sum.fiberG ? Number(r._sum.fiberG) : 0) < 25,
  ).length;

  const ctx: RuleContext = {
    userId: user.id,
    today,
    dayOfWeek,
    hour,
    minute,
    targets: {
      calories: user.dailyCalorieTarget,
      proteinG: user.dailyProteinTargetG,
      carbsG: user.dailyCarbsTargetG,
      fatG: user.dailyFatTargetG,
      waterMl: user.dailyWaterTargetMl,
    },
    consumed: {
      calories: toNum(foodAgg._sum.calories),
      proteinG: toNum(foodAgg._sum.proteinG),
      carbsG: toNum(foodAgg._sum.carbsG),
      fatG: toNum(foodAgg._sum.fatG),
      fiberG: toNum(foodAgg._sum.fiberG),
      sugarG: 0,
      itemsLogged: foodAgg._count._all,
    },
    waterMl: waterAgg._sum.amountMl ?? 0,
    mealsLoggedToday: mealTypes,
    latestWaterAgoMin: latestAgo,
    todayWorkout: workoutToday
      ? {
          id: workoutToday.id,
          category: workoutToday.category,
          durationMin: workoutToday.durationMin,
        }
      : null,
    workoutCompletedToday: !!workoutLog?.completedAt,
    workoutInProgress: !!workoutLog && !workoutLog.completedAt,
    streakDays,
    lastFoodLogDate: lastFood
      ? typeof lastFood.logDate === "string"
        ? lastFood.logDate
        : lastFood.logDate.toISOString().slice(0, 10)
      : null,
    weightAvg7,
    weightAvg14,
    weightDropLast2Weeks,
    sugarDaysInARow,
    fiberShortfallDays: fiberShortfall,
    vegOnlyToday: !vegTodayCheck,
  };
  // Touch sugarRows so tooling doesn't flag an unused var if we reintroduce logic later.
  void sugarRows;
  return ctx;
}

function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  return Number(v);
}
function avg(xs: number[]): number | null {
  if (xs.length === 0) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
function addDays(d: Date, delta: number): Date {
  const out = new Date(d);
  out.setUTCDate(out.getUTCDate() + delta);
  return out;
}
