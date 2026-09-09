import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { assertStagingTarget } from "./staging-target.mjs";

const target = assertStagingTarget(process.env);
const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const credentialsPath = resolve(root, "supabase/.temp/staging-test-credentials.json");

const admin = createClient(target.supabaseUrl, process.env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const ids = {
  plan: "6c000000-0000-4000-8000-000000000001",
  school: "6c000000-0000-4000-8000-000000000010",
  branch: "6c000000-0000-4000-8000-000000000020",
  butterflies: "6c000000-0000-4000-8000-000000000030",
  sunbeams: "6c000000-0000-4000-8000-000000000031",
  adminMembership: "6c000000-0000-4000-8000-000000000040",
  teacherMembership: "6c000000-0000-4000-8000-000000000041",
  guardianMembership: "6c000000-0000-4000-8000-000000000042",
  teacherAssignment: "6c000000-0000-4000-8000-000000000050",
  children: [
    "6c000000-0000-4000-8000-000000000060",
    "6c000000-0000-4000-8000-000000000061",
    "6c000000-0000-4000-8000-000000000062",
  ],
  enrollments: [
    "6c000000-0000-4000-8000-000000000070",
    "6c000000-0000-4000-8000-000000000071",
    "6c000000-0000-4000-8000-000000000072",
  ],
  guardianLink: "6c000000-0000-4000-8000-000000000080",
  thread: "6c000000-0000-4000-8000-000000000090",
  message: "6c000000-0000-4000-8000-000000000091",
  announcement: "6c000000-0000-4000-8000-0000000000a0",
  calendar: "6c000000-0000-4000-8000-0000000000b0",
  timetable: [
    "6c000000-0000-4000-8000-0000000000c0",
    "6c000000-0000-4000-8000-0000000000c1",
    "6c000000-0000-4000-8000-0000000000c2",
  ],
  attendance: [
    "6c000000-0000-4000-8000-0000000000d0",
    "6c000000-0000-4000-8000-0000000000d1",
  ],
  care: "6c000000-0000-4000-8000-0000000000e0",
};

const accounts = [
  { role: "super_admin", email: "platform.super-admin@loop-staging.invalid", fullName: "Platform Super Admin Test" },
  { role: "school_admin", email: "school.admin@loop-staging.invalid", fullName: "School Admin Test" },
  { role: "teacher", email: "teacher@loop-staging.invalid", fullName: "Teacher Test" },
  { role: "guardian", email: "guardian@loop-staging.invalid", fullName: "Guardian Test" },
].map((account) => ({ ...account, password: `Loop-${randomBytes(18).toString("base64url")}!` }));

async function result(promise, label) {
  const response = await promise;
  if (response.error) throw new Error(`${label}: ${response.error.message}`);
  return response.data;
}

async function insertMissing(table, rows, identity = "id") {
  const candidates = Array.isArray(rows) ? rows : [rows];
  const columns = identity.split(",");
  const existing = await result(admin.from(table).select(identity), `Inspect ${table}`);
  const key = (row) => columns.map((column) => row[column]).join("\u0000");
  const existingKeys = new Set(existing.map(key));
  const missing = candidates.filter((row) => !existingKeys.has(key(row)));
  if (missing.length === 0) return [];
  return result(admin.from(table).insert(missing), `Insert ${table}`);
}

const existingUsers = await result(admin.auth.admin.listUsers({ page: 1, perPage: 1000 }), "List staging Auth users");
const allowedEmails = new Set(accounts.map(({ email }) => email));
const unknownUsers = existingUsers.users.filter((user) => !allowedEmails.has(user.email ?? ""));
if (unknownUsers.length > 0) throw new Error("Staging seed refused: the target contains an unknown Auth user.");

const existingSchools = await result(admin.from("schools").select("id,name,slug"), "Inspect staging schools");
if (existingSchools.some((school) => school.id !== ids.school || school.name !== "Loop Demo Nursery — TEST" || school.slug !== "loop-demo-nursery-test")) {
  throw new Error("Staging seed refused: the target contains an unknown school.");
}

for (const account of accounts) {
  const existing = existingUsers.users.find((user) => user.email === account.email);
  const user = existing
    ? await result(admin.auth.admin.updateUserById(existing.id, {
        password: account.password,
        user_metadata: { full_name: account.fullName, loop_fixture: true },
        app_metadata: { loop_fixture: true, environment: "staging" },
      }), `Refresh ${account.role} test user`)
    : await result(admin.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.fullName, loop_fixture: true },
        app_metadata: { loop_fixture: true, environment: "staging" },
      }), `Create ${account.role} test user`);
  account.id = user.user.id;
}

