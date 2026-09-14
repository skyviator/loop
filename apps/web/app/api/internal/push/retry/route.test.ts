import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ dispatchPendingPush: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/push/server", () => ({
  dispatchPendingPush: mocks.dispatchPendingPush,
  PUSH_DELIVERY_BATCH_SIZE: 25,
}));

import * as route from "./route";

const TEST_WORKER_SECRET = "test-only-worker-secret-that-is-not-a-credential";

function request(options: { authorization?: string; body?: string; query?: string; cookie?: string } = {}) {
  const headers = new Headers({ "content-type": "application/json" });
  if (options.authorization) headers.set("authorization", options.authorization);
  if (options.cookie) headers.set("cookie", options.cookie);
  return new Request(`http://localhost/api/internal/push/retry${options.query ?? ""}`, {
    method: "POST",
    headers,
    body: options.body ?? "{}",
  });
}

describe("push retry worker route", () => {
  beforeEach(() => {
    process.env.PUSH_WORKER_SECRET = TEST_WORKER_SECRET;
    mocks.dispatchPendingPush.mockResolvedValue({ claimed: 0, succeeded: 0, temporaryFailures: 0, permanentFailures: 0 });
  });

  afterEach(() => {
    delete process.env.PUSH_WORKER_SECRET;
    vi.clearAllMocks();
  });

  it("rejects GET without caching and accepts only the dedicated worker credential", async () => {
    const get = route.GET();
    expect(get.status).toBe(405);
    expect(get.headers.get("cache-control")).toContain("no-store");

    const missing = await route.POST(request({ cookie: "authenticated-user=session" }));
    const wrong = await route.POST(request({ authorization: "Bearer wrong-worker-value" }));

    expect(missing.status).toBe(401);
    expect(wrong.status).toBe(401);
    expect(missing.headers.get("cache-control")).toContain("no-store");
    expect(await missing.json()).toEqual({ ok: false });
    expect(mocks.dispatchPendingPush).not.toHaveBeenCalled();
  });

  it("dispatches one bounded batch without returning queue or tenant data", async () => {
    const result = await route.POST(request({ authorization: `Bearer ${TEST_WORKER_SECRET}` }));

    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toContain("no-store");
    expect(await result.json()).toEqual({ ok: true });
    expect(mocks.dispatchPendingPush).toHaveBeenCalledOnce();
    expect(mocks.dispatchPendingPush).toHaveBeenCalledWith(25);
  });

  it("rejects selectors in either the query string or request body", async () => {
    const authorization = `Bearer ${TEST_WORKER_SECRET}`;
    const query = await route.POST(request({ authorization, query: "?school_id=other-school" }));
    const body = await route.POST(request({ authorization, body: '{"event_id":"other-event"}' }));

    expect(query.status).toBe(400);
    expect(body.status).toBe(400);
    expect(mocks.dispatchPendingPush).not.toHaveBeenCalled();
  });

  it("returns a generic retryable failure without exposing dispatcher details", async () => {
    mocks.dispatchPendingPush.mockRejectedValueOnce(new Error("private database detail"));
    const result = await route.POST(request({ authorization: `Bearer ${TEST_WORKER_SECRET}` }));

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ ok: false });
  });
});
