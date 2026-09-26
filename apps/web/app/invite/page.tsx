import Link from "next/link";

import { activateInvitationAction, redeemExistingInvitationAction, signInAction } from "@/app/actions/auth";
import { AuthCard, Field } from "@/components/auth-card";
import { StatusNote } from "@/components/app-shell";
import { getInvitationContext } from "@/lib/invitations/server";
import { createClient } from "@/lib/supabase/server";

export default async function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const { token, error } = await searchParams;
  const invitation = token ? await getInvitationContext(token).catch(() => null) : null;
  const { data: { user } } = await (await createClient()).auth.getUser();
  return (
    <AuthCard title="Join Loop" intro="Invitation activation verifies this link and your email before access is granted.">
      {error ? <StatusNote tone="error">{error}</StatusNote> : null}
      {!invitation ? (
        <><StatusNote tone="warning">This invitation is invalid, expired, or already used.</StatusNote><Link href="/sign-in" className="text-link">Go to sign in</Link></>
      ) : user ? (
        <form action={redeemExistingInvitationAction} className="form-stack">
          <input type="hidden" name="token" value={token} />
          <p className="invitation-role">Invitation to <strong>{invitation.schoolName}</strong> as <strong>{invitation.role.replace("_", " ")}</strong></p>
          <p className="meta">Signed in as {user.email}. Activation succeeds only when this verified email matches {invitation.maskedEmail}.</p>
          <button className="button button-primary" type="submit">Activate invitation</button>
        </form>
      ) : (
        <>
          <form action={activateInvitationAction} className="form-stack">
            <input type="hidden" name="token" value={token} />
            <p className="invitation-role">Invitation to <strong>{invitation.schoolName}</strong> as <strong>{invitation.role.replace("_", " ")}</strong></p>
            <p className="meta">Create the account for {invitation.maskedEmail}. The invitation determines the school and access.</p>
            <Field label="Create password" name="password" type="password" autoComplete="new-password" />
            <button className="button button-primary" type="submit">Create and activate account</button>
          </form>
          <div className="auth-divider"><span>Already use Loop?</span></div>
          <form action={signInAction} className="form-stack">
            <input type="hidden" name="invitation_token" value={token} />
            <Field label="Email" name="email" type="email" autoComplete="email" />
            <Field label="Password" name="password" type="password" autoComplete="current-password" />
            <button className="button button-secondary" type="submit">Sign in to activate</button>
          </form>
        </>
      )}
    </AuthCard>
  );
}