const byRole = Object.fromEntries(accounts.map((account) => [account.role, account]));
await insertMissing("user_profiles", accounts.map((account) => ({ id: account.id, full_name: account.fullName, status: "active" })));
await insertMissing("plans", {
  id: ids.plan,
  key: "staging_test",
  label: "Staging TEST",
  max_active_children: 20,
  max_staff: 8,
  storage_allowance_bytes: 1_073_741_824,
  status: "active",
});

const catalogue = await result(admin.from("feature_catalogue").select("key"), "Read feature catalogue");
await insertMissing("plan_features", catalogue.map(({ key }) => ({ plan_id: ids.plan, feature_key: key, is_allowed: true })), "plan_id,feature_key");
await insertMissing("schools", {
  id: ids.school,
  plan_id: ids.plan,
  name: "Loop Demo Nursery — TEST",
  slug: "loop-demo-nursery-test",
  timezone: "Asia/Colombo",
  teachers_can_manage_timetable: true,
  teachers_can_publish_announcements: false,
  teachers_can_manage_calendar: false,
  status: "active",
});
await insertMissing("platform_administrators", { user_id: byRole.super_admin.id, status: "active" }, "user_id");
await insertMissing("school_memberships", [
  { id: ids.adminMembership, school_id: ids.school, user_id: byRole.school_admin.id, role: "school_admin", status: "active" },
  { id: ids.teacherMembership, school_id: ids.school, user_id: byRole.teacher.id, role: "teacher", status: "active" },
  { id: ids.guardianMembership, school_id: ids.school, user_id: byRole.guardian.id, role: "guardian", status: "active" },
]);
await insertMissing("branches", { id: ids.branch, school_id: ids.school, name: "Main Branch — TEST", status: "active" });
await insertMissing("classrooms", [
  { id: ids.butterflies, school_id: ids.school, branch_id: ids.branch, name: "Butterflies", status: "active" },
  { id: ids.sunbeams, school_id: ids.school, branch_id: ids.branch, name: "Sunbeams", status: "active" },
]);
await insertMissing("classroom_staff_assignments", {
  id: ids.teacherAssignment,
  school_id: ids.school,
  classroom_id: ids.butterflies,
  membership_id: ids.teacherMembership,
  status: "active",
});

const childNames = ["Child One", "Child Two", "Child Three"];
await insertMissing("children", childNames.map((preferred_name, index) => ({
  id: ids.children[index], school_id: ids.school, preferred_name, status: "active",
})));
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
await insertMissing("child_enrollments", childNames.map((_, index) => ({
  id: ids.enrollments[index],
  school_id: ids.school,
  child_id: ids.children[index],
  classroom_id: index < 2 ? ids.butterflies : ids.sunbeams,
  starts_on: today,
  status: "active",
})));
await insertMissing("child_guardians", {
  id: ids.guardianLink,
  school_id: ids.school,
  child_id: ids.children[0],
  guardian_membership_id: ids.guardianMembership,
  relationship_label: "Guardian TEST",
  is_primary: true,
  status: "active",
});

const enabledFeatures = ["attendance", "timetable", "meals", "bottle", "water", "sleep", "toilet", "nappy", "mood", "activities", "notes", "photos", "messaging", "announcements", "calendar"];
await insertMissing("school_feature_settings", enabledFeatures.map((feature_key) => ({
  school_id: ids.school,
  feature_key,
  is_enabled: true,
  configured_by_user_id: byRole.school_admin.id,
})), "school_id,feature_key");
await insertMissing("child_media_consents", {
  child_id: ids.children[0],
  school_id: ids.school,
  state: "granted",
  changed_by_user_id: byRole.school_admin.id,
  changed_at: new Date().toISOString(),
}, "child_id");

