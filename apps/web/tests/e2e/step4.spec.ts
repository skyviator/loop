import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { DeleteObjectCommand, HeadObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser, type Page } from "@playwright/test";

type Account = { role: string; email: string; password: string };
const credentials = JSON.parse(readFileSync(resolve(process.cwd(), "supabase/.temp/test-credentials.json"), "utf8")) as { accounts: Account[] };

function environment(path: string) {
  return Object.fromEntries(readFileSync(path, "utf8").split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    return match ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]] : [];
  }));
}

const local = environment(resolve(process.cwd(), "apps/web/.env.local"));
const admin = createClient(local.NEXT_PUBLIC_SUPABASE_URL, local.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const r2Endpoint = new URL(local.R2_ENDPOINT).origin;
const r2 = new S3Client({ endpoint: r2Endpoint, region: local.R2_REGION, credentials: { accessKeyId: local.R2_ACCESS_KEY_ID, secretAccessKey: local.R2_SECRET_ACCESS_KEY } });

async function signIn(page: Page, role: string) {
  const account = credentials.accounts.find((item) => item.role === role);
  if (!account) throw new Error(`Missing local ${role} credentials.`);
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForLoadState("networkidle");
}

async function signedInPage(browser: Browser, role: string, viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await signIn(page, role);
  return { context, page };
}

async function generatedJpeg(page: Page, withExif: boolean) {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 960;
    canvas.height = 720;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#E7F1EE";
    context.fillRect(0, 0, 960, 720);
    context.fillStyle = "#2F6F68";
    context.fillRect(100, 100, 760, 520);
    return canvas.toDataURL("image/jpeg", 0.92).split(",")[1];
  });
  const jpeg = Buffer.from(base64, "base64");
  if (!withExif) return jpeg;
  const app1 = Buffer.from([0xff, 0xe1, 0, 16, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4d, 0x4d, 0, 0x2a, 0, 0, 0, 8]);
  return Buffer.concat([jpeg.subarray(0, 2), app1, jpeg.subarray(2)]);
}

function hasExif(bytes: Buffer) {
  return bytes.includes(Buffer.from([0x45, 0x78, 0x69, 0x66, 0, 0]));
}

