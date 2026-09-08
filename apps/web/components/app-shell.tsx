import Link from "next/link";
import type { ReactNode } from "react";

import { LoopIcon, type LoopIconName } from "./loop-icon";
import { LoopLogo } from "./logo";
import { SignOutButton } from "./sign-out-button";

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
        <SignOutButton />
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
          <SignOutButton mobile />
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
