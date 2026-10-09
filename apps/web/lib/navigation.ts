import type { AppRole } from "@loop/domain";

import type { LoopIconName } from "@/components/loop-icon";

export type NavItem = {
  href: string;
  label: string;
  icon: LoopIconName;
  mobileHidden?: boolean;
  mobileOnly?: boolean;
  mobileMore?: boolean;
};

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

const schoolOverview: NavItem = { href: "/school", label: "Overview", icon: "home" };
const schoolPeople: NavItem = { href: "/school/people", label: "People", icon: "people" };
const schoolMessages: NavItem = { href: "/messages", label: "Messages", icon: "message" };
const schoolUpdates: NavItem = { href: "/updates", label: "Updates", icon: "announcement" };
const schoolMore: NavItem = {
  href: "/school/more",
  label: "More",
  icon: "more",
  mobileOnly: true,
  mobileMore: true,
};

export const schoolAdminMoreNavigation: readonly NavItem[] = [
  { href: "/school/classrooms", label: "Classrooms", icon: "building", mobileHidden: true },
  { href: "/school/timetable", label: "Timetable", icon: "calendar", mobileHidden: true },
  { href: "/school/features", label: "Features", icon: "settings", mobileHidden: true },
  { href: "/school/settings", label: "School", icon: "settings", mobileHidden: true },
  { href: "/settings", label: "My settings", icon: "bell", mobileHidden: true },
];

export const schoolAdminNavigation: readonly NavItem[] = [
  schoolOverview,
  schoolPeople,
  ...schoolAdminMoreNavigation.slice(0, 3),
  schoolMessages,
  schoolUpdates,
  ...schoolAdminMoreNavigation.slice(3),
  schoolMore,
];

export function communicationNavigation(role: AppRole): readonly NavItem[] {
  if (role === "guardian") return guardianNavigation;
  if (role === "teacher") return teacherNavigation;
  return schoolAdminNavigation;
}

export function isNavigationItemActive(href: string, items: readonly NavItem[], pathname: string, hash: string) {
  const [targetPath, targetFragment] = href.split("#", 2);
  if (targetPath !== pathname) return false;
  if (targetFragment) return hash === `#${targetFragment}`;
  const routeHasSectionDestinations = items.some((item) => item.href.startsWith(`${targetPath}#`));
  return !routeHasSectionDestinations || hash === "";
}

export function isMobileNavigationItemActive(
  item: NavItem,
  items: readonly NavItem[],
  pathname: string,
  hash: string,
) {
  if (isNavigationItemActive(item.href, items, pathname, hash)) return true;
  if (!item.mobileMore) return false;

  return items.some(
    (candidate) =>
      candidate.mobileHidden && isNavigationItemActive(candidate.href, items, pathname, hash),
  );
}
