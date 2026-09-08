export type PushFailure = { outcome: "temporary_failure" | "permanent_failure"; responseStatus?: number };

export function classifyPushFailure(error: unknown): PushFailure {
  const responseStatus = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
    ? error.statusCode
    : undefined;
  const permanent = responseStatus === 400 || responseStatus === 401 || responseStatus === 403 || responseStatus === 404 || responseStatus === 410;
  return { outcome: permanent ? "permanent_failure" : "temporary_failure", responseStatus };
}
export function notificationPayload(delivery: {
  deliveryId: string;
  eventType: string;
  title: string;
  body: string;
  route: string;
}) {
  return {
    title: delivery.title.slice(0, 80),
    body: delivery.body.slice(0, 160),
    route: delivery.route,
    tag: `${delivery.eventType}:${delivery.deliveryId}`,
    badgeCount: 1,
  };
}
