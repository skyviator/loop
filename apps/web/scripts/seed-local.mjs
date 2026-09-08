import { execFileSync } from "node:child_process";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "../../..");
const status = process.platform === "win32"
  ? execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm exec supabase status --output env --network-id loop-local-network"], { cwd: root, encoding: "utf8" })
  : execFileSync("pnpm", ["exec", "supabase", "status", "--output", "env", "--network-id", "loop-local-network"], { cwd: root, encoding: "utf8" });
const env = Object.fromEntries(
  status
    .split(/\r?\n/)
    .map((line) => line.match(/^([A-Z_]+)="?(.*?)"?$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
);

if (!/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(env.API_URL ?? "")) {
  throw new Error("Local seed refused: Supabase API is not the Loop localhost stack.");
}

const admin = createClient(env.API_URL, env.SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

function password() {
  return `Loop-${randomBytes(12).toString("base64url")}!`;
}

async function result(promise, label) {
  const response = await promise;
  if (response.error) throw new Error(`${label}: ${response.error.message}`);
  return response.data;
}

const accounts = [
  ["super_admin", "platform@loop.local", "Nimali Perera"],
  ["school_admin", "admin@littleharbour.loop.local", "Ayesha Dissanayake"],
  ["teacher", "teacher@littleharbour.loop.local", "Sajini Fernando"],
  ["guardian", "parent@littleharbour.loop.local", "Ruwan Silva"],
  ["school_admin_2", "admin@kandygarden.loop.local", "Kavindi Jayasinghe"],
].map(([role, email, fullName]) => ({ role, email, fullName, password: password() }));

for (const account of accounts) {
  const created = await result(
    admin.auth.admin.createUser({
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName },
    }),
    `Create ${account.role}`,
  );
  account.id = created.user.id;
}

const id = () => randomUUID();
const planId = id();
const schoolId = id();
const secondSchoolId = id();
const branchId = id();
const secondBranchId = id();
const classroomId = id();
const secondClassroomId = id();
const adminMembershipId = id();
const teacherMembershipId = id();
const guardianMembershipId = id();
const secondAdminMembershipId = id();

await result(
  admin.from("plans").insert({
    id: planId,
    key: "local_core",
    label: "Local Core",
    max_active_children: 40,
    max_staff: 12,
    storage_allowance_bytes: 0,
  }),
  "Create plan",
);
const catalogue = await result(admin.from("feature_catalogue").select("key"), "Read features");
await result(
  admin.from("plan_features").insert(catalogue.map(({ key }) => ({ plan_id: planId, feature_key: key, is_allowed: true }))),
  "Configure plan features",
);
await result(
  admin.from("schools").insert([
    { id: schoolId, plan_id: planId, name: "Little Harbour Preschool", slug: "little-harbour", teachers_can_manage_timetable: true },
    { id: secondSchoolId, plan_id: planId, name: "Kandy Garden Preschool", slug: "kandy-garden", teachers_can_manage_timetable: false },
  ]),
  "Create schools",
);

const byRole = Object.fromEntries(accounts.map((account) => [account.role, account]));
await result(admin.from("platform_administrators").insert({ user_id: byRole.super_admin.id }), "Create platform admin");
await result(
  admin.from("school_memberships").insert([
    { id: adminMembershipId, school_id: schoolId, user_id: byRole.school_admin.id, role: "school_admin" },
    { id: teacherMembershipId, school_id: schoolId, user_id: byRole.teacher.id, role: "teacher" },
    { id: guardianMembershipId, school_id: schoolId, user_id: byRole.guardian.id, role: "guardian" },
    { id: secondAdminMembershipId, school_id: secondSchoolId, user_id: byRole.school_admin_2.id, role: "school_admin" },
  ]),
  "Create memberships",
);
await result(
  admin.from("branches").insert([
    { id: branchId, school_id: schoolId, name: "Colombo Main" },
    { id: secondBranchId, school_id: secondSchoolId, name: "Kandy Main" },
  ]),
  "Create branches",
);
await result(
  admin.from("classrooms").insert([
    { id: classroomId, school_id: schoolId, branch_id: branchId, name: "Sunbirds" },
    { id: secondClassroomId, school_id: secondSchoolId, branch_id: secondBranchId, name: "Fireflies" },
  ]),
  "Create classrooms",
);
await result(
  admin.from("classroom_staff_assignments").insert({
    school_id: schoolId,
    classroom_id: classroomId,
    membership_id: teacherMembershipId,
  }),
  "Assign teacher",
);

const childNames = [
  "Maya Senaratne", "Aarav Perera", "Zara Mohamed", "Nimal Jayasinghe", "Anika Fernando",
  "Ravi de Silva", "Ishara Peiris", "Tara Wijesinghe", "Dilan Perera", "Sana Rizvi",
  "Mihir Gunasekara", "Leah Thomas", "Kavin Raj", "Amaya Herath", "Noah Daniels",
];
const children = childNames.map((preferred_name) => ({ id: id(), school_id: schoolId, preferred_name }));
await result(admin.from("children").insert(children), "Create children");
const enrollments = children.map((child) => ({
  id: id(), school_id: schoolId, child_id: child.id, classroom_id: classroomId,
  starts_on: new Date().toISOString().slice(0, 10), status: "active",
}));
await result(admin.from("child_enrollments").insert(enrollments), "Enroll children");
await result(
  admin.from("child_guardians").insert(children.map((child, index) => ({
    school_id: schoolId,
    child_id: child.id,
    guardian_membership_id: guardianMembershipId,
    relationship_label: "Parent",
    is_primary: index === 0,
  }))),
  "Link guardian",
);

const enabledFeatureKeys = ["attendance", "timetable", "meals", "bottle", "water", "sleep", "toilet", "nappy", "mood", "activities", "notes"];
await result(
  admin.from("school_feature_settings").insert(enabledFeatureKeys.map((feature_key) => ({
    school_id: schoolId,
    feature_key,
    is_enabled: true,
    configured_by_user_id: byRole.school_admin.id,
  }))),
  "Enable core features",
);

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Colombo" }).format(new Date());
const weekday = new Date(`${today}T00:00:00+05:30`).getUTCDay() || 7;
const slots = [
  ["08:30", "09:00", "Arrival and welcome", null],
  ["09:00", "09:30", "Circle time", "activities"],
  ["10:00", "10:20", "Water break", "water"],
  ["11:30", "12:00", "Lunch", "meals"],
  ["13:00", "14:00", "Rest", "sleep"],
  ["14:30", "15:00", "Story and pickup", "activities"],
].map(([start_time, end_time, title, care_feature_key]) => ({
  id: id(), school_id: schoolId, classroom_id: classroomId, day_of_week: weekday,
  start_time, end_time, title, care_feature_key, created_by_user_id: byRole.school_admin.id,
}));
await result(admin.from("timetable_slots").insert(slots), "Create timetable");

const attendance = children.map((child, index) => ({
  school_id: schoolId,
  child_id: child.id,
  classroom_id: classroomId,
  enrollment_id: enrollments[index].id,
  service_date: today,
  status: index < 12 ? "present" : index < 14 ? "expected" : "absent",
  checked_in_at: index < 12 ? new Date(`${today}T08:15:00+05:30`).toISOString() : null,
  recorded_by_membership_id: teacherMembershipId,
  recorded_by_user_id: byRole.teacher.id,
}));
await result(admin.from("attendance_records").insert(attendance), "Create attendance");
await result(
  admin.from("care_events").insert({
    school_id: schoolId,
    child_id: children[0].id,
    classroom_id: classroomId,
    enrollment_id: enrollments[0].id,
    category: "meal",
    meal_outcome: "ate_most",
    recorded_at: new Date(`${today}T11:50:00+05:30`).toISOString(),
    recorded_by_membership_id: teacherMembershipId,
    recorded_by_user_id: byRole.teacher.id,
    timetable_slot_id: slots[3].id,
    timetable_service_date: today,
  }),
  "Create care event",
);

const invitationToken = randomBytes(24).toString("base64url");
await result(
  admin.from("invitations").insert({
    school_id: schoolId,
    invited_email: "new.teacher@loop.local",
    invited_role: "teacher",
    token_hash: `\\x${createHash("sha256").update(invitationToken).digest("hex")}`,
    expires_at: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    invited_by_user_id: byRole.school_admin.id,
  }),
  "Create invitation",
);

const credentialsPath = resolve(root, "supabase/.temp/test-credentials.json");
await mkdir(dirname(credentialsPath), { recursive: true });
await writeFile(
  credentialsPath,
  `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    accounts: accounts.map((account) => ({ role: account.role, email: account.email, password: account.password })),
    invitation: {
      email: "new.teacher@loop.local",
      url: `http://127.0.0.1:3000/invite?token=${invitationToken}`,
    },
  }, null, 2)}\n`,
  { mode: 0o600 },
);

console.log(`Local Loop seed complete. Credentials: ${credentialsPath}`);
