import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createClientMock } = vi.hoisted(() => ({ createClientMock: vi.fn(() => ({})) }));
vi.mock("@supabase/supabase-js", () => ({ createClient: createClientMock }));

import { createLocalAdminClient, createServerAdminClient } from "./admin";

afterEach(() => {
  vi.unstubAllEnvs();
  createClientMock.mockClear();
});

function configure(url: string, secret = "sb_secret_test_only_placeholder") {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
  vi.stubEnv("SUPABASE_SECRET_KEY", secret);
}

describe("server-only Supabase administration", () => {
  it("accepts an HTTPS project endpoint for server-side staging operations", () => {
    configure("https://project.supabase.co");
    expect(createServerAdminClient()).toBeDefined();
    expect(createClientMock).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "sb_secret_test_only_placeholder",
      { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } },
    );
  });

  it("rejects a remote plaintext endpoint", () => {
    configure("http://supabase.internal:54321");
    expect(() => createServerAdminClient()).toThrow("Privileged server operation is unavailable.");
  });

  it("rejects a legacy or malformed privileged key", () => {
    configure("https://project.supabase.co", "legacy-key-placeholder");
    expect(() => createServerAdminClient()).toThrow("Privileged server operation is unavailable.");
  });

  it("keeps local invitation administration restricted to the local CLI endpoint", () => {
    configure("https://project.supabase.co");
    expect(() => createLocalAdminClient()).toThrow("Local privileged server operation is unavailable.");

    configure("http://127.0.0.1:54321");
    expect(createLocalAdminClient()).toBeDefined();
  });
});
