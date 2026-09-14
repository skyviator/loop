"use client";

import { useRef, useState, type FormEvent } from "react";

import { signOutAction } from "@/app/actions/auth";
import { useForgetAppShell } from "@/components/app-shell-state";
import { LoopIcon } from "@/components/loop-icon";

export function SignOutButton({ mobile = false }: { mobile?: boolean }) {
  const ready = useRef(false);
  const [busy, setBusy] = useState(false);
  const forgetAppShell = useForgetAppShell();

  async function prepareSignOut(event: FormEvent<HTMLFormElement>) {
    forgetAppShell();
    if (ready.current || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    const form = event.currentTarget;
    event.preventDefault();
    setBusy(true);
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      }
    } catch {
      // Signing out must still succeed; expired endpoints are also retired on 404/410.
    }
    ready.current = true;
    form.requestSubmit();
  }

  return (
    <form action={signOutAction} className={mobile ? undefined : "nav-signout"} onSubmit={prepareSignOut}>
      <button className={mobile ? "button button-secondary mobile-signout" : "nav-link w-full"} disabled={busy} type="submit">
        {!mobile ? <LoopIcon name="signout" className="size-5" /> : null}{busy ? "Signing out…" : "Sign out"}
      </button>
    </form>
  );
}
