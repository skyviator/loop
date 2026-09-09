import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";

type Account = { role: string; email: string; password: string };
type Credentials = {
  environment: string;
  projectRef: string;
  siteUrl: string;
  fixtures: { children: string[]; sunbeams: string };
  accounts: Account[];
};

const approved = {
  projectRef: "ouotuegvwcgtrcgzdqiu",
  siteUrl: "https://loop-staging-pi.vercel.app",
  r2Bucket: "loop-media-staging",
};
const credentialsPath = resolve(process.cwd(), "supabase/.temp/staging-test-credentials.json");
const resultPath = resolve(process.cwd(), "supabase/.temp/staging-verification-result.json");
const credentials = JSON.parse(readFileSync(credentialsPath, "utf8")) as Credentials;

if (
  process.env.LOOP_ENV !== "staging"
  || process.env.PLAYWRIGHT_BASE_URL !== approved.siteUrl
  || process.env.R2_BUCKET_NAME !== approved.r2Bucket
  || credentials.environment !== "staging"
  || credentials.projectRef !== approved.projectRef
  || credentials.siteUrl !== approved.siteUrl
) {
  throw new Error("Staging browser verification refused: approved target guards are incomplete or mismatched.");
}

function account(role: string) {
  const value = credentials.accounts.find((item) => item.role === role);
  if (!value) throw new Error(`Missing staging ${role} credentials.`);
  return value;
}

async function signIn(page: Page, role: string) {
  const current = account(role);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(current.email);
  await page.getByLabel("Password").fill(current.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
}

async function signedIn(browser: Browser, role: string, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await signIn(page, role);
  return { context, page };
}

async function generatedJpeg(page: Page) {
  return Buffer.from(await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#2F6F68";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = "#F7F6F2";
    context.fillRect(12, 12, 40, 24);
    const blob = await new Promise<Blob>((resolveBlob, reject) => canvas.toBlob((value) => value ? resolveBlob(value) : reject(new Error("JPEG generation failed")), "image/jpeg", 0.88));
    return [...new Uint8Array(await blob.arrayBuffer())];
  }));
}

