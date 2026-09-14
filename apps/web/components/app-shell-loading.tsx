"use client";

import { usePathname } from "next/navigation";

import { AppFrame } from "./app-frame";
import { useRememberedAppShell } from "./app-shell-state";

export function AppShellLoading() {
  const shell = useRememberedAppShell();
  const pathname = usePathname();
  const authenticatedPath = /^\/(?:app|messages|parent|platform|school|settings|teacher|updates)(?:\/|$)/.test(pathname);
  if (!shell || !authenticatedPath) return <main className="auth-page" aria-live="polite"><p className="muted">Loading Loop…</p></main>;
  const destinationTitle = shell.nav.find((item) => item.href.split(/[?#]/, 1)[0] === pathname)?.label ?? shell.title;

  return (
    <AppFrame {...shell} title={destinationTitle}>
      <div className="route-loading" role="status" aria-live="polite">
        <span className="route-loading-line route-loading-line-wide" />
        <span className="route-loading-line" />
        <span className="route-loading-line route-loading-line-short" />
        <span className="sr-only">Loading page…</span>
      </div>
    </AppFrame>
  );
}
