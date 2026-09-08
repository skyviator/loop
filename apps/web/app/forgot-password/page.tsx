import Link from "next/link";

import { forgotPasswordAction } from "@/app/actions/auth";
import { AuthCard, Field } from "@/components/auth-card";
import { StatusNote } from "@/components/app-shell";

export default async function ForgotPasswordPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const state = await searchParams;
  const intro = process.env.NODE_ENV === "development"
    ? "We’ll send a secure recovery link. Local emails appear in Mailpit."
    : "We’ll send a secure recovery link to the account email.";
  return (
    <AuthCard title="Reset password" intro={intro}>
      {state.error ? <StatusNote tone="error">{state.error}</StatusNote> : null}
      {state.message ? <StatusNote tone="success">{state.message}</StatusNote> : null}
      <form action={forgotPasswordAction} className="form-stack">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <button className="button button-primary" type="submit">Send reset link</button>
      </form>
      <Link className="text-link" href="/sign-in">Back to sign in</Link>
    </AuthCard>
  );
}
