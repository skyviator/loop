import { execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

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
  throw new Error("Invitation tests require guarded local Supabase.");
}
const admin = createClient(local.API_URL, local.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
const publicClient = createClient(local.API_URL, local.PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });
test.describe.configure({ mode: "serial" });

function account(role: string) {
  const value = credentials.accounts.find((item) => item.role === role);
  if (!value) throw new Error(`Missing ${role} credentials.`);
  return value;
}

async function fixture() {
  const school = await admin.from("schools").select("id").eq("slug", "little-harbour").single();
  if (school.error) throw school.error;
  const inviter = await admin.from("school_memberships").select("user_id").eq("school_id", school.data.id).eq("role", "school_admin").eq("status", "active").limit(1).single();
  const child = await admin.from("children").select("id").eq("school_id", school.data.id).eq("status", "active").limit(1).single();
  if (inviter.error || child.error) throw inviter.error ?? child.error;
  return { schoolId: school.data.id, inviterId: inviter.data.user_id, childId: child.data.id };
}

function tokenHash(token: string) {
  return `\\x${createHash("sha256").update(token).digest("hex")}`;
}

test("public and anonymous signup remain disabled", async () => {
  const signup = await publicClient.auth.signUp({ email: `public-signup-${Date.now()}@loop.local`, password: `Loop-public-${Date.now()}!` });
  expect(signup.error).toBeTruthy();
  expect(signup.data.user).toBeNull();
  const anonymous = await publicClient.auth.signInAnonymously();
  expect(anonymous.error).toBeTruthy();
  expect(anonymous.data.user).toBeNull();
});

test("first School Admin invitation activates a new school without public signup", async ({ page }) => {
  const plan = await admin.from("plans").select("id").eq("status", "active").limit(1).single();
  const platform = await admin.from("platform_administrators").select("user_id").eq("status", "active").limit(1).single();
  if (plan.error || platform.error) throw plan.error ?? platform.error;
  const marker = Date.now();
  const school = await admin.from("schools").insert({ plan_id: plan.data.id, name: "Invitation QA Preschool", slug: `invitation-qa-${marker}` }).select("id").single();
  if (school.error) throw school.error;
  const email = `first.admin.${marker}@loop.local`;
  const token = randomBytes(24).toString("base64url");
  const invitation = await admin.from("invitations").insert({
    school_id: school.data.id,
    invited_email: email,
    invited_role: "school_admin",
    token_hash: tokenHash(token),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    invited_by_user_id: platform.data.user_id,
  });
  if (invitation.error) throw invitation.error;

  await page.goto(`/invite?token=${token}`);
  await page.getByLabel("Create password").fill(`Loop-first-admin-${marker}!`);
  await page.getByRole("button", { name: "Create and activate account" }).click();
  await expect(page).toHaveURL(/\/school/);
  await expect(page.getByText("Invitation QA Preschool").first()).toBeVisible();
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = users.data.users.find((item) => item.email === email);
  expect(user).toBeTruthy();
  const membership = await admin.from("school_memberships").select("role, status").eq("school_id", school.data.id).eq("user_id", user!.id).single();
  expect(membership.data).toMatchObject({ role: "school_admin", status: "active" });
  await admin.from("schools").delete().eq("id", school.data.id);
  await admin.auth.admin.deleteUser(user!.id);
});

test("new Guardian activation binds the invited child and grants only Guardian access", async ({ page }) => {
  const { schoolId, inviterId, childId } = await fixture();
  const email = `guardian.activation.${Date.now()}@loop.local`;
  const token = randomBytes(24).toString("base64url");
  const invitation = await admin.from("invitations").insert({
    school_id: schoolId,
    invited_email: email,
    invited_role: "guardian",
    token_hash: tokenHash(token),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    invited_by_user_id: inviterId,
    invited_child_id: childId,
    guardian_relationship_label: "Parent",
    guardian_is_primary: true,
  }).select("id").single();
  if (invitation.error) throw invitation.error;

  await page.goto(`/invite?token=${token}`);
  for (const viewport of [{ width: 375, height: 812 }, { width: 390, height: 844 }, { width: 430, height: 932 }]) {
    await page.setViewportSize(viewport);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const box = await page.getByRole("button", { name: "Create and activate account" }).boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(48);
  }
  await page.getByLabel("Create password").fill(`Loop-guardian-${Date.now()}!`);
  await page.getByRole("button", { name: "Create and activate account" }).click();
  await expect(page).toHaveURL(/\/parent/);

  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = users.data.users.find((item) => item.email === email);
  expect(user).toBeTruthy();
  const membership = await admin.from("school_memberships").select("id, role, status").eq("school_id", schoolId).eq("user_id", user!.id).single();
  expect(membership.data).toMatchObject({ role: "guardian", status: "active" });
  const link = await admin.from("child_guardians").select("child_id, status, is_primary").eq("guardian_membership_id", membership.data!.id).single();
  expect(link.data).toMatchObject({ child_id: childId, status: "active", is_primary: true });
  await admin.auth.admin.deleteUser(user!.id);
});

test("existing user signs in to activate without creating a duplicate Auth identity", async ({ page }) => {
  const { schoolId, inviterId } = await fixture();
  const existing = account("school_admin_2");
  const before = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const beforeCount = before.data.users.filter((item) => item.email === existing.email).length;
  expect(beforeCount).toBe(1);
  const existingUser = before.data.users.find((item) => item.email === existing.email)!;
  const beforeMembership = await admin.from("school_memberships").select("id").eq("school_id", schoolId).eq("user_id", existingUser.id).maybeSingle();
  await admin.from("invitations").delete().eq("school_id", schoolId).eq("invited_email", existing.email).eq("status", "pending");
  const token = randomBytes(24).toString("base64url");
  const invitation = await admin.from("invitations").insert({
    school_id: schoolId,
    invited_email: existing.email,
    invited_role: "school_admin",
    token_hash: tokenHash(token),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    invited_by_user_id: inviterId,
  });
  if (invitation.error) throw invitation.error;

  await page.goto(`/invite?token=${token}`);
  await page.getByLabel("Email").fill(existing.email);
  await page.getByLabel("Password", { exact: true }).fill(existing.password);
  await page.getByRole("button", { name: "Sign in to activate" }).click();
  await page.getByRole("button", { name: "Activate invitation" }).click();
  await expect(page).toHaveURL(/\/school/);
  const after = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  expect(after.data.users.filter((item) => item.email === existing.email)).toHaveLength(1);
  if (!beforeMembership.data) await admin.from("school_memberships").delete().eq("school_id", schoolId).eq("user_id", existingUser.id);
});

test("a signed-in identity with the wrong email cannot claim an invitation", async ({ page }) => {
  const { schoolId, inviterId } = await fixture();
  const token = randomBytes(24).toString("base64url");
  const email = `wrong-email-target.${Date.now()}@loop.local`;
  const invitation = await admin.from("invitations").insert({
    school_id: schoolId,
    invited_email: email,
    invited_role: "teacher",
    token_hash: tokenHash(token),
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    invited_by_user_id: inviterId,
  });
  if (invitation.error) throw invitation.error;

  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account("teacher").email);
  await page.getByLabel("Password").fill(account("teacher").password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/teacher/);
  await page.goto(`/invite?token=${token}`);
  await page.getByRole("button", { name: "Activate invitation" }).click();
  await expect(page.getByText("does not match the signed-in account", { exact: false })).toBeVisible();
  const record = await admin.from("invitations").select("status, accepted_by_user_id").eq("token_hash", tokenHash(token)).single();
  expect(record.data).toMatchObject({ status: "pending", accepted_by_user_id: null });
});
