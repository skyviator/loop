import { afterEach, describe, expect, it, vi } from "vitest";

import { authCookieOptions } from "./cookie-options";

afterEach(() => vi.unstubAllEnvs());

describe("Supabase auth cookie options", () => {
  it("requires secure cookies in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(authCookieOptions()).toEqual({ secure: true });
  });

  it("allows local HTTP development", () => {
    vi.stubEnv("NODE_ENV", "development");
    expect(authCookieOptions()).toEqual({ secure: false });
  });
});
