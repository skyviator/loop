import { readFileSync } from "node:fs";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

function serviceWorkerHarness() {
  const listeners = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn(() => Promise.resolve());
  const setAppBadge = vi.fn(() => Promise.resolve());
  const skipWaiting = vi.fn();
  const matchAll = vi.fn(() => Promise.resolve([] as Array<{ url: string; navigate: (target: string) => Promise<void>; focus: () => Promise<void> }>));
  const self = {
    location: { origin: "https://127.0.0.1:3000" },
    registration: { showNotification },
    navigator: { setAppBadge },
    clients: { claim: vi.fn(() => Promise.resolve()), matchAll, openWindow: vi.fn(() => Promise.resolve()) },
    skipWaiting,
    addEventListener: (name: string, listener: (event: unknown) => void) => listeners.set(name, listener),
  };
  vm.runInNewContext(source, { self, URL, Promise });
  return { listeners, self, showNotification, setAppBadge, skipWaiting };
}

describe("Loop service worker", () => {
  it("does not intercept fetches or create a cache", () => {
    const harness = serviceWorkerHarness();
    expect(harness.listeners.has("fetch")).toBe(false);
    expect(source).not.toContain("caches.open");
    expect(source).not.toContain("CacheStorage");
  });

  it("activates a waiting worker only after an explicit update message", () => {
    const harness = serviceWorkerHarness();
    expect(harness.skipWaiting).not.toHaveBeenCalled();
    harness.listeners.get("message")?.({ data: { type: "SKIP_WAITING" } });
    expect(harness.skipWaiting).toHaveBeenCalledOnce();
  });

  it("falls back to a safe same-origin route and updates the badge", async () => {
    const harness = serviceWorkerHarness();
    let work: Promise<unknown> = Promise.resolve();
    harness.listeners.get("push")?.({
      data: { json: () => ({ title: "Update", body: "Open Loop.", route: "https://attacker.example/private" }) },
      waitUntil: (promise: Promise<unknown>) => { work = promise; },
    });
    await work;
    expect(harness.showNotification).toHaveBeenCalledWith("Update", expect.objectContaining({ data: { route: "/app" } }));
    expect(harness.setAppBadge).toHaveBeenCalledWith(1);
  });

  it("rejects an external notification-click destination", async () => {
    const harness = serviceWorkerHarness();
    let work: Promise<unknown> = Promise.resolve();
    const close = vi.fn();
    harness.listeners.get("notificationclick")?.({
      notification: { close, data: { route: "https://attacker.example/private" } },
      waitUntil: (promise: Promise<unknown>) => { work = promise; },
    });
    await work;
    expect(close).toHaveBeenCalledOnce();
    expect(harness.self.clients.openWindow).toHaveBeenCalledWith("https://127.0.0.1:3000/app");
  });

  it.each(["//attacker.example/private", "/messages\\attacker", "javascript:alert(1)"])("rejects unsafe route %s", async (route) => {
    const harness = serviceWorkerHarness();
    let work: Promise<unknown> = Promise.resolve();
    harness.listeners.get("notificationclick")?.({
      notification: { close: vi.fn(), data: { route } },
      waitUntil: (promise: Promise<unknown>) => { work = promise; },
    });
    await work;
    expect(harness.self.clients.openWindow).toHaveBeenCalledWith("https://127.0.0.1:3000/app");
  });

  it("reuses an existing same-origin window for a safe internal route", async () => {
    const harness = serviceWorkerHarness();
    const navigate = vi.fn(() => Promise.resolve());
    const focus = vi.fn(() => Promise.resolve());
    harness.self.clients.matchAll.mockResolvedValue([{ url: "https://127.0.0.1:3000/parent", navigate, focus }]);
    let work: Promise<unknown> = Promise.resolve();
    harness.listeners.get("notificationclick")?.({
      notification: { close: vi.fn(), data: { route: "/messages?thread=allowed#latest" } },
      waitUntil: (promise: Promise<unknown>) => { work = promise; },
    });
    await work;
    expect(navigate).toHaveBeenCalledWith("https://127.0.0.1:3000/messages?thread=allowed#latest");
    expect(focus).toHaveBeenCalledOnce();
    expect(harness.self.clients.openWindow).not.toHaveBeenCalled();
  });
});
