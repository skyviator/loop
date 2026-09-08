import Link from "next/link";
import type { ReactNode } from "react";

import { signOutAction } from "@/app/actions/auth";

import { LoopIcon, type LoopIconName } from "./loop-icon";
import { LoopLogo } from "./logo";

type NavItem = { href: string; label: string; icon: LoopIconName };

export function AppShell({ eyebrow, title, nav, children }: { eyebrow: string; title: string; nav: NavItem[]; children: ReactNode }) {
  return (
    <div className="app-frame">
      <aside className="side-nav">
        <Link href="/app" className="brand-link" aria-label="Loop home"><LoopLogo compact /></Link>
        <nav aria-label="Primary">
          {nav.map((item) => (
            <Link key={item.href} href={item.href} className="nav-link">
              <LoopIcon name={item.icon} className="size-5" />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>
        <form action={signOutAction} className="nav-signout">
          <button className="nav-link w-full" type="submit"><LoopIcon name="signout" className="size-5" />Sign out</button>
        </form>
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
          <form action={signOutAction}><button className="button button-secondary mobile-signout" type="submit">Sign out</button></form>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="stat"><strong>{value}</strong><span>{label}</span></div>;
}

export function StatusNote({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "error"; children: ReactNode }) {
  return <p className={`status-note status-${tone}`} role={tone === "error" ? "alert" : undefined}>{children}</p>;
}
