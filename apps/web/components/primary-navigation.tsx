"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { isNavigationItemActive, type NavItem } from "@/lib/navigation";

import { LoopIcon } from "./loop-icon";

export function PrimaryNavigation({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");

  useEffect(() => {
    const syncHash = () => setHash(window.location.hash);
    syncHash();
    window.addEventListener("hashchange", syncHash);
    window.addEventListener("popstate", syncHash);
    return () => {
      window.removeEventListener("hashchange", syncHash);
      window.removeEventListener("popstate", syncHash);
    };
  }, [pathname]);

  return (
    <nav aria-label="Primary">
      {items.map((item) => {
        const active = isNavigationItemActive(item.href, items, pathname, hash);
        return (
          <Link key={item.href} href={item.href} className="nav-link" aria-current={active ? "page" : undefined} onNavigate={() => setHash(item.href.includes("#") ? `#${item.href.split("#", 2)[1]}` : "")}>
            <LoopIcon name={item.icon} className="size-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