test.describe.serial("Loop staging HTTPS verification", () => {
  test("manifest, service worker, installability prerequisites, and private cache boundary", async ({ page, request }) => {
    test.setTimeout(90_000);
    await page.addInitScript(() => {
      Object.defineProperty(window, "__loopNotificationPermissionRequests", { configurable: true, value: 0, writable: true });
      if ("Notification" in window) {
        Object.defineProperty(Notification, "requestPermission", {
          configurable: true,
          value: async () => {
            (window as unknown as Window & { __loopNotificationPermissionRequests: number }).__loopNotificationPermissionRequests += 1;
            return "default";
          },
        });
      }
    });
    await page.goto("/sign-in");
    await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
    const manifestResponse = await request.get("/manifest.webmanifest");
    expect(manifestResponse.ok()).toBe(true);
    const manifest = await manifestResponse.json() as { display?: string; icons?: { src: string }[]; name?: string };
    expect(manifest.name).toContain("Loop");
    expect(manifest.display).toBe("standalone");
    expect(manifest.icons?.length).toBeGreaterThanOrEqual(2);
    for (const icon of manifest.icons ?? []) expect((await request.get(icon.src)).ok()).toBe(true);
    const workerResponse = await request.get("/sw.js");
    expect(workerResponse.ok()).toBe(true);
    expect(workerResponse.headers()["cache-control"]).toContain("no-store");
    const worker = await workerResponse.text();
    expect(worker).not.toMatch(/addEventListener\(\s*["']fetch["']/);
    expect(worker).not.toMatch(/caches\.(open|match|put|add|addAll)/);
    const registration = await page.evaluate(async () => {
      const ready = await navigator.serviceWorker.ready;
      return { active: Boolean(ready.active), updateViaCache: ready.updateViaCache, caches: await caches.keys() };
    });
    expect(registration).toEqual({ active: true, updateViaCache: "none", caches: [] });
    expect(await page.evaluate(() => (window as unknown as Window & { __loopNotificationPermissionRequests: number }).__loopNotificationPermissionRequests)).toBe(0);
  });

  test("public VAPID reaches the browser without persisting a test subscription or server secrets", async ({ browser }) => {
    test.setTimeout(90_000);
    const publicVapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const secretScanValue = process.env.STAGING_SECRET_SCAN_VALUE;
    if (!publicVapid || !secretScanValue?.startsWith("sb_secret_")) throw new Error("Push readiness scan values are unavailable.");
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, permissions: ["notifications"] });
    await context.addInitScript(() => {
      Object.defineProperty(window, "__loopNotificationPermissionRequests", { configurable: true, value: 0, writable: true });
      Object.defineProperty(Notification, "requestPermission", {
        configurable: true,
        value: async () => {
          (window as unknown as Window & { __loopNotificationPermissionRequests: number }).__loopNotificationPermissionRequests += 1;
          return "granted";
        },
      });
      Object.defineProperty(PushManager.prototype, "getSubscription", { configurable: true, value: async () => null });
      Object.defineProperty(PushManager.prototype, "subscribe", {
        configurable: true,
        value: async (options: PushSubscriptionOptionsInit) => {
          const key = options.applicationServerKey;
          if (!key || typeof key === "string") throw new Error("Expected binary VAPID application server key.");
          const bytes = key instanceof ArrayBuffer ? new Uint8Array(key) : new Uint8Array(key!.buffer, key!.byteOffset, key!.byteLength);
          Object.defineProperty(window, "__loopVapidBytes", { configurable: true, value: [...bytes] });
          return {
            endpoint: "https://push.example.invalid/intercepted-staging-test",
            toJSON: () => ({ endpoint: "https://push.example.invalid/intercepted-staging-test", keys: { p256dh: "intercepted-test-key", auth: "intercepted-test-auth" } }),
            unsubscribe: async () => true,
          };
        },
      });
    });
    const page = await context.newPage();
    await page.route("**/api/push/subscriptions", async (route) => route.fulfill({ status: 200, contentType: "application/json", body: "{\"ok\":true}" }));
    try {
      await signIn(page, "guardian");
      await page.goto("/settings");
      await expect(page.getByRole("heading", { name: "Push notifications" })).toBeVisible();
      await expect(page.getByLabel("New private photos")).not.toBeChecked();
      expect(await page.evaluate(() => (window as unknown as Window & { __loopNotificationPermissionRequests: number }).__loopNotificationPermissionRequests)).toBe(0);
      await page.getByRole("button", { name: "Enable on this device" }).click();
      await expect(page.getByText("Notifications are enabled on this device.")).toBeVisible();
      const captured = await page.evaluate(() => (window as unknown as Window & { __loopVapidBytes: number[] }).__loopVapidBytes);
      const expected = [...Buffer.from(publicVapid.replace(/-/g, "+").replace(/_/g, "/"), "base64")];
      expect(captured).toEqual(expected);
      const sources = await page.locator("script[src]").evaluateAll((scripts) => scripts.map((script) => (script as HTMLScriptElement).src));
      const loaded = [await page.content()];
      for (const source of sources) {
        const response = await context.request.get(source);
        if (response.ok()) loaded.push(await response.text());
      }
      const clientText = loaded.join("\n");
      for (const name of ["SUPABASE_SECRET_KEY", "SUPABASE_SERVICE_ROLE_KEY", "VAPID_PRIVATE_KEY", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]) expect(clientText).not.toContain(name);
      expect(clientText).not.toContain(secretScanValue);
      expect(await page.evaluate(() => caches.keys())).toEqual([]);
    } finally {
      await context.close();
    }
  });

  test("all roles route server-side and core tenant access remains scoped", async ({ browser }) => {
    test.setTimeout(180_000);
    const contexts: BrowserContext[] = [];
    try {
      const platform = await signedIn(browser, "super_admin", { width: 1440, height: 900 });
      contexts.push(platform.context);
      await expect(platform.page).toHaveURL(/\/platform/);
      await expect(platform.page.getByRole("heading", { name: "Loop Demo Nursery — TEST" })).toBeVisible();
      await expect(platform.page.getByText("Platform setup excludes child, attendance, and care data by design.")).toBeVisible();
      await expect(platform.page.getByText("Child One", { exact: true })).toHaveCount(0);
      await platform.page.goto("/messages");
      await expect(platform.page).toHaveURL(/\/platform/);

      const schoolAdmin = await signedIn(browser, "school_admin", { width: 1440, height: 900 });
      contexts.push(schoolAdmin.context);
      await expect(schoolAdmin.page).toHaveURL(/\/school/);
      await expect(schoolAdmin.page.getByText("Loop Demo Nursery — TEST").first()).toBeVisible();
      await expect(schoolAdmin.page.locator("details.management-row > summary strong").filter({ hasText: "Main Branch — TEST" })).toBeVisible();
      await expect(schoolAdmin.page.getByLabel("Butterflies classroom name")).toHaveValue("Butterflies");
      await expect(schoolAdmin.page.getByLabel("Sunbeams classroom name")).toHaveValue("Sunbeams");
      await expect(schoolAdmin.page.getByRole("heading", { name: "Timetable" })).toBeVisible();
      await expect(schoolAdmin.page.getByRole("button", { name: "Save school settings" })).toBeVisible();
      await schoolAdmin.page.goto("/platform");
      await expect(schoolAdmin.page).toHaveURL(/\/school/);

      const teacher = await signedIn(browser, "teacher");
      contexts.push(teacher.context);
      await expect(teacher.page).toHaveURL(/\/teacher/);
      await expect(teacher.page.getByRole("heading", { name: "Butterflies" })).toBeVisible();
      await expect(teacher.page.getByText("Child One", { exact: true }).first()).toBeVisible();
      await expect(teacher.page.getByText("Child Two", { exact: true }).first()).toBeVisible();
      await expect(teacher.page.getByText("Child Three", { exact: true })).toHaveCount(0);
      await teacher.page.goto(`/teacher?classroom=${credentials.fixtures.sunbeams}`);
      await expect(teacher.page.getByRole("heading", { name: "Butterflies" })).toBeVisible();
      await expect(teacher.page.getByText("Child Three", { exact: true })).toHaveCount(0);
      const arrival = teacher.page.locator(".bulk-arrivals label").filter({ hasText: "Child One" });
      await arrival.locator("input").check();
      const checkIn = teacher.page.waitForResponse((response) => new URL(response.url()).pathname === "/teacher" && response.request().method() === "POST");
      await teacher.page.getByRole("button", { name: "Check in selected" }).click();
      expect((await checkIn).ok()).toBe(true);
      await teacher.page.reload();
      await expect(teacher.page.getByText("2 / 2", { exact: true })).toBeVisible();
      const carePanel = teacher.page.getByRole("tabpanel");
      await carePanel.getByRole("button", { name: "Save meal update" }).click();
      await expect(carePanel.getByRole("status")).toHaveText("2 care updates saved.");
      await teacher.page.goto("/school");
      await expect(teacher.page).toHaveURL(/\/teacher/);

      const guardian = await signedIn(browser, "guardian");
      contexts.push(guardian.context);
      await expect(guardian.page).toHaveURL(/\/parent/);
      await expect(guardian.page.getByRole("heading", { name: "Child One" })).toBeVisible();
      await guardian.page.reload();
      await expect(guardian.page.locator("#timeline")).toBeVisible();
      await expect(guardian.page.getByText("Arrived", { exact: true })).toBeVisible();
      await expect(guardian.page.getByText("Meal", { exact: true }).first()).toBeVisible();
      await guardian.page.goto(`/parent?child=${credentials.fixtures.children[2]}`);
      await expect(guardian.page.getByRole("heading", { name: "Child One" })).toBeVisible();
      await expect(guardian.page.getByText("Child Three", { exact: true })).toHaveCount(0);
      await guardian.page.goto("/teacher");
      await expect(guardian.page).toHaveURL(/\/parent/);
    } finally {
      await Promise.all(contexts.map((context) => context.close()));
    }
  });

  test("messaging, announcement, calendar, and private R2 media work through staging", async ({ browser, request }) => {
    test.setTimeout(240_000);
    const contexts: BrowserContext[] = [];
    let assetId = "";
    try {
      const guardian = await signedIn(browser, "guardian");
      const teacher = await signedIn(browser, "teacher");
      const platform = await signedIn(browser, "super_admin", { width: 1440, height: 900 });
      contexts.push(guardian.context, teacher.context, platform.context);

      await guardian.page.goto("/updates");
      await expect(guardian.page.getByText("Important staging announcement — TEST", { exact: true })).toBeVisible();
      await expect(guardian.page.getByText("Staging calendar event — TEST", { exact: true })).toBeVisible();
      await teacher.page.goto("/updates");
      await expect(teacher.page.getByText("Important staging announcement — TEST", { exact: true })).toBeVisible();
      await expect(teacher.page.getByText("Staging calendar event — TEST", { exact: true })).toBeVisible();

      await guardian.page.goto("/messages");
      await teacher.page.goto("/messages");
      const guardianMessage = `Guardian staging message TEST ${Date.now()}`;
      await guardian.page.getByLabel("Message").fill(guardianMessage);
      await guardian.page.getByRole("button", { name: "Send message" }).click();
      await expect(guardian.page.getByRole("status")).toHaveText("Message sent.");
      await teacher.page.reload();
      await expect(teacher.page.getByText(guardianMessage, { exact: true })).toBeVisible();
      const teacherReply = `Teacher staging reply TEST ${Date.now()}`;
      await teacher.page.getByLabel("Message").fill(teacherReply);
      await teacher.page.getByRole("button", { name: "Send message" }).click();
      await expect(teacher.page.getByRole("status")).toHaveText("Message sent.");
      await guardian.page.reload();
      await expect(guardian.page.getByText(teacherReply, { exact: true })).toBeVisible();
      await platform.page.goto("/messages");
      await expect(platform.page).toHaveURL(/\/platform/);

      await teacher.page.goto("/teacher");
      const upload = teacher.page.locator("form.media-upload");
      await upload.locator('input[type="file"]').setInputFiles({ name: "generated-staging-test.jpg", mimeType: "image/jpeg", buffer: await generatedJpeg(teacher.page) });
      await upload.locator("label.check-field").filter({ hasText: "Child One" }).locator("input").check();
      await upload.getByLabel("Optional caption").fill("Generated staging media — TEST");
      const reservation = teacher.page.waitForResponse((response) => /\/api\/media\/reservations$/.test(response.url()) && response.request().method() === "POST");
      const finalization = teacher.page.waitForResponse((response) => /\/api\/media\/reservations\/[^/]+\/finalize$/.test(response.url()) && response.request().method() === "POST");
      await upload.getByRole("button", { name: "Share photos" }).click();
      const reservationBody = await (await reservation).json() as { assetId: string };
      assetId = reservationBody.assetId;
      expect((await finalization).ok()).toBe(true);
      await expect(upload.getByText("Shared privately")).toBeVisible();

      const signed = await teacher.page.evaluate(async (id) => {
        const response = await fetch(`/api/media/${id}/url?variant=display`, { cache: "no-store" });
        return { status: response.status, body: await response.json() as { url?: string } };
      }, assetId);
      expect(signed.status).toBe(200);
      expect(signed.body.url).toBeTruthy();
      const privateObject = await request.get(signed.body.url!);
      expect(privateObject.ok()).toBe(true);
      const unsigned = new URL(signed.body.url!);
      unsigned.search = "";
      expect([401, 403]).toContain((await request.get(unsigned.toString())).status());

      await guardian.page.goto("/parent");
      await expect(guardian.page.getByRole("heading", { name: "Photos today" })).toBeVisible();
      await expect(guardian.page.getByLabel("Open photo: Generated staging media — TEST")).toBeVisible();
      await guardian.page.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".today-photos img")].every((image) => image.complete && image.naturalWidth > 0));
      expect(await platform.page.evaluate(async (id) => (await fetch(`/api/media/${id}/url?variant=display`)).status, assetId)).toBe(404);

      await teacher.page.goto("/teacher");
      const childRow = teacher.page.locator(".attendance-row").filter({ hasText: "Child One" });
      const checkOut = teacher.page.waitForResponse((response) => new URL(response.url()).pathname === "/teacher" && response.request().method() === "POST");
      await childRow.getByRole("button", { name: "Check out" }).click();
      expect((await checkOut).ok()).toBe(true);
      await teacher.page.reload();
      await expect(teacher.page.locator(".attendance-row").filter({ hasText: "Child One" })).toContainText("Checked out");

      const cacheNames = await Promise.all([guardian.page, teacher.page, platform.page].map((current) => current.evaluate(() => caches.keys())));
      expect(cacheNames).toEqual([[], [], []]);
    } finally {
      if (assetId) writeFileSync(resultPath, `${JSON.stringify({ assetId }, null, 2)}\n`, { mode: 0o600 });
      await Promise.all(contexts.map((context) => context.close()));
    }
  });
});
