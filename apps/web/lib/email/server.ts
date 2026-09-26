import "server-only";

import { invitationEmail, type InvitationTemplateInput } from "./invitation-template";

export type EmailResult =
  | { status: "accepted" }
  | { status: "preview"; activationUrl: string }
  | { status: "failed"; category: "configuration" | "provider_rejected" | "rate_limited" | "network" | "unknown" };

type SendInvitationInput = InvitationTemplateInput & {
  invitationId: string;
  to: string;
};

function isLocalSite(url: URL) {
  return url.protocol === "http:" && (url.hostname === "127.0.0.1" || url.hostname === "localhost");
}

export function invitationActivationUrl(token: string) {
  const configured = process.env.NEXT_PUBLIC_SITE_URL;
  if (!configured) throw new Error("Invitation delivery is not configured.");
  const site = new URL(configured);
  if (!isLocalSite(site) && site.protocol !== "https:") throw new Error("Invitation delivery is not configured securely.");
  return new URL(`/invite?token=${encodeURIComponent(token)}`, site.origin).toString();
}

export async function sendInvitationEmail(input: SendInvitationInput): Promise<EmailResult> {
  const url = new URL(input.activationUrl);
  if (isLocalSite(url) && !process.env.RESEND_API_KEY) {
    return { status: "preview", activationUrl: input.activationUrl };
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from || !apiKey.startsWith("re_")) return { status: "failed", category: "configuration" };

  const message = invitationEmail(input);
  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `loop-invitation-${input.invitationId}`,
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
      cache: "no-store",
    });
    if (response.ok) return { status: "accepted" };
    if (response.status === 429) return { status: "failed", category: "rate_limited" };
    return { status: "failed", category: "provider_rejected" };
  } catch {
    return { status: "failed", category: "network" };
  }
}
