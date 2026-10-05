"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { emailAddress, oneOf, requiredText, uuid, ValidationError } from "@loop/validation";

import { requireViewer } from "@/lib/auth";
import { deliverInvitation } from "@/lib/invitations/server";
import { scheduleMediaCleanup } from "@/lib/media/schedule";
import { schedulePushDispatch } from "@/lib/push/schedule";
import { createServerAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function localDate(timezone: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
}

function formBoolean(value: FormDataEntryValue | null) {
  return value === "on" || value === "true";
}

function boundedNumber(value: FormDataEntryValue | null, label: string, minimum: number, maximum: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) throw new ValidationError(`${label} is invalid.`);
  return parsed;
}

function optionalUuid(value: FormDataEntryValue | null, label: string) {
  return typeof value === "string" && value ? uuid(value, label) : null;
}

export type ActionState = { status: "idle" | "success" | "error"; message: string; saved?: number };

type InvitationRole = "school_admin" | "teacher" | "guardian";

function expectedActionError(error: unknown, fallback: string): ActionState {
  if (error instanceof ValidationError) return { status: "error", message: error.message };
  return { status: "error", message: fallback };
}

export async function createSchoolAction(formData: FormData) {
  const viewer = await requireViewer(["super_admin"]);
  const supabase = await createClient();
  const name = requiredText(formData.get("name"), "School name");
  const planId = uuid(formData.get("plan_id"), "Plan");
  const slug = requiredText(formData.get("slug"), "School identifier", 80).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error("School identifier must use lowercase letters, numbers, and hyphens.");
  const { error } = await supabase.from("schools").insert({ name, plan_id: planId, slug });
  if (error) throw new Error(error.message);
  await supabase.from("audit_log").insert({ actor_user_id: viewer.userId, action: "school.created", entity_table: "schools", new_values: { name, slug } });
  revalidatePath("/platform");
}

export async function updateSchoolPlatformAction(formData: FormData) {
  await requireViewer(["super_admin"]);
  const schoolId = uuid(formData.get("school_id"), "School");
  const { error } = await (await createClient()).from("schools").update({
    name: requiredText(formData.get("name"), "School name", 160),
    timezone: requiredText(formData.get("timezone"), "Timezone", 80),
    plan_id: uuid(formData.get("plan_id"), "Plan"),
    status: oneOf(formData.get("status"), ["active", "inactive", "archived"] as const, "School status"),
  }).eq("id", schoolId);
  if (error) throw new Error(error.message);
  revalidatePath("/platform");
}

export async function updatePlanAction(formData: FormData) {
  await requireViewer(["super_admin"]);
  const planId = uuid(formData.get("plan_id"), "Plan");
  const storageGb = boundedNumber(formData.get("storage_gb"), "Storage allowance", 0, 100_000);
  const { error } = await (await createClient()).from("plans").update({
    max_active_children: Math.trunc(boundedNumber(formData.get("max_active_children"), "Child limit", 1, 100_000)),
    max_staff: Math.trunc(boundedNumber(formData.get("max_staff"), "Staff limit", 1, 100_000)),
    storage_allowance_bytes: Math.round(storageGb * 1024 * 1024 * 1024),
  }).eq("id", planId);
  if (error) throw new Error(error.message);
  revalidatePath("/platform");
}

