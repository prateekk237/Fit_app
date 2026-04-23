import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const mem = process.memoryUsage();
  return NextResponse.json({
    status: "ok",
    memory_mb: Math.round(mem.rss / (1024 * 1024)),
    uptime_s: Math.round(process.uptime()),
  });
}
