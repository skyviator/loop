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
if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(local.API_URL ?? "") || !local.SECRET_KEY?.startsWith("sb_secret_")) {
  throw new Error("Media lifecycle browser tests require guarded local Supabase.");
}
const admin = createClient(local.API_URL, local.SECRET_KEY, { auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } });

function account(role: string) {
  const current = credentials.accounts.find((candidate) => candidate.role === role);
  if (!current) throw new Error(`Missing local ${role} account.`);
  return current;
}

async function signIn(page: Page, current: Account) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(current.email);
  await page.getByLabel("Password").fill(current.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/school/);
}

test("School Admin sees a clear confirmation and one removal request for private media", async ({ page }) => {
  const schoolAdmin = account("school_admin");
  const users = await admin.auth.admin.listUsers();
  if (users.error) throw users.error;
  const user = users.data.users.find((candidate) => candidate.email === schoolAdmin.email);
  if (!user) throw new Error("Missing local School Admin user.");

  const membership = await admin.from("school_memberships").select("id, school_id").eq("user_id", user.id).eq("role", "school_admin").single();
  if (membership.error) throw membership.error;
  const classroom = await admin.from("classrooms").select("id").eq("school_id", membership.data.school_id).eq("status", "active").limit(1).single();
  if (classroom.error) throw classroom.error;

  const reservationId = randomUUID();
  const assetId = randomUUID();
  const variantId = randomUUID();
  const caption = `Local withdrawal test ${Date.now()}`;

  try {
    const reservation = await admin.from("media_upload_reservations").insert({
      id: reservationId,
      school_id: membership.data.school_id,
      classroom_id: classroom.data.id,
      uploader_membership_id: membership.data.id,
      uploader_user_id: user.id,
      status: "ready",
      reserved_bytes: 1,
      actual_bytes: 1,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
      finalized_at: new Date().toISOString(),
      quota_released_at: new Date().toISOString(),
    });
    if (reservation.error) throw reservation.error;
    const asset = await admin.from("media_assets").insert({
      id: assetId,
      reservation_id: reservationId,
      school_id: membership.data.school_id,
      classroom_id: classroom.data.id,
      uploader_membership_id: membership.data.id,
      uploader_user_id: user.id,
      status: "ready",
      caption,
      ready_at: new Date().toISOString(),
      total_bytes: 1,
    });
    if (asset.error) throw asset.error;
    const variant = await admin.from("media_variants").insert({
      id: variantId,
      school_id: membership.data.school_id,
      asset_id: assetId,
      kind: "thumbnail",
      object_key: `thumbs/${membership.data.school_id}/${assetId}/${variantId}.jpg`,
      content_type: "image/jpeg",
      byte_size: 1,
      width: 1,
      height: 1,
      status: "ready",
    });
    if (variant.error) throw variant.error;

    let deleteRequests = 0;
    await page.route(`**/api/media/${assetId}/url**`, async (route) => {
      if (route.request().method() === "DELETE") {
        deleteRequests += 1;
        await route.fulfill({ status: 200, contentType: "application/json", body: "{\"removed\":true}" });
        return;
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: "{\"url\":\"data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=\"}" });
    });
    page.on("dialog", async (dialog) => {
      expect(dialog.message()).toContain("disappear immediately");
      await dialog.accept();
    });

    await signIn(page, schoolAdmin);
    const photo = page.locator(".private-photo").filter({ hasText: caption });
    await expect(photo).toBeVisible();
    await photo.getByRole("button", { name: "Remove photo" }).click();
    await expect(photo).toBeHidden();
    expect(deleteRequests).toBe(1);
  } finally {
    await admin.from("media_assets").delete().eq("id", assetId);
    await admin.from("media_upload_reservations").delete().eq("id", reservationId);
  }
});
