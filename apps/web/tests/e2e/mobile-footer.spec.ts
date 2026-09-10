import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test, type Page } from "@playwright/test";

type Account = { role: string; email: string; password: string };
type Credentials = { accounts: Account[] };

const credentialsFile = process.env.LOOP_ENV === "staging"
  ? "supabase/.temp/staging-test-credentials.json"
  : "supabase/.temp/test-credentials.json";
const credentials = JSON.parse(readFileSync(resolve(process.cwd(), credentialsFile), "utf8")) as Credentials;
const guardian = credentials.accounts.find((account) => account.role === "guardian");

if (!guardian) throw new Error("Missing guardian browser-test credentials.");

const mobileViewports = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
];

async function signIn(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(guardian!.email);
  await page.getByLabel("Password").fill(guardian!.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
}

for (const viewport of mobileViewports) {
  test(`equally distributes visible footer items at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await signIn(page);

    const nav = page.getByRole("navigation", { name: "Primary" });
    const itemCounts: Array<number | undefined> = [undefined, 3, 4, 5, 6];

    for (const itemCount of itemCounts) {
      if (itemCount) {
        await nav.evaluate((element, targetCount) => {
          element.querySelectorAll("[data-footer-test-clone]").forEach((item) => item.remove());
          const items = [...element.querySelectorAll<HTMLElement>(".nav-link")];
          const source = items[0];
          if (!source) throw new Error("Footer has no navigation items.");
          items.forEach((item, index) => { item.hidden = index >= targetCount; });
          for (let index = items.length; index < targetCount; index += 1) {
            const clone = source.cloneNode(true) as HTMLElement;
            clone.dataset.footerTestClone = "";
            element.append(clone);
          }
        }, itemCount);
      }

      const metrics = await nav.evaluate((element) => {
        const navBox = element.getBoundingClientRect();
        const items = [...element.querySelectorAll<HTMLElement>(".nav-link")]
          .filter((item) => item.getClientRects().length > 0)
          .map((item) => {
            const box = item.getBoundingClientRect();
            return { left: box.left, right: box.right, width: box.width, center: box.left + box.width / 2, height: box.height };
          });
        const centerDistances = items.slice(1).map((item, index) => item.center - items[index]!.center);
        const itemWidths = items.map((item) => item.width);

        return {
          itemCount: items.length,
          navWidth: navBox.width,
          itemWidths,
          centerDistances,
          firstGap: items[0]!.left - navBox.left,
          lastGap: navBox.right - items.at(-1)!.right,
          edgeCenterBalance: Math.abs(
            (items[0]!.center - navBox.left) - (navBox.right - items.at(-1)!.center),
          ),
          minimumItemHeight: Math.min(...items.map((item) => item.height)),
          navOverflow: element.scrollWidth - element.clientWidth,
          pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        };
      });

      if (itemCount) expect(metrics.itemCount).toBe(itemCount);
      else expect(metrics.itemCount).toBeGreaterThan(1);
      expect(metrics.navWidth).toBeGreaterThanOrEqual(viewport.width - 10);
      expect(Math.max(...metrics.itemWidths) - Math.min(...metrics.itemWidths)).toBeLessThanOrEqual(1);
      expect(Math.max(...metrics.centerDistances) - Math.min(...metrics.centerDistances)).toBeLessThanOrEqual(1);
      expect(metrics.firstGap).toBeLessThanOrEqual(1);
      expect(metrics.lastGap).toBeLessThanOrEqual(1);
      expect(metrics.edgeCenterBalance).toBeLessThanOrEqual(1);
      expect(metrics.minimumItemHeight).toBeGreaterThanOrEqual(48);
      expect(metrics.navOverflow).toBeLessThanOrEqual(1);
      expect(metrics.pageOverflow).toBeLessThanOrEqual(0);
    }
  });
}
