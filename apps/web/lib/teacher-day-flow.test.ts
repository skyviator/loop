import { describe, expect, it } from "vitest";

import {
  buildAttendanceOverview,
  buildEffectiveDailySchedule,
  defaultPhotoSelection,
} from "./teacher-day-flow";

describe("teacher day-flow helpers", () => {
  it("applies daily changes and additions without mutating recurring slots", () => {
    const slots = [{ id: "circle", title: "Circle", start_time: "09:00", end_time: "09:30", care_feature_key: "activities" }];
    const original = structuredClone(slots);
    expect(buildEffectiveDailySchedule(slots, [
      { id: "change", timetable_slot_id: "circle", kind: "changed", replacement_title: "Outdoor circle", replacement_start_time: "09:15", replacement_end_time: "09:45" },
      { id: "extra", timetable_slot_id: null, kind: "additional", replacement_title: "Music", replacement_start_time: "10:00", replacement_end_time: "10:20" },
    ]).map((slot) => [slot.title, slot.exceptionKind])).toEqual([
      ["Outdoor circle", "changed"],
      ["Music", "additional"],
    ]);
    expect(slots).toEqual(original);
  });

  it("removes a cancelled slot from only the effective day", () => {
    const slots = [{ id: "rest", title: "Rest", start_time: "13:00", end_time: "14:00", care_feature_key: "sleep" }];
    expect(buildEffectiveDailySchedule(slots, [{ id: "cancel", timetable_slot_id: "rest", kind: "cancelled", replacement_title: null, replacement_start_time: null, replacement_end_time: null }])).toEqual([]);
    expect(slots).toHaveLength(1);
  });

  it("summarizes only each classroom roster", () => {
    expect(buildAttendanceOverview(
      [{ id: "a", name: "Sunbirds" }, { id: "b", name: "Kingfishers" }],
      [{ classroom_id: "a", child_id: "1" }, { classroom_id: "a", child_id: "2" }, { classroom_id: "b", child_id: "3" }],
      [{ classroom_id: "a", child_id: "1", status: "present", checked_out_at: null }, { classroom_id: "b", child_id: "3", status: "absent", checked_out_at: null }],
    )).toEqual([
      { classroomId: "a", classroomName: "Sunbirds", enrolled: 2, checkedIn: 1, checkedOut: 0, absent: 0, excused: 0, notArrived: 1 },
      { classroomId: "b", classroomName: "Kingfishers", enrolled: 1, checkedIn: 0, checkedOut: 0, absent: 1, excused: 0, notArrived: 0 },
    ]);
  });

  it("defaults photo tags to present children with granted consent", () => {
    expect(defaultPhotoSelection([
      { id: "present", present: true, consent: "granted" },
      { id: "away", present: false, consent: "granted" },
      { id: "blocked", present: true, consent: "denied" },
    ])).toEqual(["present"]);
  });
});
