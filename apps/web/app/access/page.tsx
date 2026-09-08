import { signOutAction } from "@/app/actions/auth";
import { AuthCard } from "@/components/auth-card";
import { StatusNote } from "@/components/app-shell";
import { getViewer } from "@/lib/auth";

export default async function AccessPage() {
  const viewer = await getViewer();
  return (
    <AuthCard title="Access not ready" intro="Your account is signed in, but it has no active Loop role.">
      <StatusNote tone="warning">Ask a school administrator to send a current invitation. Access fails closed until the membership exists.</StatusNote>
      <p className="muted">Account: {viewer?.userId ? "authenticated" : "not signed in"}</p>
      <form action={signOutAction}><button className="button button-secondary" type="submit">Sign out</button></form>
    </AuthCard>
  );
}
