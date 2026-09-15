import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Page } from "@playwright/test";

type Account = { role: string; email: string; password: string };

function environment(output: string) {
  return Object.fromEntries(output.split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    return match ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]] : [];
  }));
}

const credentials = JSON.parse(readFileSync(resolve(process.cwd(), "supabase/.temp/test-credentials.json"), "utf8")) as { accounts: Account[] };
const status = process.platform === "win32"
  ? execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm exec supabase status --output env --network-id loop-local-network"], { cwd: process.cwd(), encoding: "utf8" })
  : execFileSync("pnpm", ["exec", "supabase", "status", "--output", "env", "--network-id", "loop-local-network"], { cwd: process.cwd(), encoding: "utf8" });
const local = environment(status);
if (local.API_URL !== "http://127.0.0.1:54321" || !local.SECRET_KEY?.startsWith("sb_secret_") || !local.PUBLISHABLE_KEY?.startsWith("sb_publishable_")) {
  throw new Error("Child management tests require guarded local Supabase.");
}
const admin = createClient(local.API_URL, local.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });

test.describe.configure({ mode: "serial" });

function account(role: string) {
  const current = credentials.accounts.find((candidate) => candidate.role === role);
  if (!current) throw new Error(`Missing local ${role} account.`);
  return current;
}

function relatedClassroomName(value: { name: string } | { name: string }[] | null) {
  return Array.isArray(value) ? value[0]?.name : value?.name;
}

async function signIn(page: Page, current: Account) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(current.email);
  await page.getByLabel("Password").fill(current.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/school/);
  await expect(page.locator("#people")).toBeVisible();
}

async function selectChild(page: Page, name: string) {
  const search = page.getByLabel("Search children");
  await search.fill(name);
  const row = page.locator(".child-roster-item").filter({ hasText: name });
  await expect(row).toBeVisible();
  // Searching must not leave an unrelated child's management form open.
  await expect(page.locator(".child-profile-heading")).toContainText(name);
  await row.click();
  await expect(page.locator(".child-profile-heading")).toContainText(name);
  return row;
}

test("School Admin creates, searches, moves, deactivates, and reactivates a child", async ({ page }) => {
  test.setTimeout(90_000);
  await signIn(page, account("school_admin"));
  const name = `Atomic browser child ${Date.now()}`;
  const destinationName = `Browser QA Moonbirds ${Date.now()}`;
  let childId: string | undefined;
  let destinationId: string | undefined;

  try {
    const branch = await admin.from("branches").select("id, school_id").eq("name", "Colombo Main").single();
    if (branch.error) throw branch.error;
    const createdDestination = await admin.from("classrooms").insert({ school_id: branch.data.school_id, branch_id: branch.data.id, name: destinationName }).select("id").single();
    if (createdDestination.error) throw createdDestination.error;
    destinationId = createdDestination.data.id;
    await page.reload();

    const create = page.locator(".child-create");
    await create.locator("summary").click();
    await create.getByLabel("Preferred name").fill(name);
    await create.getByLabel("Initial classroom").selectOption({ label: "Sunbirds" });
    await create.getByRole("button", { name: "Add child" }).click();
    await expect(page.locator(".child-roster-item").filter({ hasText: name })).toBeVisible();

    const found = await admin.from("children").select("id, school_id, status").eq("preferred_name", name).single();
    if (found.error) throw found.error;
    childId = found.data.id;
    const initial = await admin.from("child_enrollments").select("id, status, classrooms(name)").eq("child_id", childId).single();
    if (initial.error) throw initial.error;
    expect(initial.data.status).toBe("active");
    expect(relatedClassroomName(initial.data.classrooms)).toBe("Sunbirds");

    const row = await selectChild(page, name);
    await expect(page.locator(".child-roster-item")).toHaveCount(1);
    await expect(row).toContainText("Active · Sunbirds");
    await expect(page.locator(".child-profile-consent select")).toHaveValue("not_recorded");

    await page.getByLabel("New classroom").selectOption({ label: destinationName });
    await page.getByRole("button", { name: "Review move" }).click();
    await expect(page.getByRole("group", { name: "Confirm classroom move" })).toContainText(`Sunbirds to ${destinationName}`);
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: "Review move" }).click();
    await page.getByRole("button", { name: "Confirm move" }).click();
    await expect(page.locator(".child-profile-heading")).toContainText(destinationName);

    const history = await admin.from("child_enrollments").select("status, classrooms(name)").eq("child_id", childId);
    if (history.error) throw history.error;
    expect(history.data).toHaveLength(2);
    expect(history.data.some((item) => item.status === "completed" && relatedClassroomName(item.classrooms) === "Sunbirds")).toBe(true);
    expect(history.data.some((item) => item.status === "active" && relatedClassroomName(item.classrooms) === destinationName)).toBe(true);

    await page.getByRole("button", { name: "Deactivate child" }).click();
    await expect(page.getByRole("group", { name: "Confirm child deactivation" })).toContainText("current enrollment remains as history");
    await page.getByRole("button", { name: "Confirm deactivation" }).click();
    await expect(page.locator(".child-profile-heading")).toContainText("Inactive");
    const stillEnrolled = await admin.from("child_enrollments").select("status").eq("child_id", childId).eq("status", "active");
    expect(stillEnrolled.data).toHaveLength(1);
    await page.getByRole("button", { name: "Reactivate child" }).click();
    await expect(page.locator(".child-profile-heading")).toContainText("Active");

    const audit = await admin.from("audit_log").select("entity_table, action").eq("entity_id", childId);
    if (audit.error) throw audit.error;
    expect(audit.data.some((item) => item.action === "children.insert")).toBe(true);
    expect(audit.data.filter((item) => item.action === "children.update").length).toBeGreaterThanOrEqual(2);
  } finally {
    if (childId) await admin.from("children").delete().eq("id", childId);
    if (destinationId) await admin.from("classrooms").delete().eq("id", destinationId);
  }
});

