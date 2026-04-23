import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { getLocalDateUTC } from "@/lib/time";
import { savePhoto, photoUrl } from "@/lib/uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const typeSchema = z.enum(["body", "face"]);
const MAX_BYTES = 15 * 1024 * 1024;

/**
 * GET /api/progress-photos
 *   Returns every weight_log row that has at least one photo, newest first.
 *   Each entry is { date, weightKg, body, face } where body/face are
 *   /api/photos/:name URLs (or null).
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rows = await prisma.weightLog.findMany({
    where: {
      userId: session.userId,
      OR: [{ photoUrl: { not: null } }, { facePhotoUrl: { not: null } }],
    },
    orderBy: { logDate: "desc" },
    take: 365,
  });

  return NextResponse.json({
    photos: rows.map((r) => ({
      logId: r.id.toString(),
      date:
        typeof r.logDate === "string"
          ? r.logDate
          : r.logDate.toISOString().slice(0, 10),
      weightKg: Number(r.weightKg),
      body: photoUrl(r.photoUrl),
      face: photoUrl(r.facePhotoUrl),
    })),
  });
}

/**
 * POST /api/progress-photos  (multipart/form-data)
 *   image   — required
 *   type    — "body" | "face" (required)
 *   date    — YYYY-MM-DD (optional; defaults to user's local today)
 *
 *   Saves the image to disk via sharp, upserts a weight_log row for the
 *   given date, and updates photo_url / face_photo_url accordingly. If
 *   the row already has a weightKg, that value is preserved; otherwise
 *   the user's currentWeightKg is used as a placeholder so the NOT NULL
 *   constraint is satisfied.
 */
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart/form-data" }, { status: 400 });
  }

  const file = form.get("image");
  const typeRaw = form.get("type");
  const dateRaw = form.get("date");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "No image uploaded" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image too large (max 15 MB)" }, { status: 413 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: `Unsupported type: ${file.type}` }, { status: 415 });
  }
  const typeParse = typeSchema.safeParse(typeRaw);
  if (!typeParse.success) {
    return NextResponse.json({ error: "type must be 'body' or 'face'" }, { status: 400 });
  }

  const user = await prisma.user.findUniqueOrThrow({ where: { id: session.userId } });
  const logDate = typeof dateRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dateRaw)
    ? new Date(`${dateRaw}T00:00:00Z`)
    : getLocalDateUTC(user.timezone);

  const buf = Buffer.from(await file.arrayBuffer());
  const saved = await savePhoto(buf, typeParse.data === "face" ? "face" : "body");

  const photoFields =
    typeParse.data === "face"
      ? { facePhotoUrl: saved.filename }
      : { photoUrl: saved.filename };

  const existing = await prisma.weightLog.findUnique({
    where: { userId_logDate: { userId: user.id, logDate } },
  });

  const row = existing
    ? await prisma.weightLog.update({
        where: { userId_logDate: { userId: user.id, logDate } },
        data: photoFields,
      })
    : await prisma.weightLog.create({
        data: {
          userId: user.id,
          logDate,
          weightKg: user.currentWeightKg,
          ...photoFields,
        },
      });

  return NextResponse.json(
    {
      logId: row.id.toString(),
      date:
        typeof row.logDate === "string"
          ? row.logDate
          : row.logDate.toISOString().slice(0, 10),
      type: typeParse.data,
      url: photoUrl(saved.filename),
      bytes: saved.bytes,
      width: saved.width,
      height: saved.height,
    },
    { status: 201 },
  );
}
