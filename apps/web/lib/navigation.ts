import type { AppRole } from "@loop/domain";

import type { LoopIconName } from "@/components/loop-icon";

export type NavItem = { href: string; label: string; icon: LoopIconName };

export const guardianNavigation: readonly NavItem[] = [
  { href: "/parent", label: "Today", icon: "home" },
  { href: "/messages", label: "Messages", icon: "message" },
  { href: "/updates", label: "Updates", icon: "announcement" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export const teacherNavigation: readonly NavItem[] = [
  { href: "/teacher", label: "Today", icon: "home" },
  { href: "/teacher#attendance", label: "Attendance", icon: "attendance" },
  { href: "/teacher#care", label: "Record care", icon: "note" },
  { href: "/messages", label: "Messages", icon: "message" },
  { href: "/updates", label: "Updates", icon: "announcement" },
  { href: "/settings", label: "Settings", icon: "settings" },
];

export function communicationNavigation(role: AppRole): readonly NavItem[] {
  if (role === "guardian") return guardianNavigation;
  if (role === "teacher") return teacherNavigation;
  return [
    { href: "/school", label: "Overview", icon: "home" },
    { href: "/messages", label: "Messages", icon: "message" },
    { href: "/updates", label: "Updates", icon: "announcement" },
    { href: "/settings", label: "Settings", icon: "settings" },
  ];
}

export function isNavigationItemActive(href: string, items: readonly NavItem[], pathname: string, hash: string) {
  const [targetPath, targetFragment] = href.split("#", 2);
  if (targetPath !== pathname) return false;
  if (targetFragment) return hash === `#${targetFragment}`;
  const routeHasSectionDestinations = items.some((item) => item.href.startsWith(`${targetPath}#`));
  return !routeHasSectionDestinations || hash === "";
}
