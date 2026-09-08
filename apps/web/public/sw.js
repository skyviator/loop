const LOOP_SW_VERSION = "step-5-b";

function safeInternalRoute(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/app";
  try {
    const route = new URL(value, self.location.origin);
    return route.origin === self.location.origin ? `${route.pathname}${route.search}${route.hash}` : "/app";
  } catch {
    return "/app";
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
  if (event.data?.type === "GET_VERSION") event.source?.postMessage({ type: "LOOP_SW_VERSION", version: LOOP_SW_VERSION });
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = {};
  }

  const title = typeof payload.title === "string" ? payload.title.slice(0, 80) : "New Loop update";
  const body = typeof payload.body === "string" ? payload.body.slice(0, 160) : "Open Loop to view the update.";
  const route = safeInternalRoute(payload.route);
  const badgeCount = Number.isInteger(payload.badgeCount) && payload.badgeCount > 0 ? payload.badgeCount : 1;

  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body,
      icon: "/icons/loop-192.png",
      badge: "/icons/loop-192.png",
      tag: typeof payload.tag === "string" ? payload.tag.slice(0, 120) : undefined,
      data: { route },
    }),
    typeof self.navigator.setAppBadge === "function" ? self.navigator.setAppBadge(badgeCount) : Promise.resolve(),
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const route = safeInternalRoute(event.notification.data?.route);
  const target = new URL(route, self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(target);
      return existing.focus();
    }
    return self.clients.openWindow(target);
  })());
});
