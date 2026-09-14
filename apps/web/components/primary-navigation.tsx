"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { isNavigationItemActive, type NavItem } from "@/lib/navigation";

import { LoopIcon } from "./loop-icon";

export function PrimaryNavigation({ items }: { items: readonly NavItem[] }) {
  const pathname = usePathname();
  const [hash, setHash] = useState("");
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const syncLocation = () => {
      setHash(window.location.hash);
      setPendingHref(null);
    };
    syncLocation();
    window.addEventListener("hashchange", syncLocation);
    window.addEventListener("popstate", syncLocation);
    return () => {
      window.removeEventListener("hashchange", syncLocation);
      window.removeEventListener("popstate", syncLocation);
    };
  }, [pathname]);

  return (
    <nav aria-label="Primary">
      {items.map((item) => {
        const active = isNavigationItemActive(item.href, items, pathname, hash);
        const destinationPathname = item.href.split(/[?#]/, 1)[0];
        return (
          <Link key={item.href} href={item.href} className="nav-link" aria-current={active ? "page" : undefined} aria-busy={pendingHref === item.href} data-pending={pendingHref === item.href ? "true" : undefined} onNavigate={() => {
            setHash(item.href.includes("#") ? `#${item.href.split("#", 2)[1]}` : "");
            setPendingHref(destinationPathname !== pathname ? item.href : null);
          }}>
            <LoopIcon name={item.icon} className="size-5" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
