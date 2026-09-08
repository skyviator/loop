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

export type PushDispatchResult = { claimed: number; succeeded: number; temporaryFailures: number; permanentFailures: number };

function configureVapid() {
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey || (!subject.startsWith("mailto:") && !subject.startsWith("https://"))) return false;
  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

export async function dispatchPendingPush(batchSize = 25): Promise<PushDispatchResult> {
  const result: PushDispatchResult = { claimed: 0, succeeded: 0, temporaryFailures: 0, permanentFailures: 0 };
  if (!configureVapid()) return result;
  const admin = createServerAdminClient();
  const claimed = await admin.rpc("claim_push_deliveries", { batch_size: batchSize });
  if (claimed.error) return result;
  const deliveries = (claimed.data ?? []) as ClaimedDelivery[];
  result.claimed = deliveries.length;

  await Promise.all(deliveries.map(async (delivery) => {
    try {
      const response = await webpush.sendNotification({
        endpoint: delivery.endpoint,
        keys: { p256dh: delivery.p256dh, auth: delivery.auth_secret },
      }, JSON.stringify(notificationPayload({ deliveryId: delivery.delivery_id, eventType: delivery.event_type, title: delivery.title, body: delivery.body, route: delivery.route })), { TTL: 300, urgency: delivery.event_type === "important_announcement" ? "high" : "normal" });
      await admin.rpc("complete_push_delivery", { target_delivery_id: delivery.delivery_id, outcome: "success", response_status: response.statusCode });
      result.succeeded += 1;
    } catch (error) {
      const failure = classifyPushFailure(error);
      await admin.rpc("complete_push_delivery", {
        target_delivery_id: delivery.delivery_id,
        outcome: failure.outcome,
        response_status: failure.responseStatus,
      });
      if (failure.outcome === "permanent_failure") result.permanentFailures += 1;
      else result.temporaryFailures += 1;
    }
  }));
  return result;
}
