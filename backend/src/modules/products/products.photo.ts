import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { badRequest } from "../../utils/errors";

/**
 * Local-disk product photo storage: a deliberate, real, simple
 * implementation appropriate for a single-instance deployment (this
 * sandbox has no cloud credentials to build against). Swapping to S3/GCS
 * later is a config change to this one function — write the bytes
 * elsewhere and return that URL instead — not a rewrite of any caller.
 */
export const UPLOADS_ROOT = path.join(__dirname, "../../../uploads");
export const PRODUCT_PHOTOS_DIR = path.join(UPLOADS_ROOT, "products");

const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
};

export function ensureUploadsDirExists(): void {
  fs.mkdirSync(PRODUCT_PHOTOS_DIR, { recursive: true });
}

export interface SavedProductPhoto {
  imageUrl: string;
}

/** Decodes a base64 product photo and writes it to backend/uploads/products/<uuid>.<ext>. */
export function saveProductPhoto(imageBase64: string, mimeType: string): SavedProductPhoto {
  const ext = MIME_EXTENSIONS[mimeType.toLowerCase()];
  if (!ext) {
    throw badRequest(`Unsupported image type: ${mimeType}`);
  }
  if (!imageBase64) {
    throw badRequest("imageBase64 is required");
  }

  let buffer: Buffer;
  try {
    buffer = Buffer.from(imageBase64, "base64");
  } catch {
    throw badRequest("imageBase64 is not valid base64");
  }
  if (buffer.length === 0) {
    throw badRequest("imageBase64 decoded to an empty file");
  }

  ensureUploadsDirExists();
  const fileName = `${randomUUID()}.${ext}`;
  fs.writeFileSync(path.join(PRODUCT_PHOTOS_DIR, fileName), buffer);

  return { imageUrl: `/uploads/products/${fileName}` };
}