test("Step 4 private media and communication flows", async ({ browser }) => {
  test.setTimeout(360_000);
  const assetIds: string[] = [];
  const contexts: Array<{ close(): Promise<void> }> = [];
  try {
    const schoolAdmin = await signedInPage(browser, "school_admin", { width: 1440, height: 900 });
    contexts.push(schoolAdmin.context);
    const adminPage = schoolAdmin.page;
    await expect(adminPage.getByRole("heading", { name: "Media consent" })).toBeVisible();
    await expect(adminPage.getByLabel("Short video")).toBeDisabled();
    const unrecordedConsent = adminPage.locator(".consent-row").filter({ has: adminPage.getByText("Amaya Herath", { exact: true }) });
    await unrecordedConsent.locator("select").selectOption("granted");
    await unrecordedConsent.getByRole("button", { name: "Save consent" }).click();
    await expect(adminPage.locator(".consent-row").filter({ has: adminPage.getByText("Amaya Herath", { exact: true }) }).locator("select")).toHaveValue("granted");
    const permissions = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Save communication permissions" }) });
    await permissions.getByLabel("Teachers may publish to assigned classrooms").check();
    await permissions.getByLabel("Teachers may manage assigned classroom events").check();
    await permissions.getByRole("button", { name: "Save communication permissions" }).click();
    await adminPage.goto("/updates");
    const announcementTitle = `Browser family note ${Date.now()}`;
    await adminPage.getByText("Create announcement", { exact: true }).click();
    const announcementForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Publish", exact: true }) }).last();
    await announcementForm.getByLabel("Audience").selectOption("classroom");
    await announcementForm.getByLabel("Classroom when selected").selectOption({ label: "Sunbirds" });
    await announcementForm.getByLabel("Title").fill(announcementTitle);
    await announcementForm.getByLabel("Announcement").fill("A fictional browser-check announcement for the Sunbirds classroom.");
    await announcementForm.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(adminPage.getByText(announcementTitle, { exact: true })).toBeVisible();
    const eventTitle = `Browser picnic ${Date.now()}`;
    await adminPage.getByText("Add calendar event", { exact: true }).click();
    const eventForm = adminPage.locator("form").filter({ has: adminPage.getByRole("button", { name: "Add event", exact: true }) }).last();
    const start = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 16);
    const end = new Date(Date.now() + 7 * 86_400_000 + 3_600_000).toISOString().slice(0, 16);
    await eventForm.getByLabel("Audience").selectOption("school");
    await eventForm.getByLabel("Title").fill(eventTitle);
    await eventForm.getByLabel(/Starts/).fill(start);
    await eventForm.getByLabel(/Ends/).fill(end);
    await eventForm.getByRole("button", { name: "Add event", exact: true }).click();
    await expect(adminPage.getByText(eventTitle, { exact: true })).toBeVisible();
    await adminPage.locator("details[open]").evaluateAll((details) => details.forEach((detail) => detail.removeAttribute("open")));
    await adminPage.screenshot({ path: "docs/design/final/step4-school-admin-desktop.png", fullPage: true });

    const teacher = await signedInPage(browser, "teacher");
    contexts.push(teacher.context);
    const teacherPage = teacher.page;
    const uploadPanel = teacherPage.locator("form.media-upload");
    await expect(uploadPanel).toBeVisible();
    await uploadPanel.locator('input[type="file"]').setInputFiles({ name: "generated-exif.jpg", mimeType: "image/jpeg", buffer: await generatedJpeg(teacherPage, true) });
    await uploadPanel.locator("label.check-field").filter({ hasText: "Maya Senaratne" }).locator("input").check();
    await uploadPanel.getByLabel("Optional caption").fill("Generated browser QA photo");
    const firstReservation = teacherPage.waitForResponse((response) => /\/api\/media\/reservations$/.test(response.url()) && response.request().method() === "POST");
    const firstFinalize = teacherPage.waitForResponse((response) => /\/api\/media\/reservations\/[^/]+\/finalize$/.test(response.url()) && response.request().method() === "POST");
    await uploadPanel.getByRole("button", { name: "Share photos" }).click();
    const firstAsset = (await (await firstReservation).json() as { assetId: string }).assetId;
    assetIds.push(firstAsset);
    const firstFinalizeResponse = await firstFinalize;
    expect(firstFinalizeResponse.ok()).toBe(true);
    await expect(uploadPanel.getByText("Shared privately")).toBeVisible();

    const signedOriginal = await teacherPage.evaluate(async (assetId) => {
      const response = await fetch(`/api/media/${assetId}/url?variant=original`, { cache: "no-store" });
      return { status: response.status, body: await response.json() as { url?: string } };
    }, firstAsset);
    expect(signedOriginal.status).toBe(200);
    const original = await teacherPage.context().request.get(signedOriginal.body.url!);
    expect(original.ok()).toBe(true);
    const originalBytes = Buffer.from(await original.body());
    expect(hasExif(originalBytes)).toBe(false);

    await uploadPanel.locator('input[type="file"]').setInputFiles({ name: "generated-multi.jpg", mimeType: "image/jpeg", buffer: await generatedJpeg(teacherPage, false) });
    await uploadPanel.locator("label.check-field").filter({ hasText: "Maya Senaratne" }).locator("input").check();
    await uploadPanel.locator("label.check-field").filter({ hasText: "Aarav Perera" }).locator("input").check();
    const secondReservation = teacherPage.waitForResponse((response) => /\/api\/media\/reservations$/.test(response.url()) && response.request().method() === "POST");
    const secondFinalize = teacherPage.waitForResponse((response) => /\/api\/media\/reservations\/[^/]+\/finalize$/.test(response.url()) && response.request().method() === "POST");
    await uploadPanel.getByRole("button", { name: "Share photos" }).click();
    assetIds.push((await (await secondReservation).json() as { assetId: string }).assetId);
    const secondFinalizeResponse = await secondFinalize;
    expect(secondFinalizeResponse.ok()).toBe(true);

    await uploadPanel.locator('input[type="file"]').setInputFiles({ name: "unsafe.heic", mimeType: "image/heic", buffer: Buffer.from("not-a-photo") });
    await uploadPanel.locator("label.check-field").filter({ hasText: "Maya Senaratne" }).locator("input").check();
    await uploadPanel.getByRole("button", { name: "Share photos" }).click();
    await expect(uploadPanel.getByText(/not a supported JPEG, PNG, or WebP photo/)).toBeVisible();

    const fixture = await admin.from("child_media_consents").select("child_id, children!inner(preferred_name), school_id").eq("state", "denied").limit(1).single();
    if (fixture.error) throw fixture.error;
    const classroom = await admin.from("classrooms").select("id").eq("name", "Sunbirds").single();
    if (classroom.error) throw classroom.error;
    const denied = await teacherPage.evaluate(async ({ classroomId, childId }) => {
      const response = await fetch("/api/media/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classroomId, childIds: [childId], variants: ["original", "display", "thumbnail"].map((kind) => ({ kind, contentType: "image/jpeg", byteSize: 4, width: 1, height: 1 })) }) });
      return { status: response.status, body: await response.json() as Record<string, unknown> };
    }, { classroomId: classroom.data.id, childId: fixture.data.child_id });
    expect(denied.status).toBe(403);
    expect(denied.body).not.toHaveProperty("uploads");

    const taggedChild = await admin.from("media_asset_children").select("child_id").eq("asset_id", firstAsset).limit(1).single();
    if (taggedChild.error) throw taggedChild.error;
    const teacherAccount = credentials.accounts.find((item) => item.role === "teacher")!;
    const users = await admin.auth.admin.listUsers();
    if (users.error) throw users.error;
    const teacherUser = users.data.users.find((user) => user.email === teacherAccount.email);
    if (!teacherUser) throw new Error("Fictional teacher account is missing.");
    const teacherMembership = await admin.from("school_memberships").select("id").eq("user_id", teacherUser.id).single();
    if (teacherMembership.error) throw teacherMembership.error;
    const assignmentOff = await admin.from("classroom_staff_assignments").update({ status: "inactive" }).eq("membership_id", teacherMembership.data.id).eq("classroom_id", classroom.data.id);
    if (assignmentOff.error) throw assignmentOff.error;
    const unassigned = await teacherPage.evaluate(async ({ classroomId, childId }) => (await fetch("/api/media/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classroomId, childIds: [childId], variants: ["original", "display", "thumbnail"].map((kind) => ({ kind, contentType: "image/jpeg", byteSize: 4, width: 1, height: 1 })) }) })).status, { classroomId: classroom.data.id, childId: taggedChild.data.child_id });
    expect(unassigned).toBe(403);
    const assignmentOn = await admin.from("classroom_staff_assignments").update({ status: "active" }).eq("membership_id", teacherMembership.data.id).eq("classroom_id", classroom.data.id);
    if (assignmentOn.error) throw assignmentOn.error;
    const school = await admin.from("schools").select("id").eq("name", "Little Harbour Preschool").single();
    if (school.error) throw school.error;
    const photosOff = await admin.from("school_feature_settings").update({ is_enabled: false }).eq("school_id", school.data.id).eq("feature_key", "photos");
    if (photosOff.error) throw photosOff.error;
    const featureDisabled = await teacherPage.evaluate(async ({ classroomId, childId }) => (await fetch("/api/media/reservations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ classroomId, childIds: [childId], variants: ["original", "display", "thumbnail"].map((kind) => ({ kind, contentType: "image/jpeg", byteSize: 4, width: 1, height: 1 })) }) })).status, { classroomId: classroom.data.id, childId: taggedChild.data.child_id });
    expect(featureDisabled).toBe(403);
    const photosOn = await admin.from("school_feature_settings").update({ is_enabled: true }).eq("school_id", school.data.id).eq("feature_key", "photos");
    if (photosOn.error) throw photosOn.error;

    await teacherPage.goto("/updates");
    await expect(teacherPage.getByText(announcementTitle, { exact: true })).toBeVisible();
    await expect(teacherPage.getByText(eventTitle, { exact: true })).toBeVisible();
    await teacherPage.goto("/teacher");
    await teacherPage.locator(".recent-photos").scrollIntoViewIfNeeded();
    await expect(teacherPage.locator(".recent-photos img")).toHaveCount(2);
    await teacherPage.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".recent-photos img")].every((image) => image.complete && image.naturalWidth > 0), undefined, { timeout: 15_000 });
    await teacherPage.screenshot({ path: "docs/design/final/step4-teacher-media-mobile.png", fullPage: true });

    const guardian = await signedInPage(browser, "guardian");
    contexts.push(guardian.context);
    const guardianPage = guardian.page;
    await expect(guardianPage.getByRole("heading", { name: "Photos today" })).toBeVisible();
    await expect(guardianPage.getByLabel("Open photo: Generated browser QA photo").first()).toBeVisible();
    const link = await admin.from("media_asset_children").select("child_id").eq("asset_id", firstAsset).single();
    if (link.error) throw link.error;
    const disabledLink = await admin.from("child_guardians").update({ status: "inactive" }).eq("guardian_membership_id", (await admin.from("message_threads").select("guardian_membership_id").limit(1).single()).data!.guardian_membership_id).eq("child_id", link.data.child_id);
    if (disabledLink.error) throw disabledLink.error;
    const deniedGet = await guardianPage.evaluate(async (assetId) => (await fetch(`/api/media/${assetId}/url?variant=display`, { cache: "no-store" })).status, firstAsset);
    expect(deniedGet).toBe(404);
    const restoredLink = await admin.from("child_guardians").update({ status: "active" }).eq("child_id", link.data.child_id);
    if (restoredLink.error) throw restoredLink.error;
    await guardianPage.reload();
    await guardianPage.locator(".today-photos").scrollIntoViewIfNeeded();
    await expect(guardianPage.locator(".today-photos img")).toHaveCount(2);
    await guardianPage.waitForFunction(() => [...document.querySelectorAll<HTMLImageElement>(".today-photos img")].every((image) => image.complete && image.naturalWidth > 0), undefined, { timeout: 15_000 });
    await guardianPage.screenshot({ path: "docs/design/final/step4-parent-today-mobile.png", fullPage: true });
    await guardianPage.goto("/updates");
    await expect(guardianPage.getByText(announcementTitle, { exact: true })).toBeVisible();
    await expect(guardianPage.getByText(eventTitle, { exact: true })).toBeVisible();
    await expect(guardianPage.getByText("Create announcement", { exact: true })).toHaveCount(0);

    await teacherPage.goto("/messages");
    await guardianPage.goto("/messages");
    await expect(teacherPage.locator('[data-realtime-status="ready"]')).toBeVisible({ timeout: 15_000 });
    await expect(guardianPage.locator('[data-realtime-status="ready"]')).toBeVisible({ timeout: 15_000 });
    const teacherMessage = `Realtime teacher note ${Date.now()}`;
    await teacherPage.getByLabel("Message").fill(teacherMessage);
    await teacherPage.getByRole("button", { name: "Send message" }).click();
    await expect(guardianPage.getByText(teacherMessage, { exact: true })).toBeVisible({ timeout: 15_000 });
    const guardianMessage = `Realtime guardian reply ${Date.now()}`;
    await guardianPage.getByLabel("Message").fill(guardianMessage);
    await guardianPage.getByRole("button", { name: "Send message" }).click();
    await expect(teacherPage.getByText(guardianMessage, { exact: true })).toBeVisible({ timeout: 15_000 });

    await adminPage.goto("/updates");
    const createdAnnouncement = adminPage.locator("article.announcement").filter({ hasText: announcementTitle });
    await createdAnnouncement.getByText("Edit announcement", { exact: true }).click();
    await createdAnnouncement.getByRole("button", { name: "Archive" }).click();
    await expect(adminPage.locator("article.announcement").filter({ hasText: announcementTitle })).toContainText("archived");
    const createdEvent = adminPage.locator("article.calendar-row").filter({ hasText: eventTitle });
    await createdEvent.getByText("Edit event", { exact: true }).click();
    await createdEvent.getByLabel("Location").fill("Fictional garden");
    await createdEvent.getByRole("button", { name: "Save event" }).click();
    await expect(adminPage.locator("article.calendar-row").filter({ hasText: eventTitle })).toContainText("Fictional garden");

    const platform = await signedInPage(browser, "super_admin", { width: 1440, height: 900 });
    contexts.push(platform.context);
    expect(await platform.page.evaluate(async (assetId) => (await fetch(`/api/media/${assetId}/url?variant=display`)).status, firstAsset)).toBe(404);
    await platform.page.goto("/messages");
    await expect(platform.page).toHaveURL(/\/platform/);

    const variants = await admin.from("media_variants").select("object_key").in("asset_id", assetIds);
    if (variants.error) throw variants.error;
    expect(variants.data).toHaveLength(6);
    for (const { object_key } of variants.data) {
      expect(object_key).toMatch(/^(originals|display|thumbs)\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);
      expect(object_key).not.toMatch(/maya|aarav|@/i);
    }
  } finally {
    if (assetIds.length) {
      const variants = await admin.from("media_variants").select("object_key").in("asset_id", assetIds);
      for (const { object_key } of variants.data ?? []) {
        await r2.send(new DeleteObjectCommand({ Bucket: local.R2_BUCKET_NAME, Key: object_key }));
        await expect(r2.send(new HeadObjectCommand({ Bucket: local.R2_BUCKET_NAME, Key: object_key }))).rejects.toMatchObject({ $metadata: { httpStatusCode: 404 } });
      }
    }
    await Promise.all(contexts.map((context) => context.close()));
  }
});
