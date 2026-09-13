import "server-only";

import { waitUntil } from "@vercel/functions";
import { after } from "next/server";

async function dispatch() {
  const { dispatchPendingPush } = await import("@/lib/push/server");
  await dispatchPendingPush();
}

export function schedulePushDispatch() {
  after(dispatch);
}

export function waitUntilPushDispatch() {
  waitUntil(dispatch());
}
