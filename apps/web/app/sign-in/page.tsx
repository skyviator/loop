import Link from "next/link";

import { signInAction } from "@/app/actions/auth";
import { AuthCard, Field } from "@/components/auth-card";
import { StatusNote } from "@/components/app-shell";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; message?: string }> }) {
  const state = await searchParams;
  return (
    <AuthCard title="Welcome back" intro="Sign in to continue to your Loop workspace.">
      {state.error ? <StatusNote tone="error">{state.error}</StatusNote> : null}
      {state.message ? <StatusNote tone="success">{state.message}</StatusNote> : null}
      <form action={signInAction} className="form-stack">
        <Field label="Email" name="email" type="email" autoComplete="email" />
        <Field label="Password" name="password" type="password" autoComplete="current-password" />
        <button className="button button-primary" type="submit">Sign in</button>
      </form>
      <Link className="text-link" href="/forgot-password">Forgot password?</Link>
    </AuthCard>
  );
}
