import { describe, expect, it } from "vitest";

import { nextCalendarDate, schoolDateTimeLabel, schoolLocalDate, zonedDateTime } from "./timezone";

describe("school timezone helpers", () => {
  it("converts a Colombo wall-clock time without hard-coding its offset", () => {
    expect(zonedDateTime("2026-10-05", "09:15:00", "Asia/Colombo")).toBe("2026-10-05T03:45:00.000Z");
  });

  it("accepts fractional seconds returned by PostgreSQL time columns", () => {
    expect(zonedDateTime("2026-10-05", "09:15:00.123456", "Asia/Colombo")).toBe("2026-10-05T03:45:00.000Z");
  });

  it("uses the configured timezone and observes daylight-saving offsets", () => {
    expect(zonedDateTime("2026-07-15", "09:15:00", "America/New_York")).toBe("2026-07-15T13:15:00.000Z");
    expect(zonedDateTime("2026-12-15", "09:15:00", "America/New_York")).toBe("2026-12-15T14:15:00.000Z");
  });

  it.each([
    ["Asia/Colombo", "2026-01-15T18:29:59.000Z", "2026-01-15"],
    ["Asia/Colombo", "2026-01-15T18:30:00.000Z", "2026-01-16"],
    ["UTC", "2026-01-16T00:00:00.000Z", "2026-01-16"],
    ["America/New_York", "2026-01-16T05:00:00.000Z", "2026-01-16"],
    ["America/New_York", "2026-07-16T04:00:00.000Z", "2026-07-16"],
  ])("matches the database school-local date boundary for %s at %s", (timezone, instant, expected) => {
    expect(schoolLocalDate(new Date(instant), timezone)).toBe(expected);
  });

  it("advances date-only values across month and year boundaries", () => {
    expect(nextCalendarDate("2026-12-31")).toBe("2027-01-01");
  });

  it("formats a deterministic school-local message timestamp", () => {
    const instant = new Date("2026-01-15T18:45:00.000Z");
    expect(schoolDateTimeLabel(instant, "Asia/Colombo")).toBe("16 Jan 2026, 00:15");
    expect(schoolDateTimeLabel(instant, "America/New_York")).toBe("15 Jan 2026, 13:45");
  });
});