export async function setPlanFeatureAction(formData: FormData) {
  await requireViewer(["super_admin"]);
  const { error } = await (await createClient()).from("plan_features").upsert({
    plan_id: uuid(formData.get("plan_id"), "Plan"),
    feature_key: requiredText(formData.get("feature_key"), "Feature", 50),
    is_allowed: formBoolean(formData.get("allowed")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/platform");
}

export async function createBranchAction(formData: FormData) {
  const viewer = await requireViewer(["super_admin", "school_admin"]);
  const schoolId = viewer.role === "super_admin" ? uuid(formData.get("school_id"), "School") : viewer.schoolId!;
  const name = requiredText(formData.get("name"), "Branch name", 120);
  const { error } = await (await createClient()).from("branches").insert({ school_id: schoolId, name });
  if (error) throw new Error(error.message);
  revalidatePath(viewer.role === "super_admin" ? "/platform" : "/school");
}

export async function createClassroomAction(formData: FormData) {
  const viewer = await requireViewer(["super_admin", "school_admin"]);
  const schoolId = viewer.role === "super_admin" ? uuid(formData.get("school_id"), "School") : viewer.schoolId!;
  const branchId = uuid(formData.get("branch_id"), "Branch");
  const name = requiredText(formData.get("name"), "Classroom name", 120);
  const { error } = await (await createClient()).from("classrooms").insert({ school_id: schoolId, branch_id: branchId, name });
  if (error) throw new Error(error.message);
  revalidatePath(viewer.role === "super_admin" ? "/platform" : "/school");
}

export async function createChildAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const classroomId = uuid(formData.get("classroom_id"), "Classroom");
  const preferredName = requiredText(formData.get("preferred_name"), "Child name", 80);
  const { error } = await (await createClient()).rpc("create_child_with_enrollment", {
    expected_school_id: viewer.schoolId!,
    target_preferred_name: preferredName,
    target_classroom_id: classroomId,
    enrollment_start: localDate(viewer.timezone),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/school");
}

export async function assignStaffAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const membershipId = uuid(formData.get("membership_id"), "Staff member");
  const classroomId = uuid(formData.get("classroom_id"), "Classroom");
  const supabase = await createClient();
  const [membership, classroom, existing] = await Promise.all([
    supabase.from("school_memberships").select("id, role, status").eq("school_id", viewer.schoolId!).eq("id", membershipId).maybeSingle(),
    supabase.from("classrooms").select("id, status, branches(status)").eq("school_id", viewer.schoolId!).eq("id", classroomId).maybeSingle(),
    supabase.from("classroom_staff_assignments").select("id").eq("school_id", viewer.schoolId!).eq("membership_id", membershipId).eq("classroom_id", classroomId).eq("status", "active").limit(1),
  ]);
  if (membership.error || classroom.error || existing.error) throw new Error("Classroom assignment could not be checked.");
  if (membership.data?.role !== "teacher" || membership.data.status !== "active") throw new Error("Reactivate this Teacher's school access before assigning a classroom.");
  if (classroom.data?.status !== "active" || classroom.data.branches?.status !== "active") throw new Error("Choose an active classroom in an active branch.");
  if (existing.data?.length) throw new Error("This Teacher is already assigned to that classroom.");
  const { error } = await supabase.from("classroom_staff_assignments").insert({
    school_id: viewer.schoolId!, membership_id: membershipId, classroom_id: classroomId,
  });
  if (error) throw new Error(error.code === "23505" ? "This classroom already has an assignment for the Teacher on this date. Restore the existing row if needed." : "The Teacher could not be assigned to this classroom.");
  revalidatePath("/school");
}

export async function linkGuardianAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const { error } = await (await createClient()).from("child_guardians").insert({
    school_id: viewer.schoolId!,
    child_id: uuid(formData.get("child_id"), "Child"),
    guardian_membership_id: uuid(formData.get("guardian_membership_id"), "Guardian"),
    relationship_label: requiredText(formData.get("relationship_label"), "Relationship", 50),
    is_primary: formBoolean(formData.get("is_primary")),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/school");
}

async function issueInvitation(input: {
  actorUserId: string;
  schoolId: string;
  email: string;
  role: InvitationRole;
  childId?: string;
  relationshipLabel?: string;
  isPrimary?: boolean;
}) {
  const admin = createServerAdminClient();
  const { data, error } = await admin.rpc("create_invitation", {
    actor_user_id: input.actorUserId,
    invitation_school_id: input.schoolId,
    invitation_email: input.email,
    invitation_role: input.role,
    invitation_child_id: input.childId ?? undefined,
    invitation_relationship_label: input.relationshipLabel ?? undefined,
    invitation_is_primary: input.isPrimary ?? false,
  });
  const invitation = data?.[0];
  if (error || !invitation) {
    if (error?.code === "23505") throw new Error("A pending invitation already exists for this email.");
    throw new Error("The invitation could not be created.");
  }
  const supabase = await createClient();
  const school = await supabase.from("schools").select("name").eq("id", input.schoolId).single();
  if (school.error) throw new Error("The invitation was saved, but delivery could not be prepared.");
  const delivery = await deliverInvitation({
    invitationId: invitation.invitation_id,
    token: invitation.invitation_token,
    to: input.email,
    role: input.role,
    schoolName: school.data.name,
    expiresAt: invitation.invitation_expires_at,
  });
  if (delivery.status === "preview") return "Invitation created. Local email delivery is not configured.";
  if (delivery.status === "accepted") return "Invitation email accepted for delivery.";
  return "Invitation saved, but email delivery failed. Reissue it after checking the email provider.";
}

export async function createInvitationAction(formData: FormData) {
  const viewer = await requireViewer(["super_admin", "school_admin"]);
  const schoolId = viewer.role === "super_admin" ? uuid(formData.get("school_id"), "School") : viewer.schoolId!;
  const role = oneOf(formData.get("role"), ["school_admin", "teacher", "guardian"] as const, "Role");
  if (viewer.role === "super_admin" && role !== "school_admin") throw new Error("Platform administrators may only create the first school administrator invitation.");
  const message = await issueInvitation({
    actorUserId: viewer.userId,
    schoolId,
    role,
    email: emailAddress(formData.get("email")),
    childId: role === "guardian" ? uuid(formData.get("child_id"), "Child") : undefined,
    relationshipLabel: role === "guardian" ? requiredText(formData.get("relationship_label"), "Relationship", 50) : undefined,
    isPrimary: role === "guardian" && formBoolean(formData.get("is_primary")),
  });

  const returnTo = viewer.role === "super_admin" ? "/platform" : "/school";
  redirect(`${returnTo}?invite=${encodeURIComponent(message)}`);
}

export async function createStaffInvitationAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const role = oneOf(formData.get("role"), ["teacher", "school_admin"] as const, "Staff role");
  const email = emailAddress(formData.get("email"));
  let message: string;
  try {
    message = await issueInvitation({ actorUserId: viewer.userId, schoolId: viewer.schoolId!, email, role });
  } catch (error) {
    const failure = error instanceof Error && error.message === "A pending invitation already exists for this email."
      ? "A pending staff invitation already exists for this email. Revoke or reissue it instead."
      : "The staff invitation could not be created.";
    redirect(`/school?staffError=${encodeURIComponent(failure)}#staff-invitations`);
  }
  redirect(`/school?invite=${encodeURIComponent(message)}#staff-invitations`);
}

export async function reissueInvitationAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "super_admin"]);
  const invitationId = uuid(formData.get("invitation_id"), "Invitation");
  const supabase = await createClient();
  let query = supabase.from("invitations").select("id, school_id, invited_email, invited_role, expires_at, schools(name)").eq("id", invitationId);
  if (viewer.role === "school_admin") query = query.eq("school_id", viewer.schoolId!);
  const existing = await query.maybeSingle();
  if (existing.error || !existing.data) throw new Error("The invitation is unavailable.");

  const { data, error } = await createServerAdminClient().rpc("reissue_invitation", {
    actor_user_id: viewer.userId,
    target_invitation_id: invitationId,
  });
  const replacement = data?.[0];
  const returnTo = viewer.role === "super_admin" ? "/platform" : "/school";
  if (error || !replacement) {
    redirect(`${returnTo}?inviteError=${encodeURIComponent("Wait at least one minute after the last attempt before reissuing this invitation.")}`);
  }
  const delivery = await deliverInvitation({
    invitationId: replacement.invitation_id,
    token: replacement.invitation_token,
    to: existing.data.invited_email,
    role: existing.data.invited_role,
    schoolName: existing.data.schools?.name ?? "your school",
    expiresAt: replacement.invitation_expires_at,
  });
  const message = delivery.status === "preview"
    ? "Replacement invitation created. Local email delivery is not configured. The old link is no longer valid."
    : delivery.status === "accepted"
      ? "Replacement invitation email accepted for delivery. The old link is no longer valid."
      : "Replacement invitation saved, but email delivery failed. The old link is no longer valid.";
  const base = viewer.role === "super_admin" ? "/platform" : "/school";
  redirect(`${base}?invite=${encodeURIComponent(message)}`);
}

