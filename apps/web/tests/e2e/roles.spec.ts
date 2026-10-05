import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Account = { role: string; email: string; password: string };
type Credentials = {
  accounts: Account[];
  fixtures: { sunbirds: string; kingfishers: string; kingfisherChild: string; unassigned: string };
};
const credentials = JSON.parse(readFileSync(resolve(process.cwd(), "supabase/.temp/test-credentials.json"), "utf8")) as Credentials;
const mailpitUrl = process.env.SUPABASE_MAILPIT_URL ?? "http://127.0.0.1:54324";

async function signIn(page: Page, role: string) {
  const account = credentials.accounts.find((item) => item.role === role);
  if (!account) throw new Error(`Missing local ${role} credentials.`);
  const consoleErrors: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") consoleErrors.push(message.text()); });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
  expect(await page.locator("[data-nextjs-dialog]").count()).toBe(0);
  expect(consoleErrors).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test("super admin reaches child-blind school setup", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "super_admin");
  await expect(page).toHaveURL(/\/platform/);
  await expect(page.getByRole("heading", { name: "Schools", exact: true }).first()).toBeVisible();
  await expect(page.getByText("Platform setup excludes child, attendance, and care data by design.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Save plan limits" })).toBeVisible();
  await page.getByRole("button", { name: "Save plan limits" }).click();
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", "loop-step-c2-super-admin-desktop.png"), fullPage: true });
  const schoolName = `Browser QA School ${Date.now()}`;
  await page.getByText("Add school", { exact: true }).click();
  const schoolForm = page.locator("form").filter({ has: page.getByRole("button", { name: "Create school" }) });
  await schoolForm.getByLabel("Name").fill(schoolName);
  await schoolForm.getByLabel("Identifier").fill(`browser-qa-${Date.now()}`);
  await schoolForm.getByRole("button", { name: "Create school" }).click();
  await expect(page.getByRole("link", { name: new RegExp(schoolName) })).toBeVisible();
  await page.goto("/parent");
  await expect(page).toHaveURL(/\/platform/);
});

test("school admin reaches tenant operations", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "school_admin");
  await expect(page).toHaveURL(/\/school/);
  await expect(page.getByText("Little Harbour Preschool").first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "Plan usage" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attendance by classroom" })).toBeVisible();
  await expect(page.locator(".attendance-overview-row").filter({ hasText: "Sunbirds" })).toContainText("12 in");
  await expect(page.locator(".attendance-overview-row").filter({ hasText: "Kingfishers" })).toContainText("2 in");
  await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", "loop-step-c2-school-admin-desktop.png"), fullPage: true });
  const invitationEmail = `browser.qa.${Date.now()}@loop.local`;
  const invitationForm = page.locator("#staff-invitations > form");
  await invitationForm.getByLabel("Email").fill(invitationEmail);
  await invitationForm.getByRole("button", { name: "Create staff invitation" }).click();
  const invitationRow = page.locator(".staff-invitation-row").filter({ hasText: invitationEmail });
  await expect(invitationRow).toContainText("Pending");
  await invitationRow.getByRole("button", { name: "Revoke" }).click();
  await expect(page.locator(".staff-invitation-row").filter({ hasText: invitationEmail })).toContainText("Revoked");
  await page.goto("/platform");
  await expect(page).toHaveURL(/\/school/);
});

