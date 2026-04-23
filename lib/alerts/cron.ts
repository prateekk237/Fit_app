import cron from "node-cron";
import { prisma } from "@/lib/db";
import { evaluateForUser } from "./engine";

/**
 * Opt-in cron singleton. Runs every 15 minutes inside the Next.js
 * server process, evaluates rules for every user, and persists /
 * delivers alerts via Web Push. Only starts when FIT_ENABLE_CRON=true
 * so dev + CI stay quiet.
 *
 * Because Next.js in dev may hot-reload this module, we guard against
 * double-registering via a module-level flag.
 */
const g = globalThis as unknown as { __fitCronStarted?: boolean };

export function startCronOnce(): { started: boolean; reason?: string } {
  if (g.__fitCronStarted) return { started: false, reason: "already-started" };
  if (process.env.FIT_ENABLE_CRON !== "true") {
    return { started: false, reason: "FIT_ENABLE_CRON!=true" };
  }
  if (
    !process.env.VAPID_PUBLIC_KEY ||
    !process.env.VAPID_PRIVATE_KEY ||
    !process.env.VAPID_SUBJECT
  ) {
    return { started: false, reason: "VAPID keys missing" };
  }

  // Every 15 min, on the minute.
  cron.schedule("*/15 * * * *", async () => {
    try {
      const users = await prisma.user.findMany({ select: { id: true } });
      for (const u of users) {
        try {
          await evaluateForUser(u.id);
        } catch (err) {
          console.error("[cron] evaluate failed for", u.id, err);
        }
      }
    } catch (err) {
      console.error("[cron] tick failed", err);
    }
  });

  g.__fitCronStarted = true;
  console.log("[cron] Fit alerts cron started (every 15m)");
  return { started: true };
}
