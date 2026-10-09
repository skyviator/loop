import { describe, expect, it } from "vitest";

import {
  communicationNavigation,
  guardianNavigation,
  isMobileNavigationItemActive,
  isNavigationItemActive,
  schoolAdminMoreNavigation,
  schoolAdminNavigation,
  teacherNavigation,
} from "./navigation";

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

  it("keeps all nine School Admin destinations on desktop and a focused mobile set", () => {
    expect(schoolAdminNavigation.filter((item) => !item.mobileOnly).map((item) => item.label)).toEqual([
      "Overview",
      "People",
      "Classrooms",
      "Timetable",
      "Features",
      "Messages",
      "Updates",
      "School",
      "My settings",
    ]);
    expect(schoolAdminNavigation.filter((item) => !item.mobileHidden).map((item) => item.label)).toEqual([
      "Overview",
      "People",
      "Messages",
      "Updates",
      "More",
    ]);
    expect(schoolAdminMoreNavigation.map((item) => item.label)).toEqual([
      "Classrooms",
      "Timetable",
      "Features",
      "School",
      "My settings",
    ]);
    expect(schoolAdminNavigation.filter((item) => !item.mobileOnly).map((item) => item.href)).toEqual([
      "/school",
      "/school/people",
      "/school/classrooms",
      "/school/timetable",
      "/school/features",
      "/messages",
      "/updates",
      "/school/settings",
      "/settings",
    ]);
    expect(communicationNavigation("school_admin")).toBe(schoolAdminNavigation);
  });

  it("marks More active for School Admin destinations moved out of the mobile footer", () => {
    const more = schoolAdminNavigation.find((item) => item.mobileMore)!;

    expect(isMobileNavigationItemActive(more, schoolAdminNavigation, "/school/classrooms", "")).toBe(true);
    expect(isMobileNavigationItemActive(more, schoolAdminNavigation, "/settings", "")).toBe(true);
    expect(isMobileNavigationItemActive(more, schoolAdminNavigation, "/messages", "")).toBe(false);
  });
});
