import { afterEach, describe, expect, it, vi } from "vitest";

import { configuredApplicationOrigin, safeAuthDestination } from "./auth-redirect";

const origin = "https://loop.lk";

afterEach(() => vi.unstubAllEnvs());

describe("auth callback destinations", () => {
  it.each(["/app", "/parent", "/teacher", "/school", "/reset-password"])(
    "allows the internal path %s",
    (path) => expect(safeAuthDestination(path, origin)).toBe(path),
  );

  it("preserves internal query strings and fragments", () => {
    expect(safeAuthDestination("/parent?child=child-id#today", origin)).toBe("/parent?child=child-id#today");
  });

  it.each([
    "//evil.example",
    "/\\evil.example",
    "https://evil.example",
    "http://evil.example",
    "%2F%2Fevil.example",
    "/%2Fevil.example",
    "/%5Cevil.example",
    "%252F%252Fevil.example",
    "/%255Cevil.example",
  ])("falls back for the unsafe destination %s", (path) => {
    expect(safeAuthDestination(path, origin)).toBe("/app");
  });

  it("uses only the configured application origin", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://loop.lk");
    expect(configuredApplicationOrigin()).toBe(origin);
  });

  it("allows local HTTP development", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
    expect(configuredApplicationOrigin()).toBe("http://127.0.0.1:3000");
  });

  it.each([undefined, "http://loop.lk", "https://loop.lk/auth/callback", "https://user@loop.lk"])(
    "rejects an unsafe application origin %s",
    (value) => {
      if (value === undefined) vi.stubEnv("NEXT_PUBLIC_SITE_URL", "");
      else vi.stubEnv("NEXT_PUBLIC_SITE_URL", value);
      expect(() => configuredApplicationOrigin()).toThrow(/Auth callback is not configured/);
    },
  );
});
