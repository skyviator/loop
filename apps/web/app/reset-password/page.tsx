import { redirect } from "next/navigation";

import { updatePasswordAction } from "@/app/actions/auth";
import { AuthCard, Field } from "@/components/auth-card";
import { StatusNote } from "@/components/app-shell";
import { createClient } from "@/lib/supabase/server";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/sign-in?error=The+reset+link+is+invalid+or+has+expired.");
  const state = await searchParams;
  return (
    <AuthCard title="Choose a new password" intro="Use at least 10 characters and keep it unique to Loop.">
      {state.error ? <StatusNote tone="error">{state.error}</StatusNote> : null}
      <form action={updatePasswordAction} className="form-stack">
        <Field label="New password" name="password" type="password" autoComplete="new-password" />
        <button className="button button-primary" type="submit">Update password</button>
      </form>
    </AuthCard>
  );
}
