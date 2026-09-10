import { availableCoreFeatures, deriveTimetableStatus, type FeatureKey } from "@loop/domain";

import { bulkCheckInAction, createTimetableExceptionAction, createTimetableSlotAction, setAttendanceAction } from "@/app/actions/core";
import { AppShell, StatusNote } from "@/components/app-shell";
import { LoopIcon } from "@/components/loop-icon";
import { PrivatePhoto } from "@/components/private-photo";
import { TeacherCarePanel } from "@/components/teacher-care-panel";
import { TeacherMediaPanel } from "@/components/teacher-media-panel";
import { requireViewer } from "@/lib/auth";
import { teacherNavigation } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function TeacherPage() {
  const viewer = await requireViewer(["teacher"]);
  const supabase = await createClient();
  const assignment = await supabase.from("classroom_staff_assignments").select("classroom_id, classrooms(name)").eq("membership_id", viewer.membershipId!).eq("status", "active").lte("starts_on", new Date().toISOString().slice(0, 10)).or(`ends_on.is.null,ends_on.gte.${new Date().toISOString().slice(0, 10)}`).limit(1).maybeSingle();
  const classroomId = assignment.data?.classroom_id;
  if (!classroomId) return <AppShell eyebrow={viewer.schoolName ?? "School"} title="Classroom today" nav={teacherNavigation} contentWidth="wide"><StatusNote tone="warning">You are signed in as a teacher, but no active classroom is assigned. Ask a school administrator to assign one.</StatusNote></AppShell>;

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: viewer.timezone }).format(new Date());
  const weekday = new Date(`${today}T00:00:00+05:30`).getUTCDay() || 7;
  const [enrollments, attendance, slots, exceptions, settings, school, activeSleeps, consents, recentPhotos] = await Promise.all([
    supabase.from("child_enrollments").select("id, child_id, children(preferred_name)").eq("classroom_id", classroomId).eq("status", "active").order("starts_on"),
    supabase.from("attendance_records").select("id, child_id, status, checked_in_at, checked_out_at").eq("classroom_id", classroomId).eq("service_date", today),
    supabase.from("timetable_slots").select("id, title, start_time, end_time, care_feature_key").eq("classroom_id", classroomId).eq("day_of_week", weekday).eq("status", "active").order("start_time"),
    supabase.from("timetable_exceptions").select("id, timetable_slot_id, kind, replacement_title, replacement_start_time, replacement_end_time").eq("classroom_id", classroomId).eq("service_date", today).eq("status", "active"),
    supabase.from("school_feature_settings").select("feature_key, is_enabled").eq("school_id", viewer.schoolId!).eq("is_enabled", true),
    supabase.from("schools").select("teachers_can_manage_timetable").eq("id", viewer.schoolId!).single(),
    supabase.from("care_events").select("id, child_id").eq("classroom_id", classroomId).eq("category", "sleep").eq("status", "recorded").not("started_at", "is", null).is("ended_at", null),
    supabase.from("child_media_consents").select("child_id, state").eq("school_id", viewer.schoolId!),
    supabase.from("media_assets").select("id, caption, created_at").eq("classroom_id", classroomId).eq("status", "ready").order("created_at", { ascending: false }).limit(6),
  ]);
  const exceptionBySlot = new Map(exceptions.data?.filter((item) => item.timetable_slot_id).map((item) => [item.timetable_slot_id, item]));
  const effectiveSlots = (slots.data ?? []).filter((slot) => exceptionBySlot.get(slot.id)?.kind !== "cancelled").map((slot) => {
    const exception = exceptionBySlot.get(slot.id);
    return { ...slot, title: exception?.replacement_title ?? slot.title, start_time: exception?.replacement_start_time ?? slot.start_time, end_time: exception?.replacement_end_time ?? slot.end_time };
  });
  const statusSlots = effectiveSlots.map((slot) => ({ ...slot, derived: deriveTimetableStatus({ now: new Date(), serviceDate: today, startTime: slot.start_time, endTime: slot.end_time, timezone: viewer.timezone, attendance: "present", confirmed: false }) }));
  const current = statusSlots.find((slot) => slot.derived === "now");
  const next = statusSlots.find((slot) => slot.derived === "upcoming");
  const attendanceByChild = new Map(attendance.data?.map((item) => [item.child_id, item]));
  const presentCount = attendance.data?.filter((item) => item.status === "present" && !item.checked_out_at).length ?? 0;
  const enabled = availableCoreFeatures((settings.data?.map((item) => item.feature_key) ?? []) as FeatureKey[]);
  const sleepByChild = new Map(activeSleeps.data?.map((item) => [item.child_id, item.id]));
  const consentByChild = new Map(consents.data?.map((item) => [item.child_id, item.state]));
  const careChildren = (enrollments.data ?? []).map((enrollment) => {
    const record = attendanceByChild.get(enrollment.child_id);
    return {
      id: enrollment.child_id,
      name: enrollment.children?.preferred_name ?? "Child",
      present: record?.status === "present" && !record.checked_out_at,
      sleepEventId: sleepByChild.get(enrollment.child_id) ?? null,
      consent: consentByChild.get(enrollment.child_id) ?? "not_recorded",
    };
  });

  return <AppShell eyebrow={viewer.schoolName ?? "School"} title="Classroom today" nav={teacherNavigation} contentWidth="wide">
    <section className="teacher-hero"><div><p className="eyebrow">Assigned classroom</p><h2>{assignment.data?.classrooms?.name ?? "Classroom"}</h2></div><p className="present-count"><strong>{presentCount}</strong><span>present</span><small>of {enrollments.data?.length ?? 0}</small></p></section>
    <section className="now-next"><div><p className="eyebrow">Now</p><strong>{current?.title ?? "No activity now"}</strong><span>{current ? `${current.start_time.slice(0,5)}–${current.end_time.slice(0,5)}` : "—"}</span></div><div><p className="eyebrow">Next</p><strong>{next?.title ?? "Day complete"}</strong><span>{next ? `${next.start_time.slice(0,5)}–${next.end_time.slice(0,5)}` : "—"}</span></div></section>
    <section id="attendance" className="section-panel"><div className="section-heading"><div><p className="eyebrow">Today</p><h2>Attendance</h2></div><span className="count-label">{presentCount} / {enrollments.data?.length ?? 0}</span></div>{enrollments.data?.some((enrollment) => { const record = attendanceByChild.get(enrollment.child_id); return !record || record.status === "expected"; }) ? <form action={bulkCheckInAction} className="bulk-arrivals"><div className="bulk-arrivals-heading"><strong>Arriving together?</strong><button className="button button-secondary" type="submit">Check in selected</button></div><div className="bulk-arrival-choices">{enrollments.data?.map((enrollment) => { const record = attendanceByChild.get(enrollment.child_id); return !record || record.status === "expected" ? <label className="check-field" key={enrollment.id}><input type="checkbox" name="child_id" value={enrollment.child_id} /> {enrollment.children?.preferred_name ?? "Child"}</label> : null; })}</div></form> : null}<div className="attendance-list">{enrollments.data?.map((enrollment) => { const record = attendanceByChild.get(enrollment.child_id); const isPresent = record?.status === "present" && !record.checked_out_at; const isCheckedOut = Boolean(record?.checked_out_at); const canCheckIn = !record || record.status === "expected"; return <div className="attendance-row" key={enrollment.id}><span className={`attendance-mark ${isPresent ? "is-present" : ""}`}><LoopIcon name={isPresent ? "check" : "clock"} className="size-5" /></span><strong>{enrollment.children?.preferred_name ?? "Child"}</strong><span>{isPresent ? "Checked in" : isCheckedOut ? "Checked out" : record?.status ?? "Expected"}</span>{isPresent || canCheckIn ? <form action={setAttendanceAction}><input type="hidden" name="child_id" value={enrollment.child_id} /><button className="text-button" name="attendance_action" value={isPresent ? "check_out" : "check_in"} type="submit">{isPresent ? "Check out" : "Check in"}</button></form> : <span className="meta">Recorded</span>}</div>; })}</div></section>
    <section id="care" className="section-panel"><div className="section-heading"><div><p className="eyebrow">Few-tap workflow</p><h2>Record care in bulk</h2></div></div><TeacherCarePanel enabledFeatures={enabled} roster={careChildren} classroomId={classroomId} serviceDate={today} currentSlot={current ? { id: current.id, featureKey: current.care_feature_key } : null} /></section>
    {settings.data?.some((item) => item.feature_key === "photos" && item.is_enabled) ? <section id="photos" className="section-panel"><div className="section-heading"><div><p className="eyebrow">Private media</p><h2>Photos</h2></div></div><TeacherMediaPanel classroomId={classroomId} roster={careChildren} />{recentPhotos.data?.length ? <div className="photo-grid recent-photos">{recentPhotos.data.map((photo) => <PrivatePhoto assetId={photo.id} caption={photo.caption} key={photo.id} />)}</div> : null}</section> : null}
    {school.data?.teachers_can_manage_timetable ? <section className="section-panel"><div className="section-heading"><h2>Manage this classroom timetable</h2></div><div className="inline-editors"><details className="editor"><summary>Add recurring activity</summary><form action={createTimetableSlotAction} className="form-grid"><input type="hidden" name="classroom_id" value={classroomId} /><label className="field"><span>Day</span><select name="day_of_week">{[1,2,3,4,5,6,7].map((day) => <option key={day} value={day}>{day}</option>)}</select></label><label className="field"><span>Start</span><input type="time" name="start_time" required /></label><label className="field"><span>End</span><input type="time" name="end_time" required /></label><label className="field"><span>Activity</span><input name="title" required /></label><button className="button button-secondary">Add activity</button></form></details><details className="editor"><summary>Cancel an activity for a date</summary><form action={createTimetableExceptionAction} className="form-grid"><input type="hidden" name="classroom_id" value={classroomId} /><input type="hidden" name="kind" value="cancelled" /><label className="field"><span>Date</span><input type="date" name="service_date" required /></label><label className="field"><span>Activity</span><select name="timetable_slot_id">{slots.data?.map((slot) => <option key={slot.id} value={slot.id}>{slot.title}</option>)}</select></label><label className="field"><span>Reason</span><input name="reason" /></label><button className="button button-secondary">Add exception</button></form></details></div></section> : null}
  </AppShell>;
}
