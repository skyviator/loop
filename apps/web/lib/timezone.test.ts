import { describe, expect, it } from "vitest";

import { nextCalendarDate, zonedDateTime } from "./timezone";

describe("school timezone helpers", () => {
  it("converts a Colombo wall-clock time without hard-coding its offset", () => {
    expect(zonedDateTime("2026-10-05", "09:15:00", "Asia/Colombo")).toBe("2026-10-05T03:45:00.000Z");
  });

  it("uses the configured timezone and observes daylight-saving offsets", () => {
    expect(zonedDateTime("2026-07-15", "09:15:00", "America/New_York")).toBe("2026-07-15T13:15:00.000Z");
    expect(zonedDateTime("2026-12-15", "09:15:00", "America/New_York")).toBe("2026-12-15T14:15:00.000Z");
  });

  it("advances date-only values across month and year boundaries", () => {
    expect(nextCalendarDate("2026-12-31")).toBe("2027-01-01");
  });
});