test("two same-school guardians remain independent when one child link is revoked", async ({ page }) => {
  test.setTimeout(100_000);
  await signIn(page, account("school_admin"));
  const guardianAccount = account("guardian");
  const users = await admin.auth.admin.listUsers();
  if (users.error) throw users.error;
  const firstUser = users.data.users.find((user) => user.email === guardianAccount.email);
  if (!firstUser) throw new Error("Missing fictional local guardian.");
  const first = await admin.from("school_memberships").select("id, school_id").eq("user_id", firstUser.id).eq("role", "guardian").single();
  if (first.error) throw first.error;
  const firstLinks = await admin.from("child_guardians").select("child_id").eq("guardian_membership_id", first.data.id).eq("status", "active");
  if (firstLinks.error || !firstLinks.data.length) throw new Error("First guardian must have another linked child in the fictional local roster.");
  const otherChildId = firstLinks.data[0].child_id;
  const secondUserId = randomUUID();
  const secondEmail = `second.guardian.${secondUserId}@loop.local`;
  const secondPassword = `Loop-${randomUUID()}!`;
  const created = await admin.auth.admin.createUser({ id: secondUserId, email: secondEmail, password: secondPassword, email_confirm: true });
  if (created.error) throw created.error;

  const childName = `Two guardian child ${Date.now()}`;
  let childId: string | undefined;
  let secondMembershipId: string | undefined;
  try {
    const membership = await admin.from("school_memberships").insert({ school_id: first.data.school_id, user_id: secondUserId, role: "guardian" }).select("id").single();
    if (membership.error) throw membership.error;
    secondMembershipId = membership.data.id;

    const classroom = await admin.from("classrooms").select("id").eq("school_id", first.data.school_id).eq("status", "active").limit(1).single();
    if (classroom.error) throw classroom.error;
    const child = await admin.from("children").insert({ school_id: first.data.school_id, preferred_name: childName }).select("id").single();
    if (child.error) throw child.error;
    childId = child.data.id;
    const enrollment = await admin.from("child_enrollments").insert({ school_id: first.data.school_id, child_id: childId, classroom_id: classroom.data.id, starts_on: new Date().toISOString().slice(0, 10), status: "active" });
    if (enrollment.error) throw enrollment.error;

    await page.reload();
    await selectChild(page, childName);
    const firstLink = page.locator(".child-profile .compact-editor").filter({ has: page.getByText("Link an existing guardian", { exact: true }) });
    await firstLink.locator("summary").click();
    await firstLink.locator('select[name="guardian_membership_id"]').selectOption(first.data.id);
    await firstLink.getByRole("button", { name: "Link guardian" }).click();
    await expect(page.locator(".guardian-link")).toHaveCount(1);
    const secondLink = page.locator(".child-profile .compact-editor").filter({ has: page.getByText("Link an existing guardian", { exact: true }) });
    if (!(await secondLink.evaluate((element) => (element as HTMLDetailsElement).open))) await secondLink.locator("summary").click();
    await secondLink.locator('select[name="guardian_membership_id"]').selectOption(membership.data.id);
    await secondLink.getByRole("button", { name: "Link guardian" }).click();
    await expect(page.locator(".guardian-link")).toHaveCount(2);

    const links = await admin.from("child_guardians").select("id, guardian_membership_id, status").eq("child_id", childId);
    if (links.error) throw links.error;
    expect(new Set(links.data.map((link) => link.guardian_membership_id)).size).toBe(2);
    const firstLinkRow = links.data.find((link) => link.guardian_membership_id === first.data.id);
    if (!firstLinkRow) throw new Error("Expected first guardian link.");
    const firstLinkUi = page.locator(".guardian-link").filter({ has: page.getByText("Ruwan Silva", { exact: true }) });
    await firstLinkUi.getByRole("button", { name: "Revoke link" }).click();
    await expect(firstLinkUi.getByRole("group", { name: "Confirm guardian access revocation" })).toContainText("access to any other linked child will not be changed");
    await firstLinkUi.getByRole("button", { name: "Confirm revocation" }).click();

    const firstClient = createClient(local.API_URL, local.PUBLISHABLE_KEY);
    const signInFirst = await firstClient.auth.signInWithPassword({ email: guardianAccount.email, password: guardianAccount.password });
    if (signInFirst.error) throw signInFirst.error;
    const denied = await firstClient.from("children").select("id").eq("id", childId);
    const retained = await firstClient.from("children").select("id").eq("id", otherChildId);
    expect(denied.data).toHaveLength(0);
    expect(retained.data).toHaveLength(1);
    await firstClient.auth.signOut();

    const secondClient = createClient(local.API_URL, local.PUBLISHABLE_KEY);
    const signedInSecond = await secondClient.auth.signInWithPassword({ email: secondEmail, password: secondPassword });
    if (signedInSecond.error) throw signedInSecond.error;
    const secondRetained = await secondClient.from("children").select("id").eq("id", childId);
    expect(secondRetained.data).toHaveLength(1);
    await secondClient.auth.signOut();

    const post = await admin.from("child_guardians").select("guardian_membership_id, status").eq("child_id", childId);
    expect(post.data?.find((link) => link.guardian_membership_id === first.data.id)?.status).toBe("inactive");
    expect(post.data?.find((link) => link.guardian_membership_id === secondMembershipId)?.status).toBe("active");
    const audit = await admin.from("audit_log").select("action").eq("entity_id", firstLinkRow.id);
    expect(audit.data?.some((item) => item.action === "child_guardians.update")).toBe(true);
  } finally {
    if (childId) await admin.from("children").delete().eq("id", childId);
    if (secondMembershipId) await admin.from("school_memberships").delete().eq("id", secondMembershipId);
    await admin.auth.admin.deleteUser(secondUserId);
  }
});

