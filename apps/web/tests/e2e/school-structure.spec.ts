import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Locator, type Page } from "@playwright/test";

type Account = { role: string; email: string; password: string };

function environment(value: string) {
  return Object.fromEntries(value.split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    return match ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]] : [];
  }));
}

const credentials = JSON.parse(readFileSync(resolve(process.cwd(), "supabase/.temp/test-credentials.json"), "utf8")) as { accounts: Account[] };
const status = process.platform === "win32"
  ? execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm exec supabase status --output env --network-id loop-local-network"], { cwd: process.cwd(), encoding: "utf8" })
  : execFileSync("pnpm", ["exec", "supabase", "status", "--output", "env", "--network-id", "loop-local-network"], { cwd: process.cwd(), encoding: "utf8" });
const local = environment(status);
if (local.API_URL !== "http://127.0.0.1:54321" || !local.SECRET_KEY?.startsWith("sb_secret_")) {
  throw new Error("School structure tests require the guarded local Supabase environment.");
}
const admin = createClient(local.API_URL, local.SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

test.describe.configure({ mode: "serial" });

function account(role: string) {
  const value = credentials.accounts.find((candidate) => candidate.role === role);
  if (!value) throw new Error(`Missing local ${role} credentials.`);
  return value;
}

async function signIn(page: Page, current: Account) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(current.email);
  await page.getByLabel("Password").fill(current.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/school/);
  await expect(page.locator("#classrooms")).toBeVisible();
}

function structureItem(page: Page, kind: "branch" | "classroom", name: string) {
  return page.locator(`[data-structure-kind="${kind}"]`).filter({ hasText: name });
}

async function closeEditor(item: Locator) {
  const editor = item.locator("details.structure-editor");
  if (await editor.evaluate((element) => (element as HTMLDetailsElement).open)) {
    await editor.locator("summary").click();
  }
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const section = document.querySelector("#classrooms");
    return {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      section: section ? section.scrollWidth - section.clientWidth : 0,
    };
  });
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.section).toBeLessThanOrEqual(0);
}

test("School Admin manages branch and classroom lifecycle with confirmation", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, account("school_admin"));

  const suffix = Date.now();
  const branchName = `Browser QA Branch with a long nursery location name ${suffix}`;
  const updatedBranchName = `${branchName} updated`;
  const classroomName = `Browser QA Classroom with a long group name ${suffix}`;
  const updatedClassroomName = `${classroomName} updated`;

  try {
    const branchSection = page.getByRole("region", { name: "Branches" });
    await branchSection.locator("summary").filter({ hasText: "Create branch" }).click();
    const createBranch = branchSection.locator("form").filter({ has: page.getByRole("button", { name: "Create branch" }) });
    await createBranch.getByLabel("Branch name").fill(branchName);
    await createBranch.getByRole("button", { name: "Create branch" }).click();
    await expect(structureItem(page, "branch", branchName)).toBeVisible();

    let branch = structureItem(page, "branch", branchName);
    await branch.getByText("Edit branch", { exact: true }).click();
    await branch.getByLabel("Branch name").fill(updatedBranchName);
    await branch.getByRole("button", { name: "Save branch" }).click();
    branch = structureItem(page, "branch", updatedBranchName);
    await expect(branch).toContainText("0 classrooms");
    await closeEditor(branch);

    const classroomSection = page.getByRole("region", { name: "Classrooms" });
    await classroomSection.locator("summary").filter({ hasText: "Create classroom" }).click();
    const createClassroom = classroomSection.locator("form").filter({ has: page.getByRole("button", { name: "Create classroom" }) });
    await createClassroom.getByLabel("Branch").selectOption({ label: updatedBranchName });
    await createClassroom.getByLabel("Classroom name").fill(classroomName);
    await createClassroom.getByRole("button", { name: "Create classroom" }).click();

    let classroom = structureItem(page, "classroom", classroomName);
    await expect(classroom).toContainText(updatedBranchName);
    await expect(classroom).toContainText("0 active teachers · 0 current children");
    await classroom.getByText("Edit classroom", { exact: true }).click();
    await classroom.getByLabel("Classroom name").fill(updatedClassroomName);
    await classroom.getByLabel("Branch").selectOption({ label: "Colombo Main" });
    await classroom.getByRole("button", { name: "Save classroom" }).click();
    classroom = structureItem(page, "classroom", updatedClassroomName);
    await expect(classroom).toContainText("Colombo Main");
    await closeEditor(classroom);

    await classroom.getByRole("button", { name: "Deactivate classroom" }).click();
    await expect(classroom.getByText("This classroom will no longer be available to assigned teachers or enrolled families. Existing records will be kept.")).toBeVisible();
    await classroom.getByRole("button", { name: "Cancel" }).click();
    await expect(classroom.getByText("Active", { exact: true })).toBeVisible();
    await classroom.getByRole("button", { name: "Deactivate classroom" }).click();
    await classroom.getByRole("button", { name: "Confirm deactivation" }).click();
    classroom = structureItem(page, "classroom", updatedClassroomName);
    await expect(classroom.getByText("Inactive", { exact: true })).toBeVisible();
    await classroom.getByRole("button", { name: "Reactivate classroom" }).click();
    await expect(structureItem(page, "classroom", updatedClassroomName).getByText("Active", { exact: true })).toBeVisible();

    branch = structureItem(page, "branch", updatedBranchName);
    await branch.getByRole("button", { name: "Deactivate branch" }).click();
    await expect(branch.getByText("This branch will no longer be available to teachers or families. Existing records will be kept.")).toBeVisible();
    await branch.getByRole("button", { name: "Confirm deactivation" }).click();
    branch = structureItem(page, "branch", updatedBranchName);
    await expect(branch.getByText("Inactive", { exact: true })).toBeVisible();
    await branch.getByRole("button", { name: "Reactivate branch" }).click();
    await expect(structureItem(page, "branch", updatedBranchName).getByText("Active", { exact: true })).toBeVisible();

    await expect(page.getByText("branches.update", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("classrooms.update", { exact: true }).first()).toBeVisible();
  } finally {
    await admin.from("classrooms").delete().eq("name", updatedClassroomName);
    await admin.from("branches").delete().eq("name", updatedBranchName);
  }
});

