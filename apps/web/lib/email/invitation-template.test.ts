import { describe, expect, it } from "vitest";

import { invitationEmail } from "./invitation-template";

describe("invitation email", () => {
  it("contains the intended context without child details or raw identifiers", () => {
    const message = invitationEmail({
      schoolName: "Little Harbour <Preschool>",
      role: "guardian",
      activationUrl: "https://staging.loop.lk/invite?token=safe-token",
      expiresAt: "2026-10-01T12:00:00.000Z",
      supportAddress: "support@loop.lk",
    });
    expect(message.subject).toContain("Little Harbour");
    expect(message.text).toContain("Guardian");
    expect(message.text).toContain("https://staging.loop.lk/invite?token=safe-token");
    expect(message.html).toContain("Little Harbour &lt;Preschool&gt;");
    expect(message.html).not.toContain("child_id");
    expect(message.html).not.toContain("password");
  });
});
