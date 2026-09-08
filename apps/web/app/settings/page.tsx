import { AppShell } from "@/components/app-shell";
import { InstallPushSettings } from "@/components/install-push-settings";
import { requireViewer } from "@/lib/auth";
import { communicationNavigation } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const viewer = await requireViewer(["school_admin", "teacher", "guardian"]);
  const preferences = await (await createClient()).from("notification_preferences")
    .select("attendance_enabled, messages_enabled, important_announcements_enabled, photos_enabled")
    .eq("user_id", viewer.userId)
    .maybeSingle();

  return (
    <AppShell eyebrow={viewer.schoolName ?? "School"} title="Settings" nav={communicationNavigation(viewer.role!)}>
      <InstallPushSettings
        role={viewer.role as "school_admin" | "teacher" | "guardian"}
        vapidPublicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""}
        preferences={{
          attendance: preferences.data?.attendance_enabled ?? true,
          messages: preferences.data?.messages_enabled ?? true,
          announcements: preferences.data?.important_announcements_enabled ?? true,
          photos: preferences.data?.photos_enabled ?? false,
        }}
      />
    </AppShell>
  );
}
