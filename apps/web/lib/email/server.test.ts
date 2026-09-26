import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { invitationActivationUrl, sendInvitationEmail } from "./server";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const invitation = {
  invitationId: "10000000-0000-0000-0000-000000000001",
  to: "teacher@example.test",
  schoolName: "Little Harbour Preschool",
  role: "teacher" as const,
  activationUrl: "https://staging.loop.lk/invite?token=preview-token",
  expiresAt: "2026-10-01T12:00:00.000Z",
};

describe("transactional email adapter", () => {
  it("requires HTTPS outside an explicit localhost preview", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://staging.loop.lk");
    expect(() => invitationActivationUrl("token")).toThrow("securely");
  });

  it("keeps local delivery as an explicit preview when no provider key exists", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "http://127.0.0.1:3000");
    expect(await sendInvitationEmail({ ...invitation, activationUrl: invitationActivationUrl("local-token") })).toEqual({
      status: "preview",
      activationUrl: "http://127.0.0.1:3000/invite?token=local-token",
    });
  });

  it("sends through Resend with a deterministic idempotency key and no credential in the body", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_placeholder");
    vi.stubEnv("EMAIL_FROM", "Loop <invites@auth.loop.lk>");
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "email-id" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await sendInvitationEmail(invitation)).toEqual({ status: "accepted" });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(new Headers(init.headers).get("Idempotency-Key")).toBe(`loop-invitation-${invitation.invitationId}`);
    expect(String(init.body)).not.toContain("re_test_placeholder");
  });

  it("maps provider rate limiting to recoverable operational state", async () => {
    vi.stubEnv("RESEND_API_KEY", "re_test_placeholder");
    vi.stubEnv("EMAIL_FROM", "Loop <invites@auth.loop.lk>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 429 })));
    expect(await sendInvitationEmail(invitation)).toEqual({ status: "failed", category: "rate_limited" });
  });
});
