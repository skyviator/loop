"use client";

import { useEffect, useState } from "react";

import { saveNotificationPreferencesAction } from "@/app/actions/notifications";
import { LoopIcon } from "@/components/loop-icon";
import { usePwa } from "@/components/pwa-provider";

type PermissionState = NotificationPermission | "unsupported";

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const binary = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

export function InstallPushSettings({
  role,
  vapidPublicKey,
  preferences,
}: {
  role: "school_admin" | "teacher" | "guardian";
  vapidPublicKey: string;
  preferences: { attendance: boolean; messages: boolean; announcements: boolean; photos: boolean };
}) {
  const { install, installAvailable, isIos, isStandalone } = usePwa();
  const [permission, setPermission] = useState<PermissionState>("unsupported");
  const [subscribed, setSubscribed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    navigator.serviceWorker.ready
      .then((registration) => {
        setPermission(Notification.permission);
        return registration.pushManager.getSubscription();
      })
      .then((subscription) => setSubscribed(Boolean(subscription)))
      .catch(() => undefined);
  }, []);

  async function enablePush() {
    if (isIos && !isStandalone) {
      setMessage("On iPhone or iPad, add Loop to your Home Screen first, then open the installed app to enable notifications.");
      return;
    }
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window) || !vapidPublicKey) {
      setMessage("Push notifications are not available in this browser or are not configured locally.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const result = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
      setPermission(result);
      if (result !== "granted") {
        setMessage(result === "denied" ? "Notifications are blocked in browser settings." : "Notification permission was not granted.");
        return;
      }
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription() ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(vapidPublicKey),
      });
      const keys = subscription.toJSON().keys;
      if (!keys?.p256dh || !keys.auth) throw new Error("Subscription keys are missing.");
      const response = await fetch("/api/push/subscriptions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subscription.endpoint, keys }),
      });
      if (!response.ok) throw new Error("Registration was rejected.");
      setSubscribed(true);
      setMessage("Notifications are enabled on this device.");
    } catch {
      setMessage("Loop could not enable notifications on this device.");
    } finally {
      setBusy(false);
    }
  }

  async function disablePush() {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        const response = await fetch("/api/push/subscriptions", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Deactivation was rejected.");
        await subscription.unsubscribe();
      }
      setSubscribed(false);
      setMessage("Notifications are off on this device.");
    } catch {
      setMessage("Loop could not turn off notifications. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-stack">
      <section className="section-panel settings-panel">
        <div className="section-heading"><div><p className="eyebrow">Installed app</p><h2>Keep Loop close</h2></div><LoopIcon name="phone" className="size-6" /></div>
        {isStandalone ? <p className="muted">Loop is open as an installed app on this device.</p> : installAvailable ? <><p className="muted">Install Loop for a focused app window and easier access.</p><button className="button button-primary" type="button" onClick={() => void install()}>Install Loop</button></> : isIos ? <div className="instruction-list"><p><LoopIcon name="share" className="size-5" /><span>In Safari, tap Share.</span></p><p><LoopIcon name="add" className="size-5" /><span>Choose Add to Home Screen, then open Loop from its icon.</span></p></div> : <p className="muted">Use your browser menu to install Loop when installation is available.</p>}
      </section>

      <section className="section-panel settings-panel">
        <div className="section-heading"><div><p className="eyebrow">This device</p><h2>Push notifications</h2></div><LoopIcon name="bell" className="size-6" /></div>
        <p className="muted">Lock-screen text stays general. Open Loop and sign in to view private details.</p>
        <p className="meta">Permission: {permission} · Device: {subscribed ? "enabled" : "not enabled"}</p>
        <button className="button button-primary" disabled={busy || permission === "denied"} type="button" onClick={() => void (subscribed ? disablePush() : enablePush())}>{busy ? "Please wait…" : subscribed ? "Turn off on this device" : "Enable on this device"}</button>
        {message ? <p className="form-result" role="status" aria-live="polite">{message}</p> : null}
      </section>

      <section className="section-panel settings-panel">
        <div className="section-heading"><div><p className="eyebrow">What reaches you</p><h2>Notification preferences</h2></div></div>
        <form action={saveNotificationPreferencesAction} className="form-stack notification-preferences">
          {role === "guardian" ? <label className="check-field"><input type="checkbox" name="attendance_enabled" defaultChecked={preferences.attendance} /> Attendance check-in and check-out</label> : null}
          <label className="check-field"><input type="checkbox" name="messages_enabled" defaultChecked={preferences.messages} /> New direct messages</label>
          <label className="check-field"><input type="checkbox" name="important_announcements_enabled" defaultChecked={preferences.announcements} /> Important announcements</label>
          {role === "guardian" ? <label className="check-field"><input type="checkbox" name="photos_enabled" defaultChecked={preferences.photos} /> New private photos <small>Optional and off by default</small></label> : null}
          <p className="muted">Routine care and timetable activity never create push notifications.</p>
          <button className="button button-secondary">Save preferences</button>
        </form>
      </section>
    </div>
  );
}
