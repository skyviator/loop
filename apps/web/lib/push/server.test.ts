import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  sendNotification: vi.fn(),
  setVapidDetails: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("web-push", () => ({
  default: {
    sendNotification: mocks.sendNotification,
    setVapidDetails: mocks.setVapidDetails,
  },
}));
vi.mock("@/lib/push/policy", () => ({
  classifyPushFailure: (error: { statusCode?: number }) => ({
    outcome: error.statusCode && [400, 401, 403, 404, 410].includes(error.statusCode) ? "permanent_failure" : "temporary_failure",
    responseStatus: error.statusCode,
  }),
  notificationPayload: (item: { deliveryId: string; eventType: string; title: string; body: string; route: string }) => ({
    title: item.title,
    body: item.body,
    route: item.route,
    tag: `${item.eventType}:${item.deliveryId}`,
    badgeCount: 1,
  }),
}));
vi.mock("@/lib/supabase/admin", () => ({ createServerAdminClient: () => ({ rpc: mocks.rpc }) }));

import { dispatchPendingPush, PUSH_NETWORK_TIMEOUT_MS } from "./server";

const delivery = {
  delivery_id: "delivery-id",
  endpoint: "https://push.example.test/device",
  p256dh: "public-key",
  auth_secret: "auth-secret",
  title: "New Loop message",
  body: "Open Loop to read your new message.",
  route: "/messages?thread=thread-id",
  event_type: "message",
};

describe("push dispatcher", () => {
  beforeEach(() => {
    process.env.VAPID_SUBJECT = "mailto:test@example.test";
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-vapid-key";
    process.env.VAPID_PRIVATE_KEY = "private-vapid-key";
    mocks.rpc.mockReset();
    mocks.sendNotification.mockReset();
    mocks.setVapidDetails.mockReset();
  });

  it("uses the bounded network timeout and a stable non-sensitive delivery tag", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [delivery], error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.sendNotification.mockResolvedValueOnce({ statusCode: 201 });

    await expect(dispatchPendingPush()).resolves.toEqual({ claimed: 1, succeeded: 1, temporaryFailures: 0, permanentFailures: 0 });

    const payload = JSON.parse(mocks.sendNotification.mock.calls[0]?.[1] as string) as Record<string, unknown>;
    expect(payload).toEqual({
      title: delivery.title,
      body: delivery.body,
      route: delivery.route,
      tag: "message:delivery-id",
      badgeCount: 1,
    });
    expect(mocks.sendNotification.mock.calls[0]?.[2]).toMatchObject({ timeout: PUSH_NETWORK_TIMEOUT_MS, TTL: 300 });
  });

  it("records a temporary provider failure for later retry", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: [delivery], error: null })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.sendNotification.mockRejectedValueOnce({ statusCode: 503 });

    await expect(dispatchPendingPush()).resolves.toEqual({ claimed: 1, succeeded: 0, temporaryFailures: 1, permanentFailures: 0 });
    expect(mocks.rpc).toHaveBeenLastCalledWith("complete_push_delivery", {
      target_delivery_id: delivery.delivery_id,
      outcome: "temporary_failure",
      response_status: 503,
    });
  });

  it("surfaces claim and completion failures so the worker returns a retryable error", async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "claim failed" } });
    await expect(dispatchPendingPush()).rejects.toThrow("Push delivery claim failed");

    mocks.rpc
      .mockResolvedValueOnce({ data: [delivery], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: "completion failed" } });
    mocks.sendNotification.mockResolvedValueOnce({ statusCode: 201 });
    await expect(dispatchPendingPush()).rejects.toThrow("One or more push delivery completions failed");
  });
});
