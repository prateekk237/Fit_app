/**
 * Generate all PWA icons from a single SVG source. Run once, commit the PNGs.
 *   pnpm tsx scripts/generate-icons.ts
 *
 * Produces:
 *   public/icons/icon-192.png         (regular)
 *   public/icons/icon-512.png         (regular)
 *   public/icons/icon-maskable-192.png   (80% safe zone)
 *   public/icons/icon-maskable-512.png
 *   public/icons/apple-touch-icon.png (180x180)
 *   public/favicon.png                (32x32)
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

const OUT = join(process.cwd(), "public", "icons");
const PUBLIC = join(process.cwd(), "public");

// Indigo → violet gradient + "F" letter. Same shape as a dumbbell-agnostic
// "Fit" launcher icon.
const regularSvg = (size: number) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#4338ca"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.22)}" fill="url(#g)"/>
  <text x="50%" y="${Math.round(size * 0.7)}" text-anchor="middle"
        font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
        font-size="${Math.round(size * 0.62)}" font-weight="800"
        fill="#ffffff" letter-spacing="-${Math.round(size * 0.02)}">F</text>
</svg>`;

// Maskable: fill the whole canvas in gradient; icon content centered in
// the inner 80% safe zone so adaptive-icon platforms don't crop it.
const maskableSvg = (size: number) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#6366f1"/>
      <stop offset="100%" stop-color="#4338ca"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" fill="url(#g)"/>
  <text x="50%" y="${Math.round(size * 0.66)}" text-anchor="middle"
        font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif"
        font-size="${Math.round(size * 0.45)}" font-weight="800"
        fill="#ffffff" letter-spacing="-${Math.round(size * 0.01)}">F</text>
</svg>`;

async function emit(svg: string, size: number, filename: string, root: string = OUT) {
  const buf = await sharp(Buffer.from(svg)).resize(size, size).png().toBuffer();
  await writeFile(join(root, filename), buf);
  console.log(`  ✓ ${filename} (${size}×${size}, ${buf.length} B)`);
}

async function main() {
  await mkdir(OUT, { recursive: true });

  await emit(regularSvg(192), 192, "icon-192.png");
  await emit(regularSvg(512), 512, "icon-512.png");
  await emit(maskableSvg(192), 192, "icon-maskable-192.png");
  await emit(maskableSvg(512), 512, "icon-maskable-512.png");
  await emit(regularSvg(180), 180, "apple-touch-icon.png");
  await emit(regularSvg(32), 32, "favicon.png", PUBLIC);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
