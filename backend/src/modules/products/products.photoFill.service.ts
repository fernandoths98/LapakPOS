import Anthropic from "@anthropic-ai/sdk";
import { PhotoFillResponse } from "@lapak/shared";
import { aiEnabled } from "../../config/env";
import { AppError, badRequest } from "../../utils/errors";
import { generateStructured, JsonSchema } from "../recap/claudeClient";

/**
 * Reuses `generateStructured`'s forced-tool-use plumbing from the recap
 * module (see `recap/claudeClient.ts`) rather than duplicating the SDK-calling
 * code — this is the only file in `products/` that talks to Claude.
 */

/**
 * Anthropic's vision content block only accepts these four media types (see
 * `ImageBlockParam.Source["media_type"]` in the installed SDK's
 * `resources/messages.d.ts`) — notably NOT `image/heic`, which
 * `products.photo.ts` otherwise accepts for plain photo storage. A HEIC
 * "Snap to fill" photo therefore can't go through the vision call at all;
 * that's a real, honest limitation reported back as a 400, not silently
 * dropped.
 */
const SUPPORTED_VISION_MIME_TYPES: Record<string, "image/jpeg" | "image/png" | "image/gif" | "image/webp"> = {
  "image/jpeg": "image/jpeg",
  "image/jpg": "image/jpeg",
  "image/png": "image/png",
  "image/gif": "image/gif",
  "image/webp": "image/webp",
};

const PHOTO_FILL_SCHEMA: JsonSchema = {
  type: "object",
  properties: {
    name: {
      type: ["string", "null"],
      description: "The product's name exactly as printed on the packet, or null if not confidently readable in the photo.",
    },
    size: {
      type: ["string", "null"],
      description:
        'The package size as printed — weight, volume or count (e.g. "250 ml", "1 kg", "isi 10") — or null if not confidently readable.',
    },
    barcode: {
      type: ["string", "null"],
      description: "The barcode number as printed/visible under the barcode lines, or null if not visible or not confidently legible.",
    },
  },
  required: ["name", "size", "barcode"],
  additionalProperties: false,
};

const SYSTEM_PROMPT =
  "You read photos of Indonesian warung (corner shop) product packaging for a POS app's \"Snap to fill\" feature. " +
  "From the photo, extract ONLY what is clearly and confidently visible: the product name as printed, the package " +
  "size (weight/volume/count), and the barcode number if visible and legible. If a field isn't confidently " +
  "readable — blurry, cropped out, glare, not present — return null for it rather than guessing; a wrong guess is " +
  "worse than a blank field the cashier fills in by hand. You are never asked for a price and must not invent one.";

/**
 * POST /api/products/photo-fill — vision call that extracts {name, size,
 * barcode} from a product-packet photo. Each field is independently
 * nullable when Claude isn't confident it read it correctly.
 *
 * Throws a real `AppError` (never a fabricated 200) in two honest-failure
 * cases: `!aiEnabled` (400 — AI photo-fill isn't configured on this
 * backend) and an unsupported image mime type for vision (400). A live
 * Claude call that itself fails (network, rate limit, malformed response)
 * also surfaces as a clear error (502) rather than a silent empty result.
 */
export async function photoFillProduct(imageBase64: string, mimeType: string): Promise<PhotoFillResponse> {
  if (!aiEnabled) {
    throw badRequest("AI photo-fill isn't available yet: ANTHROPIC_API_KEY is not configured on the backend");
  }
  if (!imageBase64) {
    throw badRequest("imageBase64 is required");
  }
  const mediaType = SUPPORTED_VISION_MIME_TYPES[mimeType.toLowerCase()];
  if (!mediaType) {
    throw badRequest(`Unsupported image type for photo-fill: ${mimeType}. Use JPEG, PNG, GIF or WebP.`);
  }

  const messages: Anthropic.MessageParam[] = [
    {
      role: "user",
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: imageBase64 } },
        { type: "text", text: "Extract this product packet's name, package size, and barcode." },
      ],
    },
  ];

  try {
    return await generateStructured<PhotoFillResponse>({
      system: SYSTEM_PROMPT,
      messages,
      jsonSchema: PHOTO_FILL_SCHEMA,
      toolName: "emit_photo_fill",
      maxTokens: 256,
    });
  } catch (err) {
    // `!aiEnabled` was already checked above, so any error reaching here is a
    // genuine live-call failure (network, rate limit, malformed tool input) —
    // report it plainly rather than returning a fake-successful empty result.
    // eslint-disable-next-line no-console
    console.error("Claude photo-fill call failed.", err);
    throw new AppError(502, "ai_unavailable", "Couldn't reach the AI photo-fill service. Try again.");
  }
}