export async function revokeInvitationAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "super_admin"]);
  const invitationId = uuid(formData.get("invitation_id"), "Invitation");
  const { data, error } = await createServerAdminClient().rpc("revoke_invitation", {
    actor_user_id: viewer.userId,
    target_invitation_id: invitationId,
  });
  if (error || data !== true) throw new Error("The invitation could not be revoked.");
  revalidatePath(viewer.role === "super_admin" ? "/platform" : "/school");
}

export async function setFeatureAction(formData: FormData) {
  const viewer = await requireViewer(["super_admin", "school_admin"]);
  const schoolId = viewer.role === "super_admin" ? uuid(formData.get("school_id"), "School") : viewer.schoolId!;
  const featureKey = requiredText(formData.get("feature_key"), "Feature", 50);
  if (featureKey === "short_video" && formBoolean(formData.get("enabled"))) {
    throw new Error("Short video remains disabled until a safe metadata and transcoding pipeline is available.");
  }
  const { error } = await (await createClient()).from("school_feature_settings").upsert({
    school_id: schoolId, feature_key: featureKey, is_enabled: formBoolean(formData.get("enabled")), configured_by_user_id: viewer.userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(viewer.role === "super_admin" ? "/platform" : "/school");
}

export async function setTeacherTimetablePermissionAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const { error } = await (await createClient()).from("schools").update({ teachers_can_manage_timetable: formBoolean(formData.get("enabled")) }).eq("id", viewer.schoolId!);
  if (error) throw new Error(error.message);
  revalidatePath("/school");
}

export async function setCommunicationPermissionsAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const { error } = await (await createClient()).from("schools").update({
    teachers_can_publish_announcements: formBoolean(formData.get("teachers_can_publish_announcements")),
    teachers_can_manage_calendar: formBoolean(formData.get("teachers_can_manage_calendar")),
  }).eq("id", viewer.schoolId!);
  if (error) throw new Error(error.message);
  revalidatePath("/school");
  revalidatePath("/updates");
}

