import "server-only";

import { createHash } from "node:crypto";

import { invitationActivationUrl, sendInvitationEmail, type EmailResult } from "@/lib/email/server";
import { createServerAdminClient } from "@/lib/supabase/admin";

export type InvitationContext = {
  id: string;
  email: string;
  maskedEmail: string;
  role: "school_admin" | "teacher" | "guardian";
  schoolName: string;
  expiresAt: string;
};

function tokenHash(token: string) {
  return `\\x${createHash("sha256").update(token).digest("hex")}`;
}

function maskEmail(email: string) {
  const [local, domain] = email.split("@");
  if (!domain) return "the invited email";
  return `${local.slice(0, 1)}${"•".repeat(Math.min(5, Math.max(2, local.length - 1)))}@${domain}`;
}

export async function getInvitationContext(token: string): Promise<InvitationContext | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) return null;
  const { data, error } = await createServerAdminClient().rpc("get_invitation_context", {
    invitation_token_hash: tokenHash(token),
  });
  const invitation = data?.[0];
  if (error || !invitation || invitation.status !== "pending" || new Date(invitation.expires_at).getTime() <= Date.now()) return null;
  return {
    id: invitation.invitation_id,
    email: invitation.invited_email,
    maskedEmail: maskEmail(invitation.invited_email),
    role: invitation.invited_role,
    schoolName: invitation.school_name,
    expiresAt: invitation.expires_at,
  };
}

export async function deliverInvitation(input: {
  invitationId: string;
  token: string;
  to: string;
  role: InvitationContext["role"];
  schoolName: string;
  expiresAt: string;
}): Promise<EmailResult> {
  const activationUrl = invitationActivationUrl(input.token);
  const result = await sendInvitationEmail({
    invitationId: input.invitationId,
    to: input.to,
    schoolName: input.schoolName,
    role: input.role,
    activationUrl,
    expiresAt: input.expiresAt,
    supportAddress: process.env.EMAIL_SUPPORT_ADDRESS || undefined,
  });
  const admin = createServerAdminClient();
  if (result.status === "accepted") {
    await admin.rpc("record_invitation_delivery", {
      target_invitation_id: input.invitationId,
      delivery_succeeded: true,
    });
  } else if (result.status === "failed") {
    await admin.rpc("record_invitation_delivery", {
      target_invitation_id: input.invitationId,
      delivery_succeeded: false,
      failure_category: result.category,
    });
  }
  return result;
}
