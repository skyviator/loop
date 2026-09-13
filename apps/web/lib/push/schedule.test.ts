import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  dispatchPendingPush: vi.fn(),
  waitUntil: vi.fn(),
}));

vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("@vercel/functions", () => ({ waitUntil: mocks.waitUntil }));
vi.mock("@/lib/push/server", () => ({ dispatchPendingPush: mocks.dispatchPendingPush }));
vi.mock("server-only", () => ({}));

import { schedulePushDispatch, waitUntilPushDispatch } from "./schedule";

describe("push dispatch scheduling", () => {
  beforeEach(() => vi.clearAllMocks());

  it("passes in-flight server work directly to Vercel waitUntil without awaiting it", async () => {
    let finish!: () => void;
    const slowDispatch = new Promise<void>((resolve) => { finish = resolve; });
    mocks.dispatchPendingPush.mockReturnValueOnce(slowDispatch);

    expect(waitUntilPushDispatch()).toBeUndefined();
    expect(mocks.waitUntil).toHaveBeenCalledOnce();

    const registeredWork = mocks.waitUntil.mock.calls[0]?.[0] as Promise<void>;
    await vi.waitFor(() => expect(mocks.dispatchPendingPush).toHaveBeenCalledOnce());
    let settled = false;
    void registeredWork.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    finish();
    await registeredWork;
    expect(settled).toBe(true);
  });

  it("retains Next after scheduling for the existing non-message mutation paths", () => {
    schedulePushDispatch();
    expect(mocks.after).toHaveBeenCalledOnce();
    expect(mocks.after).toHaveBeenCalledWith(expect.any(Function));
  });
});
