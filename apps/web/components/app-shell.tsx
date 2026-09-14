import type { ReactNode } from "react";

import type { NavItem } from "@/lib/navigation";

import { AppFrame } from "./app-frame";
import { RememberAppShell } from "./app-shell-state";

export function AppShell({ eyebrow, title, nav, contentWidth, children }: { eyebrow: string; title: string; nav: readonly NavItem[]; contentWidth?: "standard" | "wide"; children: ReactNode }) {
  const shell = { eyebrow, title, nav, contentWidth };
  return (
    <>
      <RememberAppShell shell={shell} />
      <AppFrame {...shell}>{children}</AppFrame>
    </>
  );
}

export function Stat({ label, value }: { label: string; value: string | number }) {
  return <div className="stat"><strong>{value}</strong><span>{label}</span></div>;
}

export function StatusNote({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "error"; children: ReactNode }) {
  return <p className={`status-note status-${tone}`} role={tone === "error" ? "alert" : undefined}>{children}</p>;
}