export async function setMediaConsentAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const childId = uuid(formData.get("child_id"), "Child");
  const state = oneOf(formData.get("state"), ["not_recorded", "granted", "denied"] as const, "Media consent");
  const { error } = await (await createClient()).from("child_media_consents").update({
    state,
    changed_by_user_id: viewer.userId,
    changed_at: new Date().toISOString(),
  }).eq("school_id", viewer.schoolId!).eq("child_id", childId);
  if (error) throw new Error(error.message);
  scheduleMediaCleanup();
  revalidatePath("/school");
  revalidatePath("/teacher");
  revalidatePath("/parent");
}

export async function updateSchoolSettingsAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const { error } = await (await createClient()).from("schools").update({
    name: requiredText(formData.get("name"), "School name", 160),
    timezone: requiredText(formData.get("timezone"), "Timezone", 80),
  }).eq("id", viewer.schoolId!);
  if (error) throw new Error(error.message);
  revalidatePath("/school");
}

export async function updateBranchAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const { error } = await (await createClient()).from("branches").update({
    name: requiredText(formData.get("name"), "Branch name", 120),
    status: oneOf(formData.get("status"), ["active", "inactive", "archived"] as const, "Branch status"),
  }).eq("school_id", viewer.schoolId!).eq("id", uuid(formData.get("branch_id"), "Branch"));
  if (error) throw new Error(error.message);
  revalidatePath("/school");
}

