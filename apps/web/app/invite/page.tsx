import { createHash } from "node:crypto";

import Link from "next/link";

import { activateLocalInvitationAction } from "@/app/actions/auth";
import { AuthCard, Field } from "@/components/auth-card";
import { StatusNote } from "@/components/app-shell";
import { createLocalAdminClient } from "@/lib/supabase/admin";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  let invitation: { invited_email: string; invited_role: string; expires_at: string } | null = null;
  if (token && process.env.NODE_ENV === "development") {
    try {
      const hash = `\\x${createHash("sha256").update(token).digest("hex")}`;
      const response = await createLocalAdminClient().from("invitations").select("invited_email, invited_role, expires_at").eq("token_hash", hash).eq("status", "pending").maybeSingle();
      if (response.data && new Date(response.data.expires_at) > new Date()) invitation = response.data;
    } catch { invitation = null; }
  }
  return (
    <AuthCard title="Join Loop" intro="Invitation activation verifies this link and your email before access is granted.">
      {error ? <StatusNote tone="error">{error}</StatusNote> : null}
      {!invitation ? (
        <><StatusNote tone="warning">This invitation is invalid, expired, or already used.</StatusNote><Link href="/sign-in" className="text-link">Go to sign in</Link></>
      ) : (
        <form action={activateLocalInvitationAction} className="form-stack">
          <input type="hidden" name="token" value={token} />
          <p className="invitation-role">Invitation for <strong>{invitation.invited_role.replace("_", " ")}</strong></p>
          <Field label="Invited email" name="email" type="email" defaultValue={invitation.invited_email} autoComplete="email" />
          <Field label="Create password" name="password" type="password" autoComplete="new-password" />
          <button className="button button-primary" type="submit">Activate account</button>
        </form>
      )}
    </AuthCard>
  );
}
