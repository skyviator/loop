import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

type Account = { role: string; email: string; password: string };
const credentials = JSON.parse(readFileSync(resolve(process.cwd(), "supabase/.temp/test-credentials.json"), "utf8")) as { accounts: Account[] };
const status = process.platform === "win32"
  ? execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm exec supabase status --output env --network-id loop-local-network"], { cwd: process.cwd(), encoding: "utf8" })
  : execFileSync("pnpm", ["exec", "supabase", "status", "--output", "env", "--network-id", "loop-local-network"], { cwd: process.cwd(), encoding: "utf8" });
const local = Object.fromEntries(status.split(/\r?\n/).flatMap((line) => {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
  return match ? [[match[1], match[2].trim().replace(/^[\'"]|[\'"]$/g, "")]] : [];
}));
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(local.API_URL ?? "") || !local.SECRET_KEY?.startsWith("sb_secret_") || !local.PUBLISHABLE_KEY?.startsWith("sb_publishable_")) {
  throw new Error("Staff management tests require guarded local Supabase.");
}
const admin = createClient(local.API_URL, local.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
test.describe.configure({ mode: "serial" });

function account(role: string) {
  const found = credentials.accounts.find((item) => item.role === role);
  if (!found) throw new Error(`Missing fictional local ${role} account.`);
  return found;
}

function relatedProfileName(value: unknown) {
  const profile = Array.isArray(value) ? value[0] : value;
  return profile && typeof profile === "object" && "full_name" in profile && typeof profile.full_name === "string" ? profile.full_name : null;
}

async function signIn(page: Page, role = "school_admin") {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account(role).email);
  await page.getByLabel("Password").fill(account(role).password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(role === "school_admin" ? /\/school/ : /\/teacher/);
}

async function schoolAndTeacher() {
  const found = await admin.from("school_memberships").select("id, school_id, role, status, user_profiles(full_name)").eq("role", "teacher");
  if (found.error) throw found.error;
  const school = await admin.from("schools").select("id").eq("slug", "little-harbour").single();
  if (school.error) throw school.error;
  const teacher = found.data.find((item) => item.school_id === school.data.id && relatedProfileName(item.user_profiles) === "Sajini Fernando");
  if (!teacher) throw new Error("Missing local Teacher membership.");
  return { schoolId: school.data.id, teacherId: teacher.id };
}

test("staff roster search and honest staff invitation lifecycle", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page);
  const staff = page.locator("#staff");
  await expect(staff.getByRole("heading", { name: "Staff" })).toBeVisible();
  await expect(staff.locator(".staff-row").filter({ hasText: "Ayesha Dissanayake" })).toBeVisible();
  await expect(staff.locator(".staff-row").filter({ hasText: "Sajini Fernando" })).toBeVisible();
  await staff.getByLabel("Search staff").fill("Sajini");
  await expect(staff.locator(".staff-row")).toHaveCount(1);
  await expect(staff.locator(".staff-row summary")).toContainText("Sajini Fernando");
  await staff.getByLabel("Search staff").fill("not-an-existing-staff-name");
  await expect(staff.getByRole("status")).toHaveText("No staff match this search.");
  await staff.getByLabel("Search staff").fill("");

  const email = `staff-qa-${randomUUID()}@loop.test`;
  const expiredEmail = `expired-qa-${randomUUID()}@loop.test`;
  try {
    const invitations = page.locator("#staff-invitations");
    const form = invitations.locator(":scope > form");
    await expect(form.locator('select[name="role"] option')).toHaveCount(2);
    await expect(invitations.getByText("Failed delivery remains visible", { exact: false })).toBeVisible();
    await form.getByLabel("Email").fill(email);
    await form.getByLabel("Staff role").selectOption("teacher");
    await form.getByRole("button", { name: "Create staff invitation" }).click();
    const inviteRow = page.locator(".staff-invitation-row").filter({ hasText: email });
    await expect(inviteRow).toContainText("Teacher · Pending");
    await form.getByLabel("Email").fill(email.toUpperCase());
    await form.getByLabel("Staff role").selectOption("school_admin");
    await form.getByRole("button", { name: "Create staff invitation" }).click();
    await expect(page.getByText("A pending staff invitation already exists for this email.")).toBeVisible();
    const blocked = await admin.from("invitations").select("id, invited_role, status").eq("invited_email", email).eq("status", "pending");
    if (blocked.error) throw blocked.error;
    expect(blocked.data).toHaveLength(1);
    await inviteRow.getByRole("button", { name: "Revoke" }).click();
    await expect(inviteRow).toContainText("Revoked");
    await form.getByLabel("Email").fill(email);
    await form.getByLabel("Staff role").selectOption("school_admin");
    await form.getByRole("button", { name: "Create staff invitation" }).click();
    await expect(page.locator(".staff-invitation-row").filter({ hasText: email }).filter({ hasText: "School Admin · Pending" })).toHaveCount(1);

    const { schoolId } = await schoolAndTeacher();
    const expired = await admin.from("invitations").insert({
      school_id: schoolId, invited_email: expiredEmail, invited_role: "teacher",
      token_hash: `\\x${randomBytes(32).toString("hex")}`,
      created_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
      expires_at: new Date(Date.now() - 86_400_000).toISOString(),
      invited_by_user_id: (await admin.from("school_memberships").select("user_id").eq("school_id", schoolId).eq("role", "school_admin").eq("status", "active").limit(1).single()).data?.user_id,
    });
    if (expired.error) throw expired.error;
    await page.reload();
    const expiredRow = page.locator(".staff-invitation-row").filter({ hasText: expiredEmail });
    await expect(expiredRow).toContainText("Expired");
    await expiredRow.getByRole("button", { name: "Revoke" }).click();
    await expect(expiredRow).toContainText("Revoked");
  } finally {
    await admin.from("invitations").delete().in("invited_email", [email, expiredEmail]);
  }
});

test("staff invitation conflicts are database-race-safe and tenant scoped", async () => {
  const { schoolId } = await schoolAndTeacher();
  const schoolB = await admin.from("schools").select("id").eq("slug", "kandy-garden").single();
  if (schoolB.error) throw schoolB.error;
  const email = `concurrent-staff-${randomUUID()}@loop.test`;
  const current = account("school_admin");
  const other = account("school_admin_2");
  const clientA = createClient(local.API_URL, local.PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const clientB = createClient(local.API_URL, local.PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  const clientOther = createClient(local.API_URL, local.PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  try {
    const [signInA, signInB] = await Promise.all([
      clientA.auth.signInWithPassword({ email: current.email, password: current.password }),
      clientB.auth.signInWithPassword({ email: current.email, password: current.password }),
    ]);
    if (signInA.error || signInB.error || !signInA.data.user || !signInB.data.user) throw new Error("Fictional School A Admin sign-in failed.");
    const otherSignIn = await clientOther.auth.signInWithPassword({ email: other.email, password: other.password });
    if (otherSignIn.error || !otherSignIn.data.user) throw new Error("Fictional School B Admin sign-in failed.");
    const [teacher, schoolAdmin] = await Promise.all([
      clientA.from("invitations").insert({ school_id: schoolId, invited_email: email, invited_role: "teacher", token_hash: `\\x${randomBytes(32).toString("hex")}`, expires_at: new Date(Date.now() + 86_400_000).toISOString(), invited_by_user_id: signInA.data.user.id }),
      clientB.from("invitations").insert({ school_id: schoolId, invited_email: email.toUpperCase(), invited_role: "school_admin", token_hash: `\\x${randomBytes(32).toString("hex")}`, expires_at: new Date(Date.now() + 86_400_000).toISOString(), invited_by_user_id: signInB.data.user.id }),
    ]);
    expect([teacher.error, schoolAdmin.error].filter((error) => error === null)).toHaveLength(1);
    expect([teacher.error, schoolAdmin.error].filter((error) => error?.code === "23505")).toHaveLength(1);
    const schoolACount = await admin.from("invitations").select("id").eq("school_id", schoolId).eq("invited_email", email).eq("status", "pending");
    if (schoolACount.error) throw schoolACount.error;
    expect(schoolACount.data).toHaveLength(1);
    const schoolBInvite = await clientOther.from("invitations").insert({ school_id: schoolB.data.id, invited_email: email, invited_role: "teacher", token_hash: `\\x${randomBytes(32).toString("hex")}`, expires_at: new Date(Date.now() + 86_400_000).toISOString(), invited_by_user_id: otherSignIn.data.user.id });
    expect(schoolBInvite.error).toBeNull();
    const crossTenant = await clientA.from("invitations").insert({ school_id: schoolB.data.id, invited_email: `cross-${randomUUID()}@loop.test`, invited_role: "teacher", token_hash: `\\x${randomBytes(32).toString("hex")}`, expires_at: new Date(Date.now() + 86_400_000).toISOString(), invited_by_user_id: signInA.data.user.id });
    expect(crossTenant.error).not.toBeNull();
  } finally {
    await admin.from("invitations").delete().eq("invited_email", email);
    await Promise.all([clientA.auth.signOut(), clientB.auth.signOut(), clientOther.auth.signOut()]);
  }
});

test("Teacher assignments and membership changes preserve explicit revocation", async ({ page }) => {
  test.setTimeout(120_000);
  const { schoolId, teacherId } = await schoolAndTeacher();
  const main = await admin.from("classroom_staff_assignments").select("id, classroom_id").eq("school_id", schoolId).eq("membership_id", teacherId).eq("status", "active").single();
  if (main.error) throw main.error;
  const branch = await admin.from("branches").select("id").eq("school_id", schoolId).eq("status", "active").single();
  if (branch.error) throw branch.error;
  const roomName = `Staff QA classroom ${Date.now()}`;
  const room = await admin.from("classrooms").insert({ school_id: schoolId, branch_id: branch.data.id, name: roomName }).select("id").single();
  if (room.error) throw room.error;
  const teacherClient = createClient(local.API_URL, local.PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
  try {
    await signIn(page);
    const row = page.locator(".staff-row").filter({ hasText: "Sajini Fernando" });
    await row.locator("summary").click();
    await row.getByLabel("Assign to active classroom").selectOption({ label: roomName });
    await row.getByRole("button", { name: "Assign classroom" }).click();
    await expect(row.locator(".staff-assignment-row").filter({ hasText: roomName })).toContainText("Assigned");
    const assigned = await admin.from("classroom_staff_assignments").select("id, status").eq("classroom_id", room.data.id).eq("membership_id", teacherId).single();
    if (assigned.error) throw assigned.error;
    expect(assigned.data.status).toBe("active");
    await page.reload();
    await row.locator("summary").click();
    await expect(row.locator(".staff-assignment-row")).toHaveCount(2);
    const qaAssignment = row.locator(".staff-assignment-row").filter({ hasText: roomName });
    await qaAssignment.getByRole("button", { name: "Remove access" }).click();
    await qaAssignment.getByRole("button", { name: "Confirm removal" }).click();
    await expect(qaAssignment).toContainText("Removed");
    await qaAssignment.getByRole("button", { name: "Restore assignment" }).click();
    await expect(qaAssignment).toContainText("Assigned");

    const teacherSignIn = await teacherClient.auth.signInWithPassword({ email: account("teacher").email, password: account("teacher").password });
    if (teacherSignIn.error) throw teacherSignIn.error;
    const before = await teacherClient.from("children").select("id").eq("school_id", schoolId);
    expect(before.data?.length).toBeGreaterThan(0);
    await row.getByRole("button", { name: "Deactivate school access" }).click();
    await expect(row.getByRole("group", { name: /Confirm Sajini Fernando/ })).toContainText("Existing records and classroom assignment history will be kept");
    await row.getByRole("button", { name: "Confirm deactivation" }).click();
    await expect(row.locator("summary")).toContainText("Inactive");
    const after = await teacherClient.from("children").select("id").eq("school_id", schoolId);
    expect(after.data).toHaveLength(0);
    await page.reload();
    await row.locator("summary").click();
    const mainRow = row.locator(".staff-assignment-row").filter({ hasText: "Sunbirds" });
    await mainRow.getByRole("button", { name: "Remove access" }).click();
    await mainRow.getByRole("button", { name: "Confirm removal" }).click();
    await expect(mainRow).toContainText("Removed");
    const mainInactive = await admin.from("classroom_staff_assignments").select("status").eq("id", main.data.id).single();
    expect(mainInactive.data?.status).toBe("inactive");
    await row.getByRole("button", { name: "Reactivate school access" }).click();
    await expect(row.locator("summary")).toContainText("Active");
    const stillInactive = await admin.from("classroom_staff_assignments").select("status").eq("id", main.data.id).single();
    expect(stillInactive.data?.status).toBe("inactive");
    await page.reload();
    await row.locator("summary").click();
    await mainRow.getByRole("button", { name: "Restore assignment" }).click();
    await expect(mainRow).toContainText("Assigned");
    const audits = await admin.from("audit_log").select("id, entity_table").eq("school_id", schoolId).in("entity_table", ["classroom_staff_assignments", "school_memberships"]);
    expect(audits.data?.length).toBeGreaterThan(0);
  } finally {
    await admin.from("school_memberships").update({ status: "active" }).eq("id", teacherId);
    await admin.from("classroom_staff_assignments").update({ status: "active", ends_on: null }).eq("id", main.data.id);
    await admin.from("classroom_staff_assignments").delete().eq("classroom_id", room.data.id);
    await admin.from("classrooms").delete().eq("id", room.data.id);
    await teacherClient.auth.signOut();
  }
});

test("final School Admin refusal is human-readable and mobile staff controls do not overflow", async ({ page }) => {
  await signIn(page);
  const adminRow = page.locator(".staff-row").filter({ hasText: "Ayesha Dissanayake" });
  await adminRow.locator("summary").click();
  await adminRow.getByRole("button", { name: "Deactivate school access" }).click();
  await adminRow.getByRole("button", { name: "Confirm deactivation" }).click();
  await expect(page.getByText("This is the final active School Admin.")).toBeVisible();
  await expect(adminRow.locator("summary")).toContainText("Active");

  for (const size of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }, { width: 1440, height: 900 }]) {
    await page.setViewportSize(size);
    const teacherRow = page.locator(".staff-row").filter({ hasText: "Sajini Fernando" });
    await teacherRow.locator("summary").click();
    const overflow = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      boxes: ["body", ".app-frame", ".content", ".content-grid", ".section-panel", "#staff", ".side-nav"].map((selector) => {
        const item = document.querySelector(selector);
        const box = item?.getBoundingClientRect();
        const css = item ? getComputedStyle(item) : null;
        return { selector, left: Math.round(box?.left ?? 0), right: Math.round(box?.right ?? 0), width: Math.round(box?.width ?? 0), marginLeft: css?.marginLeft, marginRight: css?.marginRight, paddingLeft: css?.paddingLeft, paddingRight: css?.paddingRight };
      }),
      elements: [...document.querySelectorAll("body *")].flatMap((item) => {
        const box = item.getBoundingClientRect();
        return box.right > window.innerWidth + 1 && box.width > 0 && getComputedStyle(item).position !== "fixed"
          ? [{ tag: item.tagName, className: typeof item.className === "string" ? item.className.slice(0, 70) : "", right: Math.round(box.right) }]
          : [];
      }).slice(0, 12),
    }));
    expect(overflow.document, JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
    const targets = await page.locator("#staff button, #staff-invitations button, #staff summary").evaluateAll((items) => items.filter((item) => {
      const element = item as HTMLElement;
      return getComputedStyle(element).display !== "none" && element.getBoundingClientRect().width > 0;
    }).map((item) => ({ height: item.getBoundingClientRect().height, width: item.getBoundingClientRect().width })));
    expect(targets.every((target) => target.height >= 48 && target.width >= 48)).toBe(true);
    if (size.width === 390 || size.width === 1440) {
      await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", `loop-step-c2-staff-${size.width}.png`), fullPage: false });
    }
    await teacherRow.locator("summary").click();
  }
});
