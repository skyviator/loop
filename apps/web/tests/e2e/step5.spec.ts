import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Browser, type Page } from "@playwright/test";

type Account = { role: string; email: string; password: string };
const credentials = JSON.parse(readFileSync(resolve(process.cwd(), "supabase/.temp/test-credentials.json"), "utf8")) as { accounts: Account[] };

async function signIn(page: Page, role: string) {
  const account = credentials.accounts.find((item) => item.role === role);
  if (!account) throw new Error(`Missing local ${role} credentials.`);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
}

async function signedInPage(browser: Browser, role: string, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, permissions: ["notifications"] });
  const page = await context.newPage();
  await signIn(page, role);
  return { context, page };
}

test("Step 5 PWA settings, private device registration, and push trigger", async ({ browser }) => {
  test.setTimeout(180_000);
  const guardian = await signedInPage(browser, "guardian", { width: 390, height: 844 });
  const teacher = await signedInPage(browser, "teacher", { width: 1440, height: 900 });
  try {
    await guardian.page.goto("/settings");
    await expect(guardian.page.getByRole("heading", { name: "Keep Loop close" })).toBeVisible();
    await expect(guardian.page.getByRole("heading", { name: "Push notifications" })).toBeVisible();
    await expect(guardian.page.getByLabel("New private photos")).not.toBeChecked();
    expect(await guardian.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await guardian.page.setViewportSize({ width: 1440, height: 900 });
    await expect(guardian.page.getByRole("heading", { name: "Notification preferences" })).toBeVisible();
    expect(await guardian.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await guardian.page.setViewportSize({ width: 390, height: 844 });

    const registrationState = await guardian.page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      return { updateViaCache: registration.updateViaCache, cacheNames: await caches.keys(), controlled: Boolean(navigator.serviceWorker.controller) };
    });
    expect(registrationState.updateViaCache).toBe("none");
    expect(registrationState.cacheNames).toEqual([]);

    await guardian.page.evaluate(() => {
      let active = false;
      const subscription = {
        endpoint: `https://push.example/browser-qa-${crypto.randomUUID()}`,
        toJSON: () => ({ endpoint: "", keys: { p256dh: "browser-qa-public-encryption-key", auth: "browser-qa-auth-key" } }),
        unsubscribe: async () => { active = false; return true; },
      } as unknown as PushSubscription;
      Object.defineProperty(PushManager.prototype, "getSubscription", { configurable: true, value: async () => active ? subscription : null });
      Object.defineProperty(PushManager.prototype, "subscribe", { configurable: true, value: async () => { active = true; return subscription; } });
    });
    await guardian.page.getByRole("button", { name: "Enable on this device" }).click();
    await expect(guardian.page.getByText("Notifications are enabled on this device.")).toBeVisible({ timeout: 30_000 });
    await expect(guardian.page.getByText(/Permission: granted · Device: enabled/)).toBeVisible();

    await teacher.page.goto("/messages");
    await teacher.page.locator(".thread-row").first().click();
    await teacher.page.getByLabel("Message").fill(`Privacy-safe Step 5 delivery check ${Date.now()}`);
    await teacher.page.getByRole("button", { name: "Send message" }).click();
    await expect(teacher.page.getByRole("status")).toHaveText("Message sent.");

    await guardian.page.waitForTimeout(3000);
    await guardian.page.getByRole("button", { name: "Turn off on this device" }).click();
    await expect(guardian.page.getByText("Notifications are off on this device.")).toBeVisible();
  } finally {
    await guardian.context.close();
    await teacher.context.close();
  }
});

test("platform administration is excluded from school push settings", async ({ browser }) => {
  const platform = await signedInPage(browser, "super_admin", { width: 1440, height: 900 });
  try {
    await platform.page.goto("/settings");
    await expect(platform.page).toHaveURL(/\/platform/);
    await expect(platform.page.getByRole("heading", { name: "Push notifications" })).toHaveCount(0);
  } finally {
    await platform.context.close();
  }
});