export async function updateClassroomAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const { error } = await (await createClient()).from("classrooms").update({
    name: requiredText(formData.get("name"), "Classroom name", 120),
    branch_id: uuid(formData.get("branch_id"), "Branch"),
    status: oneOf(formData.get("status"), ["active", "inactive", "archived"] as const, "Classroom status"),
  }).eq("school_id", viewer.schoolId!).eq("id", uuid(formData.get("classroom_id"), "Classroom"));
  if (error) throw new Error(error.message);
  revalidatePath("/school");
}

export async function updateChildAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const { error } = await (await createClient()).from("children").update({
    preferred_name: requiredText(formData.get("preferred_name"), "Child name", 80),
    status: oneOf(formData.get("status"), ["active", "inactive", "archived"] as const, "Child status"),
  }).eq("school_id", viewer.schoolId!).eq("id", uuid(formData.get("child_id"), "Child"));
  if (error) throw new Error(error.message);
  revalidatePath("/school");
}

export async function moveChildEnrollmentAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const { error } = await (await createClient()).rpc("move_child_enrollment", {
    target_child_id: uuid(formData.get("child_id"), "Child"),
    target_classroom_id: uuid(formData.get("classroom_id"), "Classroom"),
    move_date: localDate(viewer.timezone),
  });
  if (error) throw new Error(error.message);
  revalidatePath("/school");
}

export async function updateMembershipAction(formData: FormData) {
  await requireViewer(["school_admin"]);
  const { error } = await (await createClient()).rpc("set_school_membership_status", {
    target_membership_id: uuid(formData.get("membership_id"), "Membership"),
    target_status: oneOf(formData.get("status"), ["active", "inactive", "archived"] as const, "Membership status"),
  });
  if (error) {
    const message = error.message.includes("at least one active School Admin")
      ? "This is the final active School Admin. Add or reactivate another School Admin before deactivating this membership."
      : "The staff membership could not be changed. Check that the school and your access are active.";
    redirect(`/school?membershipError=${encodeURIComponent(message)}#staff`);
  }
  revalidatePath("/school");
}

export async function updateAssignmentAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const active = oneOf(formData.get("status"), ["active", "inactive"] as const, "Assignment status") === "active";
  const assignmentId = uuid(formData.get("assignment_id"), "Assignment");
  const supabase = await createClient();
  if (active) {
    const assignment = await supabase.from("classroom_staff_assignments").select("membership_id, classroom_id").eq("school_id", viewer.schoolId!).eq("id", assignmentId).maybeSingle();
    if (assignment.error || !assignment.data) throw new Error("This classroom assignment is not available.");
    const [membership, classroom] = await Promise.all([
      supabase.from("school_memberships").select("role, status").eq("school_id", viewer.schoolId!).eq("id", assignment.data.membership_id).maybeSingle(),
      supabase.from("classrooms").select("status, branches(status)").eq("school_id", viewer.schoolId!).eq("id", assignment.data.classroom_id).maybeSingle(),
    ]);
    if (membership.error || classroom.error || membership.data?.role !== "teacher" || membership.data.status !== "active" || classroom.data?.status !== "active" || classroom.data.branches?.status !== "active") {
      throw new Error("Reactivate the Teacher and classroom before restoring this assignment.");
    }
  }
  const { data, error } = await supabase.from("classroom_staff_assignments").update({
    status: active ? "active" : "inactive",
    ends_on: active ? null : localDate(viewer.timezone),
  }).eq("school_id", viewer.schoolId!).eq("id", assignmentId).select("id").maybeSingle();
  if (error || !data) throw new Error(active ? "Reactivate the Teacher membership before restoring this assignment, and check that the classroom is active." : "The classroom assignment could not be changed.");
  revalidatePath("/school");
}

