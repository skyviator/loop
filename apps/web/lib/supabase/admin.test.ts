import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { createLocalAdminClient, createServerAdminClient } from "./admin";

afterEach(() => {
  vi.unstubAllEnvs();
});

function configure(url: string) {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "not-a-real-secret");
}

describe("server-only Supabase administration", () => {
  it("accepts an HTTPS project endpoint for server-side staging operations", () => {
    configure("https://project.supabase.co");
    expect(createServerAdminClient()).toBeDefined();
  });

  it("rejects a remote plaintext endpoint", () => {
    configure("http://supabase.internal:54321");
    expect(() => createServerAdminClient()).toThrow("Privileged server operation is unavailable.");
  });

  it("keeps local invitation administration restricted to the local CLI endpoint", () => {
    configure("https://project.supabase.co");
    expect(() => createLocalAdminClient()).toThrow("Local privileged server operation is unavailable.");

    configure("http://127.0.0.1:54321");
    expect(createLocalAdminClient()).toBeDefined();
  });
});
