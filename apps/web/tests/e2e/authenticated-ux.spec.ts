import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

type Account = { role: string; email: string; password: string };
type Credentials = { accounts: Account[] };

function environment(value: string) {
  return Object.fromEntries(value.split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    return match ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]] : [];
  }));
}

const credentials = JSON.parse(readFileSync(resolve(process.cwd(), "supabase/.temp/test-credentials.json"), "utf8")) as Credentials;
const status = process.platform === "win32"
  ? execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm exec supabase status --output env --network-id loop-local-network"], { cwd: process.cwd(), encoding: "utf8" })
  : execFileSync("pnpm", ["exec", "supabase", "status", "--output", "env", "--network-id", "loop-local-network"], { cwd: process.cwd(), encoding: "utf8" });
const local = environment(status);
if (local.API_URL !== "http://127.0.0.1:54321" || !local.SECRET_KEY?.startsWith("sb_secret_")) {
  throw new Error("Authenticated UX tests require the guarded local Supabase environment.");
}
const admin = createClient(local.API_URL, local.SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

const emptyClassroomId = randomUUID();
const emptyChildId = randomUUID();
const emptyChildName = "Empty State Child";
let emptySchoolId = "";

function account(role: string) {
  const value = credentials.accounts.find((item) => item.role === role);
  if (!value) throw new Error(`Missing local ${role} credentials.`);
  return value;
}

async function signIn(page: Page, role: string) {
  const current = account(role);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(current.email);
  await page.getByLabel("Password").fill(current.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
}

async function signedInPage(browser: Browser, role: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await signIn(page, role);
  return { context, page };
}

async function requireSuccess(result: { error: { message: string } | null }, action: string) {
  if (result.error) throw new Error(`${action}: ${result.error.message}`);
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const content = document.querySelector("main.content");
    return {
      document: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      content: content ? content.scrollWidth - content.clientWidth : 0,
    };
  });
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.content).toBeLessThanOrEqual(0);
}

test.beforeAll(async () => {
  const guardian = account("guardian");
  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const guardianUser = users.data.users.find((user) => user.email === guardian.email);
  if (!guardianUser) throw new Error("Local guardian user was not found.");
  const membership = await admin.from("school_memberships").select("id, school_id").eq("user_id", guardianUser.id).eq("role", "guardian").single();
  if (membership.error) throw new Error(`Find guardian membership: ${membership.error.message}`);
  emptySchoolId = membership.data.school_id;
  const branch = await admin.from("branches").select("id").eq("school_id", emptySchoolId).eq("status", "active").limit(1).single();
  if (branch.error) throw new Error(`Find local branch: ${branch.error.message}`);

  try {
    await requireSuccess(await admin.from("classrooms").insert({ id: emptyClassroomId, school_id: emptySchoolId, branch_id: branch.data.id, name: "Empty State Classroom" }), "Create empty-state classroom");
    await requireSuccess(await admin.from("children").insert({ id: emptyChildId, school_id: emptySchoolId, preferred_name: emptyChildName }), "Create empty-state child");
    await requireSuccess(await admin.from("child_enrollments").insert({ school_id: emptySchoolId, child_id: emptyChildId, classroom_id: emptyClassroomId, starts_on: new Date().toISOString().slice(0, 10), status: "active" }), "Enroll empty-state child");
    await requireSuccess(await admin.from("child_guardians").insert({ school_id: emptySchoolId, child_id: emptyChildId, guardian_membership_id: membership.data.id, relationship_label: "Parent" }), "Link empty-state guardian");
  } catch (error) {
    await admin.from("children").delete().eq("id", emptyChildId);
    await admin.from("classrooms").delete().eq("id", emptyClassroomId);
    throw error;
  }
});

test.afterAll(async () => {
  if (!emptySchoolId) return;
  await admin.from("child_guardians").delete().eq("child_id", emptyChildId);
  await admin.from("child_enrollments").delete().eq("child_id", emptyChildId);
  await admin.from("children").delete().eq("id", emptyChildId);
  await admin.from("classrooms").delete().eq("id", emptyClassroomId);
});

