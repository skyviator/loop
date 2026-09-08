import "server-only";

import { after } from "next/server";

export function schedulePushDispatch() {
  after(async () => {
    const { dispatchPendingPush } = await import("@/lib/push/server");
    await dispatchPendingPush();
  });
}
