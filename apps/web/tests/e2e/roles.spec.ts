import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

type Account = { role: string; email: string; password: string };
type Credentials = {
  accounts: Account[];
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
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "teacher");
  await expect(page).toHaveURL(/\/teacher/);
  await expect(page.getByRole("heading", { name: "Sunbirds" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Attendance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Record care in bulk" })).toBeVisible();
  await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", "loop-step-c2-teacher-mobile.png"), fullPage: true });
  await expect(page.getByText("12 / 15", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(9);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", "loop-step-c2-teacher-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const arrival = page.locator('.bulk-arrivals input[name="child_id"]').first();
  await arrival.check();
  await page.getByRole("button", { name: "Check in selected" }).click();
  await expect(page.getByText("13 / 15", { exact: true })).toBeVisible();
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

  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.getByRole("button", { name: "Check out" }).first().click();
  await expect(page.getByText("12 / 15", { exact: true })).toBeVisible();
  await expect(page.getByText("Checked out", { exact: true }).first()).toBeVisible();
  await page.goto("/school");
  await expect(page).toHaveURL(/\/teacher/);
});

test("guardian reaches mobile Child Today timeline", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "guardian");
  await expect(page).toHaveURL(/\/parent/);
  await expect(page.getByRole("heading", { name: "Maya Senaratne" })).toBeVisible();
  await expect(page.locator("#timeline")).toBeVisible();
  await expect(page.getByText("Bottle").first()).toBeVisible();
  await expect(page.getByText("Nap ended").first()).toBeVisible();
  await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", "loop-step-c2-parent-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", "loop-step-c2-parent-desktop.png"), fullPage: true });
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/parent/);
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

test("valid invitation enforces email, activates once, signs out, and protects routes", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page, "school_admin");
  const invitedEmail = `valid.teacher.${Date.now()}@loop.local`;
  const invitationForm = page.locator("#staff-invitations > form");
  await invitationForm.getByLabel("Email").fill(invitedEmail);
  await invitationForm.getByRole("button", { name: "Create staff invitation" }).click();
  const invitationLink = await page.locator(".status-success a").getAttribute("href");
  expect(invitationLink).toMatch(/^http:\/\/127\.0\.0\.1:3000\/invite\?token=/);
  await page.getByRole("button", { name: "Sign out" }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(invitationLink!);
  await expect(page.getByRole("button", { name: "Create and activate account" })).toBeVisible();
  await expect(page.getByText("The invitation determines the school and access.", { exact: false })).toBeVisible();

  const invitedPassword = `Loop-invited-${Date.now()}!`;
  await page.getByLabel("Create password").fill(invitedPassword);
  await page.getByRole("button", { name: "Create and activate account" }).click();
  await expect(page).toHaveURL(/\/teacher/);
  await expect(page.getByText(/no active classroom is assigned/i)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/sign-in/);
  await page.goto(invitationLink!);
  await expect(page.getByText("invalid, expired, or already used")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create and activate account" })).toHaveCount(0);
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
