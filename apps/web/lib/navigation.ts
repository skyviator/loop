import type { AppRole } from "@loop/domain";

import type { LoopIconName } from "@/components/loop-icon";

type NavItem = { href: string; label: string; icon: LoopIconName };

export function communicationNavigation(role: AppRole): NavItem[] {
  const home = role === "guardian" ? "/parent" : role === "teacher" ? "/teacher" : "/school";
  return [
    { href: home, label: role === "guardian" || role === "teacher" ? "Today" : "Overview", icon: "home" },
    { href: "/messages", label: "Messages", icon: "message" },
    { href: "/updates", label: "Updates", icon: "announcement" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ];
}
