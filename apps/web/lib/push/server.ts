import "server-only";

import webpush from "web-push";

import { classifyPushFailure, notificationPayload } from "@/lib/push/policy";
import { createServerAdminClient } from "@/lib/supabase/admin";

type ClaimedDelivery = {
  delivery_id: string;
  endpoint: string;
  p256dh: string;
  auth_secret: string;
  title: string;
  body: string;
  route: string;
  event_type: string;
};

export const PUSH_DELIVERY_BATCH_SIZE = 25;
export const PUSH_NETWORK_TIMEOUT_MS = 15_000;

export type PushDispatchResult = { claimed: number; succeeded: number; temporaryFailures: number; permanentFailures: number };

function configureVapid() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey || (!subject.startsWith("mailto:") && !subject.startsWith("https://"))) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function dispatchPendingPush(batchSize = PUSH_DELIVERY_BATCH_SIZE): Promise<PushDispatchResult> {
  const result: PushDispatchResult = { claimed: 0, succeeded: 0, temporaryFailures: 0, permanentFailures: 0 };
  if (!configureVapid()) return result;
  const admin = createServerAdminClient();
  const claimed = await admin.rpc("claim_push_deliveries", { batch_size: batchSize });
  if (claimed.error) throw new Error("Push delivery claim failed");
  const deliveries = (claimed.data ?? []) as ClaimedDelivery[];
  result.claimed = deliveries.length;

  const attempts = await Promise.allSettled(deliveries.map(async (delivery) => {
    let outcome: "success" | "temporary_failure" | "permanent_failure" = "success";
    let responseStatus: number | undefined;

    try {
      const response = await webpush.sendNotification({
        endpoint: delivery.endpoint,
        keys: { p256dh: delivery.p256dh, auth: delivery.auth_secret },
      }, JSON.stringify(notificationPayload({ deliveryId: delivery.delivery_id, eventType: delivery.event_type, title: delivery.title, body: delivery.body, route: delivery.route })), {
        TTL: 300,
        urgency: delivery.event_type === "important_announcement" ? "high" : "normal",
        timeout: PUSH_NETWORK_TIMEOUT_MS,
      });
      responseStatus = response.statusCode;
    } catch (error) {
      const failure = classifyPushFailure(error);
      outcome = failure.outcome;
      responseStatus = failure.responseStatus;
    }

    const completion = await admin.rpc("complete_push_delivery", {
      target_delivery_id: delivery.delivery_id,
      outcome,
      response_status: responseStatus,
    });
    if (completion.error) throw new Error("Push delivery completion failed");

    if (outcome === "success") result.succeeded += 1;
    else if (outcome === "permanent_failure") result.permanentFailures += 1;
    else result.temporaryFailures += 1;
  }));

  if (attempts.some((attempt) => attempt.status === "rejected")) {
    throw new Error("One or more push delivery completions failed");
  }
  return result;
}