const weekday = new Date(`${today}T00:00:00+05:30`).getUTCDay() || 7;
await insertMissing("timetable_slots", [
  { id: ids.timetable[0], school_id: ids.school, classroom_id: ids.butterflies, day_of_week: weekday, start_time: "08:30", end_time: "09:00", title: "Arrival — TEST", created_by_user_id: byRole.school_admin.id },
  { id: ids.timetable[1], school_id: ids.school, classroom_id: ids.butterflies, day_of_week: weekday, start_time: "11:30", end_time: "12:00", title: "Lunch — TEST", care_feature_key: "meals", created_by_user_id: byRole.school_admin.id },
  { id: ids.timetable[2], school_id: ids.school, classroom_id: ids.butterflies, day_of_week: weekday, start_time: "14:00", end_time: "14:30", title: "Story — TEST", care_feature_key: "activities", created_by_user_id: byRole.school_admin.id },
]);
const checkedInAt = new Date(Math.max(new Date(`${today}T00:00:00+05:30`).getTime(), Date.now() - 15 * 60_000)).toISOString();
await insertMissing("attendance_records", [
  { id: ids.attendance[0], school_id: ids.school, child_id: ids.children[0], classroom_id: ids.butterflies, enrollment_id: ids.enrollments[0], service_date: today, status: "expected", checked_in_at: null, checked_out_at: null, recorded_by_membership_id: ids.teacherMembership, recorded_by_user_id: byRole.teacher.id },
  { id: ids.attendance[1], school_id: ids.school, child_id: ids.children[1], classroom_id: ids.butterflies, enrollment_id: ids.enrollments[1], service_date: today, status: "present", checked_in_at: checkedInAt, checked_out_at: null, recorded_by_membership_id: ids.teacherMembership, recorded_by_user_id: byRole.teacher.id },
]);
await result(admin.from("attendance_records").update({ status: "expected", checked_in_at: null, checked_out_at: null }).eq("id", ids.attendance[0]), "Reset Child One TEST attendance");
await result(admin.from("attendance_records").update({ status: "present", checked_in_at: checkedInAt, checked_out_at: null }).eq("id", ids.attendance[1]), "Reset Child Two TEST attendance");
await insertMissing("care_events", {
  id: ids.care,
  school_id: ids.school,
  child_id: ids.children[1],
  classroom_id: ids.butterflies,
  enrollment_id: ids.enrollments[1],
  category: "meal",
  meal_outcome: "ate_most",
  recorded_at: new Date(`${today}T11:50:00+05:30`).toISOString(),
  recorded_by_membership_id: ids.teacherMembership,
  recorded_by_user_id: byRole.teacher.id,
  timetable_slot_id: ids.timetable[1],
  timetable_service_date: today,
});

await insertMissing("message_threads", {
  id: ids.thread,
  school_id: ids.school,
  child_id: ids.children[0],
  guardian_membership_id: ids.guardianMembership,
  status: "active",
});
await insertMissing("messages", {
  id: ids.message,
  thread_id: ids.thread,
  school_id: ids.school,
  sender_membership_id: ids.teacherMembership,
  sender_user_id: byRole.teacher.id,
  body: "Initial fictional staging message — TEST",
});
await insertMissing("announcements", {
  id: ids.announcement,
  school_id: ids.school,
  target_scope: "school",
  title: "Important staging announcement — TEST",
  body: "This is fictional staging verification content only.",
  priority: "important",
  status: "published",
  publish_at: new Date().toISOString(),
  created_by_membership_id: ids.adminMembership,
  created_by_user_id: byRole.school_admin.id,
});
await insertMissing("calendar_events", {
  id: ids.calendar,
  school_id: ids.school,
  target_scope: "school",
  title: "Staging calendar event — TEST",
  description: "Fictional staging verification event.",
  starts_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
  ends_at: new Date(Date.now() + 3 * 86_400_000 + 60 * 60_000).toISOString(),
  created_by_membership_id: ids.adminMembership,
  created_by_user_id: byRole.school_admin.id,
});
await insertMissing("notification_preferences", {
  user_id: byRole.guardian.id,
  attendance_enabled: true,
  messages_enabled: true,
  important_announcements_enabled: true,
  photos_enabled: false,
}, "user_id");

await mkdir(dirname(credentialsPath), { recursive: true });
await writeFile(credentialsPath, `${JSON.stringify({
  generatedAt: new Date().toISOString(),
  environment: "staging",
  projectRef: target.projectRef,
  siteUrl: target.siteUrl,
  school: { id: ids.school, name: "Loop Demo Nursery — TEST" },
  fixtures: ids,
  accounts: accounts.map(({ role, email, password }) => ({ role, email, password })),
}, null, 2)}\n`, { mode: 0o600 });

console.log(`Loop staging TEST seed complete. Credentials: ${credentialsPath}`);
