import sharp from "sharp";

/**
 * Compress + auto-rotate to a size that fits in an OpenAI-style inline
 * base64 image (< 180 KB). Llama-4 Maverick wants ≤ 896 px on the longer
 * edge at quality 80.
 */
export async function compressForAI(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // respect EXIF orientation
    .resize(896, 896, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80, mozjpeg: true })
    .toBuffer();
}

export async function toDataUrl(buffer: Buffer, mime = "image/jpeg"): Promise<string> {
  // Single-line base64 (no 76-char wrapping) per NIM requirements.
  const b64 = buffer.toString("base64");
  return `data:${mime};base64,${b64}`;
}
