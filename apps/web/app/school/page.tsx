import {
  archiveTimetableExceptionAction,
  createTimetableExceptionAction,
  createTimetableSlotAction,
  setFeatureAction,
  setCommunicationPermissionsAction,
  setTeacherTimetablePermissionAction,
  updateSchoolSettingsAction,
  updateTimetableSlotAction,
} from "@/app/actions/core";
import { AppShell, Stat, StatusNote } from "@/components/app-shell";
import { ChildGuardianManagement } from "@/components/child-guardian-management";
import { PrivatePhoto } from "@/components/private-photo";
import { SchoolStructureManagement } from "@/components/school-structure-management";
import { StaffManagement } from "@/components/staff-management";
import { requireViewer } from "@/lib/auth";
import { schoolAdminNavigation } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";
import { buildAttendanceOverview } from "@/lib/teacher-day-flow";

const weekdays = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export default async function SchoolPage({ searchParams }: { searchParams: Promise<{ invite?: string; inviteError?: string; membershipError?: string; staffError?: string }> }) {
  const viewer = await requireViewer(["school_admin"]);
  const state = await searchParams;
  const supabase = await createClient();
  const schoolId = viewer.schoolId!;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: viewer.timezone }).format(new Date());
  const [school, plans, children, enrollments, memberships, branches, classrooms, assignments, guardianLinks, invitations, settings, catalogue, planFeatures, slots, exceptions, audit, mediaConsents, storageUsage, recentPhotos, attendanceToday] = await Promise.all([
    supabase.from("schools").select("id, name, plan_id, timezone, teachers_can_manage_timetable, teachers_can_publish_announcements, teachers_can_manage_calendar").eq("id", schoolId).single(),
    supabase.from("plans").select("id, label, max_active_children, max_staff, storage_allowance_bytes").eq("status", "active"),
    supabase.from("children").select("id, preferred_name, status").eq("school_id", schoolId).order("preferred_name"),
    supabase.from("child_enrollments").select("id, child_id, classroom_id, status, starts_on, ends_on").eq("school_id", schoolId).order("starts_on", { ascending: false }),
    supabase.from("school_memberships").select("id, user_id, role, status, user_profiles(full_name)").eq("school_id", schoolId).order("role"),
    supabase.from("branches").select("id, name, status").eq("school_id", schoolId).order("name"),
    supabase.from("classrooms").select("id, branch_id, name, status").eq("school_id", schoolId).order("name"),
    supabase.from("classroom_staff_assignments").select("id, classroom_id, membership_id, status, starts_on, ends_on").eq("school_id", schoolId),
    supabase.from("child_guardians").select("id, child_id, guardian_membership_id, relationship_label, is_primary, status").eq("school_id", schoolId),
    supabase.from("invitations").select("id, invited_email, invited_role, invited_child_id, status, expires_at, delivery_status, delivery_attempt_count").eq("school_id", schoolId).order("created_at", { ascending: false }),
    supabase.from("school_feature_settings").select("feature_key, is_enabled").eq("school_id", schoolId),
    supabase.from("feature_catalogue").select("key, label, category, status").order("category").order("label"),
    supabase.from("plan_features").select("plan_id, feature_key, is_allowed"),
    supabase.from("timetable_slots").select("id, classroom_id, day_of_week, start_time, end_time, title, care_feature_key, status").eq("school_id", schoolId).order("day_of_week").order("start_time"),
    supabase.from("timetable_exceptions").select("id, classroom_id, service_date, kind, reason, timetable_slot_id, replacement_title, status").eq("school_id", schoolId).gte("service_date", new Date().toISOString().slice(0, 10)).order("service_date").limit(12),
    supabase.from("audit_log").select("id, occurred_at, action, entity_table").eq("school_id", schoolId).order("occurred_at", { ascending: false }).limit(8),
    supabase.from("child_media_consents").select("child_id, state, changed_at").eq("school_id", schoolId),
    supabase.from("school_storage_usage").select("used_bytes, reserved_bytes").eq("school_id", schoolId).maybeSingle(),
    supabase.from("media_assets").select("id, caption").eq("school_id", schoolId).eq("status", "ready").order("created_at", { ascending: false }).limit(12),
    supabase.from("attendance_records").select("classroom_id, child_id, status, checked_out_at").eq("school_id", schoolId).eq("service_date", today),
  ]);

  const plan = plans.data?.find((item) => item.id === school.data?.plan_id);
  const activeChildren = children.data?.filter((item) => item.status === "active") ?? [];
  const activeStaff = memberships.data?.filter((item) => item.status === "active" && item.role !== "guardian") ?? [];
  const enabled = new Map(settings.data?.map((item) => [item.feature_key, item.is_enabled]));
  const allowed = new Map(planFeatures.data?.filter((item) => item.plan_id === plan?.id).map((item) => [item.feature_key, item.is_allowed]));
  const classroomName = new Map(classrooms.data?.map((item) => [item.id, item.name]));
  const childLimitReached = activeChildren.length >= (plan?.max_active_children ?? Number.POSITIVE_INFINITY);
  const staffLimitReached = activeStaff.length >= (plan?.max_staff ?? Number.POSITIVE_INFINITY);
  const storageUsed = (storageUsage.data?.used_bytes ?? 0) + (storageUsage.data?.reserved_bytes ?? 0);
  const attendanceOverview = buildAttendanceOverview(
    (classrooms.data ?? []).filter((room) => room.status === "active").map((room) => ({ id: room.id, name: room.name })),
    (enrollments.data ?? []).filter((enrollment) => enrollment.status === "active" && enrollment.starts_on <= today && (!enrollment.ends_on || enrollment.ends_on >= today)),
    attendanceToday.data ?? [],
  );
  const invitationClock = new Date().toISOString();
  const localInviteUrl = state.invite && /^http:\/\/127\.0\.0\.1:3000\/invite\?token=[A-Za-z0-9_-]+$/.test(state.invite) ? state.invite : null;
  const invitationMessage = [
    "Invitation email accepted for delivery.",
    "Invitation saved, but email delivery failed. Reissue it after checking the email provider.",
    "Replacement invitation email accepted for delivery. The old link is no longer valid.",
    "Replacement invitation saved, but email delivery failed. The old link is no longer valid.",
  ].includes(state.invite ?? "") ? state.invite : null;
  const invitationCreated = Boolean(localInviteUrl) || Boolean(invitationMessage);
  const staffError = state.staffError === "A pending staff invitation already exists for this email. Revoke or reissue it instead."
    || state.staffError === "The staff invitation could not be created." ? state.staffError : null;
  const inviteError = state.inviteError === "Wait at least one minute after the last attempt before reissuing this invitation." ? state.inviteError : null;
  const membershipError = state.membershipError === "This is the final active School Admin. Add or reactivate another School Admin before deactivating this membership."
    || state.membershipError === "The staff membership could not be changed. Check that the school and your access are active." ? state.membershipError : null;
  const branchActive = new Map(branches.data?.map((branch) => [branch.id, branch.status === "active"]));

  return <AppShell eyebrow={viewer.schoolName ?? "School"} title="Overview" nav={schoolAdminNavigation}>
    {invitationCreated ? <StatusNote tone={invitationMessage?.includes("failed") ? "warning" : "success"}>{localInviteUrl ? <>Local-only invite URL: <a className="text-link break-all" href={localInviteUrl}>{localInviteUrl}</a></> : invitationMessage}</StatusNote> : null}
    {inviteError ? <StatusNote tone="warning">{inviteError}</StatusNote> : null}
    {membershipError ? <StatusNote tone="warning">{membershipError}</StatusNote> : null}
    {staffError ? <StatusNote tone="warning">{staffError}</StatusNote> : null}
    <section className="overview-band"><Stat value={activeChildren.length} label="active children" /><Stat value={activeStaff.length} label="active staff" /><Stat value={branches.data?.filter((item) => item.status === "active").length ?? 0} label="branches" /><Stat value={classrooms.data?.filter((item) => item.status === "active").length ?? 0} label="classrooms" /></section>
    <section className="section-panel attendance-overview"><div className="section-heading"><div><p className="eyebrow">Today</p><h2>Attendance by classroom</h2></div><span className="count-label">{today}</span></div>{attendanceOverview.length ? <div className="attendance-overview-list">{attendanceOverview.map((summary) => <div className="attendance-overview-row" key={summary.classroomId}><strong>{summary.classroomName}</strong><span><b>{summary.checkedIn}</b> in</span><span><b>{summary.checkedOut}</b> out</span><span><b>{summary.absent}</b> absent</span><span><b>{summary.excused}</b> excused</span><span><b>{summary.notArrived}</b> not arrived</span><small>{summary.enrolled} enrolled</small></div>)}</div> : <p className="empty-state">No active classrooms are available.</p>}</section>
    <div className="content-grid">
      <SchoolStructureManagement branches={branches.data ?? []} classrooms={classrooms.data ?? []} assignments={assignments.data ?? []} enrollments={enrollments.data ?? []} today={today} />

      <section className="section-panel"><div className="section-heading"><h2>Plan usage</h2></div><p className="meta">{plan?.label ?? "Plan"}</p><label className="meter-label">Children <span>{activeChildren.length} / {plan?.max_active_children ?? 0}</span></label><progress max={plan?.max_active_children ?? 1} value={activeChildren.length} /><label className="meter-label">Staff <span>{activeStaff.length} / {plan?.max_staff ?? 0}</span></label><progress max={plan?.max_staff ?? 1} value={activeStaff.length} /><label className="meter-label">Private media <span>{(storageUsed / 1048576).toFixed(1)} / {((plan?.storage_allowance_bytes ?? 0) / 1048576).toFixed(0)} MB</span></label><progress max={plan?.storage_allowance_bytes || 1} value={storageUsed} />{childLimitReached ? <StatusNote tone="warning">The active-child limit has been reached. Archive a child who has left or ask Loop to change the plan.</StatusNote> : null}{staffLimitReached ? <StatusNote tone="warning">The active-staff limit has been reached. Deactivate a former staff membership or ask Loop to change the plan.</StatusNote> : null}</section>

      {recentPhotos.data?.length ? <section className="section-panel"><div className="section-heading"><div><p className="eyebrow">Private media</p><h2>Recent photos</h2></div></div><p className="muted">Removing a photo hides it immediately and schedules every private size for deletion.</p><div className="photo-grid recent-photos">{recentPhotos.data.map((photo) => <PrivatePhoto assetId={photo.id} caption={photo.caption} canRemove key={photo.id} />)}</div></section> : null}

      <ChildGuardianManagement
        roster={children.data ?? []}
        enrollments={enrollments.data ?? []}
        classrooms={classrooms.data ?? []}
        branches={branches.data ?? []}
        guardians={(memberships.data ?? []).filter((item) => item.role === "guardian").map((item) => ({ id: item.id, status: item.status, name: item.user_profiles?.full_name ?? "Guardian" }))}
        guardianLinks={guardianLinks.data ?? []}
        guardianInvitations={(invitations.data ?? []).filter((invite) => invite.invited_role === "guardian")}
        consents={mediaConsents.data ?? []}
        today={today}
        childLimitReached={childLimitReached}
      />

      <StaffManagement
        staff={(memberships.data ?? []).filter((item) => item.role !== "guardian").map((item) => ({ id: item.id, name: item.user_profiles?.full_name ?? "Staff member", role: item.role === "teacher" ? "teacher" as const : "school_admin" as const, status: item.status }))}
        classrooms={(classrooms.data ?? []).map((room) => ({ id: room.id, name: room.name, status: room.status, branchActive: branchActive.get(room.branch_id) ?? false }))}
        assignments={assignments.data ?? []}
        invitations={(invitations.data ?? []).filter((invite) => invite.invited_role !== "guardian").map((invite) => ({ id: invite.id, invited_email: invite.invited_email, invited_role: invite.invited_role === "teacher" ? "teacher" as const : "school_admin" as const, status: invite.status, expires_at: invite.expires_at, delivery_status: invite.delivery_status, delivery_attempt_count: invite.delivery_attempt_count }))}
        clock={invitationClock}
        today={today}
      />

      <section id="timetable" className="section-panel span-two"><div className="section-heading"><div><p className="eyebrow">Recurring week</p><h2>Timetable</h2></div></div><div className="schedule-list">{slots.data?.map((slot) => <details className="management-row" key={slot.id}><summary><time>{weekdays[slot.day_of_week - 1]} {slot.start_time.slice(0, 5)}–{slot.end_time.slice(0, 5)}</time><strong>{slot.title}</strong><span>{classroomName.get(slot.classroom_id)} · {slot.status}</span></summary><form action={updateTimetableSlotAction} className="form-grid"><input type="hidden" name="slot_id" value={slot.id} /><label className="field"><span>Day</span><select name="day_of_week" defaultValue={slot.day_of_week}>{weekdays.map((day, index) => <option value={index + 1} key={day}>{day}</option>)}</select></label><label className="field"><span>Start</span><input name="start_time" type="time" defaultValue={slot.start_time.slice(0, 5)} required /></label><label className="field"><span>End</span><input name="end_time" type="time" defaultValue={slot.end_time.slice(0, 5)} required /></label><label className="field"><span>Activity</span><input name="title" defaultValue={slot.title} required /></label><label className="field"><span>Status</span><select name="status" defaultValue={slot.status}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></select></label><button className="button button-secondary">Save activity</button></form></details>)}</div><div className="inline-editors"><details className="editor"><summary>Add recurring activity</summary><form action={createTimetableSlotAction} className="form-grid"><label className="field"><span>Classroom</span><select name="classroom_id">{classrooms.data?.filter((item) => item.status === "active").map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label className="field"><span>Day</span><select name="day_of_week">{weekdays.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}</select></label><label className="field"><span>Start</span><input name="start_time" type="time" required /></label><label className="field"><span>End</span><input name="end_time" type="time" required /></label><label className="field"><span>Activity</span><input name="title" required /></label><label className="field"><span>Linked care</span><select name="care_feature_key"><option value="">None</option>{catalogue.data?.filter((item) => item.category === "care" && item.status === "active" && allowed.get(item.key)).map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label><button className="button button-primary">Add activity</button></form></details><details className="editor"><summary>Add date exception</summary><form action={createTimetableExceptionAction} className="form-grid"><label className="field"><span>Classroom</span><select name="classroom_id">{classrooms.data?.filter((item) => item.status === "active").map((room) => <option key={room.id} value={room.id}>{room.name}</option>)}</select></label><label className="field"><span>Date</span><input type="date" name="service_date" required /></label><label className="field"><span>Type</span><select name="kind"><option value="cancelled">Cancelled</option><option value="changed">Changed</option><option value="additional">Additional</option></select></label><label className="field"><span>Existing slot</span><select name="timetable_slot_id"><option value="">Choose slot</option>{slots.data?.filter((item) => item.status === "active").map((slot) => <option key={slot.id} value={slot.id}>{slot.title}</option>)}</select></label><label className="field"><span>Additional title</span><input name="replacement_title" /></label><label className="field"><span>Start</span><input name="replacement_start_time" type="time" /></label><label className="field"><span>End</span><input name="replacement_end_time" type="time" /></label><label className="field"><span>Reason</span><input name="reason" /></label><button className="button button-secondary">Add exception</button></form></details></div>{exceptions.data?.map((item) => <div className="person-row" key={item.id}><span>{item.service_date} · {item.kind}<small>{item.replacement_title ?? item.reason ?? "Timetable activity"} · {item.status}</small></span>{item.status === "active" ? <form action={archiveTimetableExceptionAction}><input type="hidden" name="exception_id" value={item.id} /><button className="text-button">Archive</button></form> : null}</div>)}</section>

      <section id="features" className="section-panel"><div className="section-heading"><h2>Features</h2></div><div className="feature-list">{catalogue.data?.filter((feature) => feature.status === "active").map((feature) => { const deferred = feature.key === "short_video"; const included = (allowed.get(feature.key) ?? false) && !deferred; return <form key={feature.key} action={setFeatureAction} className="feature-row"><input type="hidden" name="feature_key" value={feature.key} /><label><input type="checkbox" name="enabled" defaultChecked={deferred ? false : enabled.get(feature.key) ?? false} disabled={!included} /> {feature.label}</label><span className="feature-state">{deferred ? "Deferred — safety pipeline required" : included ? (enabled.get(feature.key) ? "Enabled" : "Available — off") : "Not in plan"}</span><button className="text-button" disabled={!included}>Save</button></form>; })}</div></section>
      <section id="settings" className="section-panel"><div className="section-heading"><h2>Settings</h2></div><form action={updateSchoolSettingsAction} className="form-stack"><label className="field"><span>School name</span><input name="name" defaultValue={school.data?.name} required /></label><label className="field"><span>Timezone</span><input name="timezone" defaultValue={school.data?.timezone} required /></label><button className="button button-secondary">Save school settings</button></form><form action={setTeacherTimetablePermissionAction} className="feature-row"><label><input type="checkbox" name="enabled" defaultChecked={school.data?.teachers_can_manage_timetable} /> Teachers may manage assigned classroom timetables</label><button className="button button-secondary">Save</button></form><form action={setCommunicationPermissionsAction} className="form-stack sub-editor"><label className="check-field"><input type="checkbox" name="teachers_can_publish_announcements" defaultChecked={school.data?.teachers_can_publish_announcements} /> Teachers may publish to assigned classrooms</label><label className="check-field"><input type="checkbox" name="teachers_can_manage_calendar" defaultChecked={school.data?.teachers_can_manage_calendar} /> Teachers may manage assigned classroom events</label><button className="button button-secondary">Save communication permissions</button></form></section>
      <section className="section-panel span-two"><div className="section-heading"><h2>Recent changes</h2></div>{audit.data?.map((item) => <div className="list-row" key={item.id}><span><strong>{item.action}</strong><small>{item.entity_table}</small></span><time>{new Date(item.occurred_at).toLocaleString("en-LK")}</time></div>)}</section>
    </div>
  </AppShell>;
}