test("child media consent changes among all conservative states", async ({ page }) => {
  await signIn(page, account("school_admin"));
  await selectChild(page, "Amaya Herath");
  const child = await admin.from("children").select("id").eq("preferred_name", "Amaya Herath").single();
  if (child.error) throw child.error;
  const original = await admin.from("child_media_consents").select("state").eq("child_id", child.data.id).single();
  if (original.error) throw original.error;

  try {
    for (const state of ["not_recorded", "granted", "denied"] as const) {
      await page.locator(".child-profile-consent select").selectOption(state);
      await page.locator(".child-profile-consent").getByRole("button", { name: "Save consent" }).click();
      await expect.poll(async () => (await admin.from("child_media_consents").select("state").eq("child_id", child.data.id).single()).data?.state).toBe(state);
      await expect(page.locator(".child-profile-consent select")).toHaveValue(state);
      await page.reload();
      await selectChild(page, "Amaya Herath");
      await expect(page.locator(".child-profile-consent select")).toHaveValue(state);
    }
    const audit = await admin.from("audit_log").select("action").eq("entity_id", child.data.id).eq("entity_table", "child_media_consents");
    expect(audit.data?.filter((event) => event.action === "child_media_consents.update").length).toBeGreaterThanOrEqual(3);
  } finally {
    await admin.from("child_media_consents").update({ state: original.data.state }).eq("child_id", child.data.id);
  }
});

test("child roster and management controls fit mobile and desktop without overflow", async ({ page }) => {
  await signIn(page, account("school_admin"));
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/school#people");
    await expect(page.locator("#people")).toBeVisible();
    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      section: document.querySelector("#people")!.scrollWidth - document.querySelector("#people")!.clientWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(0);
    expect(overflow.section).toBeLessThanOrEqual(0);
    const tooSmall = await page.locator("#people button:visible, #people summary:visible").evaluateAll((controls) => controls.filter((control) => control.getBoundingClientRect().height < 47).map((control) => control.textContent?.trim()));
    expect(tooSmall).toEqual([]);
  }
  await page.getByLabel("Search children").fill("no-match-local-child");
  await expect(page.getByText("No children match")).toBeVisible();
});