export async function updateGuardianLinkAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const { error } = await (await createClient()).from("child_guardians").update({
    relationship_label: requiredText(formData.get("relationship_label"), "Relationship", 50),
    is_primary: formBoolean(formData.get("is_primary")),
    status: oneOf(formData.get("status"), ["active", "inactive", "archived"] as const, "Guardian link status"),
  }).eq("school_id", viewer.schoolId!).eq("id", uuid(formData.get("guardian_link_id"), "Guardian link"));
  if (error) throw new Error(error.message);
  revalidatePath("/school");
}

export async function updateTimetableSlotAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "teacher"]);
  const { error } = await (await createClient()).from("timetable_slots").update({
    day_of_week: Number(oneOf(formData.get("day_of_week"), ["1", "2", "3", "4", "5", "6", "7"] as const, "Day")),
    start_time: requiredText(formData.get("start_time"), "Start time", 8),
    end_time: requiredText(formData.get("end_time"), "End time", 8),
    title: requiredText(formData.get("title"), "Activity", 120),
    status: oneOf(formData.get("status"), ["active", "inactive", "archived"] as const, "Timetable status"),
  }).eq("school_id", viewer.schoolId!).eq("id", uuid(formData.get("slot_id"), "Timetable activity"));
  if (error) throw new Error(error.message);
  revalidatePath(viewer.role === "teacher" ? "/teacher" : "/school");
}

export async function archiveTimetableExceptionAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "teacher"]);
  const { error } = await (await createClient()).from("timetable_exceptions").update({ status: "archived" }).eq("school_id", viewer.schoolId!).eq("id", uuid(formData.get("exception_id"), "Timetable exception"));
  if (error) throw new Error(error.message);
  revalidatePath(viewer.role === "teacher" ? "/teacher" : "/school");
}

export async function createTimetableSlotAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "teacher"]);
  const { error } = await (await createClient()).from("timetable_slots").insert({
    school_id: viewer.schoolId!,
    classroom_id: uuid(formData.get("classroom_id"), "Classroom"),
    day_of_week: Number(oneOf(formData.get("day_of_week"), ["1", "2", "3", "4", "5", "6", "7"] as const, "Day")),
    start_time: requiredText(formData.get("start_time"), "Start time", 8),
    end_time: requiredText(formData.get("end_time"), "End time", 8),
    title: requiredText(formData.get("title"), "Activity", 120),
    care_feature_key: typeof formData.get("care_feature_key") === "string" && formData.get("care_feature_key") ? String(formData.get("care_feature_key")) : null,
    created_by_user_id: viewer.userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(viewer.role === "teacher" ? "/teacher" : "/school");
}

export async function createTimetableExceptionAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "teacher"]);
  const kind = oneOf(formData.get("kind"), ["cancelled", "changed", "additional"] as const, "Exception");
  const slotValue = formData.get("timetable_slot_id");
  const { error } = await (await createClient()).from("timetable_exceptions").insert({
    school_id: viewer.schoolId!, classroom_id: uuid(formData.get("classroom_id"), "Classroom"),
    timetable_slot_id: kind === "additional" ? null : uuid(slotValue, "Timetable slot"),
    service_date: requiredText(formData.get("service_date"), "Date", 10), kind,
    replacement_title: kind === "additional" ? requiredText(formData.get("replacement_title"), "Activity", 120) : null,
    replacement_start_time: kind === "additional" ? requiredText(formData.get("replacement_start_time"), "Start time", 8) : null,
    replacement_end_time: kind === "additional" ? requiredText(formData.get("replacement_end_time"), "End time", 8) : null,
    reason: typeof formData.get("reason") === "string" ? String(formData.get("reason")).slice(0, 300) || null : null,
    created_by_user_id: viewer.userId,
  });
  if (error) throw new Error(error.message);
  revalidatePath(viewer.role === "teacher" ? "/teacher" : "/school");
}

