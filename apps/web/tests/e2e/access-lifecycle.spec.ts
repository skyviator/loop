import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";

type Account = { role: string; email: string; password: string };

function environment(value: string) {
  return Object.fromEntries(value.split(/\r?\n/).flatMap((line) => {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    return match ? [[match[1], match[2].trim().replace(/^['"]|['"]$/g, "")]] : [];
  }));
}

const credentials = JSON.parse(
  readFileSync(resolve(process.cwd(), "supabase/.temp/test-credentials.json"), "utf8"),
) as { accounts: Account[] };
const status = process.platform === "win32"
  ? execFileSync("cmd.exe", ["/d", "/s", "/c", "pnpm exec supabase status --output env --network-id loop-local-network"], { cwd: process.cwd(), encoding: "utf8" })
  : execFileSync("pnpm", ["exec", "supabase", "status", "--output", "env", "--network-id", "loop-local-network"], { cwd: process.cwd(), encoding: "utf8" });
const local = environment(status);
if (local.API_URL !== "http://127.0.0.1:54321" || !local.SECRET_KEY?.startsWith("sb_secret_") || !local.PUBLISHABLE_KEY?.startsWith("sb_publishable_")) {
  throw new Error("Access-lifecycle tests require the guarded local Supabase environment.");
}

const admin = createClient(local.API_URL, local.SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

test("revoked guardian stale Realtime channel receives no sensitive message content", async ({ page }) => {
  test.setTimeout(90_000);
  const guardianAccount = credentials.accounts.find((account) => account.role === "guardian");
  if (!guardianAccount) throw new Error("Missing local guardian credentials.");

  const users = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (users.error) throw users.error;
  const guardianUser = users.data.users.find((user) => user.email === guardianAccount.email);
  if (!guardianUser) throw new Error("Local guardian identity was not found.");

  const membership = await admin.from("school_memberships")
    .select("id, school_id")
    .eq("user_id", guardianUser.id)
    .eq("role", "guardian")
    .eq("status", "active")
    .single();
  if (membership.error) throw membership.error;
  const thread = await admin.from("message_threads")
    .select("id, child_id")
    .eq("school_id", membership.data.school_id)
    .eq("guardian_membership_id", membership.data.id)
    .eq("status", "active")
    .single();
  if (thread.error) throw thread.error;
  const guardianLink = await admin.from("child_guardians")
    .select("id, child_id, children(preferred_name)")
    .eq("guardian_membership_id", membership.data.id)
    .eq("child_id", thread.data.child_id)
    .eq("status", "active")
    .single();
  if (guardianLink.error) throw guardianLink.error;
  const sender = await admin.from("school_memberships")
    .select("id, user_id")
    .eq("school_id", membership.data.school_id)
    .eq("role", "school_admin")
    .eq("status", "active")
    .limit(1)
    .single();
  if (sender.error) throw sender.error;

  const guardian = createClient(local.API_URL, local.PUBLISHABLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  const signedIn = await guardian.auth.signInWithPassword({ email: guardianAccount.email, password: guardianAccount.password });
  if (signedIn.error || !signedIn.data.session) throw signedIn.error ?? new Error("Guardian sign-in did not return a session.");

  const receivedFrames: string[] = [];
  page.on("websocket", (socket) => socket.on("framereceived", (event) => receivedFrames.push(String(event.payload))));
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(guardianAccount.email);
  await page.getByLabel("Password").fill(guardianAccount.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/parent/);
  await page.goto(`/messages?thread=${thread.data.id}`);
  await expect(page.locator('[data-realtime-status="ready"]')).toBeVisible({ timeout: 15_000 });

  const sensitiveBody = `revoked-sensitive-message-${Date.now()}`;
  try {
    const revoked = await admin.from("child_guardians").update({ status: "inactive" }).eq("id", guardianLink.data.id);
    if (revoked.error) throw revoked.error;

    const deniedChild = await guardian.from("children").select("id").eq("id", guardianLink.data.child_id);
    expect(deniedChild.error).toBeNull();
    expect(deniedChild.data).toEqual([]);
    const deniedBefore = await guardian.from("messages").select("id, body").eq("thread_id", thread.data.id);
    expect(deniedBefore.error).toBeNull();
    expect(deniedBefore.data).toEqual([]);

    const inserted = await admin.from("messages").insert({
      thread_id: thread.data.id,
      school_id: membership.data.school_id,
      sender_membership_id: sender.data.id,
      sender_user_id: sender.data.user_id,
      body: sensitiveBody,
    }).select("id").single();
    if (inserted.error) throw inserted.error;

    await page.waitForTimeout(2_000);
    await expect(page.getByText(sensitiveBody, { exact: true })).toHaveCount(0);
    expect(receivedFrames.every((frame) => !frame.includes(sensitiveBody))).toBe(true);
    expect(receivedFrames.every((frame) => !frame.includes(guardianLink.data.children?.[0]?.preferred_name ?? "never-match"))).toBe(true);

    const deniedAfter = await guardian.from("messages").select("id, body").eq("thread_id", thread.data.id);
    expect(deniedAfter.error).toBeNull();
    expect(deniedAfter.data).toEqual([]);

    await guardian.realtime.setAuth(signedIn.data.session.access_token);
    const reconnect = guardian.channel(`message-thread:${thread.data.id}`, { config: { private: true } });
    const reconnectStatus = await new Promise<string>((resolveStatus) => {
      const timeout = setTimeout(() => resolveStatus("TEST_TIMEOUT"), 15_000);
      reconnect.subscribe((channelStatus) => {
        if (channelStatus === "CHANNEL_ERROR" || channelStatus === "TIMED_OUT" || channelStatus === "SUBSCRIBED") {
          clearTimeout(timeout);
          resolveStatus(channelStatus);
        }
      });
    });
    expect(reconnectStatus).not.toBe("SUBSCRIBED");
    expect(reconnectStatus).not.toBe("TEST_TIMEOUT");
    await guardian.removeChannel(reconnect);
    await admin.from("messages").delete().eq("id", inserted.data.id);
  } finally {
    await admin.from("child_guardians").update({ status: "active" }).eq("id", guardianLink.data.id);
    await guardian.auth.signOut();
  }
});
