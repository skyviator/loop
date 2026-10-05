import "server-only";

import { waitUntil } from "@vercel/functions";
import { after } from "next/server";

async function cleanup() {
  const { cleanupPendingMedia } = await import("@/lib/media/cleanup");
  await cleanupPendingMedia();
}

export function scheduleMediaCleanup() {
  after(cleanup);
}

export function waitUntilMediaCleanup() {
  waitUntil(cleanup());
}