export async function setAttendanceAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "teacher"]);
  const childId = uuid(formData.get("child_id"), "Child");
  const action = oneOf(formData.get("attendance_action"), ["check_in", "check_out"] as const, "Attendance action");
  const supabase = await createClient();
  const enrollment = await supabase.from("child_enrollments").select("id, classroom_id").eq("child_id", childId).eq("status", "active").single();
  if (enrollment.error || !viewer.membershipId) throw new Error("Active enrollment was not found.");
  const serviceDate = localDate(viewer.timezone);
  if (action === "check_out") {
    const record = await supabase.from("attendance_records").select("id, status, checked_out_at").eq("child_id", childId).eq("service_date", serviceDate).single();
    if (record.error || record.data.status !== "present" || record.data.checked_out_at) throw new Error("Only a currently present child can be checked out.");
    const { error } = await supabase.from("attendance_records").update({ checked_out_at: new Date().toISOString(), recorded_by_membership_id: viewer.membershipId, recorded_by_user_id: viewer.userId }).eq("id", record.data.id);
    if (error) throw new Error(error.message);
    schedulePushDispatch();
    revalidatePath("/teacher");
    return;
  }
  const { error } = await supabase.from("attendance_records").upsert({
    school_id: viewer.schoolId!, child_id: childId, classroom_id: enrollment.data.classroom_id,
    enrollment_id: enrollment.data.id, service_date: serviceDate, status: "present",
    checked_in_at: new Date().toISOString(),
    checked_out_at: null, recorded_by_membership_id: viewer.membershipId, recorded_by_user_id: viewer.userId,
  }, { onConflict: "child_id,service_date" });
  if (error) throw new Error(error.message);
  schedulePushDispatch();
  revalidatePath("/teacher");
}

export async function bulkCheckInAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "teacher"]);
  if (!viewer.membershipId || !viewer.schoolId) throw new Error("Staff membership is required.");
  const childIds = [...new Set(formData.getAll("child_id").map((value) => uuid(value, "Child")))];
  if (!childIds.length) throw new Error("Choose at least one arriving child.");
  const supabase = await createClient();
  const serviceDate = localDate(viewer.timezone);
  const [enrollments, existing] = await Promise.all([
    supabase.from("child_enrollments").select("id, child_id, classroom_id").eq("school_id", viewer.schoolId).eq("status", "active").in("child_id", childIds),
    supabase.from("attendance_records").select("child_id, status, checked_out_at").eq("school_id", viewer.schoolId).eq("service_date", serviceDate).in("child_id", childIds),
  ]);
  if (enrollments.error || existing.error || enrollments.data.length !== childIds.length) throw new Error("The arriving children could not be verified.");
  const eligible = new Set(existing.data.filter((row) => row.status === "expected" && !row.checked_out_at).map((row) => row.child_id));
  existing.data.forEach((row) => { if (row.status !== "expected" || row.checked_out_at) eligible.delete(row.child_id); });
  const rows = enrollments.data.filter((row) => !existing.data.some((item) => item.child_id === row.child_id) || eligible.has(row.child_id)).map((row) => ({
    school_id: viewer.schoolId!, child_id: row.child_id, classroom_id: row.classroom_id,
    enrollment_id: row.id, service_date: serviceDate, status: "present" as const,
    checked_in_at: new Date().toISOString(), checked_out_at: null,
    recorded_by_membership_id: viewer.membershipId!, recorded_by_user_id: viewer.userId,
  }));
  if (!rows.length) throw new Error("The selected children are already resolved for today.");
  const { error } = await supabase.from("attendance_records").upsert(rows, { onConflict: "child_id,service_date" });
  if (error) throw new Error(error.message);
  schedulePushDispatch();
  revalidatePath("/teacher");
}

