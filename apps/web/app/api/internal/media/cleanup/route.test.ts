import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cleanupPendingMedia: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/media/cleanup", () => ({
  cleanupPendingMedia: mocks.cleanupPendingMedia,
  MEDIA_CLEANUP_BATCH_SIZE: 10,
}));

import * as route from "./route";

const TEST_WORKER_SECRET = "test-only-media-cleanup-worker-secret-value";

function request(options: { authorization?: string; body?: string; query?: string; cookie?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.authorization) headers.set("authorization", options.authorization);
  if (options.cookie) headers.set("cookie", options.cookie);
  return new Request(`http://localhost/api/internal/media/cleanup${options.query ?? ""}`, {
    method: "POST",
    headers,
    body: options.body ?? "{}",
  });
}

describe("media cleanup worker route", () => {
  beforeEach(() => {
    process.env.MEDIA_CLEANUP_WORKER_SECRET = TEST_WORKER_SECRET;
    mocks.cleanupPendingMedia.mockResolvedValue({ claimed: 0, completed: 0, retries: 0 });
  });

  afterEach(() => {
    delete process.env.MEDIA_CLEANUP_WORKER_SECRET;
    vi.clearAllMocks();
  });

  it("rejects GET and accepts only the dedicated cleanup credential", async () => {
    expect(route.GET().status).toBe(405);
    const missing = await route.POST(request({ cookie: "authenticated-user=session" }));
    const wrong = await route.POST(request({ authorization: "Bearer wrong-worker-value" }));
    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(missing.headers.get("cache-control")).toContain("no-store");
    expect(await missing.json()).toEqual({ ok: false });
    expect(mocks.cleanupPendingMedia).not.toHaveBeenCalled();
  });

  it("runs one bounded batch without returning tenant or object data", async () => {
    const result = await route.POST(request({ authorization: `Bearer ${TEST_WORKER_SECRET}` }));
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ ok: true });
    expect(mocks.cleanupPendingMedia).toHaveBeenCalledWith(10);
  });

  it("rejects selectors in the query string or body", async () => {
    const authorization = `Bearer ${TEST_WORKER_SECRET}`;
    expect((await route.POST(request({ authorization, query: "?school_id=other" }))).status).toBe(400);
    expect((await route.POST(request({ authorization, body: '{"asset_id":"other"}' }))).status).toBe(400);
    expect(mocks.cleanupPendingMedia).not.toHaveBeenCalled();
  });

  it("returns only a generic retryable error", async () => {
    mocks.cleanupPendingMedia.mockRejectedValueOnce(new Error("private database or provider detail"));
    const result = await route.POST(request({ authorization: `Bearer ${TEST_WORKER_SECRET}` }));
    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ ok: false });
  });
});