test("Guardian navigation is consistent and message deep links remain valid", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "guardian");
  const destinations = [
    { path: "/parent", label: "Today" },
    { path: "/messages", label: "Messages" },
    { path: "/updates", label: "Updates" },
    { path: "/settings", label: "Settings" },
  ];

  for (const destination of destinations) {
    await page.goto(destination.path);
    await page.waitForLoadState("networkidle");
    const nav = page.getByRole("navigation", { name: "Primary" });
    const links = nav.getByRole("link");
    await expect(links).toHaveText(["Today", "Messages", "Updates", "Settings"]);
    expect(await links.evaluateAll((items) => items.map((item) => item.getAttribute("href")))).toEqual(["/parent", "/messages", "/updates", "/settings"]);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(destination.label);
  }

  await page.goto("/messages?thread=notification-deep-link-check");
  await expect(page).toHaveURL(/\/messages\?thread=notification-deep-link-check$/);
  await expect(page.getByRole("heading", { name: "Messages" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary" }).locator('[aria-current="page"]')).toHaveText("Messages");
});

test("Teacher active navigation follows Today, Attendance, and Record care", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "teacher");
  const nav = page.getByRole("navigation", { name: "Primary" });
  await expect(nav.getByRole("link")).toHaveText(["Today", "Attendance", "Record care", "Messages", "Updates", "Settings"]);
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Today");

  await nav.getByRole("link", { name: "Attendance" }).click();
  await expect(page).toHaveURL(/\/teacher#attendance$/);
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Attendance");

  await nav.getByRole("link", { name: "Record care" }).click();
  await expect(page).toHaveURL(/\/teacher#care$/);
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Record care");
  await expect(nav.getByRole("link", { name: "Attendance" })).not.toHaveAttribute("aria-current", "page");

  for (const destination of [{ path: "/messages", label: "Messages" }, { path: "/updates", label: "Updates" }, { path: "/settings", label: "Settings" }]) {
    await page.goto(destination.path);
    await page.waitForLoadState("networkidle");
    await expect(page.getByRole("navigation", { name: "Primary" }).locator('[aria-current="page"]')).toHaveText(destination.label);
  }
});

test("Guardian and Teacher surfaces avoid overflow from mobile through wide desktop", async ({ browser }) => {
  test.setTimeout(180_000);
  const guardian = await signedInPage(browser, "guardian");
  const teacher = await signedInPage(browser, "teacher");
  try {
    const viewports = [
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
      { width: 1440, height: 900 },
      { width: 1920, height: 1080 },
    ];
    for (const viewport of viewports) {
      for (const current of [guardian.page, teacher.page]) await current.setViewportSize(viewport);
      for (const route of ["/parent", "/messages", "/updates", "/settings"]) {
        await guardian.page.goto(route);
        await expectNoHorizontalOverflow(guardian.page);
      }
      for (const route of ["/teacher", "/teacher#attendance", "/teacher#care", "/messages", "/updates", "/settings"]) {
        await teacher.page.goto(route);
        await expectNoHorizontalOverflow(teacher.page);
      }
    }

    await guardian.page.setViewportSize({ width: 1920, height: 1080 });
    await guardian.page.goto("/parent");
    const standardContent = guardian.page.locator("main.content-standard");
    await expect(standardContent).toBeVisible();
    expect(await standardContent.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1088);
    await guardian.page.goto("/messages");
    const wideContent = guardian.page.locator("main.content-wide");
    await expect(wideContent).toBeVisible();
    expect(await wideContent.evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(1440);
  } finally {
    await guardian.context.close();
    await teacher.context.close();
  }
});

test("Guardian Today hides empty photos and keeps its empty timeline compact", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "guardian");
  await page.goto(`/parent?child=${emptyChildId}`);
  await expect(page.getByRole("heading", { name: emptyChildName })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Photos today" })).toHaveCount(0);
  await expect(page.locator(".today-photos")).toHaveCount(0);
  const timeline = page.locator(".timeline-is-empty");
  await expect(timeline.getByRole("heading", { name: "No updates yet" })).toBeVisible();
  const emptyState = await timeline.locator(".timeline-empty").boundingBox();
  expect(emptyState!.height).toBeLessThan(130);
  expect(await timeline.evaluate((element) => getComputedStyle(element, "::before").display)).toBe("none");

  await page.setViewportSize({ width: 390, height: 844 });
  await expectNoHorizontalOverflow(page);
});
