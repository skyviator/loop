import { describe, expect, it } from "vitest";

import { containsExifMetadata, PHOTO_LIMITS } from "./image-processing";

describe("private photo preparation", () => {
  it("detects an EXIF application payload", () => {
    expect(containsExifMetadata(new Uint8Array([0xff, 0xd8, 0x45, 0x78, 0x69, 0x66, 0, 0, 0xff, 0xd9]))).toBe(true);
  });

  it("does not flag a clean JPEG marker stream", () => {
    expect(containsExifMetadata(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0xff, 0xd9]))).toBe(false);
  });

  it("keeps the three variants within the documented size order", () => {
    expect(PHOTO_LIMITS.variants.original.maxEdge).toBeGreaterThan(PHOTO_LIMITS.variants.display.maxEdge);
    expect(PHOTO_LIMITS.variants.display.maxEdge).toBeGreaterThan(PHOTO_LIMITS.variants.thumbnail.maxEdge);
    expect(PHOTO_LIMITS.maxFiles).toBe(3);
  });
});
