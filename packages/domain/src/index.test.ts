import { describe, expect, it } from "vitest";

import {
  availableCoreFeatures,
  buildBulkCareDrafts,
  deriveTimetableStatus,
  mergeTimeline,
  routeForRole,
} from "./index";

const base = {
  now: new Date("2026-09-08T04:15:00.000Z"),
  serviceDate: "2026-09-08",
  startTime: "09:30",
  endTime: "10:00",
  timezone: "Asia/Colombo",
  attendance: "present" as const,
  confirmed: false,
};

describe("timetable status", () => {
  it("derives now in the school timezone", () => {
    expect(deriveTimetableStatus(base)).toBe("now");
  });

  it("does not present an ended slot as confirmed", () => {
    expect(deriveTimetableStatus({ ...base, now: new Date("2026-09-08T05:00:00Z") })).toBe(
      "ended_unconfirmed",
    );
  });

  it("does not present an absent child as completed", () => {
    expect(deriveTimetableStatus({ ...base, attendance: "absent", confirmed: true })).toBe("absent");
  });

  it("uses explicit evidence for confirmation", () => {
    expect(deriveTimetableStatus({ ...base, confirmed: true })).toBe("confirmed");
  });
});

describe("core helpers", () => {
  it("routes every verified role and fails closed", () => {
    expect(routeForRole("super_admin")).toBe("/platform");
    expect(routeForRole("guardian")).toBe("/parent");
    expect(routeForRole(null)).toBe("/access");
  });

  it("removes deferred features from teacher actions", () => {
    expect(availableCoreFeatures(["attendance", "photos", "meals", "messaging"])).toEqual([
      "attendance",
      "meals",
    ]);
  });

  it("records present children by default and applies exceptions", () => {
    const exceptions = new Map([["b", "none_refused"]]);
    expect(
      buildBulkCareDrafts(
        [
          { id: "a", present: true },
          { id: "b", present: true },
          { id: "c", present: false },
        ],
        "ate_most",
        exceptions,
      ),
    ).toEqual([
      { childId: "a", value: "ate_most" },
      { childId: "b", value: "none_refused" },
    ]);
  });

  it("merges a chronological parent timeline", () => {
    expect(
      mergeTimeline(
        [{ id: "2", occurredAt: "2026-09-08T10:00:00Z", kind: "care", title: "Lunch" }],
        [{ id: "1", occurredAt: "2026-09-08T08:00:00Z", kind: "attendance", title: "Arrived" }],
      ).map((item) => item.id),
    ).toEqual(["1", "2"]);
  });
});