test("School Admin sees the branch prerequisite before creating a classroom", async ({ page }) => {
  test.setTimeout(60_000);
  const userId = randomUUID();
  const schoolId = randomUUID();
  const email = `empty.structure.${userId}@loop.local`;
  const password = `Loop-empty-${randomUUID()}!`;
  const plan = await admin.from("plans").select("id").eq("status", "active").limit(1).single();
  if (plan.error) throw plan.error;
  const createdUser = await admin.auth.admin.createUser({ id: userId, email, password, email_confirm: true });
  if (createdUser.error) throw createdUser.error;

  try {
    const school = await admin.from("schools").insert({ id: schoolId, plan_id: plan.data.id, name: "Empty Structure Preschool", slug: `empty-structure-${userId}` });
    if (school.error) throw school.error;
    const membership = await admin.from("school_memberships").insert({ school_id: schoolId, user_id: userId, role: "school_admin" });
    if (membership.error) throw membership.error;

    await signIn(page, { role: "school_admin", email, password });
    const branchSection = page.getByRole("region", { name: "Branches" });
    const classroomSection = page.getByRole("region", { name: "Classrooms" });
    await expect(branchSection.getByText("A branch is needed before you can add classrooms.")).toBeVisible();
    await expect(classroomSection.getByText("Create a branch before adding a classroom.")).toBeVisible();
    await expect(classroomSection.getByText("Create classroom", { exact: true })).toHaveCount(0);

    const createBranch = branchSection.locator("form").filter({ has: page.getByRole("button", { name: "Create branch" }) });
    await createBranch.getByLabel("Branch name").fill("First Branch");
    await createBranch.getByRole("button", { name: "Create branch" }).click();
    await expect(classroomSection.getByText("Add a classroom when you are ready.")).toBeVisible();
    await expect(classroomSection.locator("summary").filter({ hasText: "Create classroom" })).toBeVisible();
  } finally {
    await admin.from("schools").delete().eq("id", schoolId);
    await admin.auth.admin.deleteUser(userId);
  }
});

test("School structure controls fit required mobile and desktop viewports", async ({ page }) => {
  await signIn(page, account("school_admin"));
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 390, height: 844 },
    { width: 430, height: 932 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/school#classrooms");
    await expect(page.locator("#classrooms")).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const shortControls = await page.locator("#classrooms button:visible, #classrooms summary:visible").evaluateAll((controls) => controls.filter((control) => control.getBoundingClientRect().height < 47).map((control) => ({ text: control.textContent?.trim(), height: control.getBoundingClientRect().height })));
    expect(shortControls).toEqual([]);
  }

  const branch = page.locator('[data-structure-kind="branch"]').filter({ has: page.getByRole("button", { name: "Deactivate branch" }) }).first();
  const branchName = await branch.locator("h4").innerText();
  await branch.getByRole("button", { name: "Deactivate branch" }).click();
  const confirmation = structureItem(page, "branch", branchName);
  await expect(confirmation.getByRole("group", { name: "Confirm branch deactivation" })).toBeVisible();
  await confirmation.getByRole("button", { name: "Cancel" }).click();
});