test("teacher reaches assigned mobile Classroom Today", async ({ page }) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "teacher");
  await expect(page).toHaveURL(/\/teacher/);
  await expect(page.getByRole("heading", { name: "Sunbirds" })).toBeVisible();
  await expect(page.getByLabel("Active classroom")).toHaveValue(credentials.fixtures.sunbirds);
  await page.getByLabel("Active classroom").selectOption(credentials.fixtures.kingfishers);
  await expect(page).toHaveURL(new RegExp(`classroom=${credentials.fixtures.kingfishers}`));
  await expect(page.getByRole("heading", { name: "Kingfishers" })).toBeVisible();
  await expect(page.getByText("Ira Samarakoon", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Maya Senaratne", { exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Kingfishers" })).toBeVisible();
  await page.getByLabel("Active classroom").selectOption(credentials.fixtures.sunbirds);
  await expect(page.getByRole("heading", { name: "Sunbirds" })).toBeVisible();
  await page.goto(`/teacher?classroom=${credentials.fixtures.unassigned}`);
  await expect(page.getByText("This page could not be found.")).toBeVisible();
  await page.goto(`/teacher?classroom=${credentials.fixtures.sunbirds}`);
  const crossClassReservation = await page.evaluate(async ({ classroomId, childId }) => {
    const response = await fetch("/api/media/reservations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        classroomId,
        childIds: [childId],
        variants: [
          { kind: "original", contentType: "image/jpeg", byteSize: 100, width: 10, height: 10 },
          { kind: "display", contentType: "image/jpeg", byteSize: 80, width: 10, height: 10 },
          { kind: "thumbnail", contentType: "image/jpeg", byteSize: 60, width: 10, height: 10 },
        ],
      }),
    });
    return response.status;
  }, { classroomId: credentials.fixtures.sunbirds, childId: credentials.fixtures.kingfisherChild });
  expect(crossClassReservation).toBe(403);
  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Record care in bulk" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Today's timetable" })).toBeVisible();
  await expect(page.getByText("Time-based labels describe the schedule only. They do not confirm that an activity was completed.")).toBeVisible();
  const timetableEditor = page.locator("section.section-panel").filter({ has: page.getByRole("heading", { name: "Adjust timetable" }) });
  await timetableEditor.getByText("Change today's activity", { exact: true }).click();
  const changedActivity = timetableEditor.locator("form").filter({ has: page.getByRole("button", { name: "Change today only" }) });
  await changedActivity.getByLabel("Updated title").fill("Outdoor welcome check");
  await changedActivity.getByLabel("Start").fill("08:35");
  await changedActivity.getByLabel("End").fill("09:05");
  await changedActivity.getByRole("button", { name: "Change today only" }).click();
  await expect(page.locator(".schedule-row").filter({ hasText: "Outdoor welcome check" })).toContainText("Today only");
  await timetableEditor.getByText("Add activity today", { exact: true }).click();
  const additionalActivity = timetableEditor.locator("form").filter({ has: page.getByRole("button", { name: "Add today only" }) });
  await additionalActivity.getByLabel("Activity").fill("Teacher day-flow check");
  await additionalActivity.getByLabel("Start").fill("16:00");
  await additionalActivity.getByLabel("End").fill("16:15");
  await additionalActivity.getByRole("button", { name: "Add today only" }).click();
  await expect(page.locator(".schedule-row").filter({ hasText: "Teacher day-flow check" })).toContainText("Today only");
  await expect(page.locator(".schedule-row").filter({ hasText: "Circle time" })).toBeVisible();
  await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", "loop-step-c2-teacher-mobile.png"), fullPage: true });
  await expect(page.getByText("12 / 15", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(9);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", "loop-step-c2-teacher-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const arrivalForm = page.locator(".bulk-attendance").filter({ hasText: "Morning arrivals" });
  const arrivals = arrivalForm.locator('input[name="child_id"]');
  await expect(arrivals).toHaveCount(2);
  expect(await arrivals.evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).checked))).toEqual([true, true]);
  await arrivals.last().evaluate((input) => (input as HTMLInputElement).click());
  await arrivalForm.getByRole("button", { name: "Check in selected (1)" }).click();
  await expect(page.getByText("13 / 15", { exact: true })).toBeVisible();
  const remainingArrival = page.locator(".attendance-row").filter({ hasText: "Not yet arrived" });
  await remainingArrival.getByText("Exception").click();
  await remainingArrival.getByRole("button", { name: "Excused" }).click();
  await expect(page.getByText("Excused", { exact: true })).toBeVisible();
  const carePanel = page.getByRole("tabpanel");
  const selectedForCare = carePanel.locator('input[name="child_id"]:checked');
  await expect(selectedForCare).toHaveCount(13);
  const careStartedAt = Date.now();
  await carePanel.getByLabel(/Exception for/).last().selectOption("none_refused");
  await carePanel.getByRole("button", { name: "Save meal update" }).click();
  await expect(carePanel.getByRole("status")).toHaveText("13 care updates saved.");
  console.log(`bulk-care-observed-ms=${Date.now() - careStartedAt}; roster=15; selected=13; exceptions=1; submissions=1`);

  await page.getByRole("tab", { name: "Bottle" }).click();
  await expect(carePanel.locator('select[name="default_quantity"]')).toHaveValue("120");
  await carePanel.getByLabel(/Bottle amount exception/).last().selectOption("60");
  await carePanel.getByRole("button", { name: "Save bottle update" }).click();
  await expect(carePanel.getByRole("status")).toHaveText("13 care updates saved.");

  await page.getByRole("tab", { name: "Sleep" }).click();
  await carePanel.getByRole("button", { name: "Start sleep for selected" }).click();
  await expect(carePanel.getByRole("status").first()).toHaveText("13 care updates saved.");
  await carePanel.getByRole("button", { name: "End sleep for selected" }).click();
  await expect(carePanel.getByText("No children are currently sleeping.")).toBeVisible();

  const mediaPanel = page.locator("form.media-upload");
  await expect(mediaPanel.locator('input[name="child_id"]')).toHaveCount(10);
  await expect(mediaPanel.locator('input[name="child_id"]:checked')).toHaveCount(10);
  await mediaPanel.locator('input[name="child_id"]').first().evaluate((input) => (input as HTMLInputElement).click());
  await expect(mediaPanel.locator('input[name="child_id"]:checked')).toHaveCount(9);
  await mediaPanel.getByRole("button", { name: "Select present" }).click();
  await expect(mediaPanel.locator('input[name="child_id"]:checked')).toHaveCount(10);

  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.locator(".bulk-attendance").filter({ hasText: "End-of-day checkout" }).getByRole("button", { name: "Check out selected (13)" }).click();
  await expect(page.getByText("0 / 15", { exact: true })).toBeVisible();
  await expect(page.getByText("Checked out", { exact: true }).first()).toBeVisible();
  console.log("teacher-day-flow-observed-interactions=12; roster=15; core-server-submissions=5; total-test-server-submissions=9; class-switches=2; attendance-exception=1; care-exception=1; photo-selection-exception=1; timetable-override=1");
  await page.goto("/school");
  await expect(page).toHaveURL(/\/teacher/);
});

