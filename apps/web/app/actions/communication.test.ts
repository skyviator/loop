import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  revalidatePath: vi.fn(),
  requireViewer: vi.fn(),
  waitUntilPushDispatch: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth", () => ({ requireViewer: mocks.requireViewer }));
vi.mock("@/lib/push/schedule", () => ({
  schedulePushDispatch: vi.fn(),
  waitUntilPushDispatch: mocks.waitUntilPushDispatch,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({ from: mocks.from }) }));

import { sendMessageAction } from "./communication";

function messageForm() {
  const form = new FormData();
  form.set("thread_id", "10000000-0000-4000-8000-000000000001");
  form.set("body", "A fictional reliability test message.");
  return form;
}

describe("message send reliability", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireViewer.mockResolvedValue({
      userId: "10000000-0000-4000-8000-000000000002",
      membershipId: "10000000-0000-4000-8000-000000000003",
      schoolId: "10000000-0000-4000-8000-000000000004",
    });
    mocks.insert.mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: mocks.insert });
  });

  it("commits once and returns success without waiting for secondary push work", async () => {
    let finishPush!: () => void;
    const slowPush = new Promise<void>((resolve) => { finishPush = resolve; });
    mocks.waitUntilPushDispatch.mockImplementation(() => { void slowPush; });

    const result = await sendMessageAction({ status: "idle", message: "" }, messageForm());

    expect(result).toEqual({ status: "success", message: "Message sent." });
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.waitUntilPushDispatch).toHaveBeenCalledOnce();
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/messages");
    finishPush();
    await slowPush;
  });

  it("does not start push processing when the authorized message insert fails", async () => {
    mocks.insert.mockResolvedValueOnce({ error: { message: "denied" } });

    await expect(sendMessageAction({ status: "idle", message: "" }, messageForm())).resolves.toEqual({
      status: "error",
      message: "The message was not sent. Your access may have changed.",
    });
    expect(mocks.insert).toHaveBeenCalledOnce();
    expect(mocks.waitUntilPushDispatch).not.toHaveBeenCalled();
  });
});
