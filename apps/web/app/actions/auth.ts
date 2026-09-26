"use server";

import { redirect } from "next/navigation";

import { routeForRole } from "@loop/domain";
import { emailAddress, requiredText, ValidationError } from "@loop/validation";

import { getViewer } from "@/lib/auth";
import { getInvitationContext } from "@/lib/invitations/server";
import { createServerAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function withMessage(path: string, key: "error" | "message", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

export async function signInAction(formData: FormData) {
  const invitationToken = typeof formData.get("invitation_token") === "string"
    && /^[A-Za-z0-9_-]{32}$/.test(String(formData.get("invitation_token")))
    ? String(formData.get("invitation_token"))
    : null;
  try {
    const email = emailAddress(formData.get("email"));
    const password = requiredText(formData.get("password"), "Password", 200);
    const supabase = await createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) redirect(withMessage("/sign-in", "error", "The email or password was not recognised."));
  } catch (error) {
    if (error instanceof ValidationError) redirect(withMessage("/sign-in", "error", error.message));
    throw error;
  }
  if (invitationToken) redirect(`/invite?token=${encodeURIComponent(invitationToken)}`);
  const viewer = await getViewer();
  redirect(routeForRole(viewer?.role ?? null));
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/sign-in");
}

export async function forgotPasswordAction(formData: FormData) {
  try {
    const email = emailAddress(formData.get("email"));
    const configuredSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (!configuredSiteUrl) throw new Error("Site URL is not configured.");
    const siteUrl = new URL(configuredSiteUrl);
    const loopback = siteUrl.protocol === "http:" && (siteUrl.hostname === "127.0.0.1" || siteUrl.hostname === "localhost");
    if (!loopback && siteUrl.protocol !== "https:") {
      throw new Error("Site URL is not configured securely.");
    }
    const supabase = await createClient();
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL("/auth/callback?next=/reset-password", siteUrl.origin).toString(),
    });
  } catch (error) {
    if (error instanceof ValidationError) redirect(withMessage("/forgot-password", "error", error.message));
    throw error;
  }
  const message = process.env.NODE_ENV === "development"
    ? "If that account exists, a reset link is waiting in the local Mailpit inbox."
    : "If that account exists, check its email for a password reset link.";
  redirect(withMessage("/forgot-password", "message", message));
}

export async function updatePasswordAction(formData: FormData) {
  const password = requiredText(formData.get("password"), "Password", 200);
  if (password.length < 10) redirect(withMessage("/reset-password", "error", "Use at least 10 characters."));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect(withMessage("/reset-password", "error", "The reset link is invalid or has expired."));
  redirect(withMessage("/sign-in", "message", "Password updated. Sign in with your new password."));
}

export async function activateInvitationAction(formData: FormData) {
  const token = requiredText(formData.get("token"), "Invitation", 300);
  const password = requiredText(formData.get("password"), "Password", 200);
  if (password.length < 10) redirect(withMessage(`/invite?token=${encodeURIComponent(token)}`, "error", "Use at least 10 characters."));

  const invitation = await getInvitationContext(token);
  if (!invitation) redirect(withMessage(`/invite?token=${encodeURIComponent(token)}`, "error", "This invitation is invalid, expired, or already used."));

  const admin = createServerAdminClient();
  const created = await admin.auth.admin.createUser({ email: invitation.email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    redirect(withMessage(`/invite?token=${encodeURIComponent(token)}`, "error", "This email may already have a Loop account. Sign in below to activate the invitation."));
  }

  const supabase = await createClient();
  const signedIn = await supabase.auth.signInWithPassword({ email: invitation.email, password });
  if (signedIn.error) {
    await admin.auth.admin.deleteUser(created.data.user.id);
    redirect(withMessage(`/invite?token=${encodeURIComponent(token)}`, "error", "Activation could not be completed."));
  }
  const redeemed = await supabase.rpc("redeem_invitation", { invitation_token: token });
  if (redeemed.error) {
    await supabase.auth.signOut();
    await admin.auth.admin.deleteUser(created.data.user.id);
    redirect(withMessage(`/invite?token=${encodeURIComponent(token)}`, "error", "This invitation is invalid or unavailable."));
  }
  const viewer = await getViewer();
  redirect(routeForRole(viewer?.role ?? null));
}

export async function redeemExistingInvitationAction(formData: FormData) {
  const token = requiredText(formData.get("token"), "Invitation", 300);
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) redirect("/invite?error=This+invitation+is+invalid+or+unavailable.");
  const supabase = await createClient();
  const user = await supabase.auth.getUser();
  if (!user.data.user) redirect(`/invite?token=${encodeURIComponent(token)}&error=Sign+in+to+activate+this+invitation.`);
  const redeemed = await supabase.rpc("redeem_invitation", { invitation_token: token });
  if (redeemed.error) redirect(`/invite?token=${encodeURIComponent(token)}&error=This+invitation+does+not+match+the+signed-in+account+or+is+no+longer+available.`);
  const viewer = await getViewer();
  redirect(routeForRole(viewer?.role ?? null));
}
