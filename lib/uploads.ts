/**
 * On-disk image storage. Upload dir is configurable via UPLOADS_DIR
 * (defaults to ./uploads in dev, /var/fit/uploads in prod per the
 * master plan). Files are normalized to JPEG with sharp (max 1800 px,
 * q=82) so we don't store phone-camera originals.
 *
 * We do not expose the directory via /public; a server route
 * /api/photos/[file] streams bytes only for the authenticated user.
 */
import { mkdir, writeFile, stat, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, basename } from "node:path";
import { randomUUID } from "node:crypto";
import sharp from "sharp";

const DEFAULT_DIR =
  process.env.NODE_ENV === "production"
    ? "/var/fit/uploads"
    : join(process.cwd(), "uploads");

export function uploadsDir(): string {
  return process.env.UPLOADS_DIR || DEFAULT_DIR;
}

async function ensureDir(): Promise<string> {
  const dir = uploadsDir();
  if (!existsSync(dir)) await mkdir(dir, { recursive: true });
  return dir;
}

export interface SaveResult {
  filename: string;   // sanitized basename — stored in DB
  bytes: number;
  width: number;
  height: number;
}

/** Read an uploaded Buffer, normalize via sharp, and save to disk. */
export async function savePhoto(input: Buffer, prefix = "photo"): Promise<SaveResult> {
  const dir = await ensureDir();
  const processed = sharp(input)
    .rotate()
    .resize(1800, 1800, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82, mozjpeg: true });
  const buf = await processed.toBuffer();
  const meta = await sharp(buf).metadata();

  const filename = `${prefix}-${randomUUID()}.jpg`;
  const full = join(dir, filename);
  await writeFile(full, buf);
  const s = await stat(full);
  return {
    filename,
    bytes: s.size,
    width: meta.width ?? 0,
    height: meta.height ?? 0,
  };
}

/**
 * Read a previously-saved photo. Refuses to read anything outside the
 * uploads directory (prevents traversal via ../../../etc/passwd).
 */
export async function readPhoto(name: string): Promise<Buffer> {
  const safe = basename(name); // strip any path components
  const dir = uploadsDir();
  const full = join(dir, safe);
  if (!full.startsWith(dir)) throw new Error("Path traversal rejected");
  return readFile(full);
}

export function photoUrl(filename: string | null | undefined): string | null {
  if (!filename) return null;
  return `/api/photos/${basename(filename)}`;
}
