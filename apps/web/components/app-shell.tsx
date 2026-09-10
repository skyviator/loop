import Link from "next/link";
import type { ReactNode } from "react";

import type { NavItem } from "@/lib/navigation";

import { LoopLogo } from "./logo";
import { PrimaryNavigation } from "./primary-navigation";
import { SignOutButton } from "./sign-out-button";

export function AppShell({ eyebrow, title, nav, contentWidth, children }: { eyebrow: string; title: string; nav: readonly NavItem[]; contentWidth?: "standard" | "wide"; children: ReactNode }) {
  return (
    <div className="app-frame">
      <aside className="side-nav">
        <Link href="/app" className="brand-link" aria-label="Loop home"><LoopLogo compact /></Link>
        <PrimaryNavigation items={nav} />
        <SignOutButton />
      </aside>
      <div className="app-main">
        <header className="app-header">
          <div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div>
          <SignOutButton mobile />
        </header>
        <main className={`content${contentWidth ? ` content-${contentWidth}` : ""}`}>{children}</main>
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
