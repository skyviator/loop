export type DailySlot = {
  id: string;
  title: string;
  start_time: string;
  end_time: string;
  care_feature_key: string | null;
};

export type DailyException = {
  id: string;
  timetable_slot_id: string | null;
  kind: "cancelled" | "changed" | "replacement" | "additional";
  replacement_title: string | null;
  replacement_start_time: string | null;
  replacement_end_time: string | null;
};

export type EffectiveDailySlot = DailySlot & {
  sourceSlotId: string | null;
  exceptionKind: DailyException["kind"] | null;
};

export function buildEffectiveDailySchedule(
  slots: readonly DailySlot[],
  exceptions: readonly DailyException[],
): EffectiveDailySlot[] {
  const bySlot = new Map(
    exceptions
      .filter((exception) => exception.timetable_slot_id)
      .map((exception) => [exception.timetable_slot_id, exception]),
  );
  const recurring = slots.flatMap((slot) => {
    const exception = bySlot.get(slot.id);
    if (exception?.kind === "cancelled") return [];
    return [{
      ...slot,
      title: exception?.replacement_title ?? slot.title,
      start_time: exception?.replacement_start_time ?? slot.start_time,
      end_time: exception?.replacement_end_time ?? slot.end_time,
      sourceSlotId: slot.id,
      exceptionKind: exception?.kind ?? null,
    }];
  });
  const additional = exceptions
    .filter((exception) => exception.kind === "additional")
    .flatMap((exception) => {
      if (!exception.replacement_title || !exception.replacement_start_time || !exception.replacement_end_time) return [];
      return [{
        id: `exception-${exception.id}`,
        title: exception.replacement_title,
        start_time: exception.replacement_start_time,
        end_time: exception.replacement_end_time,
        care_feature_key: null,
        sourceSlotId: null,
        exceptionKind: "additional" as const,
      }];
    });
  return [...recurring, ...additional].sort((left, right) => left.start_time.localeCompare(right.start_time));
}

export type AttendanceSummary = {
  classroomId: string;
  classroomName: string;
  enrolled: number;
  checkedIn: number;
  checkedOut: number;
  absent: number;
  excused: number;
  notArrived: number;
};

export function buildAttendanceOverview(
  classrooms: readonly { id: string; name: string }[],
  enrollments: readonly { classroom_id: string; child_id: string }[],
  attendance: readonly { classroom_id: string; child_id: string; status: string; checked_out_at: string | null }[],
): AttendanceSummary[] {
  const recordByChild = new Map(attendance.map((record) => [record.child_id, record]));
  return classrooms.map((classroom) => {
    const roster = enrollments.filter((enrollment) => enrollment.classroom_id === classroom.id);
    const records = roster.map((enrollment) => recordByChild.get(enrollment.child_id));
    return {
      classroomId: classroom.id,
      classroomName: classroom.name,
      enrolled: roster.length,
      checkedIn: records.filter((record) => record?.status === "present" && !record.checked_out_at).length,
      checkedOut: records.filter((record) => record?.status === "present" && Boolean(record.checked_out_at)).length,
      absent: records.filter((record) => record?.status === "absent").length,
      excused: records.filter((record) => record?.status === "excused").length,
      notArrived: records.filter((record) => !record || record.status === "expected").length,
    };
  });
}

export function defaultPhotoSelection(
  roster: readonly { id: string; present: boolean; consent: string }[],
) {
  return roster
    .filter((child) => child.present && child.consent === "granted")
    .map((child) => child.id);
}
