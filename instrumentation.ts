/**
 * Next.js server-runtime startup hook. We only run cron on the Node.js
 * runtime (not Edge). Enabled via FIT_ENABLE_CRON=true.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.FIT_ENABLE_CRON !== "true") return;
  const { startCronOnce } = await import("@/lib/alerts/cron");
  const out = startCronOnce();
  if (!out.started) {
    console.log("[instrumentation] cron not started:", out.reason);
  }
}
