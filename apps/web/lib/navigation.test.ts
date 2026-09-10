import { describe, expect, it } from "vitest";

import { communicationNavigation, guardianNavigation, isNavigationItemActive, teacherNavigation } from "./navigation";

describe("authenticated primary navigation", () => {
  it("keeps the Guardian destinations consistent", () => {
    expect(guardianNavigation.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/parent", label: "Today" },
      { href: "/messages", label: "Messages" },
      { href: "/updates", label: "Updates" },
      { href: "/settings", label: "Settings" },
    ]);
    expect(communicationNavigation("guardian")).toBe(guardianNavigation);
  });

  it("keeps Teacher section destinations available on shared pages", () => {
    expect(communicationNavigation("teacher")).toBe(teacherNavigation);
    expect(teacherNavigation.map(({ href }) => href)).toEqual([
      "/teacher",
      "/teacher#attendance",
      "/teacher#care",
      "/messages",
      "/updates",
      "/settings",
    ]);
  });

  it("selects exactly one Teacher destination for Today, Attendance, and Record care", () => {
    const activeLabels = (pathname: string, hash: string) => teacherNavigation
      .filter((item) => isNavigationItemActive(item.href, teacherNavigation, pathname, hash))
      .map((item) => item.label);

    expect(activeLabels("/teacher", "")).toEqual(["Today"]);
    expect(activeLabels("/teacher", "#attendance")).toEqual(["Attendance"]);
    expect(activeLabels("/teacher", "#care")).toEqual(["Record care"]);
    expect(activeLabels("/messages", "")).toEqual(["Messages"]);
    expect(activeLabels("/updates", "")).toEqual(["Updates"]);
    expect(activeLabels("/settings", "")).toEqual(["Settings"]);
  });
});
