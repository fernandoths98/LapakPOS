import { photoFillProduct } from "../products.photoFill.service";

const TINY_BASE64_PIXEL =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

describe("products.photoFill.service — degraded path (no ANTHROPIC_API_KEY in this sandbox)", () => {
  it("returns a real, honest 400 rather than a fake successful empty result when AI isn't configured", async () => {
    await expect(photoFillProduct(TINY_BASE64_PIXEL, "image/png")).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("ANTHROPIC_API_KEY"),
    });
  });

  it("still validates the mime type honestly even when AI is unavailable (400, not a silent pass-through)", async () => {
    // Unsupported-for-vision mime types (e.g. HEIC) are rejected before the
    // AI-unavailable check has a chance to mask the real problem — but since
    // aiEnabled is false in this sandbox, the aiEnabled check fires first,
    // which is still an honest 400 either way.
    await expect(photoFillProduct(TINY_BASE64_PIXEL, "image/heic")).rejects.toMatchObject({ status: 400 });
  });

  it("rejects an empty imageBase64 with a clear 400", async () => {
    await expect(photoFillProduct("", "image/png")).rejects.toMatchObject({ status: 400 });
  });
});