export async function saveCareBatchAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireViewer(["school_admin", "teacher"]);
    const category = oneOf(formData.get("category"), ["meal", "bottle", "water", "sleep", "toilet", "nappy", "mood", "activity", "note"] as const, "Care category");
    const childIds = [...new Set(formData.getAll("child_id").map((value) => uuid(value, "Child")))];
    if (!childIds.length) return { status: "error", message: "Choose at least one present child." };
    if (childIds.length > 50) return { status: "error", message: "Choose no more than 50 children at once." };
    const defaultOutcome = typeof formData.get("default_outcome") === "string" ? String(formData.get("default_outcome")) : "";
    const defaultQuantity = typeof formData.get("custom_quantity") === "string" && formData.get("custom_quantity") ? Number(formData.get("custom_quantity")) : Number(formData.get("default_quantity"));
    const activityTitle = category === "activity" ? requiredText(formData.get("activity_title"), "Activity title", 40) : "";
    const note = typeof formData.get("note") === "string" ? String(formData.get("note")).trim().slice(0, 500) || null : null;
    if (category === "note" && !note) return { status: "error", message: "Write a short note before saving." };
    const items = childIds.map((childId) => {
      const exception = typeof formData.get(`outcome_${childId}`) === "string" ? String(formData.get(`outcome_${childId}`)) : "";
      const quantityException = typeof formData.get(`quantity_${childId}`) === "string" && formData.get(`quantity_${childId}`) ? Number(formData.get(`quantity_${childId}`)) : defaultQuantity;
      return {
        child_id: childId,
        outcome_code: category === "sleep" ? "started" : category === "activity" ? activityTitle : category === "note" ? "note" : exception || defaultOutcome,
        meal_outcome: category === "meal" ? exception || defaultOutcome : null,
        quantity: category === "bottle" || category === "water" ? (Number.isFinite(quantityException) && quantityException > 0 ? quantityException : null) : null,
        unit: category === "bottle" || category === "water" ? "ml" : null,
      };
    });
    const { data, error } = await (await createClient()).rpc("record_care_batch", {
      target_classroom_id: uuid(formData.get("classroom_id"), "Classroom"),
      target_service_date: requiredText(formData.get("service_date"), "Date", 10),
      event_category: category,
      event_items: items,
      event_note: note ?? undefined,
      linked_timetable_slot_id: optionalUuid(formData.get("timetable_slot_id"), "Timetable activity") ?? undefined,
    });
    if (error) return { status: "error", message: "Nothing was saved. Check that every selected child is present and this module is enabled." };
    revalidatePath("/teacher");
    revalidatePath("/parent");
    return { status: "success", message: `${data} care ${data === 1 ? "update" : "updates"} saved.`, saved: data };
  } catch (error) {
    return expectedActionError(error, "Care could not be saved. Review the selection and try again.");
  }
}

export async function endSleepBatchAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await requireViewer(["school_admin", "teacher"]);
    const eventIds = [...new Set(formData.getAll("sleep_event_id").map((value) => uuid(value, "Sleep record")))];
    if (!eventIds.length) return { status: "error", message: "Choose at least one sleeping child." };
    const { data, error } = await (await createClient()).rpc("end_sleep_batch", {
      target_classroom_id: uuid(formData.get("classroom_id"), "Classroom"),
      sleep_event_ids: eventIds,
    });
    if (error) return { status: "error", message: "Sleep could not be ended. Refresh and check the selected children." };
    revalidatePath("/teacher");
    revalidatePath("/parent");
    return { status: "success", message: `${data} ${data === 1 ? "child is" : "children are"} now awake.`, saved: data };
  } catch (error) {
    return expectedActionError(error, "Sleep could not be ended. Review the selection and try again.");
  }
}
