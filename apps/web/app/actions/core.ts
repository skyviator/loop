"use server";

import { createHash, randomBytes } from "node:crypto";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { emailAddress, oneOf, requiredText, uuid, ValidationError } from "@loop/validation";

import { requireViewer } from "@/lib/auth";
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
  const supabase = await createClient();
  const child = await supabase.from("children").insert({ school_id: viewer.schoolId!, preferred_name: preferredName }).select("id").single();
  if (child.error) throw new Error(child.error.message);
  const enrollment = await supabase.from("child_enrollments").insert({
    school_id: viewer.schoolId!, child_id: child.data.id, classroom_id: classroomId,
    starts_on: localDate(viewer.timezone), status: "active",
  });
  if (enrollment.error) {
    await supabase.from("children").update({ status: "archived" }).eq("id", child.data.id);
    throw new Error(enrollment.error.message);
  }
  revalidatePath("/school");
}

export async function assignStaffAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const membershipId = uuid(formData.get("membership_id"), "Staff member");
  const classroomId = uuid(formData.get("classroom_id"), "Classroom");
  const { error } = await (await createClient()).from("classroom_staff_assignments").insert({
    school_id: viewer.schoolId!, membership_id: membershipId, classroom_id: classroomId,
  });
  if (error) throw new Error(error.message);
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

export async function createInvitationAction(formData: FormData) {
  const viewer = await requireViewer(["super_admin", "school_admin"]);
  const schoolId = viewer.role === "super_admin" ? uuid(formData.get("school_id"), "School") : viewer.schoolId!;
  const role = oneOf(formData.get("role"), ["school_admin", "teacher", "guardian"] as const, "Role");
  if (viewer.role === "super_admin" && role !== "school_admin") throw new Error("Platform administrators may only create the first school administrator invitation.");
  const email = emailAddress(formData.get("email"));
  const token = randomBytes(24).toString("base64url");
  const tokenHash = `\\x${createHash("sha256").update(token).digest("hex")}`;
  const supabase = await createClient();
  const { error } = await supabase.from("invitations").insert({
    school_id: schoolId, invited_email: email, invited_role: role, token_hash: tokenHash,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(), invited_by_user_id: viewer.userId,
  });
  if (error) throw new Error(error.message);

  const returnTo = viewer.role === "super_admin" ? "/platform" : "/school";
  const isLocal = process.env.NODE_ENV === "development" && /^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
  const message = isLocal ? `http://127.0.0.1:3000/invite?token=${token}` : "Invitation created. Production email delivery is not configured in this step.";
  redirect(`${returnTo}?invite=${encodeURIComponent(message)}`);
}

export async function revokeInvitationAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin", "super_admin"]);
  const invitationId = uuid(formData.get("invitation_id"), "Invitation");
  let query = (await createClient()).from("invitations").update({ status: "revoked", revoked_at: new Date().toISOString() }).eq("id", invitationId).eq("status", "pending");
  if (viewer.role === "school_admin") query = query.eq("school_id", viewer.schoolId!);
  const { error } = await query;
  if (error) throw new Error(error.message);
  revalidatePath(viewer.role === "super_admin" ? "/platform" : "/school");
}

export async function setFeatureAction(formData: FormData) {
  const viewer = await requireViewer(["super_admin", "school_admin"]);
  const schoolId = viewer.role === "super_admin" ? uuid(formData.get("school_id"), "School") : viewer.schoolId!;
  const featureKey = requiredText(formData.get("feature_key"), "Feature", 50);
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
  const viewer = await requireViewer(["school_admin"]);
  const { error } = await (await createClient()).from("school_memberships").update({
    status: oneOf(formData.get("status"), ["active", "inactive", "archived"] as const, "Membership status"),
  }).eq("school_id", viewer.schoolId!).eq("id", uuid(formData.get("membership_id"), "Membership"));
  if (error) throw new Error(error.message);
  revalidatePath("/school");
}

export async function updateAssignmentAction(formData: FormData) {
  const viewer = await requireViewer(["school_admin"]);
  const active = formData.get("status") === "active";
  const { error } = await (await createClient()).from("classroom_staff_assignments").update({
    status: active ? "active" : "inactive",
    ends_on: active ? null : localDate(viewer.timezone),
  }).eq("school_id", viewer.schoolId!).eq("id", uuid(formData.get("assignment_id"), "Assignment"));
  if (error) throw new Error(error.message);
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
