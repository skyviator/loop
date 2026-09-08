import { readFileSync } from "node:fs";
import vm from "node:vm";

import { describe, expect, it, vi } from "vitest";

const source = readFileSync(new URL("../../public/sw.js", import.meta.url), "utf8");

function serviceWorkerHarness() {
  const listeners = new Map<string, (event: unknown) => void>();
  const showNotification = vi.fn(() => Promise.resolve());
  const setAppBadge = vi.fn(() => Promise.resolve());
  const skipWaiting = vi.fn();
  const self = {
    location: { origin: "https://127.0.0.1:3000" },
    registration: { showNotification },
    navigator: { setAppBadge },
    clients: { claim: vi.fn(() => Promise.resolve()), matchAll: vi.fn(() => Promise.resolve([])), openWindow: vi.fn(() => Promise.resolve()) },
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
});
