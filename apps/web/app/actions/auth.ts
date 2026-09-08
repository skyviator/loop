"use server";

import { createHash } from "node:crypto";

import { redirect } from "next/navigation";

import { routeForRole } from "@loop/domain";
import { emailAddress, requiredText, ValidationError } from "@loop/validation";

import { getViewer } from "@/lib/auth";
import { createLocalAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function withMessage(path: string, key: "error" | "message", message: string) {
  return `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(message)}`;
}

export async function signInAction(formData: FormData) {
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
    if (process.env.NODE_ENV !== "development" && siteUrl.protocol !== "https:") {
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

export async function activateLocalInvitationAction(formData: FormData) {
  if (process.env.NODE_ENV !== "development") redirect("/invite?error=Invitation activation is unavailable.");
  const token = requiredText(formData.get("token"), "Invitation", 300);
  const email = emailAddress(formData.get("email"));
  const password = requiredText(formData.get("password"), "Password", 200);
  if (password.length < 10) redirect(withMessage(`/invite?token=${encodeURIComponent(token)}`, "error", "Use at least 10 characters."));

  const hash = `\\x${createHash("sha256").update(token).digest("hex")}`;
  const admin = createLocalAdminClient();
  const invitation = await admin
    .from("invitations")
    .select("id, invited_email, status, expires_at")
    .eq("token_hash", hash)
    .maybeSingle();
  if (!invitation.data || invitation.data.status !== "pending" || new Date(invitation.data.expires_at) <= new Date() || invitation.data.invited_email.toLowerCase() !== email) {
    redirect(withMessage(`/invite?token=${encodeURIComponent(token)}`, "error", "This invitation is invalid, expired, or does not match that email."));
  }

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error || !created.data.user) {
    redirect(withMessage(`/invite?token=${encodeURIComponent(token)}`, "error", "That account could not be activated. It may already exist; try signing in."));
  }

  const supabase = await createClient();
  const signedIn = await supabase.auth.signInWithPassword({ email, password });
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
  redirect("/app");
}
