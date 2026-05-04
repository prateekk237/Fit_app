/**
 * Photo storage abstraction. Uses Cloudflare R2 when R2_BUCKET_NAME is
 * set (production on Vercel), otherwise falls back to the local disk
 * (dev + Hostinger VPS path). The DB only ever stores a filename; the
 * /api/photos/[file] route resolves it through whichever backend is
 * active so the schema doesn't change between environments.
 */
import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";
import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const DEFAULT_DIR =
  process.env.NODE_ENV === "production"
    ? "/var/fit/uploads"
    : join(process.cwd(), "uploads");

export function uploadsDir(): string {
  return process.env.UPLOADS_DIR || DEFAULT_DIR;
}

function r2Configured(): boolean {
  return !!(
    process.env.R2_BUCKET_NAME &&
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY
  );
}

let r2Client: S3Client | null = null;
function r2(): S3Client {
  if (r2Client) return r2Client;
  r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
    },
  });
  return r2Client;
}

export interface SaveResult {
  filename: string;   // sanitized basename — stored in DB
  bytes: number;
  width: number;
  height: number;
  backend: "r2" | "disk";
}

async function ensureDir(): Promise<string> {
  const dir = uploadsDir();
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  return dir;
}

/** Read an uploaded Buffer, normalize via sharp, and persist. */
export async function savePhoto(input: Buffer, prefix = "photo"): Promise<SaveResult> {
  const processed = sharp(input)
    .rotate()
    .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true });
  const buf = await processed.toBuffer();
  const meta = await sharp(buf).metadata();

  const filename = `${prefix}-${randomUUID()}.jpg`;

  if (r2Configured()) {
    await r2().send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: filename,
        Body: buf,
        ContentType: "image/jpeg",
        // 7-day cacheable; SW can hold longer.
        CacheControl: "private, max-age=604800",
      }),
    );
    return {
      filename,
      bytes: buf.length,
      width: meta.width ?? 0,
      height: meta.height ?? 0,
      backend: "r2",
    };
  }

  // Disk fallback
  const dir = await ensureDir();
  const full = join(dir, filename);
  await writeFile(full, buf);
  const s = await stat(full);
  return {
    filename,
    bytes: s.size,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    backend: "disk",
  };
}

/** Read a previously-saved photo. Refuses path-traversal (basename'd). */
export async function readPhoto(name: string): Promise<{ body: Buffer; contentType: string }> {
  const safe = basename(name);

  if (r2Configured()) {
    const out = await r2().send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME!,
        Key: safe,
      }),
    );
    const body = Buffer.from(await out.Body!.transformToByteArray());
    return { body, contentType: out.ContentType ?? "image/jpeg" };
  }

  const dir = uploadsDir();
  const full = join(dir, safe);
  if (!full.startsWith(dir)) throw new Error("Path traversal rejected");
  const body = await readFile(full);
  return { body, contentType: "image/jpeg" };
}

export function photoUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  return `/api/photos/${basename(filename)}`;
}

export function isR2Backend(): boolean {
  return r2Configured();
}
