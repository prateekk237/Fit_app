/**
 * Streak = consecutive days with at least one food log, ending today
 * (if there's a log today) or yesterday (grace period — log before midnight
 * still counts as "alive"). Reset to 0 if neither today nor yesterday.
 */
import { prisma } from "@/lib/db";

export async function computeStreak(userId: string, today: string): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ d: Date }>>`
    SELECT DISTINCT log_date AS d
    FROM food_logs
    WHERE user_id = ${userId}::uuid AND log_date <= ${today}::date
    ORDER BY log_date DESC
    LIMIT 400
  `;
  if (rows.length === 0) return 0;

  const todayMs = Date.parse(`${today}T00:00:00Z`);
  const dayMs = 24 * 60 * 60 * 1000;

  // Normalize each row to midnight UTC ms for comparison.
  const dates = rows.map((r) => {
    if (typeof r.d === "string") return Date.parse(`${r.d}T00:00:00Z`);
    return Date.UTC(r.d.getUTCFullYear(), r.d.getUTCMonth(), r.d.getUTCDate());
  });

  // Newest log is either today or yesterday; otherwise streak broken.
  let anchor = dates[0]!;
  if (anchor !== todayMs && anchor !== todayMs - dayMs) return 0;

  let streak = 1;
  for (let i = 1; i < dates.length; i++) {
    const d = dates[i]!;
    if (d === anchor - dayMs) {
      streak += 1;
      anchor = d;
    } else {
      break;
    }
  }
  return streak;
}