test("guardian reaches mobile Child Today timeline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "guardian");
  await expect(page).toHaveURL(/\/parent/);
  await expect(page.getByRole("heading", { name: "Maya Senaratne" })).toBeVisible();
  await expect(page.locator("#timeline")).toBeVisible();
  await expect(page.getByText("Outdoor welcome check", { exact: true })).toBeVisible();
  await expect(page.getByText("Bottle").first()).toBeVisible();
  await expect(page.getByText("Nap ended").first()).toBeVisible();
  await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", "loop-step-c2-parent-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", "loop-step-c2-parent-desktop.png"), fullPage: true });
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/parent/);
});

test("second school admin sees only their own school attendance", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "school_admin_2");
  await expect(page).toHaveURL(/\/school/);
  await expect(page.getByText("Kandy Garden Preschool").first()).toBeVisible();
  await expect(page.locator(".attendance-overview-row").filter({ hasText: "Fireflies" })).toBeVisible();
  await expect(page.getByText("Sunbirds", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Maya Senaratne", { exact: true })).toHaveCount(0);
});

test("forgot and reset password completes through local Mailpit", async ({ page, request }) => {
  const account = credentials.accounts.find((item) => item.role === "school_admin_2");
  if (!account) throw new Error("Missing local recovery-test credentials.");
  await request.delete(`${mailpitUrl}/api/v1/messages`);
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(account.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByText("If that account exists")).toBeVisible();

  const verificationUrl = await latestRecoveryLink(request, account.email);
  await page.goto(verificationUrl);
  await page.waitForURL(/\/reset-password/);
  await page.getByLabel("New password").fill(`Loop-reset-${Date.now()}!`);
  await page.getByRole("button", { name: "Update password" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.getByText("Password updated")).toBeVisible();
});

test("invalid invitation fails closed", async ({ page }) => {
  await page.goto("/invite?token=not-a-valid-loop-invitation");
  await expect(page.getByText("invalid, expired, or already used")).toBeVisible();
  await expect(page.getByRole("button", { name: "Activate account" })).toHaveCount(0);
});

test("staff invitation creation keeps the token private, signs out, and protects routes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "school_admin");
  const invitedEmail = `valid.teacher.${Date.now()}@loop.local`;
  const invitationForm = page.locator("#staff-invitations > form");
  await invitationForm.getByLabel("Email").fill(invitedEmail);
  await invitationForm.getByRole("button", { name: "Create staff invitation" }).click();
  await expect(page.locator(".staff-invitation-row").filter({ hasText: invitedEmail })).toContainText("Pending");
  await expect(page.locator(".status-success a")).toHaveCount(0);
  expect(page.url()).not.toContain("token=");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/sign-in/);
});

async function latestRecoveryLink(request: APIRequestContext, email: string) {
  await expect.poll(async () => {
    const response = await request.get(`${mailpitUrl}/api/v1/messages`);
    const body = await response.json() as { messages: Array<{ ID: string; To: Array<{ Address: string }> }> };
    return body.messages.some((message) => message.To.some((recipient) => recipient.Address === email));
  }).toBe(true);
  const response = await request.get(`${mailpitUrl}/api/v1/messages`);
  const body = await response.json() as { messages: Array<{ ID: string; To: Array<{ Address: string }> }> };
  const message = body.messages.find((item) => item.To.some((recipient) => recipient.Address === email));
  if (!message) throw new Error("Recovery message not found.");
  const detailResponse = await request.get(`${mailpitUrl}/api/v1/message/${message.ID}`);
  const detail = await detailResponse.json() as { HTML?: string; Text?: string };
  const decoded = (detail.HTML ?? detail.Text ?? "").replaceAll("&amp;", "&");
  const match = decoded.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}\/auth\/v1\/verify[^\s"'<]+/);
  if (!match) throw new Error("Recovery verification URL not found in Mailpit message.");
  return match[0];
}
