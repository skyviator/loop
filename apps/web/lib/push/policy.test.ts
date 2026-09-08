import { describe, expect, it } from "vitest";

import { classifyPushFailure, notificationPayload } from "./policy";

describe("push delivery policy", () => {
  it.each([400, 401, 403, 404, 410])("classifies HTTP %s as permanent", (statusCode) => {
    expect(classifyPushFailure({ statusCode })).toEqual({ outcome: "permanent_failure", responseStatus: statusCode });
  });

  it.each([429, 500, 503])("classifies HTTP %s as retryable", (statusCode) => {
    expect(classifyPushFailure({ statusCode })).toEqual({ outcome: "temporary_failure", responseStatus: statusCode });
  });

  it("treats network errors as retryable without exposing their content", () => {
    expect(classifyPushFailure(new Error("endpoint capability must stay private"))).toEqual({ outcome: "temporary_failure", responseStatus: undefined });
  });

  it("builds a deliberately minimal lock-screen payload", () => {
    const payload = notificationPayload({ deliveryId: "delivery", eventType: "message", title: "New Loop message", body: "Open Loop to read your new message.", route: "/messages?thread=id" });
    expect(payload).toEqual({ title: "New Loop message", body: "Open Loop to read your new message.", route: "/messages?thread=id", tag: "message:delivery", badgeCount: 1 });
    expect(payload).not.toHaveProperty("endpoint");
    expect(payload).not.toHaveProperty("messageBody");
    expect(payload).not.toHaveProperty("signedUrl");
  });
});
