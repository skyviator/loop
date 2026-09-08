"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type InstallPrompt = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type PwaState = {
  installAvailable: boolean;
  isIos: boolean;
  isStandalone: boolean;
  install: () => Promise<"accepted" | "dismissed" | "unavailable">;
};

const PwaContext = createContext<PwaState | null>(null);

function standaloneMode() {
  return window.matchMedia("(display-mode: standalone)").matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}

function iosPlatform() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export function PwaProvider({ children }: { children: ReactNode }) {
  const [online, setOnline] = useState(true);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [installPrompt, setInstallPrompt] = useState<InstallPrompt | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const activationRequested = useRef(false);
  const reloading = useRef(false);

  useEffect(() => {
    queueMicrotask(() => {
      setOnline(navigator.onLine);
      setIsStandalone(standaloneMode());
      setIsIos(iosPlatform());
    });
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPrompt);
    };
    const onInstalled = () => {
      setInstallPrompt(null);
      setIsStandalone(true);
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => {
        if (registration.waiting && navigator.serviceWorker.controller) setWaiting(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) setWaiting(registration.waiting);
          });
        });
      }).catch(() => undefined);

      const onControllerChange = () => {
        if (!activationRequested.current || reloading.current || sessionStorage.getItem("loop-sw-reloading") === "1") return;
        reloading.current = true;
        sessionStorage.setItem("loop-sw-reloading", "1");
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
      sessionStorage.removeItem("loop-sw-reloading");

      return () => {
        window.removeEventListener("online", onOnline);
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("beforeinstallprompt", onInstallPrompt);
        window.removeEventListener("appinstalled", onInstalled);
        navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      };
    }
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    const clearBadge = () => {
      const badgeNavigator = navigator as Navigator & { clearAppBadge?: () => Promise<void> };
      if (document.visibilityState === "visible" && typeof badgeNavigator.clearAppBadge === "function") void badgeNavigator.clearAppBadge().catch(() => undefined);
    };
    clearBadge();
    window.addEventListener("focus", clearBadge);
    document.addEventListener("visibilitychange", clearBadge);
    return () => {
      window.removeEventListener("focus", clearBadge);
      document.removeEventListener("visibilitychange", clearBadge);
    };
  }, []);

  const value = useMemo<PwaState>(() => ({
    installAvailable: Boolean(installPrompt),
    isIos,
    isStandalone,
    install: async () => {
      if (!installPrompt) return "unavailable";
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      setInstallPrompt(null);
      return choice.outcome;
    },
  }), [installPrompt, isIos, isStandalone]);

  return (
    <PwaContext.Provider value={value}>
      {!online ? <p className="connectivity-banner" role="status">You are offline. Private Loop data is not stored for offline use.</p> : null}
      {waiting ? <div className="update-banner" role="status"><span>A new Loop version is ready.</span><button className="text-button" type="button" onClick={() => { activationRequested.current = true; waiting.postMessage({ type: "SKIP_WAITING" }); }}>Update now</button></div> : null}
      {children}
    </PwaContext.Provider>
  );
}

export function usePwa() {
  const state = useContext(PwaContext);
  if (!state) throw new Error("usePwa must be used inside PwaProvider");
  return state;
}
