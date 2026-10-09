import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

type Account = { role: string; email: string; password: string };
type Credentials = { accounts: Account[] };

const credentials = JSON.parse(
  readFileSync(resolve(process.cwd(), "supabase/.temp/test-credentials.json"), "utf8"),
) as Credentials;
const schoolAdmin = credentials.accounts.find((account) => account.role === "school_admin");

if (!schoolAdmin) throw new Error("Missing local School Admin browser-test credentials.");

const mobileViewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

const desktopDestinations = [
  "Overview",
  "People",
  "Classrooms",
  "Timetable",
  "Features",
  "Messages",
  "Updates",
  "School",
  "My settings",
];
const mobileDestinations = ["Overview", "People", "Messages", "Updates", "More"];
const moreDestinations = ["Classrooms", "Timetable", "Features", "School", "My settings"];

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(schoolAdmin!.email);
  await page.getByLabel("Password").fill(schoolAdmin!.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/school/);
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
}

for (const viewport of mobileViewports) {
  test(`School Admin footer fits and distributes destinations at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);

    const nav = page.getByRole("navigation", { name: "Primary" });
    const visibleItems = nav.locator(".nav-link:visible");
    await expect(visibleItems).toHaveCount(mobileDestinations.length);
    await expect(visibleItems).toHaveText(mobileDestinations);

    const metrics = await nav.evaluate((element) => {
      const navBox = element.getBoundingClientRect();
      const items = [...element.querySelectorAll<HTMLElement>(".nav-link")]
        .filter((item) => item.getClientRects().length > 0)
        .map((item) => {
          const box = item.getBoundingClientRect();
          return { width: box.width, height: box.height, center: box.left + box.width / 2 };
        });
      const centerDistances = items.slice(1).map((item, index) => item.center - items[index]!.center);

      return {
        navWidth: navBox.width,
        widths: items.map((item) => item.width),
        heights: items.map((item) => item.height),
        centerDistances,
        edgeBalance: Math.abs(
          (items[0]!.center - navBox.left) - (navBox.right - items.at(-1)!.center),
        ),
        navOverflow: element.scrollWidth - element.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });

    expect(metrics.navWidth).toBeGreaterThanOrEqual(viewport.width - 10);
    expect(Math.max(...metrics.widths) - Math.min(...metrics.widths)).toBeLessThanOrEqual(1);
    expect(Math.max(...metrics.centerDistances) - Math.min(...metrics.centerDistances)).toBeLessThanOrEqual(1);
    expect(Math.min(...metrics.widths)).toBeGreaterThanOrEqual(48);
    expect(Math.min(...metrics.heights)).toBeGreaterThanOrEqual(48);
    expect(metrics.edgeBalance).toBeLessThanOrEqual(1);
    expect(metrics.navOverflow).toBeLessThanOrEqual(0);
    expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
  });
}

test("More exposes every omitted School Admin destination with correct mobile active state", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);

  const primary = page.getByRole("navigation", { name: "Primary" });
  await primary.getByRole("link", { name: "More", exact: true }).click();
  await expect(page).toHaveURL(/\/school\/more$/);
  await expect(primary.getByRole("link", { name: "More", exact: true })).toHaveAttribute("aria-current", "page");

  const more = page.getByRole("navigation", { name: "More school administration" });
  await expect(more.locator("[data-more-destination]")).toHaveCount(moreDestinations.length);
  await expect(more.locator("[data-more-destination]")).toContainText(moreDestinations);

  const reachableHrefs = new Set([
    ...(await primary.locator(".nav-link:visible").evaluateAll((items) => items.map((item) => item.getAttribute("href")))),
    ...(await more.locator("[data-more-destination]").evaluateAll((items) => items.map((item) => item.getAttribute("href")))),
  ]);
  expect([...reachableHrefs].sort()).toEqual([
    "/messages",
    "/school",
    "/school/classrooms",
    "/school/features",
    "/school/more",
    "/school/people",
    "/school/settings",
    "/school/timetable",
    "/settings",
    "/updates",
  ]);

  for (const destination of moreDestinations) {
    await page.goto("/school/more");
    const destinationLink = page
      .getByRole("navigation", { name: "More school administration" })
      .getByRole("link", { name: new RegExp(`^${destination}`) });
    await destinationLink.click();
    await expect(page.getByRole("navigation", { name: "Primary" }).getByRole("link", { name: "More", exact: true }))
      .toHaveAttribute("aria-current", "page");
  }
});

test("desktop retains the original School Admin navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await signIn(page);

  const nav = page.getByRole("navigation", { name: "Primary" });
  const visibleItems = nav.locator(".nav-link:visible");
  await expect(visibleItems).toHaveCount(desktopDestinations.length);
  await expect(visibleItems).toHaveText(desktopDestinations);
  await expect(nav.getByRole("link", { name: "More", exact: true })).toBeHidden();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

test("focused admin routes, history navigation, and iPad layouts stay in sync", async ({ page }) => {
  test.setTimeout(60_000);
  const consoleIssues: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) consoleIssues.push(message.text());
  });
  await page.setViewportSize({ width: 1024, height: 768 });
  await signIn(page);
  const nav = page.getByRole("navigation", { name: "Primary" });

  await nav.getByRole("link", { name: "People", exact: true }).click();
  await expect(page).toHaveURL(/\/school\/people$/);
  await expect(page.getByRole("heading", { level: 1, name: "People" })).toBeVisible();
  await expect(page.locator("#people")).toBeVisible();
  await expect(page.locator("#classrooms")).toHaveCount(0);
  await expect(nav.getByRole("link", { name: "People", exact: true })).toHaveAttribute("aria-current", "page");

  await nav.getByRole("link", { name: "Timetable", exact: true }).click();
  await expect(page).toHaveURL(/\/school\/timetable$/);
  await expect(page.getByRole("heading", { level: 2, name: "Weekly activities" })).toBeVisible();
  await expect(page.locator("#people")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Staff invitations" })).toHaveCount(0);

  await page.goBack();
  await expect(page).toHaveURL(/\/school\/people$/);
  await expect(nav.getByRole("link", { name: "People", exact: true })).toHaveAttribute("aria-current", "page");
  await page.goForward();
  await expect(page).toHaveURL(/\/school\/timetable$/);
  await expect(nav.getByRole("link", { name: "Timetable", exact: true })).toHaveAttribute("aria-current", "page");

  for (const viewport of [{ width: 768, height: 1024 }, { width: 1024, height: 768 }]) {
    await page.setViewportSize(viewport);
    for (const route of ["/school/people", "/school/classrooms", "/school/timetable", "/messages"]) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), `${route} at ${viewport.width}x${viewport.height}`).toBeLessThanOrEqual(0);
      if (viewport.width === 768) await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", `loop-ipad-${route.replaceAll("/", "-").slice(1)}.png`), fullPage: false });
    }
    await page.screenshot({ path: resolve(process.env.TEMP ?? "/tmp", `loop-school-admin-ipad-${viewport.width}x${viewport.height}.png`), fullPage: false });
  }
  expect(consoleIssues.filter((message) => !message.includes("Live updates are unavailable") && !message.includes("caret-color:\"transparent\""))).toEqual([]);
});

test("School Admin app and notification settings use accurate save feedback", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await signIn(page);
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "My settings" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Add Loop to your Home Screen" })).toBeVisible();
  const save = page.locator(".preference-save-row button");
  await page.route("**/settings", async (route) => {
    if (route.request().method() === "POST") await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
    await route.continue();
  });
  const saveClick = save.click();
  await expect(save).toBeDisabled();
  await saveClick;
  await expect(page.getByRole("status").filter({ hasText: "Preferences saved" })).toBeVisible();
  await expect(save).toBeEnabled();
});
