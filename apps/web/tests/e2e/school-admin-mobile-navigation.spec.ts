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
    "/school#classrooms",
    "/school#features",
    "/school#people",
    "/school#settings",
    "/school#timetable",
    "/school/more",
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
