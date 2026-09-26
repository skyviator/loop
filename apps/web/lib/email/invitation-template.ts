export type InvitationTemplateInput = {
  schoolName: string;
  role: "school_admin" | "teacher" | "guardian";
  activationUrl: string;
  expiresAt: string;
  supportAddress?: string;
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function roleLabel(role: InvitationTemplateInput["role"]) {
  if (role === "school_admin") return "School Admin";
  if (role === "teacher") return "Teacher";
  return "Guardian";
}

export function invitationEmail(input: InvitationTemplateInput) {
  const schoolName = escapeHtml(input.schoolName);
  const activationUrl = escapeHtml(input.activationUrl);
  const role = roleLabel(input.role);
  const expiry = new Intl.DateTimeFormat("en-LK", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Colombo",
  }).format(new Date(input.expiresAt));
  const support = input.supportAddress
    ? `<p style="color:#5f6d73;font-size:14px">Need help? Contact ${escapeHtml(input.supportAddress)}.</p>`
    : "";

  return {
    subject: `You're invited to ${input.schoolName} on Loop`,
    text: [
      `You have been invited to ${input.schoolName} on Loop as ${role}.`,
      `Activate your account: ${input.activationUrl}`,
      `This invitation expires ${expiry} (Sri Lanka time).`,
      "If you were not expecting this invitation, you can ignore this email.",
      input.supportAddress ? `Need help? Contact ${input.supportAddress}.` : "",
    ].filter(Boolean).join("\n\n"),
    html: `<!doctype html><html><body style="margin:0;background:#f7f6f2;color:#243238;font-family:Arial,sans-serif"><div style="max-width:560px;margin:0 auto;padding:40px 24px"><div style="background:#fff;border:1px solid #dfe6e3;border-radius:16px;padding:32px"><p style="margin:0 0 8px;color:#2f6f68;font-size:14px;font-weight:700">LOOP</p><h1 style="margin:0 0 16px;font-size:24px">You're invited to ${schoolName}</h1><p style="line-height:1.6">You have been invited to join Loop as <strong>${role}</strong>.</p><p style="margin:28px 0"><a href="${activationUrl}" style="display:inline-block;background:#2f6f68;color:#fff;text-decoration:none;font-weight:700;padding:14px 20px;border-radius:10px">Activate account</a></p><p style="color:#5f6d73;font-size:14px;line-height:1.5">This invitation expires ${escapeHtml(expiry)} (Sri Lanka time). If you were not expecting it, you can ignore this email.</p>${support}</div></div></body></html>`,
  };
}
